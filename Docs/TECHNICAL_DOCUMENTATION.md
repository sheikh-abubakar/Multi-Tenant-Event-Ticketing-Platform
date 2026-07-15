# Multi-Tenant Event Ticketing Platform — Technical Documentation

> **Purpose of this document:** This is the single source of technical truth
> for this project. It covers the stack, architecture, database schema, every
> API endpoint, what has been built so far (with the reasoning behind each
> decision), and what remains to be built. Anyone — a new developer, an AI
> coding assistant, or the team lead — should be able to read this file and
> understand the system without needing prior context.
>
> **This is a living document.** It will be updated after every implementation
> step and after every team discussion that changes a decision. See the
> [Change Log](#change-log) at the bottom for a running history of updates.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Multi-Tenancy Model](#4-multi-tenancy-model)
5. [Database Schema](#5-database-schema)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [API Endpoints](#7-api-endpoints)
8. [Feature List](#8-feature-list)
9. [Key Technical Decisions](#9-key-technical-decisions)
10. [Environment & Local Setup](#10-environment--local-setup)
11. [Implementation Log](#11-implementation-log)
12. [Roadmap — Remaining Work](#12-roadmap--remaining-work)
13. [Change Log](#change-log)

---

## 1. Project Overview

A multi-tenant SaaS event ticketing platform. Multiple independent
**organizations** (event organizers) use the same application and the same
database to create venues and events, sell tickets, and manage bookings —
with each organization's data fully isolated from every other organization's,
even though everything lives in shared MongoDB collections.

**Two distinct user types:**
- **Organizers** — need an account, create/join an Organization, hold a role
  (owner/admin/staff) within it.
- **Ticket buyers** — browse public event pages and purchase tickets; they do
  not need to belong to any organization.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js |
| Backend framework | Express.js |
| Database | MongoDB Atlas (cloud-hosted) |
| ODM | Mongoose |
| Authentication | JWT (jsonwebtoken), bcryptjs for password hashing |
| File uploads | Multer (in-memory) → Cloudinary (hosted image storage) |
| Frontend framework | React |
| Frontend build tool | Vite |
| Package manager | npm |
| Repo structure | Monorepo — `backend/` and `frontend/` in one repo |
| API testing tool | Thunder Client (VS Code extension) |
| Version control | GitHub |

---

## 3. Architecture

### 3.1 Repo Structure

```
ticketing-platform/
├── backend/
│   ├── src/
│   │   ├── config/       # DB connection setup
│   │   ├── models/       # Mongoose schemas
│   │   ├── controllers/  # HTTP request/response handlers (thin layer)
│   │   ├── services/     # Business logic (all DB queries live here)
│   │   ├── routes/       # Express routers
│   │   ├── middlewares/  # auth, tenant resolution, role checks, uploads
│   │   ├── utils/        # jwt helpers, slugify helper
│   │   ├── app.js        # Express app assembly (mounts all routes)
│   │   └── server.js     # Entry point — connects DB, starts server
│   ├── uploads/          # Locally stored uploaded files (gitignored)
│   ├── .env.example
│   └── package.json
├── frontend/              # Vite + React app
└── docs/
    ├── PROJECT_PLAN.md               # Original shared requirements doc
    └── TECHNICAL_DOCUMENTATION.md    # This file
```

### 3.3 Frontend Routing

| Path | Access | Page |
|---|---|---|
| `/` | Public (shows different content if logged in) | Home — landing or "My Organizations" grid |
| `/signup`, `/login` | Public | Auth forms |
| `/create-organization` | Protected | Create Organization |
| `/o/:orgSlug/dashboard` | Protected (must be a member) | Organizer dashboard shell |
| `/o/:orgSlug/manage/venues` | Protected (must be a member) | Venue management (organizer) |
| `/o/:orgSlug/manage/events` | Protected (must be a member) | Event management (organizer) |
| `/o/:orgSlug/events` | Public — no login | Buyer-facing storefront (event listing) |
| `/o/:orgSlug/events/:eventId` | Public — no login | Buyer-facing event detail |

> **Note on this structure:** the original plan describes the public storefront
> living at `/o/:orgSlug/events`. Since the organizer's own event-management
> screen would otherwise collide with that same path in this single frontend app,
> organizer-facing management pages were placed under a `/manage/` prefix instead.
> The underlying REST API is unaffected — both the storefront and the dashboard
> call the same `/api/o/:orgSlug/events` endpoints, just with different HTTP
> methods (see §7.5).



The backend follows a strict layered pattern. A controller **never** talks to
the database directly — it always goes through a service.

```
Request
   │
   ▼
Route (routes/*.routes.js)
   — defines the URL + HTTP method, wires up middleware + controller
   │
   ▼
Middleware chain (middlewares/*)
   — authenticate → resolveTenant → loadMembership → checkRole
   — each step attaches data to `req` for the next step to use
   │
   ▼
Controller (controllers/*.controller.js)
   — reads req.body / req.params, calls the matching service function,
     shapes the HTTP response (status code + JSON)
   — contains NO business logic and NO direct Mongoose queries
   │
   ▼
Service (services/*.service.js)
   — all business logic and ALL database queries live here
   — every tenant-owned query filters by organizationId
   │
   ▼
Model (models/*.js)
   — Mongoose schema definitions, talks to MongoDB
```

**Why this separation matters:** if business logic (e.g. booking rules)
changes, only the service file changes — routes and controllers stay
untouched. It also makes the codebase testable in isolation.

---

## 4. Multi-Tenancy Model

**Approach: Document-level tenancy.** Shared database, shared collections.
Every tenant-owned document carries an `organizationId` field.

### 4.1 Tenant Resolution Strategy

Path-param based: `/api/o/:orgSlug/...`

A slug (e.g. `coke-studio-events`) uniquely identifies an organization and
appears directly in the URL. A dedicated middleware (`resolveTenant`) reads
this slug on every request, looks up the matching `Organization` document,
and attaches it to `req.organization` / `req.organizationId` **before any
controller logic runs**.

> Subdomain-based routing (`coke-studio.platform.com`) was considered but
> deferred — it adds DNS/SSL complexity. It remains a possible Week 4 stretch
> goal.

### 4.2 The Core Isolation Rule

**Every query for a tenant-owned resource MUST filter by `organizationId` in
the query itself — never fetch-then-check in application code.**

```js
// Correct — structurally impossible to cross tenant boundaries
Venue.findOne({ _id: venueId, organizationId })

// Wrong — fetches first, checks after; easy to forget the check
const venue = await Venue.findById(venueId);
if (venue.organizationId !== organizationId) throw ...
```

This single rule is what "resource-ownership guard" means throughout this
project, and it is applied in every service function that reads/updates/
deletes a tenant-owned document.

### 4.3 Global vs. Tenant-Scoped Data

| Model | Scope | Notes |
|---|---|---|
| `User` | Global | Not tied to any org. One login, many possible org memberships. |
| `Organization` | Is the tenant | The thing being isolated. |
| `OrganizationMember` | Links User ↔ Organization | Carries the role. A user can have a different role in each org. |
| `Venue`, `Event` (and everything built after) | Tenant-owned | Always carries `organizationId`. |

---

## 5. Database Schema

### 5.1 `User`
Global identity. No `organizationId` — a user is not owned by any org.

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `email` | String | required, unique, lowercase |
| `passwordHash` | String | required — bcrypt hash, never plaintext |
| `createdAt` / `updatedAt` | Date | auto (timestamps) |

### 5.2 `Organization`
The tenant.

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `slug` | String | required, unique, lowercase, url-safe (`a-z0-9-` only) — used in `/o/:orgSlug/...` |
| `logoUrl` | String | optional, default `null` |
| `createdAt` / `updatedAt` | Date | auto |

### 5.3 `OrganizationMember`
Join table: User ↔ Organization, with role.

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId → `User` | required |
| `organizationId` | ObjectId → `Organization` | required |
| `role` | String enum | `owner` \| `admin` \| `staff`, required |
| `createdAt` / `updatedAt` | Date | auto |

**Compound unique index:** `{ userId: 1, organizationId: 1 }` — a user can
only have one membership row per organization. This index also serves as the
primary lookup used on every authorized request.

### 5.4 `Venue`
Tenant-owned.

| Field | Type | Notes |
|---|---|---|
| `organizationId` | ObjectId → `Organization` | required, indexed |
| `name` | String | required |
| `address` | String | optional |
| `city` | String | optional |
| `capacity` | Number | optional, min 0 |
| `createdAt` / `updatedAt` | Date | auto |

### 5.5 `Event`
Tenant-owned. Ticket types are **embedded subdocuments** (not a separate
collection) since they have no meaning outside their parent event and there
is no seat-map complexity (flat price + quantity only).

| Field | Type | Notes |
|---|---|---|
| `organizationId` | ObjectId → `Organization` | required, indexed |
| `venueId` | ObjectId → `Venue` | required — validated to belong to the same org at write time |
| `name` | String | required |
| `description` | String | optional |
| `dateTime` | Date | required |
| `bannerImageUrl` | String | optional, set via image upload |
| `ticketTypes` | Array of `{ name, price, quantityTotal, quantityBooked }` | embedded; `quantityBooked` defaults to 0, incremented at checkout time |
| `createdAt` / `updatedAt` | Date | auto |

### 5.6 Planned / Not Yet Built

| Model | Purpose | Target Week |
|---|---|---|
| `Booking` | Records a completed ticket purchase (buyer info, event, ticket type, quantity, QR code, payment status) | Week 2 |
| Cart (likely session-based, may not be a persisted model) | Buyer's in-progress selection before checkout | Week 2 |

---

## 6. Authentication & Authorization

### 6.1 Authentication (Global)

- JWT-based. Token contains **only** `userId` — no role, no organizationId.
- Reasoning: the same token is used across all of a user's organizations.
  Role/org context is resolved fresh on every request, not baked into the
  token.
- Token expiry: 7 days (`JWT_EXPIRES_IN` env var). **Team decision:** no
  refresh-token mechanism — a simple long-lived JWT is sufficient for this
  project's scope (see [Change Log](#change-log)).
- Passwords are hashed with bcrypt (10 salt rounds) before storage; never
  stored or logged in plaintext.

### 6.2 Authorization Pipeline

Every tenant-scoped, protected route runs through this exact middleware
chain, in this order:

```
authenticate → resolveTenant → loadMembership → checkRole (optional, per-route)
```

| Step | Middleware file | What it proves | Fails with |
|---|---|---|---|
| 1 | `middlewares/authenticate.js` | "This is a real, logged-in user" (verifies JWT, loads `User`, attaches `req.user`) | `401` |
| 2 | `middlewares/resolveTenant.js` | "This URL refers to a real organization" (looks up `:orgSlug`, attaches `req.organization` / `req.organizationId`) | `404` |
| 3 | `middlewares/loadMembership.js` | "This user is actually a member of THIS organization" (looks up `OrganizationMember`, attaches `req.membership`) | `403` |
| 4 | `middlewares/checkRole.js` | "This user's role is allowed to perform this specific action" (factory function, takes an allowed-roles array) | `403` |

Public (buyer-facing) routes use **only step 2** — no login required.
Organizer routes use steps 1–3 at minimum; destructive actions add step 4.

### 6.3 Role Matrix

Roles live on `OrganizationMember`, never globally on `User`. The same user
can be `owner` in one org and `staff` in another.

| Role | Can do |
|---|---|
| `owner` | Everything — settings, team management, delete org, all resource CRUD |
| `admin` | Resource CRUD (venues/events/etc.), invite team members, view analytics. Cannot delete the organization or remove the owner. |
| `staff` | Day-to-day operational CRUD (create/edit events, view bookings). Cannot invite members, change org settings, or perform destructive deletes. |

**Current enforcement:** all three roles can create/view/update venues and
events (operational work). Only `owner`/`admin` can delete a venue or event
(destructive action). This split is a reasonable default set during
implementation — flagged for team lead confirmation if a different rule is
wanted (see [Key Technical Decisions](#9-key-technical-decisions)).

---

## 7. API Endpoints

Base URL (local dev): `http://localhost:5000`

### 7.1 Auth — `/api/auth`

| Method | Endpoint | Auth required | Body | Notes |
|---|---|---|---|---|
| POST | `/api/auth/signup` | No | `{ name, email, password }` | Creates a `User`, returns `{ token, user }` |
| POST | `/api/auth/login` | No | `{ email, password }` | Returns `{ token, user }` |
| GET | `/api/auth/me` | Yes (Bearer token) | — | Returns the logged-in user's own profile. Proves `authenticate` middleware works; no org/role logic. |

### 7.2 Organizations — `/api/organizations`

| Method | Endpoint | Auth required | Body | Notes |
|---|---|---|---|---|
| POST | `/api/organizations` | Yes | `{ name, slug? }` | Creates an `Organization` + an `OrganizationMember` (role: `owner`) atomically via a transaction. `slug` auto-generated from `name` if omitted. |
| GET | `/api/organizations/mine` | Yes | — | Lists every organization the logged-in user belongs to, with their role in each. Powers the "pick your organization" screen on the frontend. |

### 7.3 Tenant Demo/Utility Routes — `/api/o/:orgSlug`

| Method | Endpoint | Auth required | Pipeline steps | Notes |
|---|---|---|---|---|
| GET | `/api/o/:orgSlug/info` | No | resolveTenant only | Public org info — the shape every buyer-facing route takes |
| GET | `/api/o/:orgSlug/whoami` | Yes | authenticate → resolveTenant → loadMembership | Debug/demo route returning user + org + role |
| GET | `/api/o/:orgSlug/settings` | Yes, role-restricted | ...→ checkRole(["owner","admin"]) | Demo route proving role restriction works |

### 7.4 Venues — `/api/o/:orgSlug/venues`

All routes: authenticate → resolveTenant → loadMembership (applied at router level).

| Method | Endpoint | Role restriction | Body | Notes |
|---|---|---|---|---|
| POST | `/api/o/:orgSlug/venues` | any member | `{ name, address?, city?, capacity? }` | |
| GET | `/api/o/:orgSlug/venues` | any member | — | Lists all venues for this org only |
| GET | `/api/o/:orgSlug/venues/:venueId` | any member | — | 404 if venue belongs to a different org |
| PUT | `/api/o/:orgSlug/venues/:venueId` | any member | any subset of `{ name, address, city, capacity }` | |
| DELETE | `/api/o/:orgSlug/venues/:venueId` | owner/admin only | — | 204 on success |

### 7.5 Events — `/api/o/:orgSlug/events`

Reading is public for the storefront; writing requires organizer membership.

| Method | Endpoint | Auth | Role restriction | Body (form fields) | Notes |
|---|---|---|---|---|---|
| GET | `/api/o/:orgSlug/events` | No | — | — | Public listing. Populates venue name/city, sorted by date. This is the storefront's data source. |
| GET | `/api/o/:orgSlug/events/:eventId` | No | — | — | Public detail. 404 if event belongs to a different org. |
| POST | `/api/o/:orgSlug/events` | Yes | any member | `name, dateTime, venueId, description?, ticketTypes? (JSON string), banner (file)?` | Validates `venueId` belongs to the same org |
| PUT | `/api/o/:orgSlug/events/:eventId` | Yes | any member | any subset, `banner` file optional | Re-validates `venueId` if changed |
| DELETE | `/api/o/:orgSlug/events/:eventId` | Yes | owner/admin only | — | 204 on success |

### 7.6 Image Hosting

Uploaded event banner images are streamed directly to **Cloudinary** (no
local disk storage). The `bannerImageUrl` field on an `Event` stores the
Cloudinary-hosted `secure_url` directly — the frontend loads images straight
from Cloudinary's CDN, not from this backend.

### 7.7 Not Yet Built

- Cart endpoints
- Checkout / Stripe integration
- Booking confirmation, QR code generation
- Team invite endpoints
- Org settings update endpoint
- Analytics/dashboard endpoints

---

## 8. Feature List

### ✅ Implemented

- User signup/login with hashed passwords
- JWT-based authentication
- Organization creation (atomic, creates owner membership simultaneously)
- Auto-generated unique organization slugs
- Path-param tenant resolution (`/o/:orgSlug`)
- Full authorization middleware pipeline (authenticate → resolveTenant → loadMembership → checkRole)
- Role matrix: owner / admin / staff
- Cross-tenant isolation, verified via manual testing (403/404 on cross-org access attempts)
- Venue CRUD (tenant-scoped, resource-ownership guarded)
- Event CRUD (tenant-scoped, resource-ownership guarded)
- Embedded ticket types (name, price, quantity) per event
- Event banner image upload (Cloudinary-hosted)
- Cross-resource validation (event's venue must belong to the same org)
- Frontend: auth (signup/login), org creation, "My Organizations" listing
- Frontend: Venue management UI (organizer dashboard)
- Frontend: Event management UI (organizer dashboard, incl. ticket types and banner upload)
- Frontend: public event storefront listing page
- Frontend: public event detail page with ticket types and remaining quantity

### 🔜 Planned (see [Roadmap](#12-roadmap--remaining-work) for detail)

- Cart + checkout (Stripe test mode)
- Overselling-safe ticket quantity decrement
- QR code generation + booking confirmation email
- Tenant isolation audit + compound indexes (hardening pass)
- Org settings page (name, slug, logo)
- Team invites (email-based, role assignment)
- Organizer analytics dashboard
- Soft-delete for organization deletion
- Testing (unit + integration)
- Deployment to staging

---

## 9. Key Technical Decisions

A running log of decisions made during implementation — either made
independently and flagged for team lead awareness, or made *by* the team lead
directly.

| Decision | Reasoning | Status |
|---|---|---|
| Document-level tenancy (shared collections + `organizationId`) over separate DBs/schemas per tenant | Simpler to build and query; acceptable risk tradeoff for this project's scale, provided the resource-ownership guard rule is followed everywhere | Confirmed (per original plan) |
| Tenant resolution via path param (`/o/:orgSlug`), not subdomain | Simpler deployment/SSL; subdomain remains a Week 4 stretch goal | Confirmed (per original plan) |
| JWT contains only `userId`, no role/org | Same token must work across all of a user's org memberships; role/org resolved fresh per-request | Implemented |
| No refresh token — single 7-day JWT is sufficient | **Team lead decision** | Confirmed |
| Organization deletion will be soft-delete (`isDeleted`/`deletedAt` flag), not a hard MongoDB delete | **Team lead decision** — keeps data in DB, just hidden from frontend | Confirmed, not yet implemented (pending delete-org feature) |
| Any role (owner/admin/staff) can create/edit venues & events; only owner/admin can delete them | Reasonable operational default set during implementation | ⚠️ Not yet confirmed with team lead — flag if a stricter/looser rule is wanted |
| Ticket types embedded in `Event`, not a separate collection | No standalone meaning outside parent event; avoids unnecessary joins | Implemented |
| Uploaded images stored on Cloudinary (hosted), not local disk | **Team lead decision** — avoids filesystem storage limits and works correctly once deployed (local disk storage doesn't persist/scale on most hosting platforms) | Implemented |
| Seat-map based seat selection deferred; flat price + quantity per ticket type used for now | **Team lead decision** — current scope stays simple; seat-map is a planned future enhancement, understood to require a new `Seat` model, per-seat status tracking, real-time seat locking, and new frontend UI — not a trivial add-on | Confirmed, deferred |

---

## 10. Environment & Local Setup

### 10.1 Known Environment Constraints

- **API testing tool:** Thunder Client (VS Code extension) — Postman Desktop
  not installed due to local storage constraints. Thunder Client's free tier
  does not support file-upload testing; file uploads are verified via the
  frontend (`FormData`) once built, or via `curl`/Hoppscotch if needed
  earlier.
- **MongoDB Atlas connectivity:** the default `mongodb+srv://` connection
  string failed to resolve on the development machine's network
  (`querySrv ECONNREFUSED`, a DNS/SRV-record resolution issue, not an Atlas
  problem). Resolved by using Atlas's **standard (non-SRV) connection
  string** instead, which lists the shard hostnames explicitly and avoids
  the SRV DNS lookup entirely.

### 10.2 Backend Setup

```bash
cd backend
npm install
cp .env.example .env   # then fill in MONGO_URI and JWT_SECRET
npm run dev
```

Required `.env` values:
```
PORT=5000
MONGO_URI=<standard (non-SRV) MongoDB Atlas connection string, includes db name>
JWT_SECRET=<long random string>
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=<from Cloudinary dashboard>
CLOUDINARY_API_KEY=<from Cloudinary dashboard>
CLOUDINARY_API_SECRET=<from Cloudinary dashboard>
```

### 10.3 Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## 11. Implementation Log

A day-by-day technical record of what was built and why, mapped to the
original project plan.

### Week 1, Day 1 — Project Setup & Tenancy Design
- Scaffolded backend (Express, MVC folder structure) and frontend (Vite +
  React) inside one monorepo.
- Defined core schemas: `User`, `Organization`, `OrganizationMember`.
- Set up MongoDB connection config and base Express app with a health-check
  route.

### Week 1, Day 2 — Global Authentication
- Implemented signup/login with bcrypt password hashing.
- Implemented JWT issuance (`utils/jwt.js`) containing only `userId`.
- Built the `authenticate` middleware — verifies the JWT, loads the `User`,
  attaches `req.user`. Proven working via a protected `/api/auth/me` route.

### Week 1, Day 3 — Org Onboarding & Tenant Resolution
- Built `organization.service.js` — creates an `Organization` and its owner's
  `OrganizationMember` row inside a single MongoDB transaction (atomic — both
  succeed or both fail together, preventing an "orphaned" org with no owner).
- Built slug auto-generation (`utils/slugify.js`) with uniqueness checking.
- Built the `resolveTenant` middleware — reads `:orgSlug` from the URL,
  looks up the `Organization`, attaches `req.organization` /
  `req.organizationId` before any controller logic runs.
- Demo routes (`/api/o/:orgSlug/info`, `/whoami`) built to prove both the
  public (no-auth) and protected (auth + tenant) request shapes work.

### Week 1, Day 4-5 — Authorization & Role Scoping
- Built `loadMembership` middleware — looks up the `OrganizationMember` row
  for the current `(user, organization)` pair; this is the actual gatekeeper
  that stops a valid, logged-in user from touching an org they don't belong
  to.
- Built `checkRole` middleware factory — takes an allowed-roles array,
  blocks the request with `403` if the user's role in this org isn't in that
  list.
- Assembled the full pipeline: `authenticate → resolveTenant →
  loadMembership → checkRole`.
- Manually verified cross-tenant isolation: a valid token from User A,
  targeting a real organization owned by User B, correctly receives `403`
  from `loadMembership` (see test steps in project chat history / Thunder
  Client collection).

### Week 2, Day 1 (part 1) — Venue CRUD
- Built `Venue` model (tenant-scoped, `organizationId` required + indexed).
- Built `venue.service.js` establishing the **resource-ownership guard
  pattern** used for every tenant-owned resource going forward: every query
  filters by `organizationId` directly in the Mongoose query (e.g.
  `Venue.findOne({ _id, organizationId })`), never fetch-then-check.
- Full CRUD implemented and manually tested, including a cross-tenant
  negative test (User B cannot fetch User A's venue by ID — `404`).

### Week 2, Day 1 (part 2) — Event CRUD + Ticket Types + Image Upload
- Built `Event` model with embedded `ticketTypes` subdocuments (name, price,
  quantityTotal, quantityBooked).
- Built `event.service.js` following the same ownership-guard pattern, plus
  an additional cross-resource check: an event's `venueId` must belong to
  the *same* organization as the event itself.
- Built `middlewares/upload.js` (Multer) — validates image mimetype
  (jpeg/png/webp), 5MB limit, saves to `backend/uploads/event-banners/`
  with a unique filename.
- Wired event routes to accept `multipart/form-data` for create/update,
  serving uploaded images statically at `/uploads/event-banners/<filename>`.
- Manually tested via Thunder Client (JSON fields); file-upload testing
  deferred to frontend build (Thunder Client free tier doesn't support file
  uploads in requests).

### Week 2, Day 1 (part 3) — Switched Image Storage to Cloudinary
- **Team lead decision:** use Cloudinary for image hosting instead of local
  disk storage.
- Reworked `middlewares/upload.js` to use Multer's `memoryStorage` (file
  lives only as a Buffer in RAM during the request) instead of writing to
  the local filesystem.
- Added `config/cloudinary.js` (SDK config from env vars) and
  `utils/cloudinaryUpload.js` (streams the in-memory buffer to Cloudinary,
  returns the hosted `secure_url`).
- Updated `event.controller.js` create/update handlers to `await` the
  Cloudinary upload before saving `bannerImageUrl`.
- Removed the local `/uploads` static-file route from `app.js` — no longer
  needed since images are served directly from Cloudinary's CDN.
- Discussed seat-map based seating (an alternative to the current flat
  price+quantity ticket model) with team lead — confirmed deferring it;
  documented as a future enhancement requiring a new `Seat` model, per-seat
  status tracking, real-time locking, and new frontend UI (see [Key
  Technical Decisions](#9-key-technical-decisions)).

### Week 2, Day 3 — Public Event Storefront
- Split event routing so public GET requests are no longer protected by `authenticate`/`loadMembership`, while organizer write routes remain protected.
- Added a public frontend event listing page at `/o/:orgSlug/events` that fetches public org info plus org-scoped events.
- Added a public event detail page at `/o/:orgSlug/events/:eventId` that shows event banner, venue, description, ticket types, and remaining quantity.
- Moved organizer event management UI to `/o/:orgSlug/manage/events` to avoid collision with the public storefront route.
- Preserved the existing tenant-isolation rule by continuing to resolve the organization from `:orgSlug` on all event requests.


### Frontend — Stage 1: Foundation, Auth, Org Creation
- Scaffolded frontend architecture: `react-router-dom` for routing,
  `axios` client (`src/api/client.js`) with an interceptor that
  auto-attaches the JWT from `localStorage` to every request.
- Built `AuthContext` — holds global identity (token + user), mirroring the
  backend's "User is global" model. Which org/role is active is resolved
  per-page (via `:orgSlug` in the URL + a `/whoami` call), not stored here.
- Built pages: Signup, Login, Create Organization, Dashboard (shell — calls
  `/whoami` for the current `:orgSlug`, shows an "Access denied" state if
  the backend returns 403).
- Added placeholder Venues/Events pages (full CRUD UI is the next stage).
- Established the visual design system (`index.css`): a "ticket stub"
  themed palette (deep navy + gold accent + warm paper-tone cards) with a
  dashed "tear line" divider as the recurring signature motif.

### Frontend + Backend — "My Organizations" Listing
- Added `GET /api/organizations/mine` (backend) — lists every organization
  the logged-in user belongs to, with their role in each, by querying
  `OrganizationMember` for the user and populating the linked
  `Organization`.
- Updated the Home page to fetch and display this list as a grid of
  poster-style cards (`OrgCard` component) — each organization gets a
  deterministic gradient (hashed from its slug via `utils/orgTheme.js`), so
  it looks distinct but stays visually consistent across visits. Manual
  slug entry kept as a collapsed fallback option underneath.

### Frontend — Stage 2: Venue & Event Management UI
- Replaced the Venues placeholder with full CRUD: create/edit form + list,
  calling the existing `/o/:orgSlug/venues` endpoints directly.
- Replaced the Events placeholder with full CRUD: create/edit form
  (including a venue `<select>`, dynamic add/remove ticket-type rows, and a
  file input for the banner image), submitted as `multipart/form-data` via
  `FormData` — the browser sets the correct headers automatically, so no
  manual header wiring was needed on the frontend.
- Both pages additionally call `/whoami` to read the current user's role in
  this org, and conditionally hide the "Delete" button unless the role is
  `owner` or `admin` — mirroring the backend's `checkRole` restriction on
  those same endpoints (the backend still enforces this regardless; the
  frontend hiding the button is a UX nicety, not the actual security
  boundary).

---

## 12. Roadmap — Remaining Work

Mapped directly from the original 4-week project plan. Items already done
are struck through in spirit (see [Implementation Log](#11-implementation-log)
above for what's actually complete); this section lists what's **left**.

### Week 2 — Core Ticketing Features (remaining)
- [ ] Session-based cart (add/remove ticket type + quantity)
- [ ] Booking creation on checkout start
- [ ] Overselling-safe quantity decrement under concurrent requests
- [ ] Stripe test-mode checkout
- [ ] Booking confirmation + QR code generation
- [ ] Confirmation email

### Week 3 — SaaS Layer: Multi-Tenancy Hardening & Org Tooling
- [ ] Audit all Week 1-2 queries for missing `organizationId` filters
- [ ] Add compound indexes (`organizationId` + hot query fields)
- [ ] Formalize resource-ownership guards as a reusable pattern/utility if needed
- [ ] Org settings page (name, slug, logo) + soft-delete on org deletion
- [ ] Team management & invites (email-based, role assignment)
- [ ] Organizer analytics dashboard (bookings, revenue, tickets sold — scoped per org)
- [ ] Booking confirmation email polish
- [ ] Stretch: Socket.io tenant-scoped live sales ticker

### Week 4 — Polish, Testing & Deployment
- [ ] Frontend responsive polish, loading/error/empty states, form validation
- [ ] Unit tests (cart, booking, auth services)
- [ ] Integration tests (tenant isolation)
- [ ] Code review + bug fixes
- [ ] README + API docs finalization
- [ ] Move uploaded file storage to cloud (S3/Cloudinary) before deploy
- [ ] Deploy to staging
- [ ] Demo: two organizations, proving full data isolation

---

## Change Log

> Every entry here should reference the section(s) updated.

| Date | Change | Section(s) affected |
|---|---|---|
| 2026-07-14 | Initial document created, covering Week 1 (complete) and Week 2 Day 1 Venue + Event CRUD | All |
| 2026-07-14 | Switched image storage from local disk to Cloudinary (team lead decision); documented seat-map deferral decision | Tech Stack, Key Technical Decisions, Environment & Setup, API Endpoints (7.6), Implementation Log |
| 2026-07-15 | Frontend Stage 1 built (auth, org creation, dashboard shell); added GET /organizations/mine + "My Organizations" card grid UI | API Endpoints (7.2), Implementation Log, Roadmap |
| 2026-07-15 | Frontend Stage 2 built: full Venue + Event management UI (organizer dashboard), including ticket types and banner upload | Feature List, Implementation Log, Roadmap |

| 2026-07-15 | Implemented public event storefront and event detail pages; split organizer event management route to `/manage/events` | Architecture, API Endpoints (7.5), Feature List, Implementation Log, Roadmap |