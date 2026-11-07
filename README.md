# Cómo correr el proyecto

## Opción A: demo rápida (solo el front)

Funciona sin base de datos ni backend, con datos de prueba en el navegador.

```
cd frontend
npm install
copy .env.example .env
```

En `frontend/.env` poner `VITE_USE_MOCK=true` y luego:

```
npm run dev
```

Abrir **http://localhost:5173**.

## Opción B: sistema completo (base + backend + front)

Se usan tres terminales (en VS Code, con el botón **+** del panel de terminal), todas abiertas en la carpeta del proyecto.

### 1. Base de datos

Con Docker Desktop abierto:

```
docker compose up -d
```

La primera vez crea la base `proyecto_bd` en el puerto 3307 y ejecuta los scripts de `db/init`: tablas, triggers, datos de prueba, vistas y usuarios.

Para recrearla desde cero (por ejemplo, después de un cambio en `db/init`):

```
docker compose down -v
docker compose up -d
```

### 2. Backend (Flask)

```
cd backend
py -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Crear el archivo `backend/.env` con:

```
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=root12345
DB_NAME=proyecto_bd
JWT_SECRET=obligatorio_bd_2026
JWT_EXP_H=8
```

Levantarlo:

```
py app.py
```

Queda corriendo en **http://127.0.0.1:5000**. No cerrar esa terminal.

Las próximas veces alcanza con:

```
cd backend
venv\Scripts\activate
py app.py
```

### 3. Front (React)

```
cd frontend
npm install
copy .env.example .env
npm run dev
```

Con `VITE_USE_MOCK=false` en `frontend/.env`. Abrir **http://localhost:5173**.

Las próximas veces alcanza con `cd frontend` y `npm run dev`.

El front llama a `/api` y Vite reenvía esos pedidos al backend del puerto 5000, así que no hace falta configurar CORS.

## Usuarios de prueba

| Rol | Correo | Contraseña | Acceso |
|---|---|---|---|
| Administrador | admin@ucu.edu.uy | admin123 | Todas las secciones |
| Planillero | planillero@ucu.edu.uy | plan123 | Partidos y planillas |
