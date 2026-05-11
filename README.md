# CL Synergy — Freight Inquiry & Quotation MVP

A demo-grade web app for **CL Synergy**, a Sri Lanka-based freight forwarder. Replaces the team's fragmented WhatsApp / Email / Phone inquiry handling with a single tool that captures every stage of the inquiry → quote → shipment → delivery lifecycle. Most actions can be driven through a single conversational chat interface — like Claude meets Notion.

---

## Table of contents

1. [What this app does](#what-this-app-does)
2. [Who it's for](#who-its-for)
3. [Tech stack and how to run it](#tech-stack-and-how-to-run-it)
4. [The 7 tabs — page by page](#the-7-tabs--page-by-page)
5. [Business terminology — what the badges and fields mean](#business-terminology--what-the-badges-and-fields-mean)
6. [Chat command reference](#chat-command-reference)
7. [Demo script — what to type to show off the system](#demo-script--what-to-type-to-show-off-the-system)
8. [Data model](#data-model)
9. [Persistence and reset](#persistence-and-reset)
10. [What's not built yet](#whats-not-built-yet)

---

## What this app does

CL Synergy receives **30–40 inquiries per day** through WhatsApp, email, and phone calls. The team has to:

1. **Capture** the inquiry (origin, destination, container count, customer)
2. **Verify** the customer is not blacklisted or on credit hold
3. **Quote** with multiple shipping line options (Maersk, CMA CGM, MSC, …) using spot rates, contractual rates, etc.
4. **Get internal approval** if the quote margin falls below the customer's floor
5. **Send** the quote to the customer
6. **Confirm** the booking when the customer accepts
7. **Track** the shipment through transshipment ports until proof-of-delivery

Before this app, all of that lived in spreadsheets, WhatsApp threads, and people's heads. This app gives the team **one place** to do all of it — and a chat interface where typing a sentence updates the relevant tabs automatically.

## Who it's for

Three personas:

| Role | Cares about |
|---|---|
| **Sales Executive** | Capturing inquiries fast, not losing track of follow-ups, hit rate |
| **SBU Head** | P&L for their unit, approving thin-margin quotes, monitoring chasers |
| **Operations / Customer Manager** | Shipment tracking, POD, credit-hold compliance |

Stakeholders Udara and Ramzan represent the customer side; the system was reviewed in a late-April 2026 meeting.

## Tech stack and how to run it

- **React 18** + **TypeScript** + **Vite**
- **Recharts** for charts
- **lucide-react** for icons
- All state held in `localStorage` — **no backend yet**. Phase 2 plans add a real API.

To run:

```bash
cd FrontEnd/dashinterface
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

To produce a production build:
```bash
npm run build
```

---

## The 7 tabs — page by page

The sidebar has 7 tabs, in this order:

### 1. Dashboard

**What it shows:** a one-screen operations snapshot.

| Section | What it tells you | Why it matters |
|---|---|---|
| **5 KPI cards** at the top | Pending inquiries · Completed today · Active customers · Overdue items · Pending approvals | Quick health check at a glance |
| **3 lifetime tiles** | Total inquiries · Completed · Completion rate % | How well the team is closing deals overall |
| **NLQ Box** | Type a free-form question about your data | Demo-grade natural-language search |
| **Salesperson Hit Rate** | Per-employee inquiry → completion conversion, with a coloured bar | The Friday meeting flagged this as a missing metric — this surfaces who's converting |
| **SBU Breakdown** | Inquiries per Strategic Business Unit, pending vs completed | Tells SBU heads how their book is performing |
| **Inquiries per day** chart | Pending vs completed bars by day | Volume trends |
| **By Channel** pie chart | WhatsApp / Email / Phone split | Where the lead flow comes from |
| **Recent Activity** table | Last 5 inquiries | Quick "what just happened" glance |

### 2. Chat Assistant ⭐

**What it does:** a single conversational interface that drives every other tab. Type natural sentences and the relevant tabs update automatically. Like Claude (smart commands) crossed with Notion (live-updating pages).

**Key behaviours:**
- **Customer name disambiguation** — if you type *"ABC needs 5 containers"* and the system has both *"Customer ABC"* and *"ABC Trading"*, it asks which one or to create new.
- **Blacklist enforcement** — refuses to save anything for a blacklisted customer. Red bubble + shield icon.
- **Credit-hold warning** — yellow bubble asking *"Proceed anyway?"* before saving for a customer on credit hold.
- **Recurring vs one-time classification** — when you create an inquiry for a brand-new customer, the chat asks: *Recurring (saved as Regular tier) or one-time (saved as Walk-in tier)?*
- **Persistence** — the conversation history survives page refresh, so you don't lose context.

The chat understands these intents (commands):

| Intent | Example phrasings |
|---|---|
| Log inquiry | *"Hayleys requested 12 reefers from Colombo to Hamburg"* |
| Log follow-up | *"Followed up with Brandix — confirmed"* |
| Add task | *"Add task for Hayleys: send quotation by tomorrow"* |
| Mark complete | *"Mark MAS Holdings completed"* |
| Reopen | *"Mark Dilmah as pending — space not actually confirmed"* |
| Blacklist on/off | *"Blacklist Vanguard"* / *"Unblacklist Vanguard"* |
| Credit hold on/off | *"Put MAS on credit hold"* / *"Clear credit hold on Dilmah"* |
| Tier change | *"Change Customer ABC to Key Account"* |
| Payment terms | *"Change Hayleys payment to 60-Day Credit"* |
| Location change | *"Move Brandix to Negombo"* |
| Min margin | *"Set Customer ABC min margin to 8%"* |
| Add customer | *"Add new customer Lanka Tea as Regular in Galle"* |
| Open quote builder | *"Quote Hayleys"* |

Full reference is in the [Chat command reference](#chat-command-reference) section below.

### 3. Inquiry List

**What it shows:** every inquiry the team has captured, with filters.

Columns: ID · Customer (with **Tier badge**, blacklist/credit-hold badges) · Route (origin → destination) · SBU · Inquiry Text · Status · **Quote** · Employee · Date · Actions.

**Filters:** customer name · status · SBU · employee · date.

**Actions per row:**
- 👁 View — opens a modal with full details + follow-up history for this inquiry
- ✓ Mark complete
- 💬 Add follow-up

The **Quote column** shows whether a quote has been built for this inquiry yet, and what status the quote is in (Draft / Awaiting Approval / Approved / Sent / Confirmed / Lost).

### 4. Quotations ⭐

**What it does:** the centerpiece of the Friday meeting — multi-option quotes with margin checks and approval workflow.

**List view:** every quote with its rate lines visible, status badge, customer tier, total price, and action buttons.

**Quote Builder modal** (click *New Quote*):
- Pick customer (autocomplete) — see their tier, payment terms, margin floor
- Set origin / destination / quote type (FCA / Domestic Included / Drayage / DDP)
- Add multiple **rate lines** (5–10 typical), each with:
  - Shipping line (Maersk, CMA CGM, MSC, Hapag-Lloyd, ONE, Evergreen, COSCO, OOCL — pulled from a "Big Schedule" stub)
  - **Rate type** — Spot / Contractual / NAC / Convoy
  - Base rate (USD)
  - Transit days
  - Free time days (detention/demurrage)
  - Transshipment points (e.g. *"Singapore"* or *"Direct"*)
  - Destination charges (USD)
- Set margin %
- **Approval auto-routing**: if the margin is below the customer's `min_margin_pct` floor, the quote is saved as **"Awaiting Approval"** with a reason. SBU head must approve before it can be sent.

**Status transitions** (via buttons on each quote card):
```
Awaiting Approval  → Approved      OR  Lost
Draft / Approved   → Sent
Sent               → Confirmed     OR  Lost
```

Each transition fires a toast that simulates an automated email: *"Email dispatched to Hayleys"*, *"Booking instructions emailed to MAS Holdings"*.

### 5. Shipments

**What it does:** post-confirmation lifecycle tracking. The Friday meeting flagged this as the most painful gap — *"we're liable until POD but don't track shipments through transshipment points."*

**Critical Watch banner** (top of page) — shows shipments currently *"At Transshipment"* so operations can verify the onward leg connects.

**Per-shipment card** — shows:
- ID, customer, route, shipping line, linked quote, status
- A **horizontal timeline** of legs: origin → transshipment(s) → destination
- Each leg has a port name, type icon, ETA, actual arrival, status (Pending / Arrived / Departed / Delayed)
- Click `>` on a leg to advance its status. The aggregate shipment status auto-updates (e.g. once the destination leg arrives, status becomes "Delivered").
- **Record POD** button — marks delivery confirmed and emails the customer.

**Mock Inttra/Freightify integration** — the small banner in the page header acknowledges that real tracking-platform integration is planned. Today the data is local mock data.

### 6. Operations

(Renamed from "Follow-ups & Tasks". Combines three related work-management views.)

**Spot Rate / Urgent — Time Critical** banner (only shows if any inquiries are urgent)
- Spot rates have ~15-minute confirmation windows. Inquiries with words like *"urgent"*, *"spot"*, *"asap"* land here as a top-priority strip.

**Most-Chased Pending Inquiries**
- Top 5 pending inquiries ranked by how many follow-ups have been logged on them. High count = sales is chasing procurement repeatedly to get rates (the Friday meeting's "15× chasing" pain point). Coloured bars: green / amber / red.

**Section 1 — Log Follow-up**
- Add a follow-up entry. Optionally tick *"Mark inquiry as Completed"* to close the inquiry in the same action.

**Recent Follow-ups** table
- Audit log of every follow-up (the `fact_followups` data model concept).

**Section 2 — Tasks**
- Add tasks with customer, description, due date, owner. Pending / overdue / due-today pills.

**Section 3 — Missing Tasks (Power Feature)**
- Outstanding documents or actions blocking deals: *"SI not submitted"*, *"KYC pending"*, *"PO not received"*. Each row has a cutoff date that turns red when overdue.

### 7. Customers

**What it shows:** customer master record with stats overlaid.

**Customer Portal banner** (top, dashed purple) — placeholder for the Phase 2 customer-facing portal. Until then, customers receive automated email updates instead.

**Table columns:** Customer · Location · **Tier** · **Payment** · **Min Margin** · **Status flags** · Inquiries (with pending count) · Channels · Last Contact.

**Sorting:** blacklisted customers go to the bottom, otherwise sorted by tier (Key Account → Regular → Walk-in) then by last-contact date.

**Visual cues:**
- Blacklisted rows get a faint red tint + shield-alert badge
- Credit-hold rows get a yellow tint + warning badge

---

## Business terminology — what the badges and fields mean

This is the most important section if you're not familiar with freight forwarding. Every term used in the UI explained.

### Customer Tier

A simple ranking of how important / trusted a customer is. Drives pricing rules.

| Tier | What it means | Real-world example | Min Margin floor |
|---|---|---|---|
| **Key Account** | Top customers — high volume, long-term relationship, steady monthly business | Hayleys, Brandix, MAS, Dilmah | 4–5% (low — you can give sharp prices) |
| **Regular** | Standard recurring customers — smaller volumes, less frequent | Customer ABC, Hela Apparel | 7% (moderate margins) |
| **Walk-in** | One-off / new / unknown customers — no history | Vanguard Shippers | 10% (high — protect against the unknown) |

**Why it matters:** when a salesperson builds a quote, the system uses the tier to:
- Pick the **default minimum margin**
- Decide whether the quote needs **SBU head approval** (when margin is too low)
- Decide whether the customer can pay on credit, or must pay upfront

A junior salesperson can quote a Key Account at 5% margin freely. The same person trying to quote a Walk-in at 5% would be blocked — the system would force them to either raise the margin to 10% or get a manager approval.

The Friday meeting transcript referenced this directly: *"larger customers like Agba (300-400 containers/month) get tier 1 rates vs. tier 2 for smaller shippers"*.

### Payment Terms

How long after invoicing the customer has to pay you.

| Term | What it means | Cash-flow impact for CL Synergy |
|---|---|---|
| **Pay Upfront** | Customer pays before goods ship. No risk to CL Synergy. | Best for cash flow |
| **30-Day Credit** | Container ships now, customer pays within 30 days | You float their money for ~1 month |
| **60-Day Credit** | Container ships now, customer pays within 60 days | You float their money for ~2 months — only granted to your most trusted big customers |

**Why it matters:** when you book a container with a shipping line, **you (CL Synergy) pay the line first**, then collect from the customer later. If a customer is on 60-Day Credit, you've effectively lent them money for 2 months. Granting credit is a privilege you give to good customers; pulling credit (moving them to "Pay Upfront") is a punishment / red flag.

### Min Margin %

The minimum profit percentage the customer's quote must clear. Quotes below this floor are routed to the SBU head for approval.

Set per-customer (because Key Accounts can take thinner margins on volume; Walk-ins need a fatter cushion). Defaults: 5% for Key Accounts, 7% for Regulars, 10% for Walk-ins.

### Blacklist

A red flag on a customer that **blocks all activity**. Set when a customer has burned us — repeated payment defaults, fraud, etc.

The chat refuses to save inquiries / follow-ups / quotes for blacklisted customers. The Customers tab tints the row red.

The seed data has **Vanguard Shippers** as the demo blacklisted customer.

### Credit Hold

A yellow flag on a customer that **warns but doesn't block**. Set when finance has flagged late payments — usually until the open invoices are settled.

The chat warns *"Proceed anyway?"* before saving any new activity for credit-hold customers. This gives sales a chance to defer the deal until finance clears the customer.

The seed data has **Dilmah Tea** as the demo credit-hold customer.

### SBU (Strategic Business Unit)

A division within CL Synergy that runs its own P&L and targets. The Friday meeting confirmed CL Synergy has **10 SBUs**, each with its own head responsible for revenue, margin, and team performance.

This MVP exposes 4 SBUs: **Ocean Imports**, **Ocean Exports**, **Air Freight**, **Domestic**. Phase 1 of the system focuses on ocean freight (per the meeting).

Every inquiry is tagged to one SBU. The Dashboard's *"SBU Breakdown"* widget shows volume per unit. The Inquiry List has an SBU filter.

**Why it matters:** an SBU head approves margin overrides for their team's quotes. Each SBU has slightly different informal rules (e.g. *"don't quote below 5% margin"* but it varies by SBU based on customer mix and trade type).

### Rate Type (on a quote line)

The four kinds of rates that come from shipping lines:

| Type | What it is | Validity |
|---|---|---|
| **Spot** | Best-available rate at this exact moment, often discounted to fill capacity | ~15-minute window — confirm fast or it's gone |
| **Contractual** | Pre-negotiated rate under a service contract — locked for the contract term | Months / quarters |
| **NAC** (Named Account) | Rate negotiated specifically for one named customer between CL Synergy and the carrier | Customer-specific, contract term |
| **Convoy** | Volume-based group rate when multiple containers go on the same vessel | Per-sailing |

**Why the system supports all four:** the meeting flagged that procurement validates rates differently based on type, and customers compare across them. The quote builder lets you pick per line.

### Quote Type (the deal structure)

What's included in the quote price:

| Type | What's included | Typical use |
|---|---|---|
| **FCA** (Free Carrier) | Just the ocean freight — customer arranges everything else | Customer has their own forwarders / agents |
| **Domestic Included** | Ocean freight + local pickup at origin | Customer wants door-to-port handled |
| **Drayage** | Ocean freight + container haulage at destination | Customer wants port-to-warehouse handled |
| **DDP** (Delivered Duty Paid) | Door-to-door, including customs clearance and duties | Full-service deal — highest margin |

Phase 1 of the system focuses on ocean freight; the Friday meeting noted land transportation and customs are Phase 2.

### Quote Status (the lifecycle)

```
Draft  →  Awaiting Approval  →  Approved  →  Sent  →  Confirmed
                                                    ↘  Lost
```

- **Draft** — saved but not yet routed for approval
- **Awaiting Approval** — margin is below customer's floor, SBU head must sign off
- **Approved** — cleared by SBU head, ready to send
- **Sent** — emailed to the customer
- **Confirmed** — customer accepted, booking proceeds
- **Lost** — customer didn't take it (rate not competitive, went elsewhere)

### Shipment Status (post-confirmation)

```
Booked  →  In Transit  →  At Transshipment  →  Out for Delivery  →  Delivered
                                ↳  Delayed  (any stage)
```

- **Booked** — vessel space confirmed, container hasn't loaded yet
- **In Transit** — vessel sailed, between ports
- **At Transshipment** — arrived at intermediate port (Singapore, Jebel Ali, etc.), waiting for connecting vessel — **the riskiest stage**, missed connections cause delays
- **Out for Delivery** — final leg, on the road or yard at destination
- **Delivered** — POD received
- **Delayed** — flagged when any leg misses its ETA

### POD (Proof of Delivery)

Document that proves the consignee received the cargo. CL Synergy is **legally liable until POD is received** — even after the container is at destination port. That's why the Shipments tab pushes hard on POD recording.

### Big Schedule

A third-party tool (real product) that lists all the shipping lines serving a port-to-port route, with transit times and schedule details. The Friday meeting requested this be integrated so procurement always checks every available option.

This MVP shows a stub: a small banner in the quote builder listing 8 major shipping lines as if pulled from Big Schedule. Real integration is planned.

### Inttra / Freightify

Real-time shipment tracking platforms used in the freight industry. The Friday meeting requested integration so customers can see live container status. This MVP stubs them — the Shipments tab shows a placeholder banner. Real integration is planned.

### Channels

How customers contact CL Synergy:
- **WhatsApp** — informal, common with known customers
- **Email** — formal, required for new customers (background check first)
- **Phone** — fast, used for time-sensitive spot rates

The Customers tab shows which channels each customer uses. The Dashboard's *"By Channel"* pie chart shows the volume mix.

### Channels of Confirmation

How customers say *"yes, book it"*:
- Email and WhatsApp accepted for repeat customers
- For new customers, formal email is required

Spot rate confirmations sometimes need to land within **5 minutes** because the rate window is so short.

---

## Chat command reference

Every command the chat understands. Phrasings are flexible — these are examples.

### Inquiries

```
Customer Hayleys requested 12 reefer containers from Colombo to Hamburg by next Friday
Brandix needs urgent 3 reefers to Dubai today
Hela Apparel — 4 dry containers from Colombo to Mumbai
```

The chat extracts customer name, request, origin, destination, and channel from the message text. If origin isn't specified, it falls back to the customer's HQ city.

### Follow-ups

```
Followed up with Brandix — sailing schedule confirmed
Spoke to Hela Apparel, awaiting PO
Called Hayleys, awaiting SI
```

The chat asks whether to also close the linked inquiry. Pick *"Yes — close inquiry"* to mark the inquiry completed in one action.

### Tasks

```
Add task for Hayleys: send draft B/L by tomorrow
Add task for Brandix: confirm cutoff time by next Tuesday
Remind me to chase MAS on Friday
```

### Complete an inquiry

```
Mark MAS Holdings completed
Mark Hayleys as done
Close Brandix
```

### Reopen an inquiry (mark as pending again)

```
in Hayleys i didnt actually book yet, mark as pending
Reopen Dilmah Tea — space not actually confirmed
```

When you reopen, the previous closing follow-up is automatically retracted (so the timeline doesn't show two contradictory entries).

### Customer flags

```
Blacklist Vanguard Shippers
Unblacklist Vanguard
Put MAS Holdings on credit hold
Clear credit hold on Dilmah Tea
Release Brandix from credit hold
```

### Customer attribute changes

```
Change Customer ABC to Key Account
Promote Hayleys to Key Account
Change Hayleys payment to 60-Day Credit
Set MAS payment terms to Pay Upfront
Move Brandix to Negombo
Update Hayleys location to Galle, Sri Lanka
Set Customer ABC min margin to 8%
```

### Add new customer

```
Add new customer Lanka Tea as Regular in Galle
Create customer ABC Trading as Walk-in in Mumbai
Add new customer Premier Tea as Key Account in Colombo with 30-Day Credit
```

When you mention a brand-new customer in an inquiry without explicitly adding them, the chat asks: **Recurring** (Regular tier) or **One-time** (Walk-in tier)? Picking creates the customer record with the right defaults and saves the inquiry against it.

### Open the quote builder

```
Quote Hayleys
Create a quote for Brandix
New quotation for MAS Holdings
```

This navigates to the **Quotations** tab and opens the builder pre-filled with the customer's tier, payment terms, route (from their most recent pending inquiry), and margin floor.

---

## Demo script — what to type to show off the system

Run these in order. Each step shows a different feature. Switch tabs after each command to see the cascade.

### 30-second first impression

```
Hayleys requested 5 reefers from Colombo to Hamburg by next Friday
```
→ saves inquiry. Open **Inquiry List**.

```
Followed up with Hayleys, called and confirmed booking
```
→ pick *"Yes — close inquiry"*. Open **Operations** to see the chase counter and the audit log.

```
Add new customer Lanka Tea as Regular in Galle
```
→ open **Customers** to see the new row.

```
Quote Lanka Tea
```
→ auto-navigates to **Quotations** + opens the builder pre-filled.

### Test enforcement

```
Vanguard Shippers wants 5 containers to Karachi
```
→ red bubble: blocked because Vanguard is blacklisted.

```
Followed up with Dilmah Tea
```
→ yellow bubble: warned because Dilmah is on credit hold. Click **Cancel** or **Proceed anyway**.

### Test customer-name dedup

```
ABC Trading needs 6 containers to Mumbai
```
→ chat asks: *"Use existing Customer ABC, or create new?"*

### Build a quote that needs approval

1. *"Quote Hayleys"* → builder opens
2. Add 2 rate lines (Maersk + CMA CGM), base $1500 each
3. Set margin to **3%**
4. Yellow banner appears: *"margin 3% < Hayleys' floor 5%"*
5. Click **Submit for Approval**
6. On the Quotations list, click **Approve** → click **Send** → click **Mark Confirmed**
7. Watch the Dashboard's *"Pending Approvals"* KPI tick up then back to zero

### Track a shipment

1. Open **Shipments**
2. On the Colombo → Singapore → Rotterdam shipment, click `>` on the Singapore leg until it shows **Departed**
3. Click `>` on the Rotterdam leg → **Arrived** → status auto-flips to **Delivered**
4. Click **Record POD** → toast: *"Email dispatched to MAS Holdings"*

### Show persistence

1. Refresh the page (F5)
2. Everything stays — chat history, new inquiries, customer changes, quote statuses, shipment progress
3. Click **Reset Demo** in the top bar → confirms → wipes back to the seed data

---

## Data model

Five main entities, all in [`mockData.ts`](FrontEnd/dashinterface/src/mockData.ts):

```
Customer  ──< Inquiry  ──< Quote  ──< QuoteLine
                              ↓
                            Shipment  ──< ShipmentLeg
              Inquiry  ──< Followup
              Inquiry  ──< Task
              Customer ──< MissingItem
```

**Customer** — name, location, tier, payment_terms, blacklisted, credit_hold, min_margin_pct.

**Inquiry** — customer_name, inquiry_text, request, origin, destination, channel, sbu, employee_id, status (pending / completed), timestamps.

**Quote** — inquiry_id (optional), customer_name, origin, destination, quote_type, margin_pct, status, lines.

**QuoteLine** — shipping_line, rate_type, base_rate_usd, transit_days, free_time_days, transshipment_points, destination_charges_usd.

**Shipment** — quote_id, customer_name, origin, destination, shipping_line, status, booked_at, expected_delivery, pod_received, legs.

**ShipmentLeg** — port, type (Origin / Transshipment / Destination), expected_at, actual_at, status (Pending / Arrived / Departed / Delayed).

**Followup** — inquiry_id, customer_name, note, employee_id, created_at, completion_flag.

**Task** — customer_name, task, status, due_date, employee_id, inquiry_id.

**MissingItem** — customer_name, missing_item, since, cutoff_date, employee_id.

---

## Persistence and reset

All state is held in **localStorage** under the `mvp-demo:` namespace. This means:

- ✅ Refresh the page → everything you entered is still there
- ✅ Chat history persists — you can continue conversations after a refresh
- ✅ Close the browser, come back tomorrow → still there
- ❌ Open in a different browser → fresh seed data (per-browser storage)
- ❌ Switch to incognito → fresh seed data

To wipe everything back to the seed data:

> Click the **Reset Demo** button in the top right of the page (next to the date).

This is the right button to hit before showing the system to a new audience.

---

## What's not built yet

Honest list of gaps to set expectations:

### Chat coverage gaps (3 small ones)

The chat does not yet handle these — you have to use the buttons on the relevant tabs:

- **Quote status transitions via chat** — *"Approve quote QUO-501"*, *"Send QUO-501 to customer"*, *"Mark QUO-501 confirmed"*
- **Shipment progress via chat** — *"Maersk arrived at Singapore for SHP-800"*, *"Record POD for SHP-801"*
- **Task completion via chat** — *"Mark task TSK-201 done"*

### Phase 2 features (the meeting flagged these)

- **Air freight + Domestic SBUs** — currently only ocean is built
- **Customer portal** (the dashed banner on the Customers tab) — customer self-service for tracking and document downloads
- **Big Schedule integration** — currently a stub showing 8 shipping lines
- **Inttra / Freightify integration** — currently a placeholder banner on Shipments
- **"Respond"-style unified inbox** — consolidate WhatsApp + Viber + Email + WeChat per customer
- **Backend API** — everything is currently in localStorage, no real persistence across browsers/devices

### Other refinements

- **Spot-rate live countdown** — Operations tab flags spot/urgent inquiries, but the 15-minute live countdown timer isn't wired up yet (would need rate timestamps on inquiries)
- **Hit rate per SBU** — currently only per salesperson
- **Audit log of all chat actions** — the system logs follow-ups but not all chat operations
- **Multi-action chat commands** — *"Followed up with Hayleys, then add task for Brandix to send quotation"* — currently one action per message

---

## Project file map

```
MVP-Demo/
├── README.md                                  ← this file
└── FrontEnd/
    └── dashinterface/                          ← Vite + React + TS app
        ├── package.json
        ├── vite.config.ts
        ├── tsconfig.json
        └── src/
            ├── main.tsx                        ← React root
            ├── App.tsx                         ← shared state, routing, all handlers
            ├── hooks.ts                        ← usePersistentState + resetPersistentDemo
            ├── mockData.ts                     ← types, seed data, parser, intent detection
            ├── dashboard.css                   ← all styling (CSS variables theme)
            └── components/
                ├── layout/
                │   ├── TopBar.tsx              ← brand, breadcrumb, Reset Demo button
                │   └── Sidebar.tsx             ← 7-tab nav
                ├── shared/
                │   ├── KPICard.tsx             ← Dashboard KPI
                │   └── NLQBox.tsx              ← natural-language search box
                └── pages/
                    ├── Dashboard.tsx
                    ├── ChatAssistant.tsx       ← the conversational interface
                    ├── InquiryList.tsx
                    ├── Quotations.tsx          ← list + builder modal
                    ├── Shipments.tsx           ← list + transshipment timeline
                    ├── Followups.tsx           ← Operations tab
                    └── Customers.tsx
```

Built for CL Synergy's Friday solution review demo.
