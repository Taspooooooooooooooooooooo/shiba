# SHIBA PIMS — Changelog

All notable changes to the SHIBA Police Information Management System.

## v0.29.1 — 2026-07-18 · Random 5-digit badge numbers

### Changed
- **Badge numbers are random 5-digit again** (`BDG-79914`), not the
  sequential ID engine (`BDG-000001`, `BDG-000002`, …) — a badge is an
  identity, not a running counter. New officers get a random badge that
  is uniqueness-checked against the roster.
- **Existing sequential badges migrated**: OFCR-000001 → BDG-79914,
  OFCR-000002 → BDG-59658, OFCR-000003 → BDG-36121 (audited + on each
  officer's timeline). The whole roster now matches the original
  random-badge style.

## v0.29.0 — 2026-07-18 · Phase 6 Sprint 6.2 — the case file comes alive

### Added
- **Case Timeline** — the case's own chronological history (created,
  officers assigned/removed, status changes, notes added), separate from
  officers' personal timelines. Every case action now writes to it.
- **Notes** — investigator notes with author, time, an *edited* marker
  and **📌 pinning** (Sergeant+). Only the author can edit their note;
  notes are never deleted. Any signed-in officer can write one.
- **History tab** — the lifecycle at a glance (creation + every status
  change, with who did it).
- **Audit tab** — every audit-log entry referencing the case's ID.
- **Manage assignments from the case file** (Sergeant+) — add an officer
  with a role, or remove one (with an in-app confirm). Both run the full
  cascade: case timeline + audit + officer timeline + notification.

### Fixed
- **Create-case cascade race** — the audit/timeline/notification fan-out
  wasn't awaited, and the redirect to the new case file cancelled those
  requests mid-flight (found by creating the first REAL case,
  CASE-2026-000001 — stub tests couldn't catch it). `create()` now
  awaits the whole fan-out before the wizard navigates. The missing
  records for CASE-2026-000001 were backfilled.

### Setup
Run **`lapd/SETUP-PATCH-12.sql`** (or re-run `RUN-ALL-PENDING.sql`) —
adds `case_timeline` + `case_notes`. The Timeline/Notes/History tabs
show a friendly hint until then; Assignments and Audit already work.

## v0.28.2 — 2026-07-17 · PATCH-11 fix (legacy tables) + reliable update reload

### Fixed
- **`SETUP-PATCH-11.sql` failed with `column "division_id" does not
  exist`** — the original DB dump left behind *empty* legacy `cases` /
  `case_assignments` / `case_notes` tables with the wrong shape
  (`case_number` / `assigned_to`, no `case_id`), so `create table if not
  exists` skipped them and the index failed. The patch now detects the
  legacy shape (no `case_id` column), **aborts untouched if any row
  exists** (so real data is never lost), and only drops + recreates when
  the leftovers are empty. Stays idempotent after you have real cases.
- **"A newer version is available → Refresh now" sometimes needed several
  clicks.** GitHub Pages caches the page + `version.js` for 10 minutes,
  so a plain reload re-served the stale script. The button now
  re-fetches the page and `version.js` with `cache:"reload"` (bypassing
  the HTTP cache) *before* reloading, so one click lands the new build.
  (Takes effect from this version onward — the fix ships inside
  `version.js`.)

## v0.28.1 — 2026-07-17 · Personnel File ↔ Cases wiring + stale text

### Fixed
- **Personnel File "Cases" tab** was written against a placeholder schema
  (`case_number` / `assigned_to`) that never matched the real tables — it
  now reads the officer's actual cases via `case_assignments` and each row
  links to its case file. Stale empty-state text ("the full Case System
  arrives in Phase 5") replaced with the real setup hint.
- **Statistics tab "Cases" count** now counts real assignments instead of
  showing "—".
- **Permissions tab** note "Division, resource, and ownership permissions
  arrive in later parts of Phase 4" was stale (Phase 4 is complete) — now
  states they're enforced by the Policy Engine.

## v0.28.0 — 2026-07-17 · Phase 6 Sprint 6.1 — Cases (core)

### Added
- **Case Management — the operational heart of PIMS.** A case is a
  *container* (a digital case file), not a form. New `📂 Cases` page.
- **Case dashboard** — searchable, filterable table (status / priority /
  division), every row opens the full case file.
- **Create Case wizard** — 4 steps (General → Description → Officers →
  Review), with add/remove of additional officers (Sergeant+) each with
  a role. Officer applicants set themselves as Lead Investigator.
- **The 8-step create cascade** — one click fans out: generate `CASE-…`
  ID → insert case → assignments → per-officer Personnel-File timeline
  entries → audit log → notifications to assignees → dashboard.
- **Case file page** — General + Assignments tabs, full lifecycle status
  (Draft → Open → Investigation → Evidence Collection → Supervisor
  Review → Approved For Closing → Closed → Archived), Sergeant+ status
  advancement. Timeline / Evidence / Notes / History / Audit tabs are
  stubbed ("soon") for later 6.x sprints.
- Cases wired into the nav and `Ctrl+K` command palette.

### Setup
Run **`lapd/SETUP-PATCH-11.sql`** (or re-run `RUN-ALL-PENDING.sql`) —
adds the `cases` + `case_assignments` tables. Until then the page
degrades to a friendly hint. The ID engine's `CASE` prefix was already
seeded, so no ID setup is needed.

## v0.27.0 — 2026-07-16 · PDF417 credential barcode

### Added
- **PDF417 barcode on every certificate document** — the stacked
  barcode real driver's licences and police credentials carry, rendered
  as crisp SVG (prints sharp) next to the existing QR.
- **Branded payload:** `SHIBA|CERT|<cert id>|<officer id>|<token>`.
  The **token is still the only authority** — `verify_qr_token()` checks
  it against our DB, so a hand-crafted barcode with a made-up token is
  rejected exactly like a forged QR (verified: forged → `valid:false`).
- **Scanner reads PDF417** — ZXing decodes the strip from the camera
  alongside jsQR (every 6th frame; PDF417 is far heavier than QR).
  `extractToken()` now accepts the SHIBA payload, a QR link, or a raw
  token.

### Note
The Digital ID card does **not** get a PDF417 yet — officers have no
`qr_token`, so its barcode could be *decoded* but not *verified*, and a
scanner saying "valid" for an unverifiable code would be security
theatre. Needs an `officers.qr_token` patch first.

## v0.26.0 — 2026-07-15 · Adsterra connected (real ads in /cloud)

### Added
- **All 6 Adsterra units are live** in `cloud/adzone.js` — Social Bar
  (floating), Native Banner (right rail), 728×90 (top, desktop), 320×50
  (top, mobile), 160×600 (left rail), 300×250 (the ad-watch gate).
  One `AdZone.mount()` call wires every slot on `/cloud/` and
  `/cloud/downloads/`. **The main PIMS system stays 100% ad-free.**
- Each banner renders inside its **own `srcdoc` iframe**, because
  Adsterra's format reads a *global* `atOptions` — two sizes on one page
  would otherwise clobber each other. Verified: `atOptions` never leaks
  into the page global.

### Changed
- Side rails are now **one slot per side** (left 160×600, right native)
  instead of 3 identical slots — Adsterra fills duplicate units poorly,
  and a 600px skyscraper already fills the rail.

- **Admin mode — management browses the cloud ad-free.** Super
  Administrator / Chief / Commander (the same roles that already see
  every file) get **no banners, no social bar, and no ad-watch wait** —
  downloads hand over instantly. A badge **only they can see** ("🛡 Admin
  · Ads OFF") can flip ads back on to preview what a visitor gets.
  Visitors always get ads and never see the badge.

### Note
The Social Bar rewrites the browser tab title ("(1) New Message!") as an
attention grab — switchable off in the Adsterra unit's settings. (Admin
mode sidesteps it entirely for you.)

**Honest:** admin mode reads `localStorage.role`, so it's client-side —
someone could set `role="Chief"` to skip ads. Same caveat as the rest of
the gate; the real fix is the private bucket + signed-URL edge function.

## v0.25.1 — 2026-07-15 · Applications: graceful degrade before PATCH-10

### Fixed
- Submitting / editing an application no longer fails if
  `SETUP-PATCH-10.sql` hasn't been run yet — it retries without the
  `linked_certificate` / `updated_at` columns (with a one-line hint when
  a certificate link is dropped). Run PATCH-10 to enable cert-linking.

## v0.25.0 — 2026-07-15 · Applications rework (auto-detect, form builder, in-app dialogs)

### Added
- **Sergeant I+ can review** — application review is now open to the
  Sergeant tier and above (was Lieutenant+). Reviewers **open** each
  application in a detail dialog to see the full submission and decide;
  nothing sensitive is just listed in the open.
- **Google-Forms-style form** — each question is its own card, and the
  applicant can **add** their own questions and **remove** any question.
- **Link a certificate** — optionally attach one of your approved
  certificates (e.g. a **Firearm Qualification**) to an application.
  Needs `lapd/SETUP-PATCH-10.sql` (or re-run `RUN-ALL-PENDING.sql`).
- **Edit & resubmit** — when a reviewer requests changes, the applicant
  can edit their answers/motivation/linked cert and resubmit.
- **In-app dialogs** — a themed modal system (`UI.modal` / `UI.confirm`
  / `UI.promptText`) replaces every native browser `prompt`/`confirm`
  in the applications flow (deny reason, request-changes note, accept
  confirmation).

### Changed
- **Removed the "You are applying as" picker** — the applicant is now
  **auto-detected** from the signed-in account.
- **"All Applications" → "My Applications"** — you see only your own
  applications; the review queue (Sergeant I+) is where open ones live.

## v0.24.0 — 2026-07-14 · Cloud polish (real download, ad rails, bigger preview)

### Changed
- **Real download** — the download button (and the `/cloud/downloads/`
  route) now **saves the file** instead of opening it in a tab. It
  fetches the bytes and hands over a same-origin blob so the browser's
  Save dialog fires even for cross-origin storage.
- **Removed the "Copy direct link"** button from the file viewer — the
  share link + the ad-gated download link remain.
- **Bigger file preview** — the viewer card is now up to 900px wide and
  previews are up to 70% of screen height (less empty space).
- **Side ad rails** — 3 stacked ad slots on the left and right margins
  of the cloud + download pages (in addition to the top banner), shown
  on wide screens. Cloud only; placeholder until Adsterra is connected.

## v0.23.0 — 2026-07-11 · SHIBA Cloud rework (ads, ad-gate, privacy)

### Added
- **Ad-watch gate** — before an upload or download, a full-screen gate
  shows an ad for a time scaled to the file size (**15–120s**), then
  hands the file over. Powered by `cloud/adzone.js`.
- **Ads in /cloud only** — a page banner + gate ad slots, with a
  labelled placeholder until you connect Adsterra. **The main PIMS
  system stays 100% ad-free** (police data never sits with ad scripts).
- **Per-account privacy** — you now see only **your own** uploads;
  admins/chiefs (management) still see everything. Needs
  `cloud/SETUP-CLOUD-PRIVACY.sql`.
- **Direct-download route** `/cloud/downloads/?=<id>` — a clean link
  that runs the ad-gate then downloads.
- **Right-click / drag deterrent** on cloud files.
- **`cloud/ADSTERRA-GUIDE.md`** — step-by-step: account → ad types →
  paste keys → get paid.

### Honest note
The gate is client-side (most users comply, but a public bucket URL is
still reachable directly). True unbypassable protection = private
bucket + signed-URL edge function — planned next; officer photos keep
working (verified) and move to their own public path when we do it.

## v0.22.0 — 2026-07-11 · Applications + Command Palette refresh

### Added
- **📝 Applications** (`applications.html`, new sidebar tab) — officers
  apply for special assignments (SWAT, K9, Detective, Traffic,
  Transfer, Training, Special Permission), each with its own questions.
  **Sergeant+** (`applications.review`) see a review queue and
  **Accept / Deny / Request Changes** (reason required). Decisions
  notify the officer + timeline + audit. Accepting SWAT/K9/etc. can
  **auto-assign the division**; Training grants the Training-Officer
  permission group. `APP-2026-…` ids. Personnel File gets an
  **Applications tab**. Needs `lapd/SETUP-PATCH-9.sql`.
- **⌨️ Command Palette (Ctrl+K) refreshed** — now covers every current
  page (Officers, Certificates, Certificate Studio, Scanner,
  Applications, Permissions, Cloud, Settings) plus quick actions
  (Create Officer, Issue Certificate) and Log out. No more "Coming
  Soon" dead entries.

## v0.21.0 — 2026-07-11 · Certificate Studio + big-screen layout

### Added
- **🎖 Certificate Studio** (`cert-studio.html`) — issuing a certificate
  is now a full-page experience, not a form: pick the type from chips,
  the officer's file loads read-only (photo, ID, badge, rank, division,
  hire date), and the **official document builds itself in a LIVE
  preview** as you type — Canva/Word style. **Smart templates**
  pre-write the official wording for each of the 9 types (editable).
  Generate → Pending Approval → the existing approval workflow.
  Every "Issue Certificate" button now opens the Studio.

### Fixed
- **Big screens** — page content now fills wide monitors (the content
  column was sizing to its children, leaving a third of a 1920px
  screen empty); ultra-wide screens also get more widget columns and
  breathing room. Mobile keeps its compact layout — the site adapts
  automatically between PC and mobile.

## v0.20.0 — 2026-07-09 · Phase 5 — Certificates, Promotions & the Scanner

### Added
- **🏆 Certificates Center** (`certificates.html`) — the official
  document system. Issue any of 9 certificate types (Promotion, Award,
  Commendation, Training, Firearm Qualification, Medical, Suspension,
  Probation, Termination) → it lands in **Pending Approval** →
  Lieutenant+ approves or rejects (with a reason). **No more Promote
  button anywhere** — a promotion happens only when its certificate is
  approved, which triggers the full cascade: rank change → timeline →
  audit → notification → inbox.
- **Official certificate documents** — printable, gold-trimmed, with
  Certificate ID, issuer, approver, effective date, and a **secure QR**.
- **📷 SHIBA Scanner** (`scanner.html`, new sidebar tab) — scan a
  certificate QR with the camera (or paste the token). A code validates
  **only against our database**: forged, foreign, revoked, or rejected
  codes are flagged. Every scan is audited.
- **Personnel File → Certificates tab** is now real: the officer's
  certificates with status chips + document view; Issue button for
  Sergeant+.
- Officers page: row/drawer/personnel "Promote" buttons became
  **🎖 Issue Certificate**.
- Database: `SETUP-PATCH-8.sql` (also bundled in `RUN-ALL-PENDING.sql`)
  — certificates table with unguessable `qr_token` + the
  `verify_qr_token` scanner function. Graceful hints until run.

## v0.19.0 — 2026-07-07 · Version display + auto update check

### Added
- **Single source of truth for the version** (`js/version.js` +
  `version.json`). The boot screen and footer now show the **real**
  running version (no more hard-coded "v1.0.0").
- **Update detector** — each page checks `version.json` (fetched fresh,
  never cached). If your browser is running an older cached build, a
  green **"A newer version is available — Refresh now"** banner appears,
  so you always know when you're up to date.

### Note
- On release, bump BOTH `js/version.js` and `version.json` (they must
  match). Documented at the top of `version.js`.

## v0.18.0 — 2026-07-07 · Phase 4 complete — Policy Engine + fixes

### Added
- **Policy Engine** (Part 5) — the capstone. Central rules that combine
  a permission with **conditions** (rank + ownership + time), defined
  once: archive (Lieutenant+), promotion approval (Lieutenant+), bodycam
  delete (Captain+ **and within 30 days**), case close (assigned officer
  or Sergeant+). `PermissionService.checkPolicy()`; a Policies section
  on the Permissions Reference page. Officer archive now runs through it.

### Fixed
- **Scrolling** — pages could not scroll when taller than the screen
  (a global `overflow:hidden` on `<body>`); now scrolls normally, and
  no more horizontal overflow that forced zooming out (worst on mobile).
- Mobile spacing and single-column cards on small screens; wide tables
  scroll sideways.

### Changed
- The Officers roster shows **everyone in one place** again (division
  scoping reverted per preference; the division helpers remain for
  future modules).

**Phase 4 — the Permission & Authorization System — is complete.**
Server-side RLS enforcement remains as a separate hardening pass.

## v0.17.0 — 2026-07-07 · Phase 4 Part 4 — Division & Ownership

### Added
- **Division permissions** — officers without `division.all`
  (Lieutenant+ / admins) now only see their **own division's** roster
  on the Officers page. "Traffic can't see SWAT."
- **Ownership / resource helpers** — `PermissionService.owns()` and
  `canModifyResource()` (owner may edit until locked; then an elevated
  permission is required). Library ready for Cases & Reports.
- **`RUN-ALL-PENDING.sql`** — one paste that applies every pending
  database patch (audit-safety, account-lock, permission-groups,
  temporary-permissions) in a single, safe-to-re-run script.

### Fixed
- Roadmap phase numbering (there were two "Phase 5"s): Cases → Phase 6,
  Shifts → 7, Reports → 8, Administration → 9, Polish → 10.

## v0.16.0 — 2026-07-07 · Phase 4 Part 3 — Temporary Permissions

### Added
- **Temporary permissions** — grant an officer a single permission that
  **auto-expires**. One engine, three intents chosen when granting:
  **Temporary** (time-boxed extra power), **Delegation** (hand an
  approval power over while away), **Emergency** (a 2-hour override).
- On the Personnel File → 🛡 Permissions tab, admins pick a permission,
  a kind, a duration (2h / 1d / 7d / 30d) and a reason, then **Grant** —
  and can **Revoke** active grants. Expired/revoked grants are shown as
  **history**. `PermissionService.can()` counts only active grants
  (skipped while simulating).
- Every grant/revoke is **audited + timelined** and the officer is
  **notified**.
- Needs `lapd/SETUP-PATCH-7.sql` (adds `permission_grants`); degrades
  to a hint until run.

## v0.15.0 — 2026-07-07 · Phase 4 Part 2 — Permission Groups & Templates

### Added
- **Permission Groups** — named bundles (🎓 Training Officer, 🚔 Fleet
  Manager, 📦 Evidence Custodian, 🧑‍✈️ Recruiter, 📻 Dispatcher) that
  grant a set of permissions on top of an officer's rank. Assign them
  on the Personnel File → 🛡 Permissions tab (admins only); saving is
  audited and timelined. `PermissionService.can()` now includes an
  officer's group permissions.
- **Permissions Reference** page (`permissions.html`, admin-only,
  linked from Settings) — shows every **rank template** and every
  **group** bundle in one place.
- Needs `lapd/SETUP-PATCH-6.sql` (adds `officers.permission_groups`).
  Until it's run, groups simply don't apply — no errors.

## v0.14.0 — 2026-07-07 · Phase 4 Part 1 — Permission Foundation

### Added
- **Comprehensive rank matrix** — the full permission list (officers,
  cases, certificates, bodycam, reports, leadership/admin) flowing
  through the single `PermissionService.can()`.
- **`require(action)` guard** — the "blocked → show message + audit"
  flow in one call (logs `PERMISSION_DENIED`).
- **🔒 Permission Simulator** — admins can **Preview as** any rank from
  Settings; the whole UI switches to what that role sees (with a
  floating "Previewing as…" banner), the real account untouched. Great
  for testing exactly what each rank gets.
- **Permission Viewer** — the Personnel File tab now lists every
  permission grouped by module with ✓ / ✕ for the officer's rank.

Client-side for now; database-driven rules, groups, temporary/division
permissions, and the Policy Engine come in Parts 2–5.

## v0.13.0 — 2026-07-07 · Phase 3 complete — Authentication & Identity

### Added
- **⚙️ Account Settings** (`settings.html`) — makes the Account-vs-Profile
  split real: your **User Account** (username, role, login email, last
  sign-in, PIN status) beside your linked **Officer Profile**. Change
  your password and 4-digit PIN (via Supabase Auth); both are audited.
  Settings sidebar link now works.
- **📱 Sessions** — see your current device, and **Sign out other
  devices** or **Sign out everywhere** (Supabase session scopes).
- **🔒 Account Lock** — 5 wrong passwords locks an account for 15
  minutes; the login page warns on the last attempts, logs
  `ACCOUNT_LOCKED`, and raises a system notification. Needs
  `lapd/SETUP-PATCH-5.sql` (login works normally until it's run).
- **🟢 Live presence** — a "Online Now" dashboard widget counting who's
  actually using SHIBA PIMS right now (Supabase Realtime).
- **📧 Password reset → inbox** — issuing a Reset Access code now also
  drops a message in the officer's inbox.

## v0.12.0 — 2026-07-07 · Phase 3 begins — Authentication & Identity

### Added
- **🪪 Digital Identity Card** — every Personnel File can now open an
  official SHIBA PD credential: photo, name, rank, badge, Officer ID,
  division, status, and a **scannable QR code** (generated in the
  browser) that links to the officer's file. Print-ready layout.
  Opening a card is audit-logged (`IDENTITY_CARD_VIEWED`).

## v0.11.0 — 2026-07-06 · 🎖 Officer Management Edition (Phase 2 complete)

### Added — Personnel File tabs
- **🎖 Career** — rank-change ladder built from the timeline, with the
  date and days spent at each stage.
- **📊 Statistics** — real counts: cases, reports, promotions, timeline
  events, audit events (certificates arrive in Phase 4).
- **🔔 Inbox** — the officer's notifications, with click-to-mark-read.
- **📝 Leadership Notes** — senior officers (Lieutenant+) leave notes
  the officer can only read; each note is audited and timelined.
  Needs `lapd/SETUP-PATCH-4.sql` (shows a friendly hint until run).
- **🛡 Permissions** — what the officer's rank grants (rank→tier
  mapping); temporary/division/custom permissions come in Phase 3.

### Phase 2 — Officer Management — is complete
Create wizard, activation, full audited edit, archive, search,
filters, and the full Personnel File. Certificates and Cases tabs
remain placeholders until their phases (4 and 5).

## v0.10.1 — 2026-07-06

### Fixed
- **SHIBA CLOUD uploads while logged in** — after real Supabase Auth
  shipped (v0.6), logged-in users became the `authenticated` role, but
  the cloud storage rules only permitted `anon`, so every upload failed
  with "new row violates row-level security policy". Cloud storage
  operations (upload / delete / public URL) now run through a dedicated
  anonymous storage client that the existing rules allow. Viewing
  shared files was never affected. (Phase 3 RLS hardening will replace
  this with proper authenticated-role storage policies.)

## v0.10.0 — 2026-07-06 · Phase 2 Sprints 2.1 + 2.2

### Added
- **✏️ Edit Personnel** — an Edit button on the Personnel File (and the
  officers table) opens a full editor for *every* field: name, phone,
  email, division, rank, status, photo, internal notes. Each save
  records a **field-level audit diff** ("phone: — → +421 900 000 001;
  email: — → chief@…"), a timeline entry, and a notification to the
  officer's account.
- **📇 Contact step** in the Create Officer wizard (phone + email),
  matching the planned create form. Wizard is now 6 steps.
- **🗄️ Archive Officer** replaces Delete — police keep history. An
  officer who leaves is marked **Retired** (audited + notified); every
  case, timeline entry, certificate, and audit record stays forever.

### Changed
- **Smart search** — searches name, ID, badge, rank, division, phone,
  email, and status; partial-ID matching means `OFCR-152` finds
  `OFCR-000152`.
- **Working filters** — the Status and Rank dropdowns now filter the
  list (ranks loaded from the database); archived officers are hidden
  by default and shown under the "Archived" status filter.

## v0.9.0 — 2026-07-06 · Phase 2: Personnel File

### Added
- **📂 Personnel File** (`personnel.html`) — one page per officer:
  profile header (photo, rank, badge, On-Duty pill), permission-gated
  Promote / Reset Access, and tabs:
  - **General** — full details grid incl. the linked @account
  - **Timeline** — complete career history
  - **Audit** — every logged action involving this officer
  - **Cases** — ready for Phase 5
  - **Certificates** — placeholder for Phase 4
- Officer names in the table are now links to their Personnel File;
  the drawer got a "📂 Personnel File" button.
- Opening a personnel file is itself audit-logged
  (`PERSONNEL_FILE_OPENED`) — sensitive data access is traceable.

## v0.8.1 — 2026-07-06

### Added
- **Create Officer wizard** — account-setup style: Name → Division →
  Rank → Photo → Summary → Create → ✅ Success, with the activation
  code (and copy button) right in the success screen. Back button on
  every step; Edit mode still shows all fields at once.
- Rank dropdown and division suggestions now come from the database
  (all 10 ranks, all 7 divisions).

### Changed
- Officers page textures: themed action-bar buttons, table row
  buttons, search bar, and filter dropdowns (no more default white
  browser controls).
- Chief of Police **Vladko Shiba (OFCR-000001)** reports for duty 🚔

## v0.8.0 — 2026-07-06 · Phase 1: Live Dashboard

### Added
- **Live widgets** — Officers, On Duty, Open Cases, Reports, Cloud
  Files, and your Unread notifications: real database numbers,
  refreshed every 30 seconds.
- **⚡ Live Activity feed** — the newest audit entries (who did what,
  when, with the AUDIT id) right on the dashboard.
- **📊 Weekly Activity chart** — events per day for the last 7 days,
  labelled in your language.
- **Quick Actions** — ＋ Create Officer (jumps straight into the
  modal, permission-gated), 🔍 Search Officers, ☁️ Upload File.

## v0.7.0 — 2026-07-06 · Phase 0: Foundation

### Added
- **Core services** in `js/core/` — the engine every future module
  uses: `idService` (public IDs), `permissionService`
  (`can(user, "officers.create")` with a rank matrix),
  `auditService` (audit_logs), `timelineService` (officer_timeline),
  `notificationService` (notifications table + NOTIF ids).
- **Real audit trail** — creating, editing, promoting, deleting
  officers, issuing reset codes, and activating accounts all write
  `AUDIT-2026-…` entries with actor, target, and details.
- **Notifications** — system entries on officer creation; promoted
  officers with accounts get a personal "Congratulations" message.
- **Permission gating** — plain Officers see a view-only officer
  list; Create/Edit/Promote/Delete/Reset appear only for roles that
  are allowed to use them (client-side UX gating; server-side RLS
  comes in Phase 3).
- `lapd/SETUP-PATCH-3.sql` — audit history survives deletions
  (foreign keys switch to ON DELETE SET NULL).

### Changed
- ROADMAP.md consolidated from the BOSS planning documents into one
  phase plan (Phase 0 Foundation → Phase 9 v1.0).

## v0.6.2 — 2026-07-05

### Changed
- Activation asks only for the **activation code** — the Officer ID
  field moved behind an "⚙ Advanced settings" toggle as an optional
  double-check (`lapd/SETUP-PATCH-2.sql` relaxes the server check).

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
