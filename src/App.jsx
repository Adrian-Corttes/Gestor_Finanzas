import React, { useState, useEffect, createContext, useContext } from "react";
import { v4 as uuidv4 } from "uuid";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  query,
} from "firebase/firestore";
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";

// -----------------------------------------------------------------------------
// 1) CONFIGURACIÓN Y CONSTANTES
// -----------------------------------------------------------------------------

// ⚠️ Reemplaza estos valores con los de tu proyecto desde Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyBwCtxbLpt8YQSUZTYttVafCxC8cqE4q9I",
  authDomain: "gestor-de-finanzas-6ae2b.firebaseapp.com",
  projectId: "gestor-de-finanzas-6ae2b",
  storageBucket: "gestor-de-finanzas-6ae2b.firebasestorage.app",
  messagingSenderId: "75647062495",
  appId: "1:75647062495:web:b3e300755e1708762d346a",
  measurementId: "G-04V2CT5MXE",
};

const APP_ID_FALLBACK = "default-app-id";

const FinanceContext = createContext(null);

const CATEGORIES = [
  "Vivienda",
  "Transporte",
  "Alimentación",
  "Servicios",
  "Salud",
  "Educación",
  "Entretenimiento",
  "Ropa",
  "Ahorro/Deuda",
  "Impuestos",
  "Otros",
];

const PIE_CHART_COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#A28CFE",
  "#FF6B6B",
  "#4ECDC4",
  "#FFD93D",
  "#6A0572",
  "#2D6A4F",
  "#B56576",
];

const MONTH_ORDER = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const formatCurrency = (n) => {
  const val = Number(n) || 0;
  return val.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

export const useFinance = () => useContext(FinanceContext);

// -----------------------------------------------------------------------------
// 2) PROVIDER: ESTADO + FIREBASE + (LOGIN EMAIL/CONTRASEÑA)
// -----------------------------------------------------------------------------

export const FinanceProvider = ({ children }) => {
  const [data, setData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);

  // Errores de autenticación que consumirá la UI de Login
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    // Inicializa Firebase (app única)
    let app;
    try {
      app = initializeApp(firebaseConfig);
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      setIsLoading(false);
      return;
    }

    const firestoreDb = getFirestore(app);
    const firebaseAuth = getAuth(app);

    // Persistencia local de sesión
    setPersistence(firebaseAuth, browserLocalPersistence).catch((e) => {
      console.warn("No se pudo establecer persistencia local:", e);
    });

    setDb(firestoreDb);
    setAuth(firebaseAuth);

    // Listener de auth
    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!db || !userId) return;

    const qRef = query(collection(db, `users/${userId}/months`));

    const unsubscribe = onSnapshot(
      qRef,
      (snapshot) => {
        const newData = {};
        snapshot.forEach((d) => {
          newData[d.id] = d.data();
        });
        setData(newData);
      },
      (error) => {
        console.error("Failed to fetch data from Firestore:", error);
      }
    );

    return () => unsubscribe();
  }, [db, userId]);

  // ---------------------- Cálculos ----------------------
  const calculateTotals = (monthData) => {
    if (!monthData)
      return {
        incomesTotal: 0,
        expensesTotal: 0,
        recommendedSavings: 0,
        balance: 0,
      };

    const incomesArr = Array.isArray(monthData.incomes)
      ? monthData.incomes
      : [];
    const expensesArr = Array.isArray(monthData.expenses)
      ? monthData.expenses
      : [];

    const incomesTotal = incomesArr.reduce(
      (sum, item) => sum + (Number(item.value) || 0),
      0
    );

    const expensesTotal = expensesArr.reduce((sum, expense) => {
      const hasSub =
        Array.isArray(expense.subItems) && expense.subItems.length > 0;
      if (!hasSub) return sum + (Number(expense.value) || 0);

      const subItemsTotal = expense.subItems.reduce((subSum, subItem) => {
        const hasArticles =
          Array.isArray(subItem.articles) && subItem.articles.length > 0;
        if (!hasArticles) return subSum + (Number(subItem.value) || 0);
        const articlesTotal = subItem.articles.reduce(
          (aSum, a) => aSum + (Number(a.value) || 0),
          0
        );
        return subSum + articlesTotal;
      }, 0);
      return sum + subItemsTotal;
    }, 0);

    const recommendedSavings = incomesTotal * 0.05;
    const balance =
      incomesTotal - expensesTotal - (Number(monthData.savings) || 0);
    return { incomesTotal, expensesTotal, recommendedSavings, balance };
  };

  // ---------------------- Persistencia ----------------------
  const path = (month) => {
    return `users/${userId}/months/${month}`;
  };

  const ensureMonthData = (month) => ({
    incomes: Array.isArray(data[month]?.incomes)
      ? data[month].incomes.slice()
      : [],
    expenses: Array.isArray(data[month]?.expenses)
      ? data[month].expenses.slice()
      : [],
    savings: Number(data[month]?.savings) || 0,
  });

  const addTransaction = async (month, type, description, value, category) => {
    if (!db || !userId) return;
    if (
      description.trim() === "" ||
      isNaN(parseFloat(value)) ||
      Number(value) <= 0
    ) {
      console.error("Description and value cannot be empty or <= 0.");
      return;
    }
    const monthDocRef = doc(db, path(month));
    const monthData = ensureMonthData(month);

    if (type === "income") {
      monthData.incomes.push({
        id: uuidv4(),
        description,
        value: parseFloat(value),
      });
    } else {
      monthData.expenses.push({
        id: uuidv4(),
        description,
        value: parseFloat(value),
        subItems: [],
        category: category || "",
      });
    }
    await setDoc(monthDocRef, monthData);
  };

  const updateTransaction = async (
    month,
    type,
    id,
    newDescription,
    newValue,
    newCategory
  ) => {
    if (!db || !userId) return;
    if (
      newDescription.trim() === "" ||
      isNaN(parseFloat(newValue)) ||
      Number(newValue) <= 0
    ) {
      console.error("Description and value cannot be empty or <= 0.");
      return;
    }
    const monthDocRef = doc(db, path(month));
    const monthData = ensureMonthData(month);
    const list = type === "income" ? "incomes" : "expenses";

    const idx = monthData[list].findIndex((i) => i.id === id);
    if (idx === -1) return;

    monthData[list][idx].description = newDescription;
    monthData[list][idx].value = parseFloat(newValue);
    if (type === "expense") monthData[list][idx].category = newCategory || "";

    await setDoc(monthDocRef, monthData);
  };

  const updateSavings = async (month, value) => {
    if (!db || !userId) return;
    const monthDocRef = doc(db, path(month));
    const parsed = isNaN(parseFloat(value)) ? 0 : parseFloat(value);
    await setDoc(monthDocRef, { savings: parsed }, { merge: true });
  };

  const addSubItem = async (month, expenseId, description, value) => {
    if (!db || !userId) return;
    if (
      description.trim() === "" ||
      isNaN(parseFloat(value)) ||
      Number(value) <= 0
    )
      return;

    const monthDocRef = doc(db, path(month));
    const monthData = ensureMonthData(month);
    const eIdx = monthData.expenses.findIndex((e) => e.id === expenseId);
    if (eIdx === -1) return;

    const expense = monthData.expenses[eIdx];
    const subItems = Array.isArray(expense.subItems) ? expense.subItems : [];
    subItems.push({
      id: uuidv4(),
      description,
      value: parseFloat(value),
      articles: [],
    });

    const newExpenseValue = subItems.reduce(
      (s, si) => s + (Number(si.value) || 0),
      0
    );
    monthData.expenses[eIdx] = { ...expense, subItems, value: newExpenseValue };

    await setDoc(monthDocRef, monthData);
  };

  const updateSubItem = async (
    month,
    expenseId,
    subItemId,
    newDescription,
    newValue
  ) => {
    if (!db || !userId) return;
    if (
      newDescription.trim() === "" ||
      isNaN(parseFloat(newValue)) ||
      Number(newValue) <= 0
    )
      return;

    const monthDocRef = doc(db, path(month));
    const monthData = ensureMonthData(month);
    const eIdx = monthData.expenses.findIndex((e) => e.id === expenseId);
    if (eIdx === -1) return;

    const expense = monthData.expenses[eIdx];
    const subIdx = (expense.subItems || []).findIndex(
      (s) => s.id === subItemId
    );
    if (subIdx === -1) return;

    const subItems = expense.subItems.slice();
    subItems[subIdx] = {
      ...subItems[subIdx],
      description: newDescription,
      value: parseFloat(newValue),
    };

    const newExpenseValue = subItems.reduce(
      (s, si) => s + (Number(si.value) || 0),
      0
    );
    monthData.expenses[eIdx] = { ...expense, subItems, value: newExpenseValue };

    await setDoc(monthDocRef, monthData);
  };

  const deleteSubItem = async (month, expenseId, subItemId) => {
    if (!db || !userId) return;
    const monthDocRef = doc(db, path(month));
    const monthData = ensureMonthData(month);
    const eIdx = monthData.expenses.findIndex((e) => e.id === expenseId);
    if (eIdx === -1) return;

    const expense = monthData.expenses[eIdx];
    const subItems = (expense.subItems || []).filter((s) => s.id !== subItemId);
    const newExpenseValue = subItems.reduce(
      (s, si) => s + (Number(si.value) || 0),
      0
    );
    monthData.expenses[eIdx] = { ...expense, subItems, value: newExpenseValue };

    await setDoc(monthDocRef, monthData);
  };

  const addArticle = async (
    month,
    expenseId,
    subItemId,
    description,
    value
  ) => {
    if (!db || !userId) return;
    if (
      description.trim() === "" ||
      isNaN(parseFloat(value)) ||
      Number(value) <= 0
    )
      return;

    const monthDocRef = doc(db, path(month));
    const monthData = ensureMonthData(month);
    const eIdx = monthData.expenses.findIndex((e) => e.id === expenseId);
    if (eIdx === -1) return;

    const expense = monthData.expenses[eIdx];
    const subIdx = (expense.subItems || []).findIndex(
      (s) => s.id === subItemId
    );
    if (subIdx === -1) return;

    const subItems = expense.subItems.slice();
    const subItem = subItems[subIdx];
    const articles = Array.isArray(subItem.articles)
      ? subItem.articles.slice()
      : [];

    articles.push({ id: uuidv4(), description, value: parseFloat(value) });
    const newSubItemValue = articles.reduce(
      (s, a) => s + (Number(a.value) || 0),
      0
    );

    subItems[subIdx] = { ...subItem, articles, value: newSubItemValue };
    const newExpenseValue = subItems.reduce(
      (s, si) => s + (Number(si.value) || 0),
      0
    );
    monthData.expenses[eIdx] = { ...expense, subItems, value: newExpenseValue };

    await setDoc(monthDocRef, monthData);
  };

  const updateArticle = async (
    month,
    expenseId,
    subItemId,
    articleId,
    newDescription,
    newValue
  ) => {
    if (!db || !userId) return;
    if (
      newDescription.trim() === "" ||
      isNaN(parseFloat(newValue)) ||
      Number(newValue) <= 0
    )
      return;

    const monthDocRef = doc(db, path(month));
    const monthData = ensureMonthData(month);
    const eIdx = monthData.expenses.findIndex((e) => e.id === expenseId);
    if (eIdx === -1) return;

    const expense = monthData.expenses[eIdx];
    const subIdx = (expense.subItems || []).findIndex(
      (s) => s.id === subItemId
    );
    if (subIdx === -1) return;

    const subItems = expense.subItems.slice();
    const subItem = subItems[subIdx];
    const aIdx = (subItem.articles || []).findIndex((a) => a.id === articleId);
    if (aIdx === -1) return;

    const articles = subItem.articles.slice();
    articles[aIdx] = {
      ...articles[aIdx],
      description: newDescription,
      value: parseFloat(newValue),
    };

    const newSubItemValue = articles.reduce(
      (s, a) => s + (Number(a.value) || 0),
      0
    );
    subItems[subIdx] = { ...subItem, articles, value: newSubItemValue };

    const newExpenseValue = subItems.reduce(
      (s, si) => s + (Number(si.value) || 0),
      0
    );
    monthData.expenses[eIdx] = { ...expense, subItems, value: newExpenseValue };

    await setDoc(monthDocRef, monthData);
  };

  const deleteArticle = async (month, expenseId, subItemId, articleId) => {
    if (!db || !userId) return;

    const monthDocRef = doc(db, path(month));
    const monthData = ensureMonthData(month);
    const eIdx = monthData.expenses.findIndex((e) => e.id === expenseId);
    if (eIdx === -1) return;

    const expense = monthData.expenses[eIdx];
    const subIdx = (expense.subItems || []).findIndex(
      (s) => s.id === subItemId
    );
    if (subIdx === -1) return;

    const subItems = expense.subItems.slice();
    const subItem = subItems[subIdx];
    const articles = (subItem.articles || []).filter((a) => a.id !== articleId);

    const newSubItemValue = articles.reduce(
      (s, a) => s + (Number(a.value) || 0),
      0
    );
    subItems[subIdx] = { ...subItem, articles, value: newSubItemValue };

    const newExpenseValue = subItems.reduce(
      (s, si) => s + (Number(si.value) || 0),
      0
    );
    monthData.expenses[eIdx] = { ...expense, subItems, value: newExpenseValue };

    await setDoc(monthDocRef, monthData);
  };

  const deleteTransaction = async (month, type, id) => {
    if (!db || !userId) return;

    const monthDocRef = doc(db, path(month));
    const monthData = ensureMonthData(month);

    if (type === "income") {
      monthData.incomes = monthData.incomes.filter((i) => i.id !== id);
    } else {
      monthData.expenses = monthData.expenses.filter((e) => e.id !== id);
    }
    await setDoc(monthDocRef, monthData);
  };

  const addNewMonth = async (monthName) => {
    if (!db || !userId) return;
    const normalized = (monthName || "").trim();
    if (!normalized) return;

    if (!data[normalized]) {
      const monthDocRef = doc(db, path(normalized));
      await setDoc(monthDocRef, { incomes: [], expenses: [], savings: 0 });
    }
  };

  const deleteMonth = async (monthName) => {
    if (!db || !userId) return;
    const monthDocRef = doc(db, path(monthName));
    await deleteDoc(monthDocRef);
  };

  const renameMonth = async (oldName, newName) => {
    if (!db || !userId) return;
    const normalized = (newName || "").trim();
    if (!normalized || oldName === normalized) return;
    if (data[normalized]) return; // ya existe

    const oldRef = doc(db, path(oldName));
    const newRef = doc(db, path(normalized));
    await setDoc(newRef, ensureMonthData(oldName));
    await deleteDoc(oldRef);
  };

  // ---------------------- Auth (Email/Password) ----------------------
  const signInEmail = async (email, password) => {
    if (!auth) return;
    setAuthError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      console.error("Error al iniciar sesión:", e);
      setAuthError(mapFirebaseAuthError(e));
    }
  };

  const signUpEmail = async (email, password) => {
    if (!auth) return;
    setAuthError("");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      console.error("Error al crear cuenta:", e);
      setAuthError(mapFirebaseAuthError(e));
    }
  };

  const logOut = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Error al cerrar sesión:", e);
    }
  };

  const mapFirebaseAuthError = (e) => {
    const code = e?.code || "";
    if (code.includes("auth/invalid-email")) return "El correo no es válido.";
    if (code.includes("auth/missing-password"))
      return "La contraseña es obligatoria.";
    if (code.includes("auth/weak-password"))
      return "La contraseña es muy débil (mínimo 6 caracteres).";
    if (code.includes("auth/email-already-in-use"))
      return "Este correo ya está registrado.";
    if (code.includes("auth/user-not-found"))
      return "No existe una cuenta con este correo.";
    if (code.includes("auth/wrong-password")) return "Contraseña incorrecta.";
    if (code.includes("auth/too-many-requests"))
      return "Demasiados intentos. Intenta más tarde.";
    return "Ocurrió un error de autenticación. Intenta nuevamente.";
  };

  return (
    <FinanceContext.Provider
      value={{
        data,
        addTransaction,
        updateTransaction,
        updateSavings,
        addSubItem,
        updateSubItem,
        deleteSubItem,
        addArticle,
        updateArticle,
        deleteArticle,
        deleteTransaction,
        calculateTotals,
        addNewMonth,
        deleteMonth,
        renameMonth,
        isLoading,
        userId,

        // Auth
        signInEmail,
        signUpEmail,
        logOut,
        authError,
        setAuthError,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

// -----------------------------------------------------------------------------
// 3) COMPONENTES COMUNES (MODALS & EDITABLES)
// -----------------------------------------------------------------------------

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-70 p-4 font-sans">
      <div className="bg-white rounded-lg border border-gray-300 shadow-2xl w-full max-w-lg md:max-w-3xl max-h-[90vh] overflow-y-auto transform transition-all duration-300">
        <div className="bg-gray-200 p-4 flex justify-between items-center rounded-t-lg border-b border-gray-300">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-red-600 p-1 bg-white rounded-full transition-all duration-200 shadow-md"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

const EditableItem = ({ type, item, onSave, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(item.description);
  const [value, setValue] = useState(item.value);
  const [category, setCategory] = useState(item.category || "");
  const [message, setMessage] = useState("");

  const handleSave = () => {
    if (
      description.trim() === "" ||
      isNaN(parseFloat(value)) ||
      parseFloat(value) <= 0
    ) {
      setMessage(
        "La descripción no puede estar vacía y el valor debe ser mayor a 0."
      );
      return;
    }
    onSave(item.id, description, value, category);
    setIsEditing(false);
    setMessage("");
  };

  const handleDelete = () => onDelete(item.id);

  const icon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5 text-gray-500"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5l-2.4 2.4a.5.5 0 00-.1.3l-.9 3.4a.5.5 0 00.6.6l3.4-.9a.5.5 0 00.3-.1l2.4-2.4a2 2 0 000-2.8l-1.2-1.2a2 2 0 00-2.8 0z" />
    </svg>
  );

  const deleteIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-5 h-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.971a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m-1.022.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.971a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165M10.125 12.75l1.5-1.5m0 0l1.5 1.5M11.625 11.25l-1.5 1.5"
      />
    </svg>
  );

  if (isEditing) {
    return (
      <div className="flex flex-col space-y-2 p-3 bg-gray-100 rounded-lg shadow-inner">
        {message && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg text-sm text-center">
            {message}
          </div>
        )}
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div className="flex items-center space-x-2">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {type === "expense" && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Seleccionar Categoría</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex justify-end space-x-2 mt-2">
          <button
            onClick={handleSave}
            className="bg-blue-600 text-white px-4 py-2 text-sm rounded-lg shadow-md transition-transform transform hover:scale-105"
          >
            Guardar
          </button>
          <button
            onClick={() => {
              setIsEditing(false);
              setMessage("");
            }}
            className="bg-gray-300 text-gray-800 px-4 py-2 text-sm rounded-lg shadow-md transition-transform transform hover:scale-105"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <li className="flex justify-between items-center p-3 border-b border-gray-200 last:border-b-0 transition-colors hover:bg-gray-50">
      <span className="flex-1 text-gray-800">{item.description}</span>
      <div className="flex items-center space-x-4">
        <span
          className={`font-bold ${
            type === "income" ? "text-green-600" : "text-red-600"
          }`}
        >
          {formatCurrency(item.value)}
        </span>
        <button
          onClick={() => setIsEditing(true)}
          className="p-1 rounded-full text-gray-600 hover:text-blue-500 hover:bg-gray-200 transition-colors duration-200"
          title="Editar"
        >
          {icon}
        </button>
        <button
          onClick={handleDelete}
          className="p-1 rounded-full text-gray-600 hover:text-red-500 hover:bg-gray-200 transition-colors duration-200"
          title="Eliminar"
        >
          {deleteIcon}
        </button>
      </div>
    </li>
  );
};

// -----------------------------------------------------------------------------
// 4) LOGIN VIEW (Email/Contraseña) – MISMO ARCHIVO
// -----------------------------------------------------------------------------

const LoginView = () => {
  const { signInEmail, signUpEmail, authError, setAuthError, isLoading } =
    useFinance();
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      return setAuthError("Debes ingresar correo y contraseña.");
    }
    if (mode === "login") {
      signInEmail(email, password);
    } else {
      signUpEmail(email, password);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white w-full max-w-md rounded-lg shadow-xl border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-center text-blue-700 mb-1">
          Gestor de Finanzas
        </h1>
        <p className="text-center text-gray-500 mb-6">
          {mode === "login" ? "Inicia sesión" : "Crea tu cuenta"}
        </p>

        {authError && (
          <div className="mb-4 bg-red-100 text-red-700 border border-red-300 rounded p-3 text-sm">
            {authError}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Correo</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setAuthError("");
              }}
              placeholder="tucorreo@ejemplo.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setAuthError("");
              }}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white font-semibold rounded-lg px-4 py-2 shadow hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {mode === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
          </button>
        </form>

        <div className="mt-4 text-sm text-center text-gray-600">
          {mode === "login" ? (
            <>
              ¿No tienes cuenta?{" "}
              <button
                className="text-blue-600 hover:underline"
                onClick={() => {
                  setMode("signup");
                  setAuthError("");
                }}
              >
                Regístrate
              </button>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{" "}
              <button
                className="text-blue-600 hover:underline"
                onClick={() => {
                  setMode("login");
                  setAuthError("");
                }}
              >
                Inicia Sesión
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// 5) VISTAS PRINCIPALES (ExpenseModal, SubItemModal, MonthModal, Dashboard...)
//    (Tu lógica original intacta)
// -----------------------------------------------------------------------------

const ExpenseModal = ({ month, expense, isOpen, onClose }) => {
  const { addSubItem } = useFinance();
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [selectedSubItem, setSelectedSubItem] = useState(null);
  const [message, setMessage] = useState("");

  const handleAddItem = () => {
    if (
      description.trim() === "" ||
      isNaN(parseFloat(value)) ||
      parseFloat(value) <= 0
    ) {
      setMessage(
        "La descripción y el valor no pueden estar vacíos o ser menores a 0."
      );
      return;
    }
    addSubItem(month, expense.id, description, value);
    setDescription("");
    setValue("");
    setIsAddingItem(false);
    setMessage("");
  };

  if (selectedSubItem) {
    return (
      <SubItemModal
        month={month}
        expenseId={expense.id}
        subItem={selectedSubItem}
        isOpen={true}
        onClose={() => setSelectedSubItem(null)}
      />
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Detalle de Egreso: ${expense.description}`}
    >
      <div className="space-y-4">
        <div className="text-right text-lg font-bold text-red-700">
          Total: {formatCurrency(expense.value)}
        </div>

        <div className="flex flex-col items-center space-y-4">
          {!isAddingItem ? (
            <button
              onClick={() => setIsAddingItem(true)}
              className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md transition-transform transform hover:scale-105"
            >
              + Agregar Sub-ítem
            </button>
          ) : (
            <div className="w-full p-4 border border-gray-300 bg-gray-100 rounded-lg shadow-inner">
              {message && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg text-sm text-center mb-2">
                  {message}
                </div>
              )}
              <div className="flex flex-col space-y-2">
                <input
                  type="text"
                  placeholder="Descripción del sub-ítem"
                  className="px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Valor"
                  className="px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <div className="flex justify-end space-x-2 mt-2">
                  <button
                    onClick={handleAddItem}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm shadow-md transition-transform transform hover:scale-105"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingItem(false);
                      setMessage("");
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg text-sm shadow-md transition-transform transform hover:scale-105"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-300 shadow-md">
          <ul className="space-y-0">
            {(expense.subItems || []).map((item) => (
              <li
                key={item.id}
                className="flex justify-between items-center p-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
              >
                <button
                  onClick={() => setSelectedSubItem(item)}
                  className="flex-1 text-left text-gray-800"
                >
                  {item.description}
                </button>
                <div className="flex items-center space-x-4">
                  <span className="font-bold text-red-600">
                    {formatCurrency(item.value)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
};

const SubItemModal = ({ month, expenseId, subItem, isOpen, onClose }) => {
  const { addArticle, updateArticle, deleteArticle } = useFinance();
  const [isAddingArticle, setIsAddingArticle] = useState(false);
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");

  const handleAddArticle = () => {
    if (
      description.trim() === "" ||
      isNaN(parseFloat(value)) ||
      parseFloat(value) <= 0
    ) {
      setMessage(
        "La descripción y el valor no pueden estar vacíos o ser menores a 0."
      );
      return;
    }
    addArticle(month, expenseId, subItem.id, description, value);
    setDescription("");
    setValue("");
    setIsAddingArticle(false);
    setMessage("");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Detalle de Sub-ítem: ${subItem.description}`}
    >
      <div className="space-y-4">
        <div className="text-right text-lg font-bold text-red-700">
          Total: {formatCurrency(subItem.value)}
        </div>

        <div className="flex flex-col items-center space-y-4">
          {!isAddingArticle ? (
            <button
              onClick={() => setIsAddingArticle(true)}
              className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md transition-transform transform hover:scale-105"
            >
              + Agregar Artículo
            </button>
          ) : (
            <div className="w-full p-4 border border-gray-300 bg-gray-100 rounded-lg shadow-inner">
              {message && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg text-sm text-center mb-2">
                  {message}
                </div>
              )}
              <div className="flex flex-col space-y-2">
                <input
                  type="text"
                  placeholder="Descripción del artículo"
                  className="px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Valor"
                  className="px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <div className="flex justify-end space-x-2 mt-2">
                  <button
                    onClick={handleAddArticle}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm shadow-md transition-transform transform hover:scale-105"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingArticle(false);
                      setMessage("");
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg text-sm shadow-md transition-transform transform hover:scale-105"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-300 shadow-md">
          <ul className="space-y-0">
            {(subItem.articles || []).map((article) => (
              <EditableItem
                key={article.id}
                type="expense"
                item={article}
                onSave={(id, desc, val) =>
                  updateArticle(month, expenseId, subItem.id, id, desc, val)
                }
                onDelete={(id) =>
                  deleteArticle(month, expenseId, subItem.id, id)
                }
              />
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
};

const MonthModal = ({ month, isOpen, onClose }) => {
  const {
    data,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    calculateTotals,
    updateSavings,
  } = useFinance();
  const [isAdding, setIsAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [type, setType] = useState("income");
  const [category, setCategory] = useState("");
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [message, setMessage] = useState("");

  const monthData = data[month] || { incomes: [], expenses: [], savings: 0 };
  const { incomesTotal, expensesTotal, recommendedSavings, balance } =
    calculateTotals(monthData);

  const [savingsInput, setSavingsInput] = useState(monthData.savings || 0);

  useEffect(() => {
    setSavingsInput(monthData.savings || 0);
  }, [monthData.savings]);

  const handleSavingsChange = (e) => {
    const newSavings = e.target.value === "" ? "" : parseFloat(e.target.value);
    setSavingsInput(newSavings);
  };
  const handleSavingsBlur = () => updateSavings(month, savingsInput);

  const handleAdd = () => {
    if (
      description.trim() === "" ||
      isNaN(parseFloat(value)) ||
      parseFloat(value) <= 0
    ) {
      setMessage(
        "La descripción no puede estar vacía y el valor debe ser mayor a 0."
      );
      return;
    }
    addTransaction(month, type, description, value, category);
    setDescription("");
    setValue("");
    setCategory("");
    setIsAdding(false);
    setMessage("");
  };

  if (selectedExpense) {
    return (
      <ExpenseModal
        month={month}
        expense={selectedExpense}
        isOpen={true}
        onClose={() => setSelectedExpense(null)}
      />
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Detalle de ${month}`}>
      <div className="space-y-4">
        {/* Totales */}
        <div className="grid grid-cols-3 text-center text-sm font-medium rounded-lg overflow-hidden border border-gray-300 shadow-md">
          <div className="p-3 bg-gray-100 border-r border-gray-300">
            <p className="text-green-600">Ingresos</p>
            <p className="text-green-800 font-bold mt-1 text-xl">
              {formatCurrency(incomesTotal)}
            </p>
          </div>
          <div className="p-3 bg-gray-100 border-r border-gray-300">
            <p className="text-red-600">Egresos</p>
            <p className="text-red-800 font-bold mt-1 text-xl">
              {formatCurrency(expensesTotal)}
            </p>
          </div>
          <div className="p-3 bg-gray-100">
            <p className="text-blue-600">Balance</p>
            <p
              className={`font-bold mt-1 text-xl ${
                balance >= 0 ? "text-blue-800" : "text-red-800"
              }`}
            >
              {formatCurrency(balance)}
            </p>
          </div>
        </div>

        {/* Ahorro */}
        <div className="p-3 bg-gray-100 rounded-lg border border-gray-300 shadow-sm">
          <h3 className="text;base font-bold text-blue-700 mb-2">Ahorro</h3>
          <div className="flex flex-col md:flex-row items-center md:space-x-4">
            <div className="flex-1 w-full md:w-auto">
              <label className="text-sm font-semibold text-gray-600">
                Recomendado (5%):
              </label>
              <p className="font-bold text-blue-600 mt-1">
                {formatCurrency(recommendedSavings)}
              </p>
            </div>
            <div className="flex-1 w-full md:w-auto mt-2 md:mt-0">
              <label className="text-sm font-semibold text-gray-600">
                Tu Ahorro:
              </label>
              <input
                type="number"
                placeholder="Valor de ahorro"
                className="w-full px-2 py-1 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={savingsInput}
                onChange={handleSavingsChange}
                onBlur={handleSavingsBlur}
                onKeyDown={(e) => e.key === "Enter" && handleSavingsBlur()}
              />
            </div>
          </div>
        </div>

        {/* Agregar transacción */}
        <div className="flex flex-col items-center space-y-4">
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md transition-transform transform hover:scale-105"
            >
              + Agregar Ingreso/Egreso
            </button>
          ) : (
            <div className="w-full p-4 border border-gray-300 bg-gray-100 rounded-lg shadow-inner">
              {message && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg text-sm text-center mb-2">
                  {message}
                </div>
              )}
              <div className="flex flex-col space-y-2">
                <input
                  type="text"
                  placeholder="Descripción"
                  className="px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Valor"
                  className="px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <select
                  className="px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="income">Ingreso</option>
                  <option value="expense">Egreso</option>
                </select>
                {type === "expense" && (
                  <select
                    className="px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Seleccionar Categoría</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex justify-end space-x-2 mt-2">
                  <button
                    onClick={handleAdd}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm shadow-md transition-transform transform hover:scale-105"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => {
                      setIsAdding(false);
                      setMessage("");
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg text-sm shadow-md transition-transform transform hover:scale-105"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Listas */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-base font-bold text-green-700 mb-2">
              Ingresos
            </h3>
            <div className="rounded-lg border border-gray-300 shadow-md">
              <ul className="space-y-0">
                {(monthData.incomes || []).map((item) => (
                  <EditableItem
                    key={item.id}
                    type="income"
                    item={item}
                    onSave={(id, desc, val) =>
                      updateTransaction(month, "income", id, desc, val)
                    }
                    onDelete={(id) => deleteTransaction(month, "income", id)}
                  />
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold text-red-700 mb-2">Egresos</h3>
            <div className="rounded-lg border border-gray-300 shadow-md">
              <ul className="space-y-0">
                {(monthData.expenses || []).map((item) => (
                  <li
                    key={item.id}
                    className="flex justify-between items-center p-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
                  >
                    <button
                      onClick={() => setSelectedExpense(item)}
                      className="flex-1 text-left text-gray-800"
                    >
                      {item.description}
                    </button>
                    <div className="flex items-center space-x-4">
                      <span className="font-bold text-red-600">
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// -----------------------------------------------------------------------------
// 6) DASHBOARD / MONTHLY SUMMARY (sin cambios funcionales)
// -----------------------------------------------------------------------------

const Dashboard = () => {
  const { data, isLoading, userId } = useFinance();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
        <p className="ml-4 text-gray-600">Cargando gráficos...</p>
      </div>
    );
  }

  // ---- Agregado por categoría (Pie) ----
  const expensesByCategory = Object.values(data).reduce((acc, month) => {
    const expenses = Array.isArray(month?.expenses) ? month.expenses : [];
    expenses.forEach((expense) => {
      const category = expense.category || "Sin categoría";
      acc[category] = (acc[category] || 0) + (Number(expense.value) || 0);
    });
    return acc;
  }, {});

  const pieChartData = Object.entries(expensesByCategory)
    .map(([category, value]) => ({ name: category, value }))
    .sort((a, b) => b.value - a.value);

  // ---- Agregado por mes (Bar) ----
  const sortedMonths = Object.keys(data).sort((a, b) => {
    const [ma, ya] = a.toLowerCase().split(" ");
    const [mb, yb] = b.toLowerCase().split(" ");
    const yaNum = parseInt(ya);
    const ybNum = parseInt(yb);
    const ia = MONTH_ORDER.indexOf(ma);
    const ib = MONTH_ORDER.indexOf(mb);
    if (yaNum !== ybNum) return yaNum - ybNum;
    return ia - ib;
  });

  const monthlyData = sortedMonths.map((m) => {
    const incomes = (data[m]?.incomes || []).reduce(
      (s, i) => s + (Number(i.value) || 0),
      0
    );
    const expenses = (data[m]?.expenses || []).reduce(
      (s, e) => s + (Number(e.value) || 0),
      0
    );
    return { name: m.split(" ")[0], Ingresos: incomes, Egresos: expenses };
  });

  const isDataAvailable = Object.keys(data).length > 0;

  return (
    <div className="p-4 sm:p-8 bg-gray-100 min-h-screen font-sans">
      <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6 text-center">
        Panel de Control Financiero
      </h2>
      <div className="flex justify-center text-sm text-gray-500 mb-6">
        <span className="font-mono text-gray-700 break-all">
          ID de Usuario: {userId}
        </span>
      </div>

      {!isDataAvailable ? (
        <div className="bg-white rounded-lg shadow-lg p-8 text-center text-gray-600">
          <p className="text-xl font-semibold">
            ¡Empieza a agregar tus meses y transacciones para ver los gráficos
            aquí!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pie */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">
              Distribución de Egresos
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                >
                  {pieChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Barras */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">
              Ingresos vs. Egresos Mensuales
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={monthlyData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis dataKey="name" />
                <YAxis tickFormatter={formatCurrency} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar
                  dataKey="Ingresos"
                  fill="#2ecc71"
                  barSize={20}
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="Egresos"
                  fill="#e74c3c"
                  barSize={20}
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

const MonthCard = ({ month }) => {
  const { data, calculateTotals, renameMonth, deleteMonth } = useFinance();
  const monthData = data[month] || { incomes: [], expenses: [], savings: 0 };
  const { incomesTotal, expensesTotal, balance } = calculateTotals(monthData);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [newMonthName, setNewMonthName] = useState(month);

  const handleRename = () => {
    if (newMonthName.trim() !== "" && newMonthName !== month) {
      renameMonth(month, newMonthName);
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteMonth(month);
    setIsConfirmingDelete(false);
  };

  const icon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5 text-gray-500"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5l-2.4 2.4a.5.5 0 00-.1.3l-.9 3.4a.5.5 0 00.6.6l3.4-.9a.5.5 0 00.3-.1l2.4-2.4a2 2 0 000-2.8l-1.2-1.2a2 2 0 00-2.8 0z" />
    </svg>
  );

  const deleteIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-5 h-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.971a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m-1.022.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.971a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165M10.125 12.75l1.5-1.5m0 0l1.5 1.5M11.625 11.25l-1.5 1.5"
      />
    </svg>
  );

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg p-4 flex flex-col items-center cursor-pointer hover:shadow-2xl transition-shadow duration-300">
        <div className="flex justify-between items-center w-full mb-2">
          {isEditing ? (
            <input
              type="text"
              value={newMonthName}
              onChange={(e) => setNewMonthName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="text-lg font-bold text-gray-800 text-center w-full px-2 py-1 border border-gray-300 rounded-md"
              autoFocus
            />
          ) : (
            <h3
              className="text-lg font-bold text-gray-800 flex-1 text-center"
              onClick={() => setIsModalOpen(true)}
            >
              {month}
            </h3>
          )}
          <div className="flex items-center space-x-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(!isEditing);
              }}
              className="p-1 rounded-full text-gray-600 hover:text-blue-500 hover:bg-gray-200 transition-colors duration-200"
              title="Renombrar mes"
            >
              {icon}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsConfirmingDelete(true);
              }}
              className="p-1 rounded-full text-gray-600 hover:text-red-500 hover:bg-gray-200 transition-colors duration-200"
              title="Eliminar mes"
            >
              {deleteIcon}
            </button>
          </div>
        </div>

        {isConfirmingDelete ? (
          <div className="text-center mt-2 p-2 bg-red-100 rounded-lg border border-red-300">
            <p className="text-sm text-red-700 font-semibold mb-2">
              ¿Estás seguro de que quieres eliminar {month}?
            </p>
            <div className="flex justify-center space-x-2">
              <button
                onClick={handleDelete}
                className="px-3 py-1 bg-red-600 text-white text-xs rounded-md shadow-md"
              >
                Confirmar
              </button>
              <button
                onClick={() => setIsConfirmingDelete(false)}
                className="px-3 py-1 bg-gray-300 text-gray-800 text-xs rounded-md shadow-md"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div
            className="text-center text-sm"
            onClick={() => setIsModalOpen(true)}
          >
            <p className="text-green-600">
              Ingresos:{" "}
              <span className="font-semibold">
                {formatCurrency(incomesTotal)}
              </span>
            </p>
            <p className="text-red-600">
              Egresos:{" "}
              <span className="font-semibold">
                {formatCurrency(expensesTotal)}
              </span>
            </p>
            <p className="text-blue-600">
              Ahorro:{" "}
              <span className="font-semibold">
                {formatCurrency(monthData.savings)}
              </span>
            </p>
            <p
              className={`font-bold mt-2 ${
                balance >= 0 ? "text-blue-600" : "text-red-600"
              }`}
            >
              Balance: {formatCurrency(balance)}
            </p>
          </div>
        )}
      </div>
      <MonthModal
        month={month}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

const MonthlySummary = () => {
  const { data, addNewMonth, isLoading, userId } = useFinance();

  const months = Object.keys(data).sort((a, b) => {
    const [ma, ya] = a.toLowerCase().split(" ");
    const [mb, yb] = b.toLowerCase().split(" ");
    const yaNum = parseInt(ya);
    const ybNum = parseInt(yb);
    const ia = MONTH_ORDER.indexOf(ma);
    const ib = MONTH_ORDER.indexOf(mb);
    if (yaNum !== ybNum) return ybNum - yaNum;
    return ib - ia;
  });

  const [newMonthInput, setNewMonthInput] = useState("");

  const handleAddMonth = () => {
    if (newMonthInput.trim() !== "") {
      addNewMonth(newMonthInput.trim());
      setNewMonthInput("");
    }
  };

  return (
    <div className="p-4 sm:p-8 bg-gray-100 min-h-screen font-sans">
      <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6 text-center">
        Resumen Mensual
      </h2>
      <div className="flex justify-center text-sm text-gray-500 mb-6">
        <span className="font-mono text-gray-700 break-all">
          ID de Usuario: {userId}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
          <p className="ml-4 text-gray-600">Cargando tus datos...</p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-4">
            <input
              type="text"
              placeholder="Escribe un mes (ej. Enero 2024)"
              className="w-full md:w-auto px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
              value={newMonthInput}
              onChange={(e) => setNewMonthInput(e.target.value)}
            />
            <button
              onClick={handleAddMonth}
              className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md transition-transform transform hover:scale-105"
            >
              Agregar Mes
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {months.map((month) => (
              <MonthCard key={month} month={month} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// 7) APLICACIÓN (Auth Gate + Nav + Logout)
// -----------------------------------------------------------------------------

const InnerApp = () => {
  const { userId, isLoading, logOut } = useFinance();
  const [view, setView] = useState("dashboard");

  // Gate de autenticación
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-4 text-gray-700">Verificando sesión...</span>
        </div>
      </div>
    );
  }

  if (!userId) {
    // No autenticado: muestra Login
    return <LoginView />;
  }

  // Autenticado: muestra tu app completa
  return (
    <div className="font-sans antialiased text-gray-900 bg-gray-100 min-h-screen">
      <nav className="bg-white border-b border-gray-300 p-4 mb-4 shadow-sm">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">
            Gestor de Finanzas
          </h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setView("dashboard")}
              className={`px-4 py-2 text-sm rounded-lg transition-colors duration-200 ${
                view === "dashboard"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setView("summary")}
              className={`px-4 py-2 text-sm rounded-lg transition-colors duration-200 ${
                view === "summary"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Resumen Mensual
            </button>
            <button
              onClick={logOut}
              className="px-3 py-2 text-sm rounded-lg bg-gray-100 border border-gray-300 hover:bg-gray-200 text-gray-700"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </nav>

      {view === "dashboard" ? <Dashboard /> : <MonthlySummary />}
    </div>
  );
};

const App = () => {
  return (
    <FinanceProvider>
      <InnerApp />
    </FinanceProvider>
  );
};

export default App;
