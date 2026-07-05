# SHIBA PIMS — Roadmap

Development milestones for the SHIBA Police Information Management
System. Every module follows the same rules: database-backed, writes
to Timeline + Audit Log, creates notifications, respects permissions,
uses UUID + public ID.

## ✅ Milestone 1 — Core

- [x] Login (boot screen, PIN, shared account across services)
- [x] Dashboard
- [x] Officers Engine v2 (create / edit / delete / view, drawer, timeline)
- [x] SHIBA CLOUD file sharing + officer photos
- [x] ID Engine (sequential public IDs from the database)
- [ ] Roles & permissions (rank-based action rules)
- [ ] Notifications inbox

## 🔄 Milestone 2 — Workflow

- [x] **Activation system** — admin creates officer → activation code
      (48 h) → officer sets own username/password/PIN via Supabase
      Auth; 🔑 Reset Access button issues password-reset codes
      (same-username reset via Edge Function still planned)
- [ ] **Promotion system** — `promotion_requests` (PROMO-2026-000001),
      approval queue for Sergeant+, auto: rank change + timeline +
      notification + audit + certificate
- [ ] Cases (CASE-2026-000001, assignment, notes, evidence)
- [ ] Live audit log page

## 📄 Milestone 3 — Documents

- [ ] Certificates (promotion / award / commendation / training /
      disciplinary) with QR verification
- [ ] PDF export
- [ ] Inbox / messages

## 🎥 Milestone 4 — Media

- [ ] Shifts
- [ ] Bodycam (upload via SHIBA CLOUD, watch, evidence links,
      rank-gated download/delete)

## 🔒 Post-alpha hardening

- [ ] Supabase Row Level Security policies (stop anon writes)
- [ ] Real credential storage (users table / Supabase Auth) — replaces
      the hard-coded test login
- [ ] Move public-ID generation fully into database triggers
