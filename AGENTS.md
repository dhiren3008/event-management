# AGENTS.md

Vanilla HTML/CSS/JS site served by json-server. No framework, no bundler, no build step.

## Run
- `npm install`, then `npm start` → http://localhost:3000
- `npm start` = `node scripts/free-port.mjs && json-server --watch db.json --static . --port 3000`: serves the REST API **and** the site.
- **Port 3000 guard:** `scripts/free-port.mjs` runs first and evicts anything already on port 3000 — but only processes whose command line contains `json-server`, so unrelated apps are never touched. This exists because the sibling project `Web development/Infinity` is *also* configured for `--port 3000`: whichever started first owned the port and the other died with `EADDRINUSE`. The guard makes this project's `npm start` always reclaim it. To run both projects at once, move one to a different port.
- All URLs are root-absolute (`/css/...`, `/js/...`, `/pages/...`) and JS uses ES modules — opening HTML with `file://` will NOT work. Always test through `npm start`.
- No lint/typecheck/test tooling exists. Verification = run the server and check the browser console.

## Data
- `db.json` is the live database AND seed data; json-server rewrites it on every write. Diff noise there is a normal side effect of testing.
- Collections: `users`, `events`, `bookings`, `assignments`. Passwords are stored/compared in plaintext (`js/core/api.js`); auth is client-side only.
- Seeded logins: admin@gmail.com/admin123, member@gmail.com/member123, verifier@gmail.com/verifier123.
- **Cancellation state is optional.** Events may carry `status: 'active' | 'cancelled'` and `cancelledAt`; bookings may carry `status: 'confirmed' | 'cancelled'` and `cancelledAt`. A missing status means active/confirmed, so older rows stay valid.
- Cancelled records are kept as history and are never deleted implicitly. Every ticket/revenue total must go through `summariseBookings()` in `js/core/utils.js` (it excludes cancelled bookings); the verifier dashboard skips cancelled events and bookings.
- Member pages (`js/member/*.js`) are still static markup with no API binding, so an event being cancelled does not yet block member booking — the admin UI is the only place the status is enforced.
- Deleting an event is blocked while it has bookings (use Cancel Event instead). Deleting a user is blocked while they have bookings or event assignments (deactivate instead), and an admin cannot deactivate or delete their own account.

## Structure
- Root pages: `login.html`, `index.html`, `forgot-password.html`, `reset-password.html`.
- `pages/admin/` — dashboard, event list/create/details, user list, add/edit pages for member/verifier/admin, switch-account, settings, profile. Each page is a shell: `<div id="app">` + one module script; page markup is either static inside `#app` or built by the script.
- `pages/member/` and `pages/verifier/` — static shells; the verifier dashboard is wired to real assignments/bookings.
- `js/core/` shared modules — always import with explicit `.js` extension:
  - `config.js`: API base, localStorage key, `ROLE_HOME`, and `ROLE_MENU` (sidebar). New admin pages get their menu entry here.
  - `auth.js`: `requireRole('admin')` guard; session = localStorage `infinite_success_user`.
  - `api.js`: fetch wrappers for `/users`, `/events`, `/bookings`, `/assignments`.
  - `layout.js`: `renderLayout()` injects sidebar/topbar into `#app`.
  - `utils.js`: validation, formatting, and the cancellation/`summariseBookings()` helpers.
- Page script pattern: `requireRole(...)` → `renderLayout(...)` → fill the page's static markup (or the returned `contentEl`).
- `css/`: `base.css` (`:root` design tokens), `components.css`, `layout.css`, then per-page CSS linked individually per HTML page. BEM-ish naming with `is-*` state classes.

## Gotchas
- Only `admin` has `ROLE_MENU` entries — member/verifier render an empty sidebar.
- `layout.js` links `/assets/images/logo.png` but the file is `Logo.png`: fine on Windows, 404 on case-sensitive hosts. Match case exactly for new files.
- Admin form pages declare their role with `data-role` on `#app`; do not re-derive the role from the URL (every admin URL contains `/admin/`).
- `js/admin/user-form.js` PATCHes only the fields a page actually renders, so detail pages with a subset of inputs cannot blank the rest of the record.
- Git repo root is `C:\Users\Dhiren` (home dir, no commits) — `git status` from here is huge and mostly unrelated; scope commands to this folder.
