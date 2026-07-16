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
| Payment processing | Stripe (test mode) |
| Email | Nodemailer (Gmail SMTP / App Password) |
| QR Code generation | `qrcode` npm package (data URL format) |
| Session management | `express-session` (in-memory, for cart) |
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
│   │   ├── config/       # DB connection setup, Stripe init, Cloudinary init, email transporter
│   │   ├── models/       # Mongoose schemas (User, Organization, OrganizationMember, Venue, Event, Booking)
│   │   ├── controllers/  # HTTP request/response handlers (thin layer)
│   │   ├── services/     # Business logic (all DB queries live here)
│   │   ├── routes/       # Express routers
│   │   ├── middlewares/  # auth, tenant resolution, role checks, uploads
│   │   ├── utils/        # jwt helpers, slugify helper, cloudinaryUpload helper
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

### 3.2 Config Files (`backend/src/config/`)

| File | Purpose | Key exports |
|---|---|---|
| `db.js` | MongoDB/Mongoose connection setup | (connects to MONGO_URI) |
| `cloudinary.js` | Cloudinary SDK config from env vars | configured cloudinary instance |
| `stripe.js` | Stripe SDK initialization | configured Stripe instance |
| `email.js` | Nodemailer transporter + HTML email template | `sendBookingConfirmation(booking, event, qrCodeUrl)` |

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
| `/o/:orgSlug/events/:eventId` | Public — no login | Buyer-facing event detail (with ticket qty input + "Add to Cart") |
| `/o/:orgSlug/cart/:eventId` | Public — no login | Session-based cart (quantity +/-, remove, subtotal) |
| `/o/:orgSlug/checkout/:eventId` | Public — no login | Checkout form (buyer name/email + Stripe redirect) |
| `/o/:orgSlug/bookings/:bookingId/confirmation` | Public — no login | Booking confirmation (QR code, ticket summary, email status) |

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
| `Venue`, `Event`, `Booking` | Tenant-owned | Always carries `organizationId`. |
| Cart (session-based) | Session-scoped | Lives in `req.session`, not persisted to MongoDB. Tenant-scoped by storing `organizationId` inside the cart object. |

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
| `ticketTypes` | Array of `{ name, price, quantityTotal, quantityBooked }` | embedded; `quantityBooked` defaults to 0, incremented atomically at checkout via MongoDB transaction |
| `createdAt` / `updatedAt` | Date | auto |

### 5.6 `Booking`
Tenant-owned. Records a completed ticket purchase after Stripe payment.

| Field | Type | Notes |
|---|---|---|
| `organizationId` | ObjectId → `Organization` | required, indexed |
| `eventId` | ObjectId → `Event` | required, indexed |
| `buyerName` | String | required, trim |
| `buyerEmail` | String | required, lowercase, trim |
| `items` | Array of `{ ticketTypeName, ticketTypeIndex, quantity, unitPrice, lineTotal }` | embedded, no `_id` on subdocs |
| `totalAmount` | Number | required, min 0 |
| `currency` | String | default `"PKR"` |
| `status` | String enum | `pending` \| `confirmed` \| `cancelled`, default `pending`, indexed |
| `paymentStatus` | String enum | `pending` \| `paid` \| `failed`, default `pending`, indexed |
| `stripeSessionId` | String | nullable, indexed — stores Stripe Checkout Session ID for lookup |
| `confirmationCode` | String | unique, sparse — auto-generated (`BK-<timestamp>-<random hex>`) |
| `qrCodeUrl` | String | nullable — data URL of generated QR code, set on confirmation |
| `expiresAt` | Date | nullable — set at creation to `createdAt + 90s`; the booking-hold scheduler releases tickets once this passes with no payment |
| `reminderSentAt` | Date | nullable — set once the 30s payment-reminder email has been sent, so it's never sent twice |
| `createdAt` / `updatedAt` | Date | auto (timestamps) |

`status` enum: `pending` \| `confirmed` \| `cancelled` \| `expired` (the last value added for the auto-release feature — see §7.7.2).

**Compound indexes:** `{ organizationId: 1, eventId: 1 }`, `{ buyerEmail: 1, createdAt: -1 }`

### 5.7 Cart (Session-Based, Not Persisted to MongoDB)

The cart is NOT a MongoDB model. It lives only in `req.session.carts` as a
JavaScript object keyed by `cart:<organizationId>:<eventId>`. Each cart entry
contains:

| Field | Type | Notes |
|---|---|---|
| `organizationId` | string (ObjectId) | Stored for tenant-scoping |
| `eventId` | string (ObjectId) | The event this cart is for |
| `items` | Array of `{ ticketTypeIndex, ticketTypeName, quantity, unitPrice }` | The selected tickets |
| `createdAt` | ISO string | When cart was first created |
| `updatedAt` | ISO string | Updated on every add/remove/change |

**Why session-based instead of a DB model?** Carts are ephemeral — they don't
need to survive server restarts or be queried. A DB-backed cart would add
complexity (orphaned carts, cleanup jobs) for no real benefit at this scope.

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

### 7.6 Cart — `/api/o/:orgSlug/cart`

All cart routes are **public** (no login required) and use **only** `resolveTenant` middleware. The cart lives in the buyer's session (express-session) and is tenant-scoped via `:orgSlug`.

> **Important note on session cookies:** The frontend axios client must be
> configured with `withCredentials: true` to send the session cookie on every
> request. See `frontend/src/api/client.js`.

| Method | Endpoint | Body | Notes |
|---|---|---|---|
| GET | `/api/o/:orgSlug/cart/:eventId` | — | Returns the cart + event details (populated venue). Creates an empty cart if one doesn't exist for this (org, event) pair. |
| POST | `/api/o/:orgSlug/cart/:eventId/items` | `{ ticketTypeIndex, quantity }` | Adds quantity to an existing ticket type, or creates a new entry. Validates remaining capacity before adding (409 if sold out). |
| PUT | `/api/o/:orgSlug/cart/:eventId/items` | `{ ticketTypeIndex, quantity }` | Sets exact quantity for a ticket type. Setting `quantity: 0` removes the item. Validates remaining capacity. |
| DELETE | `/api/o/:orgSlug/cart/:eventId/items/:ticketTypeIndex` | — | Removes a specific ticket type from the cart. |
| DELETE | `/api/o/:orgSlug/cart/:eventId` | — | Clears the entire cart for this event. |

### 7.7 Bookings — `/api/o/:orgSlug/events/:eventId/bookings`

All booking routes are **public** (no login) and use `resolveTenant` only — ticket buyers do not need an account. The exception is `GET /` (list all bookings for an event), which requires organizer membership.

| Method | Endpoint | Middleware | Body | Notes |
|---|---|---|---|---|
| POST | `/api/o/:orgSlug/events/:eventId/bookings/checkout` | resolveTenant | `{ buyerName, buyerEmail, items: [{ ticketTypeIndex, quantity }], cartKey? }` | **Creates a pending booking** inside a MongoDB transaction + **decrements quantityBooked atomically**. Creates a Stripe Checkout Session. Returns `{ bookingId, stripeSessionId, stripeUrl }`. The frontend redirects the browser to `stripeUrl` for card payment. **Idempotent** — see §7.7.1. |
| GET | `/api/o/:orgSlug/events/:eventId/bookings/confirm?session_id=xxx` | resolveTenant | — | Verifies Stripe payment status, generates QR code (data URL), updates booking status to `confirmed`, sends confirmation email. Idempotent — safe to call multiple times. |
| GET | `/api/o/:orgSlug/events/:eventId/bookings/:bookingId` | resolveTenant | — | Returns a single booking by ID (tenant-scoped). Populates event name/date/venue. |
| GET | `/api/o/:orgSlug/events/:eventId/bookings` | authenticate + resolveTenant + loadMembership | — | **Organizer only.** Lists all bookings for an event, sorted newest first. |

#### 7.7.1 Checkout & Confirmation Idempotency

Three layers of duplicate-prevention protect the checkout flow, from the
most application-level to the most infrastructure-level:

**Level 1 — `createCheckoutSession()`: duplicate checkout prevention.**
Before creating a new booking, the service checks for an existing
`pending` booking for the same `(eventId, buyerEmail)` pair. If one exists
and its Stripe session is still `open`/`requires_payment`, the **same**
`stripeUrl` is returned instead of creating a second booking (which would
double-decrement ticket inventory). If that old session has actually
expired on Stripe's side (24h), a fresh session is created and attached to
the *same* booking document, rather than creating a brand-new booking. This
is what stops a buyer double-clicking "Pay" (or resubmitting the checkout
form) from being charged twice or holding two sets of tickets.

**Level 2 — `confirmBooking()`: duplicate confirmation prevention.**
If a booking is already `status: "confirmed"` and `paymentStatus: "paid"`,
the function returns immediately without regenerating a QR code or
resending the confirmation email. This matters because `confirmBooking()`
can legitimately be called twice for the same successful payment — once
when the buyer's browser redirects back to the frontend success page, and
again from the Stripe webhook (§7.9) as a reliability fallback. Without
this check, the buyer would get two confirmation emails and two QR codes
for one purchase.

**Level 3 — Stripe server-side idempotency key.**
When creating the Stripe Checkout Session itself, an `idempotencyKey`
(`checkout-<email>-<eventId>-<bookingId>`) is passed to Stripe's API. This
is a safety net *underneath* Level 1 — even if our own application-level
check somehow ran twice concurrently (e.g. two near-simultaneous requests
racing past the Level 1 check before either had saved its booking), Stripe
itself guarantees only one Checkout Session is ever created for that exact
key, and returns the same session object for any repeat call with the same
key.

### 7.7.2 Auto-Release & Payment Reminder (Booking Hold Expiry)

A pending booking holds its tickets (via the `quantityBooked` decrement
already made at checkout) for a fixed **90-second window**
(`HOLD_DURATION_MS` in `booking.service.js`). A background scheduler
(`services/bookingScheduler.js`), started once from `server.js` after the
DB connects, sweeps the `Booking` collection every 5 seconds and does two
things:

| Elapsed since checkout | Action |
|---|---|
| **30 seconds**, still `pending`/`pending` | Sends a **payment reminder email** (`sendPaymentReminder` in `config/email.js`) containing a direct link to the *existing* Stripe Checkout Session URL (retrieved fresh via `stripe.checkout.sessions.retrieve`) — no new session is created for this. Marks `reminderSentAt` so it's never sent twice. |
| **90 seconds**, still `pending`/`pending` | **Releases the held tickets**: inside a MongoDB transaction, decrements each `Event.ticketTypes[i].quantityBooked` back down by the amount this booking had reserved, and sets the booking's `status` to `"expired"`. This makes the tickets purchasable by someone else again. |

**Why a periodic DB sweep instead of `setTimeout` per booking:** timers
scheduled in-process are lost if the server restarts. Storing `expiresAt`
as a real timestamp on the `Booking` document means the next sweep tick —
running in a fresh process if needed — still correctly identifies bookings
that are overdue, with no special recovery logic required.

**New `Booking` fields added for this feature** (see §5.6): `expiresAt`
(Date, set at creation to `createdAt + 90s`), `reminderSentAt` (Date,
`null` until the reminder fires). `status` enum gained a new value:
`"expired"`.

**Interaction with `confirmBooking()`:** if Stripe payment succeeds in the
narrow window after the scheduler has already expired a booking,
`confirmBooking()` now explicitly checks for `status: "expired"` and
returns a `410 Gone` rather than silently "confirming" a booking whose
tickets have already been given back to inventory.

**Bug found during manual testing (fixed same day):** the Level 1
duplicate-checkout check (§7.7.1) originally filtered only by
`paymentStatus: "pending"`, not `status`. Since the scheduler sets
`status: "expired"` on a released booking but leaves `paymentStatus:
"pending"` (payment genuinely never happened), an already-expired
booking's stale Stripe session was being matched as "still active" and
handed back to a buyer starting a fresh checkout — even though its
tickets had already been returned to inventory. Fixed by requiring
`status: "pending"` in that lookup as well, so expired bookings are never
mistaken for active ones.


### 7.8 Bookings (Alternative Simplified Path) — `/api/o/:orgSlug/bookings`

Stripe redirects the buyer back to the frontend confirmation page with a URL
like `/o/:orgSlug/bookings/:bookingId/confirmation?session_id=xxx`. The
frontend then calls these API endpoints:

| Method | Endpoint | Middleware | Body | Notes |
|---|---|---|---|---|
| GET | `/api/o/:orgSlug/bookings/:bookingId/confirm?session_id=xxx` | resolveTenant | — | Same as §7.7 confirm, but without requiring `eventId` in the URL path. |
| GET | `/api/o/:orgSlug/bookings/:bookingId` | resolveTenant | — | Same as §7.7 getOne, but without requiring `eventId` in the URL path. |

### 7.9 Stripe Webhook — `/api/webhooks/stripe`

| Method | Endpoint | Middleware | Body | Notes |
|---|---|---|---|---|
| POST | `/api/webhooks/stripe` | `express.raw({ type: "application/json" })` | Stripe event payload | **Must be registered BEFORE `express.json()` in app.js.** Constructs the event using Stripe's signature verification (`STRIPE_WEBHOOK_SECRET`). On `checkout.session.completed`, it calls `confirmBooking()` as a fallback in case the browser redirect fails. |

### 7.10 Image Hosting

Uploaded event banner images are streamed directly to **Cloudinary** (no
local disk storage). The `bannerImageUrl` field on an `Event` stores the
Cloudinary-hosted `secure_url` directly — the frontend loads images straight
from Cloudinary's CDN, not from this backend.

### 7.11 Planned / Not Yet Built

- Team invite endpoints (invite member by email, assign role)
- Org settings update endpoint (name, slug, logo)
- Analytics/dashboard endpoints (per-org bookings, revenue, tickets sold)

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
- Frontend: public event detail page with ticket types, remaining quantity, and "Add to Cart"
- **Session-based cart** (add, update, remove, clear — all via REST endpoints)
- **Stripe Checkout integration** (test mode — creates Stripe session, redirects buyer to Stripe hosted payment page)
- **Atomic ticket quantity decrement** (MongoDB transaction prevents overselling under concurrent requests)
- **Booking creation** (pending on checkout start, confirmed after payment)
- **QR code generation** (data URL embedded in booking document)
- **Confirmation email** (Nodemailer — HTML template with ticket details and QR code)
- **Frontend: Cart page** (quantity +/- controls, remove, subtotal, proceed to checkout)
- **Frontend: Checkout page** (buyer info form, order summary, Stripe redirect)
- **Frontend: Booking confirmation page** (QR code display, ticket summary, confirmation code)
- **Checkout/confirmation idempotency** (3 layers — see §7.7.1): duplicate checkout prevention, duplicate confirmation prevention, Stripe-side idempotency key
- **Automatic booking-hold release**: unpaid pending bookings release their held tickets back to inventory after 90 seconds
- **Payment reminder email**: sent 30 seconds into an unpaid pending booking, with a direct Stripe payment link

### 🔜 Planned (see [Roadmap](#12-roadmap--remaining-work) for detail)

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
| **Session-based cart over DB-backed cart** | Carts are ephemeral — they don't need to survive server restarts or be queried. A DB-backed cart would add complexity (orphaned carts, cleanup jobs) for no real benefit at this scope. | Implemented |
| **`express-session` with `saveUninitialized: true`** | Ensures a session cookie is created on the buyer's first cart request (GET /cart), so subsequent add/remove calls always have a valid session to write to. | Implemented |
| **Frontend axios with `withCredentials: true`** | Required for the browser to send the session cookie to the backend on CORS requests (frontend on :5173, backend on :5000). | Implemented |
| **Booking confirmation via frontend API call, not Stripe webhook (for local dev)** | During local development, Stripe can't reach `localhost`. The frontend calls the confirm endpoint directly with `session_id` after Stripe redirects back. The Stripe webhook is set up for production/staging as a reliability fallback. | Implemented |
| **QR code as data URL (not uploaded to CDN)** | Simpler — no extra upload step. The data URL is stored directly in the MongoDB document and served inline. For high-traffic production, consider uploading QR images to Cloudinary/S3. | Implemented |
| **Email sending is non-blocking** | If the email fails (wrong SMTP config, network issue), the booking is still confirmed and the user sees the confirmation page. The error is logged to console but doesn't block the booking flow. | Implemented |
| **Idempotency handled at 3 layers (app-level checkout, app-level confirmation, Stripe idempotency key)** rather than just one | Each layer guards a different failure mode: double-checkout-submission, double-confirmation-call (browser redirect race with webhook), and true concurrent-request races. Belt-and-suspenders is warranted here because a failure means real double charges. | Implemented |
| **Booking hold expiry via periodic DB sweep (`setInterval`, 5s), not per-booking `setTimeout`** | A stored `expiresAt` timestamp survives server restarts; an in-memory timer does not. For a single-instance dev/staging deployment this is sufficient; a multi-instance production deployment would need a distributed lock or a dedicated job queue (e.g. BullMQ) so the sweep doesn't run redundantly on every instance — noted as a future hardening item. | Implemented (single-instance) |
| **90s hold / 30s reminder are fixed constants (`HOLD_DURATION_MS`, `REMINDER_AFTER_MS`), not env-configurable** | Kept simple for now; trivial to promote to `.env` values later if the organizer needs this tunable per event. | Implemented |

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

### 10.2 Complete `.env` Reference

Full list of all environment variables used by the backend:

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | Server port (default: 5000) |
| `MONGO_URI` | Yes | Standard (non-SRV) MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | Long random string for JWT signing |
| `JWT_EXPIRES_IN` | No | JWT expiry (default: `7d`) |
| `SESSION_SECRET` | No | Secret for express-session (default: `"stagepass-cart-secret"`) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key starting with `sk_test_` |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret starting with `whsec_` — **not needed for local dev** (booking confirmation works via frontend callback) |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name (from dashboard) |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret |
| `EMAIL_HOST` | No | SMTP host (default: `smtp.gmail.com`) |
| `EMAIL_PORT` | No | SMTP port (default: `587`) |
| `EMAIL_USER` | Conditional* | Gmail address for sending confirmation emails |
| `EMAIL_PASS` | Conditional* | Gmail App Password (16 chars, no spaces) — NOT the regular Gmail password |
| `EMAIL_FROM` | No | Sender name/address (default: `"StagePass <noreply@stagepass.com>"`) |
| `FRONTEND_URL` | No | Frontend URL for Stripe redirect (default: `http://localhost:5173`) |

> **\*Email is optional:** If `EMAIL_USER` is not set, the confirmation email
> will be skipped (logged as a warning) but the booking will still be confirmed
> and the QR code will still be generated. The email failure does NOT block
> the checkout flow.

### 10.3 Setting Up Email (Gmail App Password)

**Step-by-step for using Gmail as the email sender:**

1. Enable **2-Step Verification** on your Google Account.
2. Go to **Google Account → Security → App passwords**.
3. Select **"Mail"** + **"Other (Custom name)"** → name it `StagePass`.
4. Copy the 16-character app password (e.g., `abcd efgh ijkl mnop`).
5. Remove spaces: `abcdefghijklmnop`.
6. Add to `.env`:
   ```
   EMAIL_USER=yourname@gmail.com
   EMAIL_PASS=abcdefghijklmnop
   ```

### 10.4 Setting Up Stripe Test Mode

1. Sign up at https://dashboard.stripe.com/ (free).
2. Go to **Developers → API keys**.
3. Copy the **Secret key** (starts with `sk_test_`).
4. Add to `.env`: `STRIPE_SECRET_KEY=sk_test_xxxxxxxx...`
5. **Test card number:** `4242 4242 4242 4242` with any future expiry date and any CVC.
6. **Webhook secret (`whsec_`)** is NOT needed for local development — the booking
   confirmation is handled by the frontend success page. The webhook endpoint
   exists in the codebase and will work once deployed with a public URL.

### 10.5 Backend Setup

```bash
cd backend
npm install
cp .env.example .env   # then fill in all required values
npm run dev
```

### 10.6 Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 10.7 Frontend Axios Configuration

The frontend API client (`frontend/src/api/client.js`) includes:

```js
const apiClient = axios.create({
  baseURL: "http://localhost:5000/api",
  withCredentials: true,  // Required for session cookie to work across CORS
});
```

The `withCredentials: true` setting is critical for the session-based cart
to work. Without it, the browser won't send the session cookie on API calls
to the backend, and each request would appear to come from a different
anonymous session.

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

### Week 2, Day 4-5 — Cart, Booking & Checkout (Full Feature)
- **Cart Model Decision:** Cart is session-based (not a MongoDB model) — lives
  in `req.session.carts` keyed by `cart:<orgId>:<eventId>`. This was chosen over
  a DB-backed cart to avoid orphaned-cart cleanup complexity.
- Built `backend/src/services/cart.service.js` — full CRUD for session-based
  cart items (add, update/remove-by-zero, remove-by-index, clear). Each
  mutation validates remaining ticket capacity against the Event document
  before allowing the change (409 Conflict if insufficient).
- Built `backend/src/controllers/cart.controller.js` and
  `backend/src/routes/cart.routes.js` — mounted at `/api/o/:orgSlug/cart`
  with `resolveTenant` only (public, no login).
- **Session Fix:** The axios client was updated with `withCredentials: true`
  so the browser sends the session cookie on CORS requests. The session config
  uses `saveUninitialized: true` and `maxAge: 24h`.
- Built `backend/src/models/Booking.js` — tenant-scoped booking schema with
  embedded items array, status/paymentStatus enums, Stripe session ID, unique
  confirmation code, and QR code URL.
- Enhanced `backend/src/services/booking.service.js` — added `createCheckoutSession()`
  (atomic MongoDB transaction + Stripe Checkout session creation), `confirmBooking()`
  (verifies payment with Stripe, generates QR code via `qrcode` npm package, updates
  status, sends confirmation email via Nodemailer), `handleStripeWebhook()`, `getBooking()`,
  and `getEventBookings()`. The original `createBooking()` is preserved as a fallback.
- **Overselling Prevention:** The `createCheckoutSession` function runs inside a MongoDB
  transaction. It reads the event, checks remaining capacity for each ticket type,
  decrements `quantityBooked`, creates the Booking document, and creates the Stripe
  session — all atomically. If two concurrent requests try to buy the last ticket, only
  one succeeds; the other gets a 409 error.
- **QR Code Generation:** Uses the `qrcode` npm package to generate a data URL (PNG as
  base64). The QR encodes `{ bookingId, confirmationCode, eventId, buyerEmail }`. This
  data URL is stored in `booking.qrCodeUrl` and displayed on the frontend confirmation page.
- **Confirmation Email:** Uses Nodemailer with Gmail SMTP + App Password. Sends an HTML
  email with booking details table, confirmation code, and embedded QR code image.
  Email failure is non-blocking (logged to console, booking still confirmed).
- **Stripe Webhook Endpoint:** Registered before `express.json()` in app.js to receive
  raw body for signature verification. Handles `checkout.session.completed` as a
  reliability fallback.
- Built `backend/src/config/stripe.js` (Stripe SDK init), `backend/src/config/email.js`
  (Nodemailer transporter + HTML email template).
- Updated `backend/src/routes/booking.routes.js` and added
  `backend/src/routes/bookingConfirm.routes.js` (alternative path without `:eventId`
  for Stripe redirect compatibility).
- **Frontend Cart Page** (`frontend/src/pages/CartPage.jsx`) — displays cart items with
  quantity +/-, remove button, subtotal, and "Proceed to Checkout" button.
- **Frontend Checkout Page** (`frontend/src/pages/CheckoutPage.jsx`) — buyer name/email
  form, order summary table, "Pay with Card" button that redirects to Stripe.
- **Frontend Booking Confirmation Page** (`frontend/src/pages/BookingConfirmation.jsx`) —
  displays confirmation code, status, total paid, ticket summary table, QR code image
  (if generated), and "Browse More Events" link.
- **Frontend Event Detail Enhancement** — added quantity input and "Add" button for each
  ticket type, "View Cart" link in header, and "Go to Cart" bottom button.
- **All 3 new frontend pages** registered in `frontend/src/App.jsx`.
- Updated `.env.example` with all new environment variables (Stripe, Email, Session, Frontend URL).

### Week 2, Day 4-5 (continued) — Checkout & Confirmation Idempotency
- Added duplicate-checkout prevention to `createCheckoutSession()`: looks
  up any existing `pending` booking for the same `(eventId, buyerEmail)`
  before creating a new one; reuses the existing Stripe session URL if
  still valid, or reattaches a freshly-created session to the *same*
  booking if the old one expired on Stripe's side.
- Added duplicate-confirmation prevention to `confirmBooking()`: returns
  immediately, without regenerating a QR code or resending the
  confirmation email, if the booking is already `confirmed` + `paid`. This
  matters because the frontend success-page redirect and the Stripe
  webhook can both call this function for the same successful payment.
- Added a Stripe-side `idempotencyKey` (`checkout-<email>-<eventId>-<bookingId>`)
  to the Checkout Session creation call — a safety net beneath the
  application-level check, guaranteeing Stripe itself never creates two
  sessions for the same key even under a genuine race.
- See §7.7.1 for the full breakdown of all three layers.

### Week 2, Day 4-5 (continued) — Auto-Release & Payment Reminder
- **Team lead task:** if a buyer starts checkout (Stripe page opens) but
  doesn't complete payment, their held tickets should be released for
  other buyers, with a reminder email sent first.
- Added `expiresAt` and `reminderSentAt` fields to the `Booking` model,
  and a new `"expired"` value to its `status` enum.
- `createCheckoutSession()` now sets `expiresAt = createdAt + 90s`
  (`HOLD_DURATION_MS`) on every new booking (and refreshes it if an
  expired Stripe session is replaced with a fresh one for the same
  booking).
- Built `services/bookingScheduler.js` — a periodic sweep (`setInterval`,
  every 5s), started once from `server.js` after the DB connects:
  - `sendPendingReminders()`: finds `pending` bookings older than 30s
    with no reminder sent yet, retrieves the live Stripe Checkout Session
    URL, and emails it via the new `sendPaymentReminder()` template
    (`config/email.js`).
  - `releaseExpiredBookings()`: finds `pending` bookings past their
    `expiresAt`, and inside a MongoDB transaction decrements each held
    `Event.ticketTypes[i].quantityBooked` back down and marks the
    booking `"expired"`.
- Chose a DB-timestamp-based sweep over per-booking `setTimeout` calls
  specifically because timestamps survive server restarts (see [Key
  Technical Decisions](#9-key-technical-decisions)).
- `confirmBooking()` now explicitly rejects (`410 Gone`) confirming a
  booking whose status is already `"expired"`, to correctly handle the
  edge case of a late Stripe payment succeeding just after the scheduler
  already released the tickets.

---

## 12. Roadmap — Remaining Work

Mapped directly from the original 4-week project plan. Items already done
are marked as complete; this section lists what's **left**.

### Week 2 — Core Ticketing Features
- [x] Session-based cart (add/remove ticket type + quantity)
- [x] Booking creation on checkout start
- [x] Overselling-safe quantity decrement under concurrent requests
- [x] Stripe test-mode checkout
- [x] Booking confirmation + QR code generation
- [x] Confirmation email

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
| **2026-07-15** | **Week 2 Day 4-5: Cart, Booking & Checkout — full implementation** | **Tech Stack (§2), Architecture (§3.1, §3.2, §3.3), Database Schema (§5.6, §5.7), API Endpoints (§7.6–§7.11), Feature List (§8), Key Technical Decisions (§9), Environment & Setup (§10.2–§10.7), Implementation Log (§11), Roadmap (§12)** |
| 2026-07-16 | Documented the checkout/confirmation idempotency (3 layers) that had been implemented but not yet written up | API Endpoints (§7.7.1), Feature List, Implementation Log |
| 2026-07-16 | Added booking auto-release (90s) + payment reminder email (30s) via a background scheduler; new `Booking.expiresAt`/`reminderSentAt` fields and `"expired"` status | Database Schema (§5.6), API Endpoints (§7.7.2), Feature List, Key Technical Decisions, Implementation Log |
| 2026-07-16 | Bug fix: idempotency lookup in `createCheckoutSession` now also filters `status: "pending"` (not just `paymentStatus`), so an already-expired booking's stale Stripe session can no longer be mistaken for an active one | API Endpoints (§7.7.2), Implementation Log |