# Multi-Tenant Event Ticketing Platform

A multi-tenant SaaS event ticketing platform. Organizations create events and
venues, sell tickets, and manage bookings — each fully isolated from every
other organization's data.

## 📚 Project Documentation

For a complete technical overview of this project—including architecture, database schema, API endpoints, implementation details, roadmap, and development notes—please refer to the following document:

👉 **[Technical Documentation](./Docs/Technical_documentation.md)**

## Tenancy Model

Document-level tenancy: shared DB, shared collections, every tenant-owned
document carries an `organizationId`.

- **User** — global identity (login), not tied to any single org
- **Organization** — the tenant
- **OrganizationMember** — links a User to an Organization with a role
  (owner / admin / staff)

## Stack

- Backend: Node.js, Express, MongoDB/Mongoose (MVC: controllers / services /
  models / routes / middlewares)
- Frontend: React + Vite

## Project Structure

```
ticketing-platform/
├── backend/
│   ├── src/
│   │   ├── config/       # DB connection, env setup
│   │   ├── models/       # Mongoose schemas
│   │   ├── controllers/  # Route handlers
│   │   ├── services/     # Business logic
│   │   ├── routes/       # Express routers
│   │   ├── middlewares/  # Auth, tenant resolution, role checks
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
└── frontend/              # Vite + React app
```

## Setup

### Backend
```bash
cd backend
npm install
cp .env.example .env   # then fill in your own MONGO_URI and JWT_SECRET
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
