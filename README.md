# Medianoche — Backend (API)

API REST para el e-commerce **Medianoche**, construida con **NestJS 11**, **Prisma** y **PostgreSQL**.

## Stack

- NestJS 11 (TypeScript, CommonJS)
- Prisma ORM + PostgreSQL 16 (vía Docker)
- Autenticación JWT (Passport) + bcryptjs
- Validación con class-validator

## Requisitos

- Node.js 20.9+ (probado con 22.x)
- Docker Desktop (para la base de datos)

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Levantar PostgreSQL (puerto host 5433 -> contenedor 5432)
docker compose up -d

# 3. Aplicar migraciones y generar el cliente Prisma
npx prisma migrate dev

# 4. Cargar datos de ejemplo (categorías, productos y usuario demo)
npm run db:seed

# 5. Arrancar la API en modo desarrollo
npm run start:dev
```

La API queda en `http://localhost:3001/api`.

> **Nota:** el contenedor de Postgres publica el puerto **5433** del host (el 5432
> suele estar ocupado por una instalación local de PostgreSQL). La `DATABASE_URL`
> en `.env` ya apunta a `localhost:5433`.

## Variables de entorno (`.env`)

| Variable         | Descripción                                  |
| ---------------- | -------------------------------------------- |
| `DATABASE_URL`   | Cadena de conexión a PostgreSQL              |
| `JWT_SECRET`     | Secreto para firmar los JWT                  |
| `JWT_EXPIRES_IN` | Expiración del token (p. ej. `7d`)           |
| `PORT`           | Puerto de la API (por defecto `3001`)        |
| `FRONTEND_URL`   | Origen permitido para CORS (`localhost:3000`) |
| `FIREBASE_PROJECT_ID` | ID del proyecto Firebase (para verificar tokens de Google) |

## Login con Google

`POST /api/auth/google` recibe un `idToken` de Firebase (obtenido en el frontend),
lo **verifica** contra las llaves públicas de Google (`jose`) validando firma,
emisor y audiencia (`FIREBASE_PROJECT_ID`), hace _find-or-create_ del usuario y
devuelve un JWT propio. No requiere service account.

## Usuario demo

Tras el seed:

- **Email:** `demo@medianoche.com`
- **Contraseña:** `password123`

## Endpoints

| Método | Ruta                 | Auth | Descripción                               |
| ------ | -------------------- | ---- | ----------------------------------------- |
| GET    | `/api/health`        | —    | Health check                              |
| POST   | `/api/auth/register` | —    | Registro (`name`, `email`, `password`)    |
| POST   | `/api/auth/login`    | —    | Login (`email`, `password`)               |
| POST   | `/api/auth/google`   | —    | Login con Google (`idToken` de Firebase)  |
| GET    | `/api/auth/me`       | JWT  | Usuario autenticado                       |
| GET    | `/api/products`      | —    | Catálogo (`q`, `category`, `page`, `limit`) |
| GET    | `/api/products/:id`  | —    | Detalle de producto                       |
| GET    | `/api/categories`    | —    | Categorías con conteo de productos        |
| GET    | `/api/cart`          | JWT  | Carrito del usuario                       |
| POST   | `/api/cart/items`    | JWT  | Agregar ítem (`productId`, `quantity`)    |
| PATCH  | `/api/cart/items/:id`| JWT  | Actualizar cantidad (`quantity`)          |
| DELETE | `/api/cart/items/:id`| JWT  | Eliminar ítem                             |

Las rutas con `JWT` requieren el encabezado `Authorization: Bearer <token>`.

## Modelo de datos

- **User** — usuarios (rol `USER` / `ADMIN`).
- **Category** — categorías del catálogo.
- **Product** — productos (precio en centavos: `priceCents`).
- **CartItem** — ítems del carrito, únicos por (usuario, producto).

## Scripts útiles

```bash
npm run start:dev      # desarrollo con watch
npm run build          # compilar a dist/
npm run prisma:studio  # explorar la BD en el navegador
npm run db:seed        # recargar datos de ejemplo
```
