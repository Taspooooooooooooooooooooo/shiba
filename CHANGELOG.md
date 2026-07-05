# SHIBA PIMS — Changelog

All notable changes to the SHIBA Police Information Management System.

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
