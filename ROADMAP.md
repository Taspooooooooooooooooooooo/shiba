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

## 🟣 PHASE 2 — Personnel File (IN PROGRESS)

The heart of the system — one full page per officer:

- [x] Personnel File v1 (`personnel.html?id=…`): profile header with
      photo/rank/status pill, permission-gated Promote + Reset Access,
      tabs General · Timeline · Audit · Cases · Certificates
      (placeholder), account link, opening audit-logged
- [ ] Remaining tabs: Career · Bodycam · Shifts · Statistics ·
      Leadership Notes · Permissions · Inbox
- [ ] Career Progression visual (rank ladder with dates, certificates,
      approver, days-at-rank; shows demotions too)
- [ ] Leadership notes (read-only for the officer)
- [ ] Opening a Personnel File is itself audit-logged
- [ ] **Decision point: "SHIBA OS" shell** — single-page app with
      dynamic modules (like M365 Admin / Discord) instead of separate
      HTML pages. Evaluate here, before the biggest page is built.

## 🔴 PHASE 3 — Full Permission System

- [ ] Rank permissions matrix (Cadet → Chief) stored in the database
- [ ] **Temporary permissions** ("Manage Shifts, expires 10.08.2026")
- [ ] Division permissions (Metro sees Metro; Administration sees all)
- [ ] Grant/revoke UI + every grant audit-logged
- [ ] Supabase **RLS policies** — server-side enforcement (end of the
      anon free-for-all)

## 🟡 PHASE 4 — Certificates & Promotions

Nothing changes rank with a button — everything is an official
certificate with an approval workflow:

- [ ] Certificate builder: template, logo, Chief signature, QR,
      security pattern, `CERT-2026-…`, PDF export
- [ ] Issue → **Pending Approval** → Chief approves → rank changes +
      timeline + audit + notification + inbox, certificate becomes
      *Official*
- [ ] Same flow for Demotion, Award, Commendation, Suspension,
      Training, Firearm Qualification, Probation, Termination
- [ ] Promotion queue ("Certificates Waiting For Approval")

## 🟢 PHASE 5 — Cases

- [ ] Case file: `CASE-2026-…`, status, priority, evidence, notes,
      attachments, assigned officers, timeline
- [ ] Assignment → officer gets notification + inbox + dashboard alert

## 🔵 PHASE 6 — Shifts & Bodycam

- [ ] Shift start/end, hours, calendar, weekly/monthly stats + graphs
- [ ] Bodycam: upload via SHIBA CLOUD, watch, evidence links,
      bookmarks, rank-gated download (Lieutenant+) / delete (Captain+)

## 🟣 PHASE 7 — Reports & Notification Center

- [ ] Incident / Arrest / Use of Force / Training / Disciplinary
      reports
- [ ] Inbox page, browser notifications, notification history —
      every notification has its own ID and URL

## 🟠 PHASE 8 — Administration

- [ ] Admin Center: users, roles, audit browser, database health,
      statistics, import/export, backups, diagnostics

## 🔥 PHASE 9 — v1.0 Polish

- [ ] Security review, performance, animations, final UI pass
- [ ] Public QR verification portal for certificates

---

## ⭐ Bonus ideas (post-v1.0)

Live dispatch map (GPS units) · Training scheduler · Fleet management ·
Achievement & service ribbons · Evidence locker · AI search assistant ·
Mobile app (Android/iOS)
