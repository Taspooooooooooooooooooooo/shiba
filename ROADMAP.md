# 🚔 SHIBA PIMS — Roadmap to v1.0

One phase at a time. **No new module starts until the previous phase is
stable** — that's the rule.

## 📜 Development rules (every module must…)

- be backed by Supabase (no fake data)
- check permissions via `PermissionService.can(user, "action")`
- write to the **Audit Log** and the officer **Timeline**
- send **Notifications** where someone should know
- use the **Public ID Engine** (`OFCR-000001`, `CASE-2026-000001`, …)
- look consistent: dark theme, responsive, same components

---

## ✅ SHIPPED (v0.1 – v0.6)

- **Login & Auth** — real Supabase Auth (server-checked passwords),
  PIN as step 2 of 2, shared account across PIMS + CLOUD, SSO login
  popup, auto-logout session
- **Activation System** — officer gets a code (`ACT-2026-…`, 48 h),
  sets own username/password/PIN; admin Reset Access codes;
  code-only entry with Officer ID under Advanced settings
- **ID Engine** — central `public_ids` table + atomic
  `next_public_id()`; change a prefix in one row, whole system follows
- **Officers Engine v2** — create / edit / delete / search / view
  drawer / basic promote (ranks table) / timeline / cloud photos
- **SHIBA CLOUD** — file sharing with `?=ID` links, picker integration
  for officer photos
- Command palette (Ctrl+K), changelog, this roadmap

---

## 🟢 PHASE 0 — Foundation (IN PROGRESS)

Core services in `js/core/` that every future module calls instead of
repeating code:

- [ ] `idService.js` — public IDs (wraps the DB ID Engine)
- [ ] `permissionService.js` — `can(user, "promotion.approve")`;
      role matrix now, temporary + division permissions in Phase 3
- [ ] `auditService.js` — every important action → `audit_logs`
- [ ] `timelineService.js` — career events → `officer_timeline`
- [ ] `notificationService.js` — `notifications` table + toasts
- [ ] Officers module rewired through these services

## 🔵 PHASE 1 — Live Dashboard

- [ ] Real widgets: Active Officers, On Duty, Open Cases, Pending
      Promotions, Pending Certificates, Notifications
- [ ] Recent timeline feed + weekly graph
- [ ] Quick Actions (Create Officer, Create Case, Start Shift, Search)

## 🟣 PHASE 2 — Officer Management (COMPLETE ✅)

The heart of the system — one full page per officer:

- [x] Personnel File v1 (`personnel.html?id=…`): profile header with
      photo/rank/status pill, permission-gated Promote + Reset Access,
      tabs General · Timeline · Audit · Cases · Certificates
      (placeholder), account link, opening audit-logged
- [x] Sprint 2.1 — smart search (partial-ID, phone/email/status),
      working Status/Rank filters, Archive (Retired) instead of Delete
- [x] Sprint 2.2 — Edit everything with field-level audit diffs +
      timeline + notification; wizard Contact step (phone/email)
- [x] Personnel File tabs: Career · Statistics · Inbox · Leadership
      Notes · Permissions (Bodycam/Shifts tabs land with their phases)
- [ ] Career Progression visual (rank ladder with dates, certificates,
      approver, days-at-rank; shows demotions too)
- [ ] Leadership notes (read-only for the officer)
- [ ] Opening a Personnel File is itself audit-logged
- [ ] **Decision point: "SHIBA OS" shell** — single-page app with
      dynamic modules (like M365 Admin / Discord) instead of separate
      HTML pages. Evaluate here, before the biggest page is built.

## 🟠 PHASE 3 — Authentication & Identity (COMPLETE ✅)

Officer Profile (permanent record) vs User Account (login) as two
distinct things, plus everything that keeps identity secure:

- [x] 🪪 Digital Identity Card with scannable QR (print-ready)
- [x] Account Settings page (profile-vs-account, change password + PIN)
- [x] Sessions — current device + sign out others / everywhere
- [x] Account lock after 5 failed logins (audit + system alert)
- [x] Password reset codes (Lieutenant+) → officer's inbox
- [x] Live presence count on the dashboard
- [ ] *(Duty Authentication — Start Shift — lives in Phase 6 Shifts)*
- [ ] *(2FA / security keys — future)*

## 🔴 PHASE 4 — Permission & Authorization System (COMPLETE ✅)

The brain of PIMS — one place decides "who can do what, when, where,
and why", built in focused parts:

- [x] **Part 1 — Permissions**: comprehensive rank matrix through a
      single `PermissionService.can()`, `require()` guard (deny + audit),
      grouped Permission Viewer, and the **Permission Simulator**
      ("Preview as role"). Client-side.
- [x] **Part 2 — Permission Groups & Templates**: named bundles
      (Training Officer, Fleet Manager, …) assignable to an officer on
      top of their rank; rank templates + groups reference page
      (`permissions.html`). Needs `SETUP-PATCH-6.sql`.
- [x] **Part 3 — Temporary permissions / Delegation / Emergency
      Override**: one expiring-grant engine (grant + revoke + history)
      on the Personnel File; `can()` honours active grants. Needs
      `SETUP-PATCH-7.sql`.
- [x] **Part 4 — Division, Resource & Ownership permissions**: officers
      without `division.all` (Lieutenant+/admin) see only their own
      division's roster; `owns()` / `canModifyResource()` ownership
      helpers ready for Cases & Reports. Client-side, no SQL.
- [x] **Part 5 — Policy Engine**: central rules combining a permission
      with conditions (rank + ownership + time), e.g. "only Captain+ can
      delete bodycam within 30 days"; `checkPolicy()` + a Policies
      reference. Client-side.
- [ ] *Server-side hardening (separate careful pass): move policies to
      the database + Supabase **RLS** so rules are enforced on the
      server, not just the UI.*

## 🟡 PHASE 5 — Certificates & Promotions (IN PROGRESS)

Nothing changes rank with a button — everything is an official
certificate with an approval workflow:

- [x] Certificates Center: issue builder (9 types), `CERT-2026-…` ids,
      official printable document with secure QR
- [x] Issue → **Pending Approval** → Lieutenant+ approves → rank
      changes + timeline + audit + notification + inbox
- [x] Same flow for Award, Commendation, Suspension, Training,
      Firearm Qualification, Medical, Probation, Termination
- [x] Pending-approval queue with approve / reject (+ reason)
- [x] 📷 **SHIBA Scanner** tab — camera QR verification that validates
      **only our database tokens** (forged/revoked codes fail); scans
      audited; manual token entry fallback
- [x] **Certificate Studio** — full-page issuing with live document
      preview, read-only officer card, smart templates per type
- [ ] Drafts + versioning (save a draft, edit history, restore)
- [ ] Approval screen extras: history/timeline/audit tabs + attachments
- [ ] PDF export, watermark, barcode, digital signature
- [ ] **Certificate Designer** (admin template editor: logo, colors,
      layout, QR position — change the design without code) → grows
      into the Document Management System (reports, letters, policies)
- [ ] Special QR code types (awaiting the BOSS's permission 😄)

### 🔐 Secure QR Verification (user request, 2026-07-07)

A QR that **only our site can validate** — a forged or screenshotted
one fails.

- [ ] Every certificate / ID card QR encodes a **unique verification
      token** stored in the database (not just a plain URL), so the
      code means nothing without our records.
- [ ] In-app **QR scanner** page (device camera) that decodes a code,
      pulls the token, and checks it against the DB → shows
      **✅ Valid** (officer/certificate details) or **❌ Invalid /
      forged / revoked**.
- [ ] Tokens can be **revoked** and every scan is **audit-logged**
      (who scanned what, when).
- *My additions:* tamper check (token must match the certificate it
  claims); optional **public verify page** (no login) so a citizen can
  confirm a real certificate — this becomes the Phase 9 Public
  Verification Portal; scanner rejects any QR whose token isn't in our
  database, which is what makes it "only work for us."

### 📝 Applications & Requests (user request, 2026-07-07)

Officers apply for things; the right rank reviews and decides.

- [ ] Application **types**: SWAT, K9, Detective, Traffic, Transfer,
      Training, Special Permission (each with its own form questions).
- [ ] An officer opens e.g. **SWAT Application**, fills it in, submits;
      it gets `APP-2026-…` and status **Submitted**.
- [ ] Reviewers (**Sergeant+** or a `applications.review` permission)
      see a **queue** of pending applications; they **Accept / Deny /
      Request Changes** with a reason.
- [ ] The decision **notifies the officer** (inbox + notification),
      writes their **timeline** and the **audit** log.
- *My additions:* status flow (Draft → Submitted → Under Review →
  Accepted/Denied); each application **type** sets who may apply
  (min rank) and who may review (permission); an **accepted** SWAT
  application can auto-assign the SWAT division or a temporary
  permission (ties into Phase 3b permissions); an **Applications tab**
  on the Personnel File shows the officer's full application history.
  This reuses the same request→approval engine as Promotions.

## 🟢 PHASE 6 — Cases

- [ ] Case file: `CASE-2026-…`, status, priority, evidence, notes,
      attachments, assigned officers, timeline
- [ ] Assignment → officer gets notification + inbox + dashboard alert

## 🔵 PHASE 7 — Shifts & Bodycam

- [ ] Shift start/end, hours, calendar, weekly/monthly stats + graphs
- [ ] Bodycam: upload via SHIBA CLOUD, watch, evidence links,
      bookmarks, rank-gated download (Lieutenant+) / delete (Captain+)

## 🟣 PHASE 8 — Reports & Notification Center

- [ ] Incident / Arrest / Use of Force / Training / Disciplinary
      reports
- [ ] Inbox page, browser notifications, notification history —
      every notification has its own ID and URL

## 🟠 PHASE 9 — Administration

- [ ] Admin Center: users, roles, audit browser, database health,
      statistics, import/export, backups, diagnostics

## 🔥 PHASE 10 — v1.0 Polish

- [ ] Security review, performance, animations, final UI pass
- [ ] Public QR verification portal for certificates

---

## ⭐ Bonus ideas (post-v1.0)

Live dispatch map (GPS units) · Training scheduler · Fleet management ·
Achievement & service ribbons · Evidence locker · AI search assistant ·
Mobile app (Android/iOS)
