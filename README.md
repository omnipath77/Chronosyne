# Chronosyne Backend API

This project is a secure, modular Node.js/TypeScript API boilerplate with authentication, user CRUD, Prisma integration, TypeScript, and best security practices.

## Structure

- `src/`
  - `index.ts` (Entrypoint)
  - `middleware/`
    - `auth.ts` (JWT authentication)
    - `errorHandler.ts` (centralized error handling)
    - `requestLogger.ts` (logging requests)
  - `routes/`
    - `auth.ts` (auth/register/login/self)
    - `users.ts` (user CRUD)
  - `types/`
- `prisma/` (add your `schema.prisma` here)
- `.env.example` (sample env vars)
- `package.json` / `tsconfig.json`

## Setup

1. Copy your `prisma/schema.prisma` into `prisma/`
2. Install dependencies: `npm install`
3. Generate Prisma client: `npx prisma generate`
4. (Optional) Run migrations: `npx prisma migrate dev`
5. Start dev server: `npm run dev`

---

This includes:
- Express + TypeScript
- Auth (JWT, bcrypt)
- Rate limiting
- Helmet, CORS
- Prisma/Postgres
- Centralized request+error logging (Winston)
- Lint/type check scripts
