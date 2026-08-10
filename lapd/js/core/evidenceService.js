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
                 divisionId, from, to, ownerScope, limit = 300 } = {}) {

        let q = db
            .from("case_evidence")
            .select("*, cases(case_id, title), divisions(name), " +
                "officers(officer_id, first_name, last_name)")
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

        /* rank-scoped access (Officer tier): own uploads OR evidence on
           the cases they're assigned to. Best-effort UX scoping — true
           enforcement is the Phase 9 RLS pass. */

        if (ownerScope && ownerScope.officerId) {

            const parts = ["uploaded_by_officer.eq." + ownerScope.officerId];

            if (ownerScope.caseIds && ownerScope.caseIds.length) {

                parts.push("case_id.in.(" + ownerScope.caseIds.join(",") + ")");

            }

            q = q.or(parts.join(","));

        }

        if (search) {
            const s = search.trim().replace(/[(),]/g, " ");
            q = q.or(
                `evidence_id.ilike.%${s}%,file_name.ilike.%${s}%,` +
                `description.ilike.%${s}%`);
        }

        const { data, error } = await q;

        if (error) return { error };

        return { rows: (data || []).map(r => {
            r.case_label = r.cases ? r.cases.case_id : null;
            r.division_label = r.divisions ? r.divisions.name : null;
            r.officer_label = r.officers
                ? (r.officers.officer_id + " " +
                   (r.officers.first_name + " " +
                    r.officers.last_name).trim())
                : null;
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

        if (this._lockedBlock(ev)) return false;

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

        Object.assign(ev, {
            status: "Reviewed",
            reviewed_by: localStorage.getItem("username") || null,
            reviewed_at: new Date().toISOString()
        });

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

        if (this._lockedBlock(ev)) return false;

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

        if (this._lockedBlock(ev)) return false;

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

        if (this._lockedBlock(ev)) return false;

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

    },

    /* ----------------------------------------------------- */
    /* lock · download · retention · export (Sprint 8.5)      */
    /* ----------------------------------------------------- */

    /* a locked item can't be edited/reviewed/attached/detached/
       archived until a Lieutenant+ unlocks it */

    _lockedBlock(ev) {
        if (ev && ev.locked) {
            UI?.error("This evidence is locked" +
                (ev.locked_reason ? " (" + ev.locked_reason + ")" : "") +
                " — a Lieutenant+ must unlock it first.");
            return true;
        }
        return false;
    },

    /* command staff (Lieutenant+) — matched by rank/role name */
    async isCommand() {
        try {
            const r = await PermissionService.role();
            return /lieutenant|captain|commander|chief|super|admin|deputy|inspector|colonel|major|superintend/i
                .test(r || "");
        } catch (e) { return false; }
    },

    async lock(ev, reason) {

        if (!window.db) return false;

        if (ev.locked) { UI?.error("Already locked."); return false; }

        if (!(await this.isCommand())) {
            AuditService.log({ action: "EVIDENCE_LOCK_DENIED",
                target: ev.evidence_id });
            UI?.error("Locking evidence requires Lieutenant or above.");
            return false;
        }

        if (!reason?.trim()) {
            UI?.error("A lock reason is required (e.g. Court Submission).");
            return false;
        }

        const { error } = await db.from("case_evidence").update({
            locked: true,
            locked_by: localStorage.getItem("username") || null,
            locked_reason: reason.trim(),
            locked_at: new Date().toISOString()
        }).eq("id", ev.id);

        if (error) {
            UI?.error(this._missing(error) ? this.SETUP_HINT_81 : "Could not lock.");
            return false;
        }

        Object.assign(ev, { locked: true, locked_reason: reason.trim(),
            locked_by: localStorage.getItem("username") || null });

        await Promise.allSettled([
            this.logCustody(ev.id, "Locked", reason.trim()),
            AuditService.log({ action: "EVIDENCE_LOCKED",
                target: ev.evidence_id, details: reason.trim() })
        ]);

        UI?.success(ev.evidence_id + " locked");
        return true;

    },

    async unlock(ev, reason) {

        if (!window.db) return false;

        if (!ev.locked) return true;

        if (!(await this.isCommand())) {
            AuditService.log({ action: "EVIDENCE_UNLOCK_DENIED",
                target: ev.evidence_id });
            UI?.error("Unlocking evidence requires Lieutenant or above.");
            return false;
        }

        const { error } = await db.from("case_evidence").update({
            locked: false, locked_by: null, locked_reason: null, locked_at: null
        }).eq("id", ev.id);

        if (error) { UI?.error("Could not unlock."); return false; }

        Object.assign(ev, { locked: false, locked_reason: null, locked_by: null });

        await Promise.allSettled([
            this.logCustody(ev.id, "Unlocked", reason?.trim() || null),
            AuditService.log({ action: "EVIDENCE_UNLOCKED",
                target: ev.evidence_id, details: reason?.trim() || null })
        ]);

        UI?.success(ev.evidence_id + " unlocked");
        return true;

    },

    fileHref(ev) {
        if (ev.cloud_id) return "../cloud/?=" + ev.cloud_id;
        return ev.file_url || null;
    },

    /* download requires a reason and is written to the chain of custody */
    async download(ev, reason) {

        const href = this.fileHref(ev);

        if (!href) { UI?.error("No file is attached to this evidence."); return null; }

        if (!reason?.trim()) {
            UI?.error("A reason is required to download evidence.");
            return null;
        }

        await Promise.allSettled([
            this.logCustody(ev.id, "Downloaded", reason.trim()),
            AuditService.log({ action: "EVIDENCE_DOWNLOADED",
                target: ev.evidence_id, details: reason.trim() })
        ]);

        return href;

    },

    async setRetention(ev, { policy, retainUntil } = {}) {

        if (!window.db) return false;

        if (this._lockedBlock(ev)) return false;

        if (!(await PermissionService.can("cases.assign"))) {
            UI?.error("Requires Sergeant or above.");
            return false;
        }

        if (!this.RETENTION_POLICIES.includes(policy)) policy = "Standard";

        const patch = {
            retention_policy: policy,
            retain_until: policy === "Custom" ? (retainUntil || null) : null
        };

        const { error } = await db.from("case_evidence")
            .update(patch).eq("id", ev.id);

        if (error) {
            UI?.error(this._missing(error) ? this.SETUP_HINT_81
                : "Could not set retention.");
            return false;
        }

        Object.assign(ev, patch);

        const detail = policy + (patch.retain_until
            ? " until " + patch.retain_until : "");

        await Promise.allSettled([
            this.logCustody(ev.id, "Retention set", detail),
            AuditService.log({ action: "EVIDENCE_RETENTION_SET",
                target: ev.evidence_id, details: detail })
        ]);

        UI?.success("Retention: " + policy);
        return true;

    },

    /* export the evidence metadata as a downloadable JSON file */
    exportMetadata(ev, custody) {

        const meta = {
            evidence_id: ev.evidence_id, type: ev.type, status: ev.status,
            source: ev.source, description: ev.description,
            file_name: ev.file_name, file_size: ev.file_size, sha256: ev.hash,
            case: ev.cases?.case_id || ev.case_label || null,
            division: ev.divisions?.name || ev.division_label || null,
            logged_by: ev.officer_label || ev.uploaded_by || null,
            created_at: ev.created_at,
            reviewed_by: ev.reviewed_by || null,
            reviewed_at: ev.reviewed_at || null,
            locked: !!ev.locked, locked_by: ev.locked_by || null,
            locked_reason: ev.locked_reason || null,
            retention_policy: ev.retention_policy || "Standard",
            retain_until: ev.retain_until || null,
            chain_of_custody: (custody || []).map(c => ({
                action: c.action, by: c.actor_label || c.actor || null,
                details: c.details || null, at: c.created_at }))
        };

        const blob = new Blob([JSON.stringify(meta, null, 2)],
            { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (ev.evidence_id || "evidence") + ".json";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        this.logCustody(ev.id, "Exported", "metadata JSON");
        AuditService.log({ action: "EVIDENCE_EXPORTED",
            target: ev.evidence_id, details: "metadata" });

    },

    /* open a print-ready evidence report (browser print → PDF) */
    exportReport(ev, custody) {

        const esc = s => (s == null ? "" : String(s))
            .replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

        const row = (k, v) =>
            `<tr><td class="k">${esc(k)}</td><td>${esc(v || "—")}</td></tr>`;

        const coc = (custody || []).map(c =>
            `<tr><td>${esc(c.action)}</td><td>${esc(c.actor_label || c.actor || "—")}</td>` +
            `<td>${esc(c.details || "")}</td><td>${new Date(c.created_at).toLocaleString()}</td></tr>`
        ).join("");

        const html =
            `<!doctype html><html><head><meta charset="utf-8">` +
            `<title>${esc(ev.evidence_id)} — Evidence Report</title><style>` +
            `body{font-family:Arial,sans-serif;color:#111;margin:32px}` +
            `h1{font-size:20px}h2{font-size:14px;margin-top:22px;` +
            `border-bottom:1px solid #ccc;padding-bottom:4px}` +
            `table{border-collapse:collapse;width:100%;font-size:12px}` +
            `td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}` +
            `td.k{width:180px;color:#555}.lock{color:#b00;font-weight:bold}` +
            `.badge{display:inline-block;padding:2px 8px;border:1px solid #999;` +
            `border-radius:6px;font-size:11px}</style></head><body>` +
            `<h1>SHIBA PIMS — Evidence Report</h1>` +
            `<span class="badge">${esc(ev.evidence_id)}</span> ` +
            (ev.locked ? `<span class="lock">LOCKED — ${esc(ev.locked_reason || "hold")}</span>` : "") +
            `<h2>Details</h2><table>` +
            row("Evidence ID", ev.evidence_id) + row("Type", ev.type) +
            row("Status", ev.status) + row("Source", ev.source) +
            row("Description", ev.description) + row("File", ev.file_name) +
            row("Size (bytes)", ev.file_size) + row("SHA-256", ev.hash) +
            row("Case", ev.cases?.case_id || ev.case_label) +
            row("Division", ev.divisions?.name || ev.division_label) +
            row("Logged by", ev.officer_label || ev.uploaded_by) +
            row("Logged at", ev.created_at ? new Date(ev.created_at).toLocaleString() : "") +
            row("Reviewed by", ev.reviewed_by) +
            row("Retention", (ev.retention_policy || "Standard") +
                (ev.retain_until ? " until " + ev.retain_until : "")) +
            `</table><h2>Chain of custody</h2><table>` +
            `<tr><th>Action</th><th>By</th><th>Details</th><th>When</th></tr>` +
            (coc || `<tr><td colspan="4">—</td></tr>`) + `</table>` +
            `<p style="margin-top:22px;color:#888;font-size:11px">Generated ` +
            new Date().toLocaleString() + ` · SHIBA PIMS</p>` +
            `<scr` + `ipt>window.onload=function(){setTimeout(function(){window.print()},300)}</scr` + `ipt>` +
            `</body></html>`;

        const w = window.open("", "_blank");
        if (!w) { UI?.error("Allow pop-ups to export the report."); return; }
        w.document.write(html); w.document.close();

        this.logCustody(ev.id, "Exported", "printable report");
        AuditService.log({ action: "EVIDENCE_EXPORTED",
            target: ev.evidence_id, details: "report" });

    }

};

window.EvidenceService = EvidenceService;
