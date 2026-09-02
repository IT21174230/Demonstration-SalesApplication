# CLSynergy — Sales Tracking System Documentation

> **Branch Reference:** `authen`
> **Last Updated:** September 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Directory Structure](#4-directory-structure)
5. [Backend](#5-backend)
   - [Application Entry Point](#51-application-entry-point)
   - [REST API Endpoints](#52-rest-api-endpoints)
   - [Database & Data Models](#53-database--data-models)
   - [AI Chat Service](#54-ai-chat-service)
   - [Tool Definitions & Handler](#55-tool-definitions--handler)
   - [System Prompt](#56-system-prompt)
6. [Frontend](#6-frontend)
   - [Pages & Components](#61-pages--components)
   - [Routing](#62-routing)
   - [State Management](#63-state-management)
   - [API Client](#64-api-client)
   - [Types & Interfaces](#65-types--interfaces)
   - [Shared Components](#66-shared-components)
7. [Authentication & Authorization](#7-authentication--authorization)
   - [SSO Login Flow](#71-sso-login-flow)
   - [JWT Token Management](#72-jwt-token-management)
   - [Role-Based Access Control](#73-role-based-access-control)
8. [Business Workflows](#8-business-workflows)
   - [Inquiry Lifecycle](#81-inquiry-lifecycle)
   - [Rate Management](#82-rate-management)
   - [Quotation Workflow](#83-quotation-workflow)
   - [Booking Lifecycle](#84-booking-lifecycle)
   - [Shipment Tracking](#85-shipment-tracking)
   - [KYC Workflow](#86-kyc-workflow)
9. [Deployment](#9-deployment)
10. [Environment Variables](#10-environment-variables)
11. [Development Guide](#11-development-guide)

---

## 1. Project Overview

CLSynergy is a **Sales Tracking System** built for freight forwarding and logistics operations. It manages the complete lifecycle from customer inquiry through quotation, booking, and shipment delivery.

**Core capabilities:**

- **Inquiry Management** — Capture, classify, and route customer inquiries across SBUs (Ocean Exports, Ocean Imports, Air Freight, Domestic)
- **Rate Management** — Unified rate database aggregating contracted, FAK, spot, NAC, tariff, and special rates from multiple carriers
- **Quotation Builder** — Multi-line quotation creation with margin-based auto-approval routing
- **Booking Management** — End-to-end booking lifecycle including SI/BL documentation
- **Shipment Tracking** — Multi-leg shipment tracking with proof-of-delivery
- **KYC Compliance** — Customer onboarding with KYC verification workflow
- **AI Command Center** — Natural language chat interface powered by Claude for command-driven operations
- **Role-Based Dashboards** — Workspace views tailored per role (CS, Sales, Finance, Procurement, Admin)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Browser)                     │
│                                                         │
│  React 19 SPA ─── REST API ────┐                       │
│                  WebSocket ────┤                       │
└──────────────────────────────┬─┘                       │
                               │                         │
┌──────────────────────────────▼─────────────────────────┐
│                  FastAPI Backend                        │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  Routes   │  │ WebSocket│  │   CORS Middleware    │  │
│  │ /api/*   │  │  /ws     │  │  (+ WS fix)          │  │
│  └────┬─────┘  └────┬─────┘  └──────────────────────┘  │
│       │              │                                   │
│  ┌────▼─────┐  ┌────▼──────────┐                       │
│  │ Frontend │  │  Chat Service  │                       │
│  │ Queries  │  │ (Claude API)   │                       │
│  └────┬─────┘  └────┬──────────┘                       │
│       │              │                                   │
│  ┌────▼─────┐  ┌────▼──────────┐                       │
│  │  CRUD    │  │ Tool Handler   │                       │
│  │ Queries  │  │ (40+ functions)│                       │
│  └────┬─────┘  └────┬──────────┘                       │
│       │              │                                   │
│  ┌────▼──────────────▼──────┐                           │
│  │  JSON File Data Store    │                           │
│  │  (mock_data.json)        │                           │
│  └──────────────────────────┘                           │
└─────────────────────────────────────────────────────────┘
          │
          ▼
   ┌──────────────┐
   │ External APIs │
   │ • Claude AI   │
   │ • Resend Email│
   │ • INTTRA (sim)│
   └──────────────┘
```

**Pattern:** Modular monolith with JSON-file persistence (MVP-grade). The frontend communicates via REST for CRUD and WebSocket for AI chat.

---

## 3. Technology Stack

### Backend

| Component        | Technology                |
|------------------|---------------------------|
| Framework        | FastAPI 0.136.1           |
| Server           | Uvicorn 0.46.0            |
| Language         | Python 3.12               |
| AI Integration   | OpenAI SDK 2.35.1 (Claude)|
| Email            | Resend 2.30.0             |
| Validation       | Pydantic 2.13.3           |
| HTTP Client      | httpx 0.28.1, requests    |
| WebSocket        | websockets 16.0           |
| Data Store       | JSON file (mock_data.json)|

### Frontend

| Component        | Technology                |
|------------------|---------------------------|
| Framework        | React 19.2.5              |
| Language         | TypeScript ~6.0           |
| Build Tool       | Vite 8                    |
| Charts           | Recharts 3.8.1            |
| Icons            | Lucide React 1.8.0        |
| Linting          | ESLint 9 + TypeScript ESLint |
| Styling          | Plain CSS (dashboard.css) |

---

## 4. Directory Structure

```
MVP-Demo/
├── Dockerfile                          # Multi-stage Docker build
│
├── BackEnd/
│   ├── main.py                         # FastAPI app entry point
│   ├── requirments.txt                 # Python dependencies
│   ├── enrich_mock_data.py             # Data enrichment script
│   ├── Data/
│   │   ├── mock_data.json              # Primary JSON data store
│   │   ├── history.txt                 # Chat history persistence
│   │   ├── db_creation.sql             # Reference SQL schema
│   │   └── seed_rates.sql              # Reference seed data
│   ├── Prompts/
│   │   └── sys_prompt.py               # Claude system prompt
│   ├── routes/
│   │   └── frontend_api.py             # REST API routes
│   └── Utils/
│       ├── Chat/
│       │   ├── init_chat.py            # Chat orchestration (Claude API)
│       │   └── chat_bg_.py             # Chat history I/O
│       ├── DB_Query/
│       │   ├── queries.py              # Generic CRUD on JSON data
│       │   └── frontend_queries.py     # Frontend-specific transforms
│       └── Tools/
│           ├── tool_definitions.py     # Claude tool schemas (40+)
│           └── tool_handler.py         # Tool execution dispatch
│
└── FrontEnd/dashinterface/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    ├── .env.development
    └── src/
        ├── main.tsx                    # React DOM entry
        ├── App.tsx                     # Root component + state
        ├── api.ts                      # REST/Auth API client
        ├── types.ts                    # TypeScript interfaces & enums
        ├── auth.ts                     # JWT decode, SSO helpers
        ├── RoleContext.ts              # RBAC context provider
        ├── hooks.ts                    # usePersistentState
        ├── useWebSocket.ts             # WebSocket hook for chat
        ├── dashboard.css               # All component styles (70KB)
        ├── index.css                   # CSS variables & base
        ├── App.css                     # Minimal root styles
        └── components/
            ├── layout/
            │   ├── TopBar.tsx          # Header bar
            │   └── Sidebar.tsx         # Navigation + help panel
            ├── pages/
            │   ├── Login.tsx           # SSO login page
            │   ├── Dashboard.tsx       # KPI cards & charts
            │   ├── Workspace.tsx       # Role-based workflow hub
            │   ├── ChatAssistant.tsx   # AI command center
            │   ├── NewInquiry.tsx      # Inquiry creation form
            │   ├── InquiryList.tsx     # Inquiry list & management
            │   ├── RateCheck.tsx       # Rate lookup & manual entry
            │   ├── RateList.tsx        # Unified rate browser
            │   ├── RecordRate.tsx      # Record new rates (Procurement)
            │   ├── Quotations.tsx      # Quote builder & management
            │   ├── Shipments.tsx       # Shipment tracking
            │   ├── Customers.tsx       # Customer master data
            │   ├── KYCForm.tsx         # KYC onboarding
            │   ├── Followups.tsx       # Follow-ups & tasks
            │   └── Profile.tsx         # User profile & logout
            └── shared/
                ├── KPICard.tsx         # KPI metric card
                ├── NLQBox.tsx          # Natural language input
                ├── PortCombobox.tsx    # Port autocomplete (UN/LOCODE)
                ├── SearchCombobox.tsx  # Generic search dropdown
                ├── TagInput.tsx        # Multi-value tag input
                ├── CustomerEditModal.tsx # Customer edit modal
                └── WorkflowStepper.tsx # Workflow stage visualizer
```

---

## 5. Backend

### 5.1 Application Entry Point

**File:** `BackEnd/main.py`

The FastAPI application is initialized here with:

- **CORS Middleware** — Custom `_CORSWithWebSocketFix` class that allows origins from `localhost:5173` and `localhost:8000`, with special handling to prevent WebSocket connections from crashing due to HTTP CORS responses.
- **WebSocket Endpoint** (`/ws`) — Bidirectional real-time channel for the AI chat interface. Receives user queries and streams Claude-generated responses.
- **REST Router** — Mounts all frontend API routes via `app.include_router(frontend_router)`.
- **Static File Serving** — Serves the built React frontend from `/static` (production) and mounts `/assets` for Vite assets.
- **SPA Fallback** — Returns `index.html` for any unmatched routes to enable client-side routing.
- **Port:** 5000 (Uvicorn)

### 5.2 REST API Endpoints

**File:** `BackEnd/routes/frontend_api.py`

All endpoints are prefixed with `/api/`.

#### Initialization

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/init` | Bulk-loads all entities: customers, inquiries, tasks, missing items, followups, quotes, shipments, employees, bookings, activity log |

#### Inquiries

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/inquiries` | Create new inquiry |
| POST | `/api/inquiries/{fe_id}/complete` | Mark inquiry as completed |
| PATCH | `/api/inquiries/{fe_id}/workflow-stage` | Update workflow stage |
| POST | `/api/inquiries/reopen` | Reopen a completed inquiry |

#### Customers

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/customers` | Create new customer |
| PATCH | `/api/customers/{name}` | Update tier, payment terms, blacklist, credit hold, KYC status |

#### Rates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rates/search` | Search by origin, destination, container type, liner, rate type |

#### Quotations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/quotes` | Create quotation with multiple line items |
| PATCH | `/api/quotes/{quote_id}/status` | Update status (Draft → Awaiting Approval → Sent → Accepted/Rejected/Expired) |

#### Bookings

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bookings` | Create booking from accepted quote |
| PATCH | `/api/bookings/{id}/confirm` | Procurement confirms liner space |
| PATCH | `/api/bookings/{id}/release` | CS releases container instructions |
| PATCH | `/api/bookings/{id}/notify` | Notify Procurement of urgent booking |
| PATCH | `/api/bookings/{id}/si-cutoff` | Set SI cutoff date |
| PATCH | `/api/bookings/{id}/si-requested` | Mark SI request sent to customer |
| PATCH | `/api/bookings/{id}/si-submitted` | Mark SI submitted to liner |
| PATCH | `/api/bookings/{id}/bl-cutoff` | Set BL cutoff date |
| PATCH | `/api/bookings/{id}/draft-bl-sent` | Mark draft BL sent |
| PATCH | `/api/bookings/{id}/bl-status` | Set BL approval status |
| PATCH | `/api/bookings/{id}/master-bl` | Record master BL number |
| PATCH | `/api/bookings/{id}/house-bl` | Create house BL (door-to-door) |

#### Shipments

| Method | Endpoint | Description |
|--------|----------|-------------|
| PATCH | `/api/shipments/{id}/legs/{leg_id}` | Advance leg status (Pending → Arrived → Departed) |
| PATCH | `/api/shipments/{id}/pod` | Record proof-of-delivery |

#### Tasks & Follow-ups

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tasks` | Create a task/reminder |
| PATCH | `/api/tasks/{fe_id}/complete` | Mark task complete |
| POST | `/api/followups` | Create follow-up note |

#### Activity Log

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/activity-log` | Record an action entry |

#### Email

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/send-kyc` | Send KYC form via Resend email |
| POST | `/api/send-quotation` | Send quotation via Resend email |

#### INTTRA Integration (Simulated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/inttra/spot-rates` | Get simulated spot rates from shipping lines |
| POST | `/api/inttra/book` | Simulate booking with liner |
| POST | `/api/inttra/submit-si` | Simulate shipping instruction submission |

### 5.3 Database & Data Models

The system uses **JSON-file persistence** via `BackEnd/Data/mock_data.json`. All CRUD operations go through `BackEnd/Utils/DB_Query/queries.py` which provides thread-safe reads/writes using `threading.Lock` and atomic file replacement via `tempfile` + `os.replace()`.

#### Customer Schema

```json
{
  "id": 1,
  "name": "Hayleys Logistics",
  "customer_type": "existing",
  "contact_email": "ops@hayleys.lk",
  "contact_phone": "+94112345678",
  "kyc_status": "approved",
  "kyc_completed_at": "2026-01-15T10:00:00Z",
  "created_at": "2026-01-01T00:00:00Z",
  "tier": "Key Account",
  "payment_terms": "30-Day Credit",
  "location": "Colombo, Sri Lanka",
  "blacklisted": false,
  "credit_hold": false,
  "min_margin_pct": 7,
  "notes": ""
}
```

**KYC Status values:** `not_started` → `pending_customer` → `pending_finance_approval` → `approved` / `rejected`

**Tier values:** `Walk-in` | `Regular` | `Key Account`

**Payment Terms:** `Pay Upfront` | `30-Day Credit` | `60-Day Credit`

#### Inquiry Schema

```json
{
  "id": 5013,
  "fe_id": "INQ-1041",
  "customer_id": 10,
  "channel": "email",
  "origin": "Colombo",
  "destination": "Hamburg",
  "delivery_type": "port-to-port",
  "commodity": "Reefer containers",
  "container_type": "20'GP",
  "quantity": 12,
  "status": "new",
  "received_at": "2026-01-20T14:30:00Z",
  "received_by_party_id": 1,
  "inquiry_text": "We need 12 reefer containers...",
  "request": "12 reefer containers",
  "sbu": "Ocean Exports",
  "workflow_stage": "rate-check",
  "completed_at": null
}
```

**SBU values:** `Ocean Exports` | `Ocean Imports` | `Air Freight` | `Domestic`

**Workflow stages:** `inquiry-received` → `rate-check` → `quote-in-prep` → `quote-sent` → `booking-confirmed`

#### Quotation Schema

```json
{
  "id": "QUO-502",
  "inquiry_id": "INQ-1041",
  "customer_id": 10,
  "origin": "Colombo",
  "destination": "Hamburg",
  "quote_type": "FCA",
  "margin_pct": 7,
  "status": "Draft",
  "created_at": "2026-01-21 10:00",
  "created_by": 1,
  "approver_id": null,
  "approval_reason": null,
  "lines": [
    {
      "id": "LINE-1",
      "shipping_line": "Maersk Line",
      "rate_type": "Spot",
      "base_rate_usd": 1250,
      "transit_days": 15,
      "free_time_days": 7,
      "transshipment_points": "Direct",
      "destination_charges_usd": 150
    }
  ]
}
```

**Status flow:** `Draft` → `Awaiting Approval` → `Approved` → `Sent` → `Accepted` / `Rejected` / `Expired`

#### Booking Schema

```json
{
  "id": "BKG-901",
  "quote_id": "QUO-502",
  "customer_id": 10,
  "origin": "Colombo",
  "destination": "Hamburg",
  "shipping_line": "Maersk Line",
  "vessel_name": "MV Seatrade",
  "voyage_number": "0521W",
  "container_type": "20'GP",
  "quantity": 12,
  "delivery_type": "port-to-port",
  "status": "Pending Liner",
  "is_urgent": false,
  "booked_by": 2,
  "confirmed_by": null,
  "released_by": null,
  "created_at": "2026-01-22 09:00",
  "confirmed_at": null,
  "released_at": null,
  "procurement_notified": false,
  "si_cutoff_date": "2026-02-10",
  "si_requested": false,
  "si_submitted": false,
  "bl_cutoff_date": "2026-02-15",
  "bl_status": "pending",
  "draft_bl_sent": false,
  "master_bl_number": "",
  "house_bl_number": "",
  "notes": ""
}
```

**Status flow:** `Pending Liner` → `Liner Confirmed` → `Released` / `Cancelled`

#### Rate Schema

```json
{
  "id": 100,
  "liner_name": "Maersk Line",
  "origin": "Colombo",
  "destination": "Hamburg",
  "container_type": "20'GP",
  "rate_type": "contracted",
  "amount": 1250.00,
  "currency": "USD",
  "valid_from": "2026-01-01",
  "valid_to": "2026-12-31",
  "source_system": "AMS",
  "last_updated": "2026-01-15T10:00:00Z"
}
```

**Rate types:** `contracted` | `monthly` | `spot`

#### Shipment Schema

```json
{
  "id": "SHP-001",
  "booking_id": "BKG-901",
  "customer_id": 10,
  "status": "In Transit",
  "pod_received": null,
  "legs": [
    {
      "id": "LEG-1",
      "type": "Origin",
      "port": "Colombo",
      "status": "Departed",
      "scheduled_at": "2026-01-20",
      "actual_at": "2026-01-20"
    }
  ]
}
```

**Leg statuses:** `Pending` → `Arrived` → `Departed`

#### Employee Schema

```json
{
  "id": 1,
  "name": "Ramesh Kumar",
  "role": "Sales"
}
```

**Roles:** `Sales` | `CS` | `Finance` | `Procurement`

#### Activity Log Schema

```json
{
  "id": 1,
  "timestamp": "2026-01-20 14:30",
  "actor_role": "CS",
  "actor_id": 1,
  "action": "Inquiry received",
  "ref_type": "inquiry",
  "ref_id": "INQ-1041",
  "customer_name": "Hayleys Logistics",
  "pushed_to": "Procurement",
  "notes": ""
}
```

#### Frontend ID Mapping

The backend uses sequential integer IDs. The frontend transforms them:

| Entity | Frontend Format | Offset |
|--------|----------------|--------|
| Customer | `CUS-001` | — |
| Inquiry | `INQ-1041` | — |
| Quote | `QUO-502` | — |
| Booking | `BKG-900` | — |
| Task | `TSK-201` | +200 |
| Follow-up | `FUP-401` | +400 |
| Missing Item | `MIS-301` | +300 |

### 5.4 AI Chat Service

**Files:** `BackEnd/Utils/Chat/init_chat.py`, `BackEnd/Utils/Chat/chat_bg_.py`

The chat service orchestrates AI-powered conversations via Claude:

1. User message arrives via WebSocket (`/ws`)
2. Message is saved to `history.txt` as newline-delimited JSON
3. Last 10 messages are loaded for context
4. A request is sent to Claude API with the system prompt + history + current message
5. If Claude requests tool calls, they are executed via `tool_handler.py` and results are fed back
6. The agentic loop continues until Claude produces a final text response
7. Response is saved to history and sent back via WebSocket

**Configuration:**
- Model: Set via `OPEN_AI_MODEL` environment variable
- API Key: Set via `OPENAI_API` environment variable
- Fully async (`async/await`) for non-blocking I/O

### 5.5 Tool Definitions & Handler

**Files:** `BackEnd/Utils/Tools/tool_definitions.py`, `BackEnd/Utils/Tools/tool_handler.py`

40+ tool functions are defined using the OpenAI Tool schema format, organized into categories:

- **Lookup** — `get_all_records`, `get_record_by_id`, `search_customers`, `search_inquiries`, `search_rates`
- **Inquiry Lifecycle** — `create_inquiry`, `update_inquiry_status`
- **Process Management** — `create_process_instance`, `update_process_instance_status`, step execution management
- **Customer Management** — `create_customer`, `update_customer`
- **Rate Management** — `create_rate`, `search_rates`, `create_rate_request`, `update_rate_request_status`
- **Quotation Lifecycle** — `create_quotation`, `update_quotation_status`
- **Booking Lifecycle** — `create_booking`, `update_booking_status`, `search_bookings`, `notify_procurement`
- **KYC** — `send_kyc_form`
- **Admin** — `delete_record`

The `tool_handler.py` dispatches tool calls from Claude to the appropriate query functions and returns JSON-serialized results.

### 5.6 System Prompt

**File:** `BackEnd/Prompts/sys_prompt.py`

Defines the AI assistant's persona as a sales assistant for "ABC Logistics" with:

- Full process context (new customer flow, existing customer flow, urgent booking bypass)
- 27 structured commands parsed from user messages (e.g., `/new customer`, `/new inquiry`, `/quote`, `/lookup`)
- Response format guidelines (brief confirmations, no internal steps exposed)
- Last 5 messages loaded for conversation continuity

---

## 6. Frontend

### 6.1 Pages & Components

| Page | File | Size | Description |
|------|------|------|-------------|
| **Login** | `Login.tsx` | 1.2 KB | SSO login with Azure AD |
| **Dashboard** | `Dashboard.tsx` | 19 KB | KPI cards, pipeline charts, salesperson hit rates |
| **Workspace** | `Workspace.tsx` | 193 KB | Multi-step role-based workflow hub (largest component) |
| **Chat** | `ChatAssistant.tsx` | 47 KB | AI chat with intent detection, quick commands |
| **New Inquiry** | `NewInquiry.tsx` | 22 KB | Multi-container inquiry form |
| **Inquiry List** | `InquiryList.tsx` | 58 KB | Table/grid view with filters, inline editing |
| **Rate Check** | `RateCheck.tsx` | 98 KB | DB lookup, manual entry, review workflows |
| **Rate List** | `RateList.tsx` | 32 KB | Unified rate browser with filters |
| **Record Rate** | `RecordRate.tsx` | 46 KB | Procurement rate recording tool |
| **Quotations** | `Quotations.tsx` | 37 KB | Quote builder with approval workflow |
| **Shipments** | `Shipments.tsx` | 18 KB | Multi-leg shipment tracking |
| **Customers** | `Customers.tsx` | 11 KB | Customer master data management |
| **KYC Form** | `KYCForm.tsx` | 13 KB | Customer onboarding workflow |
| **Follow-ups** | `Followups.tsx` | 23 KB | Follow-up logging & task management |
| **Profile** | `Profile.tsx` | 2.3 KB | User profile & logout |

**Layout Components:**

| Component | File | Description |
|-----------|------|-------------|
| **TopBar** | `TopBar.tsx` | Header with brand, breadcrumb, role badge, user profile |
| **Sidebar** | `Sidebar.tsx` | Navigation menu with role-based access, help panel |

### 6.2 Routing

The app uses **manual client-side routing** via a `currentPage` state variable in `App.tsx` (no React Router). Navigation is handled by a `navigateTo(page)` function that updates the state, with role-based access enforced via `ROLE_PAGE_ACCESS`.

```typescript
type PageId =
  | 'dashboard' | 'chat' | 'workspace'
  | 'new-inquiry' | 'inquiry-list'
  | 'rate-list' | 'rate-check' | 'record-rate'
  | 'quotations' | 'shipments'
  | 'followups' | 'customers' | 'kyc'
  | 'profile'
```

If a user's role does not grant access to the requested page, they are redirected to the dashboard.

### 6.3 State Management

All application state lives in `App.tsx` using React `useState` hooks:

```
Global State (App.tsx)
├── ssoUser          — Current authenticated employee
├── inquiries[]      — All inquiries
├── tasks[]          — All tasks
├── followups[]      — All follow-ups
├── customers[]      — All customers
├── quotes[]         — All quotations
├── shipments[]      — All shipments
├── bookings[]       — All bookings
├── activityLog[]    — All activity entries
├── clientList[]     — Reference: all clients from backend
├── kycPendingClients[] — Reference: KYC-pending clients
├── kycRequests[]    — Reference: KYC request records
├── currentPage      — Active page ID
├── toast            — Toast notification state
├── initState        — App loading state (loading/ready/error)
└── rateCheckContext — Rate check workflow context
```

**Patterns used:**
- **Optimistic UI** — Local state updated immediately; API call runs in background
- **Derived state** — Filtered/computed lists via `useMemo`
- **Persistent state** — Chat messages and form drafts saved to `localStorage` via `usePersistentState()` hook (namespace: `mvp-demo:`)
- **Context** — `RoleContext` provides RBAC functions to all components

### 6.4 API Client

**File:** `src/api.ts` (~50 KB)

Centralized HTTP client with:

- **Base URL:** Configured via `VITE_API_BASE` env var (defaults to `/api`)
- **Auth headers:** All requests include `Authorization: Bearer ${access_token}`
- **Auto-retry on 401:** Token refresh with deduplication lock to prevent multiple simultaneous refresh calls
- **Error handling:** Throws on non-2xx responses with error detail

**Key endpoint groups:**

| Group | Example Endpoints |
|-------|-------------------|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Inquiries | `GET /inquiries/inquiries`, `POST /inquiries/inquiries-new-new`, `PATCH /inquiries/{id}` |
| Clients | `GET /clients/clients-db`, `PATCH /clients/{id}`, `GET /clients/kyc-pending` |
| Rates | `GET /rates/rates`, `POST /rates/rate-requests`, `POST /rates/vessel-rates` |
| Quotations | `POST /quotations`, `PATCH /quotations/{id}/send`, `PATCH /quotations/{id}/response` |
| Activities | `POST /activities` |
| Reference | `GET /liners`, `GET /ports`, `GET /trade-lanes`, `GET /employees` |

### 6.5 Types & Interfaces

**File:** `src/types.ts` (~46 KB)

Comprehensive TypeScript definitions for all domain entities:

**Core domain types:** `Inquiry`, `Quote`, `Booking`, `Customer`, `Shipment`, `ActivityEntry`, `Task`, `Followup`

**Workflow types:**
```typescript
type WorkflowStage =
  | 'rate-check'
  | 'procurement-request'
  | 'quotation-prep'
  | 'quotation-sent'
  | 'customer-response'
  | 'booking-request'
  | 'completed'
```

**Enums & constants:**
- `ContainerType` — `'20 GP'`, `'40 GP'`, `'40 HC'`, `'20 REEFER'`, etc.
- `CommodityType` — 22 HS chapter groupings
- `DeliveryType` — `'port-to-port'`, `'door-to-door'`, etc.
- `InquiryPriority` — `'Low'`, `'Medium'`, `'High'`, `'Urgent'`
- `QuoteType` — `'FCA'`, `'Domestic Included'`, `'Drayage'`, `'DDP'`
- `RateSourceType` — `'Contracted'`, `'FAK'`, `'Spot'`, `'Tariff Rate'`, `'NAC'`, `'Special'`

**Helper functions included in types.ts:**
- `findCustomer()` — Match customer by name
- `findCustomerCandidates()` — Fuzzy matching with token overlap
- `findDuplicateCustomers()` — Duplicate detection across email, phone, address
- `detectIntent()` — Multi-pass regex-based intent classifier for chat
- `parseInquiry()` — Extract structured data from natural language
- `isSpotInquiry()` — Heuristic urgency detection
- Date utilities: `todayISO()`, `isOverdue()`, `daysOverdue()`, `isDueToday()`

### 6.6 Shared Components

| Component | Description |
|-----------|-------------|
| `KPICard` | Metric card with label, value, trend indicator (up/down/neutral) |
| `WorkflowStepper` | Visual workflow stage progression with current stage highlight |
| `PortCombobox` | Port autocomplete with UN/LOCODE lookup from port database |
| `SearchCombobox` | Generic dropdown search for lists |
| `TagInput` | Multi-value tag input (e.g., preferred liners) |
| `CustomerEditModal` | Modal for inline customer property edits |
| `NLQBox` | Natural language query input for the chat interface |

---

## 7. Authentication & Authorization

### 7.1 SSO Login Flow

```
┌──────────┐         ┌──────────────┐         ┌────────────┐
│  Browser  │         │ Backend API  │         │  Azure AD  │
└─────┬────┘         └──────┬───────┘         └─────┬──────┘
      │                      │                       │
      │  Click "Sign in"     │                       │
      ├─────────────────────►│                       │
      │                      │  POST /auth/login     │
      │                      ├──────────────────────►│
      │                      │  { auth_url }         │
      │  Redirect to Azure   │◄──────────────────────┤
      │◄─────────────────────┤                       │
      │                      │                       │
      │  User authenticates  │                       │
      ├──────────────────────────────────────────────►│
      │                      │                       │
      │  Redirect back with tokens                   │
      │◄─────────────────────────────────────────────┤
      │  ?access_token=...&refresh_token=...         │
      │                      │                       │
      │  Store tokens in     │                       │
      │  localStorage        │                       │
      │                      │                       │
      │  Decode JWT claims   │                       │
      │  (sub, name, dept,   │                       │
      │   mail_id, desig)    │                       │
      │                      │                       │
      │  Map dept → UserRole │                       │
      │  Set RoleContext      │                       │
      └──────────────────────┘                       │
```

**Login page:** `Login.tsx` displays a "Sign in with Microsoft" button. On click, it calls `apiGetLoginUrl()` which returns an Azure AD authorization URL, then redirects the browser.

### 7.2 JWT Token Management

**File:** `src/auth.ts`

| Function | Purpose |
|----------|---------|
| `decodeJwt(token)` | Base64-decode JWT payload without external library |
| `isTokenExpired(token)` | Check expiry with 60-second safety buffer |
| `deptToRole(dept)` | Map department string to `UserRole` enum |
| `scheduleTokenRefresh(callback)` | Schedule refresh 1 minute before expiry |
| `getAccessToken()` | Retrieve stored access token |
| `setTokens(access, refresh)` | Store both tokens in localStorage |

**JWT Claims:**
```typescript
interface JwtClaims {
  sub: string       // Employee ID
  mail_id: string   // Email address
  name: string      // Full name
  dept: string      // Department
  desig: string     // Designation/title
  exp: number       // Expiry timestamp (Unix)
  jti: string       // Token ID
}
```

**Department → Role mapping:**

| Department | UserRole |
|------------|----------|
| `procurement` | `Procurement` |
| `finance` | `Finance` |
| `customer-service` | `CS` |
| `sales` | `Sales` |
| `IT` | `Admin` |

**Token refresh:** Automatic via `scheduleTokenRefresh()` which fires 1 minute before expiry. If a 401 response occurs during an API call, the client auto-refreshes and retries the request. A deduplication lock (`refreshPromise`) prevents multiple concurrent refresh calls.

### 7.3 Role-Based Access Control

**File:** `src/RoleContext.ts`, `src/types.ts`

Five user roles with hierarchical access:

```typescript
type UserRole = 'CS' | 'Sales' | 'Finance' | 'Procurement' | 'Admin'
```

#### Page Access Matrix

| Page | CS | Sales | Finance | Procurement | Admin |
|------|----|-------|---------|-------------|-------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Command Center (Chat) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Workspace | ✅ | ✅ | ✅ | ✅ | ✅ |
| New Inquiry | ✅ | ✅ | — | — | ✅ |
| Inquiry List | ✅ | ✅ | — | ✅ | ✅ |
| Rate List | ✅ | ✅ | — | ✅ | ✅ |
| Rate Check | — | — | — | ✅ | ✅ |
| Record Rate | — | — | — | ✅ | ✅ |
| Quotations | ✅ | ✅ | ✅ | — | ✅ |
| Shipments | — | — | — | — | ✅ |
| Follow-ups | ✅ | ✅ | — | ✅ | ✅ |
| Customers | ✅ | ✅ | ✅ | — | ✅ |
| KYC Form | ✅ | — | ✅ | — | ✅ |
| Profile | ✅ | ✅ | ✅ | ✅ | ✅ |

#### Action Permissions

Granular action-level permissions checked via `useRole().hasPermission(action)`:

- `inquiry:create`, `inquiry:edit`, `inquiry:complete`
- `quote:create`, `quote:approve`, `quote:send`
- `booking:create`, `booking:confirm`, `booking:release`
- `customer:edit`, `customer:blacklist`
- `rate:record`, `rate:request`

#### Visual Indicators

- Role badge in the top bar with role-specific colors:
  - CS: `#0891b2` (cyan)
  - Sales: `#2c2c82` (dark blue)
  - Finance: `#16a34a` (green)
  - Procurement: `#d97706` (amber)
  - Admin: `#7c3aed` (purple)
- Locked pages in sidebar: lock icon + `opacity: 0.35`
- Role-filtered quick commands in the chat interface

---

## 8. Business Workflows

### 8.1 Inquiry Lifecycle

```
Customer Contact (Email / WhatsApp / Phone / In-person)
        │
        ▼
┌───────────────┐
│ New Inquiry   │  ← CS / Sales creates via form or chat command
│ Created       │
└───────┬───────┘
        │
        ▼
┌───────────────┐     ┌──────────────────┐
│ KYC Check     │────►│ KYC Not Approved │──► KYC Workflow (see §8.6)
│               │     │ (Blocks progress)│
└───────┬───────┘     └──────────────────┘
        │ KYC Approved
        ▼
┌───────────────┐
│ Rate Check    │  ← Search AMS rate database
│ (Stage 1)     │    Search INTTRA spot rates
└───────┬───────┘    Manual rate entry
        │
        ▼ (if rates unavailable in DB)
┌───────────────────┐
│ Procurement       │  ← Escalate to Procurement team
│ Escalation        │    (optional, skippable)
│ (Stage 2)         │
└───────┬───────────┘
        │
        ▼
┌───────────────┐
│ Quotation Prep│  ← Build multi-line quotation
│ (Stage 3)     │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Quote Sent    │  ← Email to customer via Resend
│ (Stage 4)     │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Customer      │  ← Track: Accepted / Rejected / Negotiating
│ Response      │
│ (Stage 5)     │
└───────┬───────┘
        │ Accepted
        ▼
┌───────────────┐
│ Booking       │  ← See §8.4
│ Request       │
│ (Stage 6)     │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Completed     │
│ (Stage 7)     │
└───────────────┘
```

**Multi-container support:** A single inquiry can contain multiple container lines, each with its own container type, quantity, commodity, destination, and temperature settings (for reefer).

### 8.2 Rate Management

The system aggregates rates from 6 sources into a unified view:

| Source | Description | Entry Method |
|--------|-------------|--------------|
| **Contracted** | Long-term liner contracts | AMS import |
| **FAK** | Freight All Kinds (commodity-agnostic) | Procurement records |
| **Spot** | Current market rates per vessel | Procurement records or INTTRA API |
| **NAC** | Named Account Contract rates | AMS import |
| **Tariff Rate** | Published tariff rates | AMS import |
| **Special** | Commodity-specific negotiated rates | Procurement records |

**Rate Check workflow (RateCheck.tsx):**
1. **DB Select** — Search unified rate database with filters (liner, origin, destination, container type)
2. **Manual Entry** — Record spot/FAK/special rates with vessel details, surcharges
3. **Review** — Confirm selections, create quotation, advance workflow

**Rate Requests:** CS can create rate requests for Procurement when database rates are unavailable. Procurement adds rate options, which auto-advance the inquiry to quotation prep.

### 8.3 Quotation Workflow

```
┌─────────────┐
│   Draft     │  ← Created with line items
└──────┬──────┘
       │
       ▼ (if margin < customer.min_margin_pct)
┌─────────────────┐
│ Awaiting        │  ← Finance reviews
│ Approval        │
└──────┬──────────┘
       │ Approved
       ▼
┌─────────────┐
│  Approved   │
└──────┬──────┘
       │ CS sends to customer
       ▼
┌─────────────┐
│   Sent      │  ← Email via Resend
└──────┬──────┘
       │
       ├──► Accepted (Confirmed) ──► Booking creation
       ├──► Rejected (Lost)
       └──► Expired
```

**Margin auto-approval:** If the quote margin percentage is below the customer's `min_margin_pct`, the quote is automatically routed to "Awaiting Approval" for Finance review. Above the threshold, it stays as "Draft" for direct sending.

**Quote lines include:** Shipping line, rate type, base rate (USD), transit days, free time days, transshipment points, destination charges.

### 8.4 Booking Lifecycle

```
┌──────────────┐
│ Pending Liner│  ← CS creates from accepted quote
└──────┬───────┘
       │
       ├──► Normal Flow                    ├──► Urgent Flow
       │                                   │    (is_urgent=true)
       ▼                                   ▼
┌──────────────┐                    ┌──────────────┐
│ Procurement  │                    │ CS Books     │
│ Confirms     │                    │ Directly     │
│ Liner Space  │                    │ (Skip Proc.) │
└──────┬───────┘                    └──────┬───────┘
       │                                   │
       ▼                                   ▼
┌──────────────┐                    ┌──────────────┐
│ Liner        │                    │ Liner        │
│ Confirmed    │                    │ Confirmed    │
└──────┬───────┘                    │ + Notify     │
       │                            │ Procurement  │
       ▼                            └──────┬───────┘
┌──────────────┐                           │
│ SI Cutoff    │◄──────────────────────────┘
│ Management   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ SI Submitted │  ← Shipping Instructions to liner
│ to Liner     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ BL Cutoff    │
│ Management   │
└──────┬───────┘
       │
       ├──► Draft BL sent to customer
       ├──► BL approved/rejected
       ├──► Master BL recorded
       └──► House BL created (door-to-door only)
              │
              ▼
       ┌──────────────┐
       │  Released    │  ← CS releases container instructions
       └──────────────┘
```

### 8.5 Shipment Tracking

After booking release, shipments are tracked through multi-leg journeys:

```
Origin Port          Transshipment(s)          Destination Port
─────────────        ─────────────────         ────────────────
Pending              Pending                   Pending
  → Arrived            → Arrived                 → Arrived
    → Departed           → Departed               → POD Received
```

Each leg transitions: `Pending` → `Arrived` → `Departed`

Proof-of-delivery (POD) is recorded at the final destination.

### 8.6 KYC Workflow

```
┌───────────────┐
│ Not Started   │  ← Default for new customers
└───────┬───────┘
        │ Send KYC email
        ▼
┌───────────────────┐
│ Pending Customer  │  ← Waiting for customer to submit docs
└───────┬───────────┘
        │ Customer submits
        ▼
┌────────────────────────┐
│ Pending Finance        │  ← Finance reviews documents
│ Approval               │
└───────┬────────────────┘
        │
        ├──► Approved  ──► All blocked inquiries auto-advance
        └──► Rejected
```

When KYC is approved, any inquiries that were blocked at the "inquiry-received" stage are automatically advanced to "rate-check".

---

## 9. Deployment

### Docker (Production)

The project includes a multi-stage `Dockerfile`:

**Stage 1:** Build React frontend
```dockerfile
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY FrontEnd/dashinterface/package.json FrontEnd/dashinterface/package-lock.json ./
RUN npm ci
COPY FrontEnd/dashinterface/ ./
RUN npm run build
```

**Stage 2:** Python backend + built frontend
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY BackEnd/requirments.txt ./
RUN pip install --no-cache-dir -r requirments.txt
COPY BackEnd/ ./
COPY --from=frontend-builder /build/dist ./static
EXPOSE 5000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
```

The built frontend is served as static files by FastAPI at port 5000.

### Development

**Backend:**
```bash
cd BackEnd
pip install -r requirments.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd FrontEnd/dashinterface
npm install
npm run dev
```

The Vite dev server runs on `0.0.0.0:5173` and proxies API requests to `localhost:8000` via the `.env.development` configuration.

---

## 10. Environment Variables

### Backend

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API` | Claude/OpenAI API key | `sk-...` |
| `OPEN_AI_MODEL` | Model identifier | `gpt-4o` |
| `RESEND_API` | Resend email API key | `re_...` |

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE` | Backend API base URL | `/api` |
| `VITE_WS_URL` | WebSocket URL | `ws[s]://host/ws` |

---

## 11. Development Guide

### Prerequisites

- **Python 3.12+** for the backend
- **Node.js 20+** for the frontend
- **Docker** (optional, for containerized deployment)

### Running Locally

1. **Clone and checkout the `authen` branch:**
   ```bash
   git clone <repository-url>
   cd MVP-Demo
   git checkout authen
   ```

2. **Start the backend:**
   ```bash
   cd BackEnd
   pip install -r requirments.txt
   # Set environment variables (OPENAI_API, OPEN_AI_MODEL, RESEND_API)
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. **Start the frontend:**
   ```bash
   cd FrontEnd/dashinterface
   npm install
   npm run dev
   ```

4. **Access the application:**
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:8000/api`
   - WebSocket: `ws://localhost:8000/ws`

### Build for Production

```bash
# Using Docker
docker build -t clsynergy .
docker run -p 5000:5000 \
  -e OPENAI_API=sk-... \
  -e OPEN_AI_MODEL=gpt-4o \
  -e RESEND_API=re_... \
  clsynergy

# Manual
cd FrontEnd/dashinterface && npm run build
cd BackEnd && uvicorn main:app --host 0.0.0.0 --port 5000
```

### Code Quality

```bash
# Frontend linting
cd FrontEnd/dashinterface
npm run lint

# Frontend type checking
npm run build  # Runs tsc -b before vite build
```

### Key Conventions

- **Frontend IDs** use string prefixes (`INQ-`, `QUO-`, `BKG-`, etc.) while the backend uses integer IDs
- **Timestamps** are ISO-8601 in the backend and `YYYY-MM-DD HH:MM` display format in the frontend
- **All mutations** follow the optimistic UI pattern: update local state first, then API call
- **Thread safety** in the backend is ensured via `threading.Lock` for JSON file operations
- **Atomic writes** use `tempfile` + `os.replace()` to prevent data corruption

### Known Limitations

1. **JSON-file persistence** — Not suitable for production scale; consider PostgreSQL migration
2. **Single-server threading** — File lock won't scale to multiple backend instances
3. **No CSRF protection** — State-changing endpoints lack CSRF tokens
4. **localStorage tokens** — Vulnerable to XSS (acceptable for internal SPA)
5. **No rate limiting** — API endpoints lack throttling
6. **Unbounded chat history** — `history.txt` grows indefinitely
7. **Frontend-only RBAC** — Backend should also enforce role-based permissions
8. **No automated tests** — Manual testing only

---

*Generated from the `authen` branch of the CLSynergy Sales Tracking System.*
