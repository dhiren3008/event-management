# Project Brief — Infinite Success Events (Event Management)

**For: any collaborating developer or AI assistant**  
**From: Dhiren (project owner)**  

Welcome! You are assisting in building and maintaining **Infinite Success Events**, a role-based Event & Ticket Management web application. This document is the single source of truth for the entire architecture, data schemas, business rules, design tokens, and workflows. Read this file fully before making any modifications.

Where a screenshot or explicit user instruction conflicts with something in this document, **trust the screenshot/user instruction** and explain any discrepancy.

> **Current Status: Production-Ready Prototype.**  
> All three roles (`admin`, `member`, `verifier`) are fully functional and wired to a live local REST API powered by `json-server`. All core member workflows (Browsing, Checkout, Ticket Management & Self-Cancellation, Dynamic Billing & Invoices, and Profile/Settings) are implemented and operational.

---

## 1. What the Project Is

A **role-based event and ticket booking management web app**. Three roles operate in the system:

| Role | Core Capabilities |
|---|---|
| `admin` | Full system control: dashboard with weekly analytics, Event Management (create, edit, cancel, delete, assign verifiers), User Management (members, verifiers, admins: create, edit, deactivate, delete), own admin profile, settings. |
| `member` | Browses active events with live search and booking window guards; books tickets (Single / Double / VIP with meal and dynamic spouse options) via a staged checkout with live overselling prevention, payment loader, and success confirmation; views personal ticket catalog with status pills and self-cancellation (24h cutoff rule); views live billing history and printable itemized invoices; edits profile details with real API persistence and session sync. |
| `verifier` | Venue check-in tool: views only events assigned to them by an admin (`date >= today` and active), searches attendees, and toggles ticket verification at the door (`verified: true/false`). |

Users authenticate through a client-side authentication model, are routed to their role's dashboard, and interact with `json-server` REST endpoints.

---

## 2. Tech Stack & Execution Rules

- **Vanilla Web Stack**: Pure **HTML5 + CSS3 + vanilla JavaScript (ES modules)**. No React, Vue, Angular, jQuery, or TypeScript.
- **Zero Build Tooling**: No bundlers, no Webpack, no Vite, no transpilers. Browser executes native ES modules via `<script type="module">`.
- **Backend & Database**: **`json-server` (v0.17.4)** is the sole dependency. One process simultaneously serves:
  1. The REST API reading and writing to `db.json` (`/users`, `/events`, `/bookings`, `/assignments`).
  2. The static web root (the project root folder).

### How to Run

```bash
npm install      # run once
npm start        # starts the server on http://localhost:3000
```

`npm start` executes:
```bash
node scripts/free-port.mjs && json-server --watch db.json --static . --port 3000
```

### Port 3000 Guard (`scripts/free-port.mjs`)
Both this project and a sibling project (`Web development/Infinity`) target port 3000. `scripts/free-port.mjs` runs first to terminate any existing process occupying port 3000 **if and only if** its command line contains `json-server`. Unrelated applications are never touched.

### Strict Development Rules
1. **Never open HTML directly via `file://`**: All asset paths (`/css/...`, `/js/...`, `/pages/...`) are root-absolute and JavaScript uses ES modules, both of which are blocked by CORS policies under `file://`. Always access through `http://localhost:3000`.
2. **Explicit `.js` Extensions**: Always include the `.js` extension on all internal imports (`import { requireRole } from '../core/auth.js';`).
3. **No Browser `alert()` Calls**: All feedback must use `.form-message` or `showToast(msg, 'success' | 'error')` from `js/core/dom.js`.
4. **Console is the Test Suite**: No automated test suites exist. Verification requires running `npm start` and observing network requests and console output.

---

## 3. Data Model (`db.json`)

`db.json` serves as both live database and seed storage; `json-server` updates this file on every POST, PATCH, or DELETE.

### 3.1 `users`
```json
{
  "id": 2,
  "name": "S.R.Sharma",
  "email": "member@gmail.com",
  "mobile": "7788777779",
  "password": "member123",
  "role": "member",
  "createdAt": "2026-10-10",
  "displayId": "#2002",
  "status": true,
  "mealPreference": "Non-Veg",
  "spouse": "",
  "gst": "27ABCDE0002F1Z5",
  "address1": "Flat 102, Silver Heights",
  "address2": "MG Road",
  "city": "Pune",
  "state": "Maharashtra",
  "zip": "411001",
  "country": "India",
  "systemIncharge": "K. Raman",
  "tabTeamName": "Team Alpha",
  "photo": ""
}
```
- `role`: `"admin" | "member" | "verifier"`.
- `status`: `false` = deactivated account. Missing `status` field is treated as active.
- `displayId`: Unique identifier (e.g., `#2001`). Generated via `generateNextDisplayId()` using `Math.max(2000, ...numbers) + 1` to ensure deleting a user never produces duplicate IDs.
- `password`: Stored in plaintext for this local demonstration app. Add flows auto-generate an 8-character temporary password.
- **Seeded Logins**:
  - `admin@gmail.com` / `admin0000` (`admin`, id 1)
  - `dhiren@gmail.com` / `i3l1m5b1` (`admin`, id 16)
  - `member@gmail.com` / `member123` (`member`, id 2)
  - `verifier@gmail.com` / `verifier123` (`verifier`, id 3)

### 3.2 `events`
```json
{
  "id": 1,
  "name": "Startup Pitch Day",
  "location": "Pune Tech Hub",
  "date": "2026-11-21",
  "endDate": "2026-11-21",
  "bookingStart": "2026-10-07",
  "bookingEnd": "2026-10-20",
  "startTime": "11:00",
  "endTime": "14:00",
  "price": 300,
  "capacity": 150,
  "description": "Early-stage founders pitch to a panel of investors...",
  "image": "",
  "createdAt": "2026-10-02",
  "status": "active",
  "cancelledAt": null
}
```
- All dates are ISO `"YYYY-MM-DD"`. Times are 24-hour `"HH:MM"`.
- **Cancellation**: `status: "active" | "cancelled"`. Missing `status` defaults to active. Always evaluate using `isEventCancelled(event)` from `js/core/utils.js`.
- **Image Fallback**: Deterministically assigned via `IMAGE_POOL[(event.id || 0) % IMAGE_POOL.length]` across all member pages.

### 3.3 `bookings`
```json
{
  "id": 11,
  "eventId": 6,
  "userId": 2,
  "quantity": 1,
  "amount": 1200,
  "ticketType": "Single",
  "userMeal": "Non-Veg",
  "spouseName": "",
  "spouseMeal": "",
  "status": "confirmed",
  "bookedAt": "2026-11-05",
  "verified": false,
  "verifiedAt": null,
  "cancelledAt": null
}
```
- `amount`: Calculated ticket total (Single = 1x price; Double = 2x price, qty 2; VIP = 1.5x price, qty 1).
- `status`: `"confirmed" | "cancelled"`. Always evaluate using `isBookingCancelled(booking)`.
- Cancelled bookings are never deleted; they are preserved for financial auditing and seat reclamation.

### 3.4 `assignments`
```json
{
  "id": 1,
  "eventId": 6,
  "userId": 3,
  "status": true
}
```
- Links an event to an authorized verifier (`userId`). `status: false` temporarily suspends assignment.

> **CRITICAL RULE**: Every ticket or revenue calculation across the entire codebase MUST pass through **`summariseBookings(bookings)`** in `js/core/utils.js`. It automatically filters out cancelled bookings and returns `{ count, tickets, revenue }`.

---

## 4. Architecture & Page Lifecycle

Every page implements a thin HTML shell:

```html
<head>
    <link rel="stylesheet" href="/css/base.css">
    <link rel="stylesheet" href="/css/components.css">
    <link rel="stylesheet" href="/css/layout.css">
    <link rel="stylesheet" href="/css/member/billing.css">
</head>
<body>
    <div id="app">
        <!-- Optional static template markup -->
    </div>
    <script type="module" src="/js/member/billing.js"></script>
</body>
```

### Standard Script Lifecycle
```javascript
import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getBookingsByUser, getEvents } from '../core/api.js';

async function init() {
    // 1. Guard route: invalid or missing session redirects to login
    const user = requireRole('member');
    if (!user) return;

    // 2. Render sidebar and topbar shell (preserves static content inside #app)
    const { contentEl } = renderLayout({
        user,
        activeKey: 'billing',
        title: '',
        subtitle: ''
    });

    // 3. Fetch data via API layer
    const [bookings, events] = await Promise.all([
        getBookingsByUser(user.id),
        getEvents()
    ]);

    // 4. Bind events & render dynamic elements
}

init();
```

---

## 5. File Map & Responsibility Directory

```
/
├── index.html                   Entry point (redirects based on session)
├── login.html                   Login portal (Email tab active, mobile demo tab)
├── forgot-password.html         Phone verification -> handoff to reset
├── reset-password.html          Guarded password reset (sessionStorage handoff)
├── db.json                      Live database & seed data
├── package.json                 Only json-server dependency
├── scripts/free-port.mjs        Port 3000 safety guard
├── AGENTS.md                    Short agent context
├── PROJECT-BRIEF.md             Complete developer brief (this document)
│
├── pages/
│   ├── admin/
│   │   ├── dashboard.html       Admin dashboard with metrics & weekly updates
│   │   ├── events.html          Events listing, filtering, and verifier assignment
│   │   ├── create-event.html    Dual create/edit event form (?id=N)
│   │   ├── event-details.html   Event details, attendees list, cancellation & deletion
│   │   ├── users.html           Member/verifier/admin user tables & deactivation
│   │   ├── add-admin.html       Admin registration
│   │   ├── add-member.html      Member registration
│   │   ├── add-verifier.html    Verifier registration
│   │   ├── admin-details.html   Admin profile editor
│   │   ├── member-details.html  Member profile editor
│   │   ├── verifier-details.html Verifier profile editor
│   │   ├── profile.html         Admin personal profile editor
│   │   └── settings.html        Admin settings shell
│   │
│   ├── member/
│   │   ├── dashboard.html       Hero card, recommended events, weekly stats
│   │   ├── events.html          Upcoming & Recommended events catalog with live search
│   │   ├── event-details.html   Banner, seats left, booking window check, duplicate booking lockout
│   │   ├── ticket-details.html  Attendee checkout form with pricing math & payment modal
│   │   ├── check-details.html   Alternative preview endpoint
│   │   ├── tickets.html         My Tickets listing with 24h cutoff self-cancellation
│   │   ├── billing.html         Live billing history with itemized printable invoices
│   │   ├── settings.html        Settings hub with dedicated Profile navigation
│   │   └── profile.html         Member personal profile editor with PATCH sync
│   │
│   └── verifier/
│       ├── dashboard.html       Verifier dashboard with assigned events hero banner and upcoming grid
│       ├── ticket-details.html  Dedicated ticket verification card with cover banner & live verify toggle
│       └── settings.html        Verifier settings shell
│
├── js/
│   ├── core/                    Shared utilities and application foundation
│   │   ├── config.js            API bases, storage keys, menu configurations, routing
│   │   ├── auth.js              requireRole, saveUser, clearUser, session revalidation
│   │   ├── api.js               Centralized fetch wrappers (never call fetch() in pages)
│   │   ├── layout.js            renderLayout, sidebar & topbar builders, logout dialog
│   │   ├── date.js              formatDate, formatTime, getTodayISO, getWeekRange
│   │   ├── utils.js             summariseBookings, isEventCancelled, isBookingCancelled, validation
│   │   ├── dom.js               openOverlay, closeOverlay, bindOverlayClose, showToast
│   │   └── icons.js             SVG icon library
│   │
│   ├── admin/                   Admin page scripts
│   ├── member/                  Member page scripts
│   │   ├── dashboard.js         Member overview & recommendations
│   │   ├── events.js            Catalog display & deterministic cover photos
│   │   ├── event-details.js     Dynamic event page with booking locks
│   │   ├── ticket-details.js    Checkout logic, pre-payment seat re-check, loader modal
│   │   ├── tickets.js           Tickets table, cancellation modal, 24h cutoff rule
│   │   ├── billing.js           Invoices table, modal data-binding, print trigger
│   │   ├── settings.js          Clean settings navigation
│   │   └── profile.js           Profile editor with PATCH to /users/:id & session sync
│   │
│   └── verifier/
│       ├── dashboard.js         Verifier assigned events loader & redirection to verification
│       ├── ticket-details.js    Single/multi-ticket verification view, search & live PATCH toggle
│       └── settings.js          Verifier settings shell
│
└── css/
    ├── base.css                 :root design tokens, color palette, typography
    ├── components.css           Shared button, input, pill, modal, and card styles
    ├── layout.css               Sidebar, topbar, responsive 900px drawer styles
    ├── admin/                   Admin page stylesheets
    ├── member/                  Member page stylesheets
    └── verifier/                Verifier page stylesheets (dashboard.css, ticket-details.css)
```

---

## 6. Design System & CSS Tokens

All visual tokens are defined in **`css/base.css :root`**:

| Token Category | CSS Variables | Purpose |
|---|---|---|
| **Brand Colors** | `--color-primary: #7b3fc4`<br>`--color-primary-dark: #4f23ac`<br>`--color-primary-light: #9b51c6`<br>`--gradient-primary: linear-gradient(135deg, #7b3fc4 0%, #4f23ac 100%)` | Primary brand identity, buttons, active sidebar items, header accents. |
| **Typography** | `--font-family: 'Poppins', sans-serif`<br>`--color-heading: #8e44c8`<br>`--color-text: #1f1f2e`<br>`--color-text-muted: #7a7a8a` | Consistent typographic hierarchy across all pages. |
| **Surfaces** | `--color-bg: #ffffff`<br>`--color-page-bg: #f5f5f9`<br>`--color-input-bg: #f6f7f9`<br>`--color-border: #e2e0ea`<br>`--shadow-card: 0 4px 20px rgba(0, 0, 0, 0.04)` | Container cards, input backgrounds, structural borders. |
| **Status Pills** | Green: `#10b981` (`.status-pill--confirm`)<br>Red: `#ef4444` (`.status-pill--cancel`)<br>Amber: `#f59e0b` (`.status-pill--pending`) | Ticket statuses, verification states, billing badges. |

- **Responsive Breakpoint**: **900px**. Below 900px, the sidebar turns into a slide-out drawer controlled by `.topbar__menu-button` and `.layout__overlay`.

---

## 7. Business Rules & Logic Implementations

### 7.1 Event Lifecycle, Deletion Protection & Creation Rules
- Events can be created, updated via `create-event.html?id=N`, cancelled, or reactivated.
- **Cancellation Preserves Bookings**: Cancelling an event updates `{ status: 'cancelled', cancelledAt: today }` while keeping its bookings intact in the database for financial and attendee record keeping.
- **Deleting an active event is prohibited if bookings exist**: Intercepted with an error toast: `"If you have to delete this event, first you have to cancel it."` Once an event is cancelled, deletion is permitted and removes the event along with cleaning up its attached assignments and bookings (purged via `deleteBooking()` and `deleteAssignment()`).
- **Atomic Deletion Sequence**: When deletion is permitted, `deleteEvent(id)` executes first. If deletion fails, an error is surfaced and no assignments are lost; verifier assignments are cleaned up only after event deletion succeeds.
- **Multi-Day Ongoing Events**: `getEventStatus(event.date, event.endDate)` in `date.js` uses `endDate` so an event that has started but not yet concluded is categorized as `ongoing`, not `past`.
- **Create/Edit Event Validation**:
  - `date <= endDate`, `bookingStart <= bookingEnd`, `bookingEnd <= date`
  - Single-day events: `endTime > startTime`
  - `price > 0` and `capacity > 0`
  - In edit mode: `capacity` cannot be reduced below tickets already booked (`summariseBookings(bookings).tickets`).
  - Pressing Enter inside any input field submits the form.
  - New events default to `status: "active"` and `cancelledAt: null`.

### 7.2 Member Booking Flow & Safeguards
1. **Booking Window Enforcement**:
   - `event-details.js` compares today's date against `event.bookingStart` and `event.bookingEnd`.
   - Outside the window, the CTA is disabled with informative messaging (`"Bookings Open On [Date]"` or `"Bookings Closed"`).
   - `ticket-details.js` validates the window again upon checkout initialization.
2. **Duplicate Booking Lockout**:
   - Members cannot hold multiple active bookings for the same event.
   - If already booked, `event-details.html` displays an **"Already Booked"** button redirecting to `tickets.html`.
3. **Pre-Payment Capacity Re-check (Anti-Overselling Guard)**:
   - When the user clicks "Pay Now", `ticket-details.js` immediately re-fetches the latest event bookings from the API, recomputes seats left via `summariseBookings()`, and rejects checkout if requested seats exceed remaining capacity.
4. **Double-Click Lockout**:
   - The "Pay Now" trigger is instantly disabled on click to prevent multi-submission race conditions.
5. **Simulated Payment Experience**:
   - Runs a staged modal progression: Animated spinner loader (1.2s) $\rightarrow$ Success confirmation with checkmark $\rightarrow$ Redirect to `tickets.html`.

### 7.3 Member Self-Cancellation (24-Hour Cutoff Rule)
- On `tickets.html`, members can cancel their confirmed tickets up until 24 hours prior to the event date (`event.date > getTodayISO()`).
- If `event.date === today`, the cancel button is disabled with a label `"Cutoff passed"`.
- Cancelled bookings record `status: 'cancelled'` and `cancelledAt: today`. They remain in the database for auditing and release their allocated seats in `summariseBookings()`.

### 7.4 Member Billing & Invoicing
- `billing.html` renders real member bookings with status pills (`Paid`, `Cancelled`, `Event Cancelled`).
- **Invoice Viewer**:
  - Itemized modal populated dynamically with member billing address, GST, event particulars, meal preferences, and spouse details.
  - Cancelled bookings display a specialized warning banner: `"This booking was cancelled on [Date]. Retained for audit and record keeping."`
  - Includes a dedicated `@media print` stylesheet that isolates the invoice card for physical printing or PDF export.

### 7.5 Member Profile & Settings
- In `settings.html`, the **Profile** row is active and routes directly to `profile.html`. Secondary placeholder rows (Privacy, Help Center, About Us) remain non-navigating.
- `profile.html` allows members to edit personal details, address, meal preference, spouse, GST, and password.
- Submitting the form calls `updateUser(userId, changes)` (HTTP PATCH to `db.json`), updates the active session in `localStorage`, and updates avatar initials across the page and topbar immediately.
- The topbar avatar button is interactive for both `admin` and `member` roles.

### 7.6 Admin Verifier Assignment Rules
1. **Assignment Restrictions**: Verifiers cannot be assigned to cancelled events (`isEventCancelled(event)`) or past events (`getEventStatus(event.date, event.endDate) === 'past'`).
2. **UI & API Enforcement**: The "Assign Event" row button is styled with `is-disabled` and shows an explanatory toast alert when clicked for cancelled/past events. Selecting a verifier in the modal activates their status toggle, and toggling status ON automatically checks the verifier.
3. **No Duplicate Assignments**: `saveAssignments(eventId)` re-fetches latest assignments from the server and validates `(eventId, userId)` uniqueness with safe numeric comparisons before creating an assignment. Saves new assignments with active status (`status: true`).
4. **Search & Select-All**: Search in the assign modal (`#assign-search`) strips leading `#` so `#3` matches ID `3`. Select-all (`#assign-all`) strictly affects visible filtered rows and updates dynamically when individual checkboxes change.

### 7.7 Admin User Management & Form Safeguards
1. **Dynamic Tab Add Buttons**: On `pages/admin/users.html`, only the Add button corresponding to the active role tab is rendered (Add Member, Add Ticket Verifier, Add Admin).
2. **Account Deactivation Protection**: An admin cannot deactivate or delete their own account, and the last remaining active admin cannot be deactivated or deleted.
3. **Detail Pages Guard**: Detail pages opened without `?id=` disable/hide the Delete Account button with an explanatory message.
4. **Unified Form Validation & Phone Safeguards**: All user create/edit forms validate non-empty name, valid email format, and a 10-to-12 digit mobile number (`/^\d{10,12}$/`). All phone inputs throughout the system enforce `minlength="10"`, `maxlength="12"`, `pattern="[0-9]{10,12}"`, and `inputmode="numeric"`, actively blocking non-numeric keystrokes and auto-sanitizing pasted inputs.
5. **Uniqueness Enforcement**: Email (case-insensitive) and mobile number are verified against all existing users to reject duplicates.
6. **Submit Button Lockout**: Submit buttons are disabled during API operations and re-enabled in a `finally` block.
7. **Admin Self-Edit Session Refresh**: Saving profile edits on the signed-in admin account automatically refreshes the `localStorage` session and topbar avatar initials.

### 7.8 Admin Dashboard & Settings
1. **Dashboard Analytics**: Greeting double space removed; weekly revenue formatted via `formatCurrency()`; search placeholder set to `"Search recent events"`; all revenue and ticket aggregations strictly pass through `summariseBookings()`.
2. **Settings Hub**: The first row item is labelled "Profile" and routes to `PROFILE_PAGE` (`/pages/admin/profile.html`). The unconnected topbar search is hidden, and `.topbar__actions` aligns the Profile button and remaining icon buttons to the right side of the header.

### 7.9 Verifier Portal & Venue Ticket Verification
1. **Sidebar Navigation**: Verifier sidebar renders `Events`, `Settings`, and `Log out` (Reports and Calendar are excluded).
2. **Assigned Events Dashboard**:
   - Reads active upcoming events from `/events` assigned to the verifier in `/assignments` (`a.status !== false`, `!isEventCancelled(event)`, `date >= today`).
   - Nearest upcoming event is featured on the Hero Card with dark gradient overlay, venue, date/time, and a "Verify Now" button.
   - Upcoming assigned events are displayed in a responsive 4-card grid matching the design system.
3. **Dedicated Ticket Details & Verification (`ticket-details.html`)**:
   - Clicking "Verify Now" redirects to `/pages/verifier/ticket-details.html?eventId=:id`.
   - Renders the framed card with purple border (`2.5px solid var(--color-primary); border-radius: 28px`), cover banner with `Ticket ID: #...`, event name, member name, ticket type, formatted date/time, and location.
   - For multi-attendee events, includes previous/next ticket navigation and topbar search to quickly locate any attendee's ticket.
   - Clicking "Verify Ticket" updates `/bookings/:id` (`PATCH { verified: true, verifiedAt: today }`), turning the button green (`Ticket Verified ✓`) with 1-click Undo support. Updates sync immediately to `db.json` and reflect across the Admin attendee roster and Member ticket view.

---

## 8. Authentication & Session Security Flow

1. **Login**: `authenticateUser(email, password)` matches credentials against `/users` and verifies that `status !== false`.
2. **Session Storage**: User session is saved in `localStorage.setItem('infinite_success_user', JSON.stringify(sanitizedUser))` with password stripped.
3. **Route Guarding**: Every page invokes `requireRole(expectedRole)`. If the session is missing, it redirects to `/login.html`; if the role is mismatched, it redirects to that role's home.
4. **Background Session Revalidation**:
   - In the background, `revalidateSession()` calls `getUserById(user.id)`.
   - If the account was deactivated (`status: false`), deleted, or had its role changed server-side, the user is logged out immediately.
   - If the server is unreachable due to a network blip, the session is preserved to avoid kicking offline users.
5. **Password Reset Protocol**:
   - `forgot-password.html` validates the user's registered phone number.
   - Stashes a temporary reset token `{ id, name, mobile }` in `sessionStorage.setItem('infinite_success_reset_user', ...)`.
   - `reset-password.html` refuses to execute without this handoff, applies the new password via `PATCH /users/:id`, and redirects to login.

---

## 9. API Wrapper Reference (`js/core/api.js`)

All interactions with `json-server` must go through `api.js`:

| Function | HTTP Method | Endpoint | Description |
|---|---|---|---|
| `authenticateUser(email, pw)` | `GET` | `/users?email=...` | Validates credentials and checks active status. |
| `getEvents()` | `GET` | `/events` | Retrieves all event records. |
| `getEventById(id)` | `GET` | `/events?id=...` | Retrieves single event or `null`. |
| `createEvent(payload)` | `POST` | `/events` | Creates a new event. |
| `updateEvent(id, changes)` | `PATCH` | `/events/:id` | Modifies event fields. |
| `deleteEvent(id)` | `DELETE` | `/events/:id` | Deletes an event. |
| `getBookings()` | `GET` | `/bookings` | Retrieves all bookings. |
| `getBookingsByUser(userId)` | `GET` | `/bookings?userId=...` | Retrieves bookings belonging to a member. |
| `getBookingsByEvent(eventId)` | `GET` | `/bookings?eventId=...` | Retrieves attendees for an event. |
| `createBooking(payload)` | `POST` | `/bookings` | Records a new ticket booking. |
| `updateBooking(id, changes)` | `PATCH` | `/bookings/:id` | Updates booking status (cancellation/verification). |
| `deleteBooking(id)` | `DELETE` | `/bookings/:id` | Deletes a booking record (used during cancelled event deletion cleanup). |
| `getUsers()` | `GET` | `/users` | Retrieves all user records. |
| `getUserById(id)` | `GET` | `/users?id=...` | Retrieves single user or `null`. |
| `createUser(payload)` | `POST` | `/users` | Registers a new user. |
| `updateUser(id, changes)` | `PATCH` | `/users/:id` | Updates user profile fields. |
| `deleteUser(id)` | `DELETE` | `/users/:id` | Deletes a user (blocked if bookings/assignments exist). |
| `getAssignments()` | `GET` | `/assignments` | Retrieves all event-verifier assignments. |
| `createAssignment(payload)` | `POST` | `/assignments` | Assigns an event to a verifier. |
| `updateAssignment(id, changes)` | `PATCH` | `/assignments/:id` | Toggles assignment active state. |
| `deleteAssignment(id)` | `DELETE` | `/assignments/:id` | Unassigns a verifier from an event. |

---

## 10. Conventions Checklist for AI / Developers

When adding or editing code in this repository, you must adhere to these conventions:

- **Indentation**: 4 spaces in all JavaScript, HTML, and CSS files.
- **Naming Conventions**: BEM-ish CSS naming (`.block__element--modifier`); state classes start with `is-` (`.is-active`, `.is-hidden`, `.is-open`).
- **No Global Leakage**: Page logic wrapped in `async function init() { ... }` called at the bottom of the script.
- **Explicit Imports**: Never omit `.js` from import statements.
- **Safe Dates**: Always format dates using `formatDate(iso)` or `formatShortDate(iso)`. Never use raw `.toISOString()` for UI display as it introduces UTC day-shift bugs.
- **Consistent Totals**: Any revenue or ticket aggregation must call `summariseBookings(bookings)`.
- **Cancellation Checks**: Always use `isEventCancelled(event)` and `isBookingCancelled(booking)`. Never compare `status === 'active'` directly as legacy database rows lack this field.
- **Safe DOM Manipulation**: Reusable popups must use `openOverlay(id)` and `closeOverlay(id)` from `dom.js`.
- **Button Feedback**: Always disable submit buttons during asynchronous API operations and restore them in a `finally` block with original button text.
- **Phone Field Constraints**: All phone/mobile inputs must configure `type="tel" inputmode="numeric" minlength="10" maxlength="12" pattern="[0-9]{10,12}"`. Use `isValidMobile()` (`/^\d{10,12}$/` in `utils.js`) for validation. Keystrokes must block non-digit characters on keydown, and pasted inputs must be sanitized to digits only.
