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

## Railway connections and health

- `/health` is a liveness check only. It stays independent of PostgreSQL and Redis.
- `/health/deep` performs a read-only PostgreSQL `SELECT 1` and, when configured,
  a Redis `PING`. A failed dependency returns HTTP 503. Redis health checks time out
  after one second and do not write keys. An absent `REDIS_URL` is explicitly
  reported as `not_configured` and does not make Redis mandatory for local use.
- Set `REDIS_URL` with a Railway service-variable reference to the intended Redis
  service. Do not paste connection strings into source, logs, or pull requests.
  The client connects on startup, retries connections, and disconnects on shutdown.
  This establishes connection monitoring; it does not migrate rate limiting or
  application data into Redis.
- `TRUST_PROXY_HOPS` defaults to `1` in production and `0` otherwise. The production
  default assumes Railway's single trusted immediate proxy. Verify this against
  your actual request path before merging; additional proxies or direct access
  require reviewing the trust boundary. Set it to `0` to disable proxy trust.
  Values outside integers 0–10 fail startup; do not use blanket `trust proxy=true`.
- Console logs are structured JSON, including request/error metadata and timestamps.

Run `npx prisma generate`, `npm run type-check`, and `npm test` before merging.
The tests use an isolated simulated Redis protocol server and fake database checks;
they do not access production data. Keep `/health` as Railway's deployment probe,
and use `/health/deep` for dependency monitoring.
