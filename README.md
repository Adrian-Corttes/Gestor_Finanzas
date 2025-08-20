# 💰 Gestor de Finanzas

Aplicación web para la gestión de finanzas personales desarrollada con **React**, **Firebase** y **TailwindCSS**.  
Permite registrar ingresos, egresos, sub-ítems y artículos, con autenticación por correo electrónico, gráficos interactivos y control mensual del balance.

---

## 🚀 Características

- 📊 **Dashboard** con gráficos de ingresos y egresos.
- 📅 **Resumen mensual** con detalle por cada mes.
- ➕ **CRUD completo** (crear, editar, eliminar) para:
  - Ingresos
  - Egresos
  - Sub-ítems
  - Artículos
- 🔐 **Autenticación** con correo y contraseña usando Firebase Auth.
- ☁️ **Persistencia en la nube** con Firestore.
- 🎨 **Interfaz moderna y responsiva** con TailwindCSS.

---

## 🛠️ Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/USUARIO/REPO.git
   cd REPO
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura Firebase:
   - Ve a tu [consola de Firebase](https://console.firebase.google.com/).
   - Crea un proyecto y habilita **Firestore** y **Authentication (Email/Password)**.
   - Copia tu configuración en `app1.jsx` (objeto `firebaseConfig`).

4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

---

## 📦 Build para producción

```bash
npm run build
```

Los archivos generados estarán en la carpeta `/dist`.

---

## 📸 Capturas

> *(Aquí puedes añadir screenshots de tu app si lo deseas)*

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia MIT.  
¡Siéntete libre de usarlo y mejorarlo! 🚀
