# SHIBA PIMS — Changelog

All notable changes to the SHIBA Police Information Management System.

## v0.6.1 — 2026-07-05

### Added
- Proper full-screen **PIN verification** screen (was unstyled and
  appeared in the corner) — now a centered card, labelled "Step 2 of 2".
- **Loading screen on activation** — staged "Creating your account…"
  overlay after activating, matching the login experience.

### Changed
- Activation page is now vertically centered.
- **Legacy hard-coded login DISABLED** — the real Supabase Auth admin
  account is live; `ALLOW_LEGACY_LOGIN = false`. The old `vladko`
  bypass no longer exists; login is fully server-authenticated.

### Fixed
- `lapd/SETUP-PATCH-1.sql`: activation codes now cascade-delete with
  their officer (a used code previously blocked officer deletion).

## v0.6.0 — 2026-07-05

### Added
- **Real authentication (Supabase Auth)** — passwords are now checked
  on the server, never in the browser. Usernames map to internal
  `@shiba.is-a.dev` auth addresses; the PIN second step compares a
  SHA-256 hash stored in the account metadata.
- **Activation system** — creating an officer automatically issues an
  activation code (`ACT-2026-000001`, 48 h, XXXX-XXXX-XXXX). The
  officer opens **ACTIVATE ACCOUNT** on the login page, enters their
  Officer ID + code, and sets their own username/password/PIN — the
  admin never sees the password. One-time setup: `lapd/SETUP-AUTH.sql`
  (prints the bootstrap Super Administrator code) + disable
  "Confirm email" in Supabase Auth settings.
- **🔑 Reset Access** button in the officer drawer — issues a reset
  code for an officer who lost their password (they re-activate with
  a new username; true same-username reset needs a server function,
  planned).
- Activation codes live in an RLS-protected table — they cannot be
  listed from the browser; SECURITY DEFINER functions are the only
  doors in.

### Changed
- Login keeps a temporary legacy fallback (`ALLOW_LEGACY_LOGIN` in
  login.js) until the real admin account is confirmed — then it gets
  switched off and the hard-coded account stops existing.
- Login page uses the shared `window.db` client (removed the old
  duplicate `supabase.js` client).

## v0.5.0 — 2026-07-05

### Added
- **ID Engine** — central `public_ids` table + atomic `next_public_id()`
  SQL function for sequential public IDs (`OFCR-000001`,
  `CASE-2026-000001`, ...). One-time setup: `lapd/SETUP-ID-ENGINE.sql`.
  Officer and badge IDs use it automatically (with fallback until the
  SQL is run).
- **Edit Officer** — Edit button on every officer row; the modal opens
  pre-filled and saves changes (name, division, rank, photo) with a
  timeline entry.
- `CHANGELOG.md` and `ROADMAP.md`.

## v0.4.0 — 2026-07-05

### Added
- **One SHIBA account everywhere** — login shared between PIMS and
  CLOUD (localStorage), all pages gated.
- **OAuth-style login popup** — `/lapd/?=from<sessionId>` logs in and
  reports back to the opening tab, like Google login.
- **Cloud picker** — ☁️ button in the officer modal opens the cloud in
  picker mode; the chosen file fills the photo field automatically.
- **Cloud links as officer photos** — `/cloud/?=ID` share links resolve
  to the real file through the shared database (our cloud only).
- Share links use the short `?=ID` format; previews cover all common
  image/video/audio types by extension.

## v0.3.0 — 2026-07-04

### Added
- **SHIBA CLOUD** (`/cloud/`) — drag & drop file uploads to Supabase
  storage, share links with preview, recent-uploads list.
  One-time setup: `cloud/SETUP.sql`.
- Cloud entry in the sidebars.

## v0.2.0 — 2026-07-04

### Changed
- **Officers Engine reworked** to match the real database schema:
  `officer_id`, first/last name, rank/division lookups by name,
  promotion via the `ranks` table, timeline in `officer_timeline`.

### Fixed
- Promote wrote a nonexistent `rank` column.
- Deleting an officer failed when timeline rows existed.

## v0.1.0 — 2026-07-03

### Fixed
- All JavaScript console errors: duplicate script blocks after
  `</html>`, syntax errors in `officers.js` and `utils.js`, scripts
  loading in `<head>` before the page body existed, missing
  `layout.js`, Supabase client never actually created.

### Added
- Working command palette (Ctrl+K) with styling.
- Shared topbar/sidebar layout for the Officers page.
