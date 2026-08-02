/* ==========================================================
   SHIBA PIMS — Core Service
   EvidenceService (Phase 8 · Sprint 8.1) — the Evidence
   backbone. Evidence is a FIRST-CLASS object: bodycam is just
   one type. Every piece carries a lifecycle status, its owning
   officer + division, where it came from, and — the heart of
   8.1 — a full CHAIN OF CUSTODY (who created / uploaded /
   viewed / attached / reviewed / locked / archived it).

   The registry is the `case_evidence` table (extended by
   PATCH-20); custody lives in `evidence_custody`. This service
   is the single API over both. It is self-contained (only
   needs db + PermissionService + AuditService) so it can load
   on the case, shift and dashboard pages alike.

   Needs a one-time setup: lapd/SETUP-PATCH-20.sql. Custody
   logging is best-effort and silently no-ops until it's run.
========================================================== */

const EvidenceService = {

    /* every kind of digital evidence the system understands */

    TYPES: ["Bodycam", "Dashcam", "Photo", "Video", "Audio",
            "Document", "Screenshot", "Digital", "Other"],

    /* the evidence lifecycle (bodycam's own Recording/Stopped/…
       lives on bodycam_sessions; this is the evidence-object status) */

    STATUSES: ["Created", "Uploaded", "Verifying", "Available",
               "Attached", "Reviewed", "Archived"],

    STATUS_COLORS: {
        "Created": "#9ca3af",
        "Uploaded": "#3b82f6",
        "Verifying": "#a855f7",
        "Available": "#22c55e",
        "Attached": "#0ea5e9",
        "Reviewed": "#eab308",
        "Archived": "#6b7280"
    },

    SOURCES: ["Manual", "Bodycam", "Dashcam", "Import"],

    RETENTION_POLICIES: ["Standard", "Never", "Custom"],

    /* the chain-of-custody actions, for reference / filtering */

    CUSTODY_ACTIONS: ["Created", "Uploaded", "Verified", "Viewed",
                      "Attached", "Detached", "Reviewed", "Locked",
                      "Unlocked", "Downloaded", "Archived"],

    SETUP_HINT_81:
        "The evidence backbone needs a one-time setup — run " +
        "lapd/SETUP-PATCH-20.sql (or RUN-ALL-PENDING.sql) in the " +
        "Supabase SQL Editor.",

    _missing(error) {

        const s = ((error?.message || "") + " " + (error?.code || ""))
            .toLowerCase();

        return s.includes("pgrst204") || s.includes("pgrst205") ||
            s.includes("does not exist") ||
            s.includes("could not find") ||
            s.includes("schema cache");

    },

    /* ----------------------------------------------------- */
    /* display helpers                                        */
    /* ----------------------------------------------------- */

    dot(color, label) {
        return `<span class="dotChip"><i style="background:${color}"></i>` +
            `${label}</span>`;
    },

    statusChip(status) {
        if (!status) return "—";
        return this.dot(this.STATUS_COLORS[status] || "#9ca3af", status);
    },

    /* ----------------------------------------------------- */
    /* chain of custody                                       */
    /* ----------------------------------------------------- */

    /* append one custody entry — fire-and-forget. Resolves the
       actor's officer id so the chain ties back to a person. */

    async logCustody(evidenceUuid, action, details) {

        if (!window.db || !evidenceUuid) return;

        let officerId = null;

        try { officerId = await PermissionService.myOfficerId(); }
        catch (e) { /* not linked */ }

        try {

            await db.from("evidence_custody").insert([{
                evidence_id: evidenceUuid,
                action: action,
                actor: localStorage.getItem("username") || null,
                actor_officer_id: officerId,
                details: details || null
            }]);

        } catch (e) { /* table missing — PATCH-20 not run yet */ }

    },

    async custody(evidenceUuid) {

        const { data, error } = await db
            .from("evidence_custody")
            .select("*, officers(officer_id, first_name, last_name)")
            .eq("evidence_id", evidenceUuid)
            .order("created_at", { ascending: true });

        if (error) return { error };

        return { rows: (data || []).map(r => {
            r.actor_label = r.officers
                ? (r.officers.officer_id + " " +
                   (r.officers.first_name + " " +
                    r.officers.last_name).trim())
                : (r.actor || "—");
            return r;
        }) };

    },

    /* ----------------------------------------------------- */
    /* queries                                                */
    /* ----------------------------------------------------- */

    async byId(evidenceUuid) {

        const { data, error } = await db
            .from("case_evidence")
            .select("*, cases(case_id, title), divisions(name)")
            .eq("id", evidenceUuid)
            .maybeSingle();

        if (error || !data) return { error: error || { message: "not found" } };

        return { row: data };

    },

    /* the Evidence Room foundation (Sprint 8.2 renders this) —
       every filter is optional. */

    async list({ search, type, status, source, caseId, officerId,
                 divisionId, from, to, limit = 300 } = {}) {

        let q = db
            .from("case_evidence")
            .select("*, cases(case_id, title), divisions(name)")
            .order("created_at", { ascending: false })
            .limit(limit);

        if (type) q = q.eq("type", type);
        if (status) q = q.eq("status", status);
        if (source) q = q.eq("source", source);
        if (caseId) q = q.eq("case_id", caseId);
        if (officerId) q = q.eq("uploaded_by_officer", officerId);
        if (divisionId) q = q.eq("division_id", divisionId);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to);

        if (search) {
            const s = search.trim();
            q = q.or(
                `evidence_id.ilike.%${s}%,file_name.ilike.%${s}%,` +
                `description.ilike.%${s}%`);
        }

        const { data, error } = await q;

        if (error) return { error };

        return { rows: (data || []).map(r => {
            r.case_label = r.cases ? r.cases.case_id : null;
            r.division_label = r.divisions ? r.divisions.name : null;
            return r;
        }) };

    },

    /* ----------------------------------------------------- */
    /* lifecycle transitions — each writes custody + audit    */
    /* ----------------------------------------------------- */

    async markViewed(ev) {

        /* a view is a custody event ("who looked at this") — no
           status change */

        return this.logCustody(ev.id, "Viewed", null);

    },

    async markReviewed(ev) {

        if (!window.db) return false;

        if (ev.status === "Reviewed") return true;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Reviewing evidence requires Sergeant or above.");

            return false;

        }

        const { error } = await db
            .from("case_evidence")
            .update({
                status: "Reviewed",
                reviewed_at: new Date().toISOString(),
                reviewed_by: localStorage.getItem("username") || null
            })
            .eq("id", ev.id);

        if (error) {

            UI?.error(this._missing(error)
                ? this.SETUP_HINT_81 : "Could not mark reviewed.");

            return false;

        }

        await Promise.allSettled([
            this.logCustody(ev.id, "Reviewed", null),
            AuditService.log({
                action: "EVIDENCE_REVIEWED",
                target: ev.evidence_id
            })
        ]);

        UI?.success(ev.evidence_id + " · reviewed");

        return true;

    },

    /* attach a free-standing piece of evidence to a case */

    async attachToCase(ev, caseRow) {

        if (!window.db || !caseRow) return false;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const { error } = await db
            .from("case_evidence")
            .update({
                case_id: caseRow.id,
                division_id: caseRow.division_id || ev.division_id || null,
                status: "Attached"
            })
            .eq("id", ev.id);

        if (error) { UI?.error("Could not attach the evidence."); return false; }

        await Promise.allSettled([
            this.logCustody(ev.id, "Attached", caseRow.case_id),
            AuditService.log({
                action: "EVIDENCE_ATTACHED",
                target: ev.evidence_id + " -> " + caseRow.case_id
            })
        ]);

        UI?.success(ev.evidence_id + " → " + caseRow.case_id);

        return true;

    },

    async detach(ev) {

        if (!window.db) return false;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const { error } = await db
            .from("case_evidence")
            .update({ case_id: null, status: "Available" })
            .eq("id", ev.id);

        if (error) { UI?.error("Could not detach the evidence."); return false; }

        await Promise.allSettled([
            this.logCustody(ev.id, "Detached", ev.cases?.case_id || null),
            AuditService.log({
                action: "EVIDENCE_DETACHED",
                target: ev.evidence_id
            })
        ]);

        return true;

    },

    async archive(ev) {

        if (!window.db) return false;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const { error } = await db
            .from("case_evidence")
            .update({ status: "Archived",
                      archived_at: new Date().toISOString() })
            .eq("id", ev.id);

        if (error) { UI?.error("Could not archive."); return false; }

        await Promise.allSettled([
            this.logCustody(ev.id, "Archived", null),
            AuditService.log({
                action: "EVIDENCE_ARCHIVED",
                target: ev.evidence_id
            })
        ]);

        UI?.success(ev.evidence_id + " · archived");

        return true;

    }

};

window.EvidenceService = EvidenceService;
