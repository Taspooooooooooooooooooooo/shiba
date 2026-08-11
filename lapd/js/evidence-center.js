/* ==========================================================
   SHIBA PIMS
   Evidence Center (Phase 8 · Sprint 8.6) — a Sergeant+ oversight
   screen for the department's digital evidence:
     • Today's Uploads
     • Pending Review (unreviewed evidence)
     • Missing Bodycams (shifts that ended without footage)
     • Processing (uploaded but not yet integrity-verified)
     • Flagged (tampered / failed integrity)
   Reads existing tables — no new schema.
========================================================== */

const EvidenceCenter = {

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    async init() {

        if (!window.db) return;

        const sup = await PermissionService.can("cases.assign");

        const scope = document.getElementById("ecScope");

        if (!sup) {
            scope.innerHTML = `<span class="dotChip"><i style="background:#e08a5a">` +
                `</i>Supervisors only</span>`;
            document.getElementById("ecBody").innerHTML =
                "<p class='muted'>The Evidence Center is for Sergeant and " +
                "above. Ask a supervisor if you need something reviewed.</p>";
            return;
        }

        scope.innerHTML = `<span class="dotChip"><i style="background:#22c55e">` +
            `</i>Supervisor oversight</span>`;

        await this.load();

    },

    async load() {

        const [today, pending, missing, processing, flagged] =
            await Promise.all([
                this.todayUploads(),
                this.pendingReview(),
                this.missingBodycams(),
                this.processing(),
                this.flagged()
            ]);

        const body = document.getElementById("ecBody");
        body.innerHTML = "";

        /* ---- stats ---- */

        const stat = (label, v, cls = "") =>
            `<div class="statChip ${cls}"><b>${v}</b><span>${label}</span></div>`;

        const stats = document.createElement("div");
        stats.className = "caseStats";
        stats.style.marginBottom = "6px";
        stats.innerHTML =
            stat("Today", today.length) +
            stat("Pending review", pending.length,
                pending.length ? "" : "") +
            stat("Missing bodycam", missing.length,
                missing.length ? "crit" : "") +
            stat("Processing", processing.length) +
            stat("Flagged", flagged.length, flagged.length ? "crit" : "");
        body.appendChild(stats);

        /* ---- sections ---- */

        body.appendChild(this.section(
            "Flagged evidence", flagged,
            "Bodycam footage whose stored file no longer matches its hash — " +
            "possible tampering.",
            f => this.bodycamRow(f, "#ef4444", "TAMPERED"), true));

        body.appendChild(this.section(
            "Missing bodycams", missing,
            "Shifts that ended with a bodycam ready but no footage uploaded.",
            m => this.shiftRow(m), true));

        body.appendChild(this.section(
            "Pending review", pending,
            "Evidence a supervisor hasn't marked reviewed yet.",
            e => this.evidenceRow(e)));

        body.appendChild(this.section(
            "Processing", processing,
            "Uploaded bodycam clips waiting to be integrity-verified.",
            p => this.bodycamRow(p, "#a855f7", p.integrity_status || "Unverified")));

        body.appendChild(this.section(
            "Today's uploads", today,
            "Everything logged into evidence today.",
            e => this.evidenceRow(e)));

    },

    /* ----------------------------------------------------- */
    /* queries                                                */
    /* ----------------------------------------------------- */

    startOfToday() {
        const d = new Date(); d.setHours(0, 0, 0, 0);
        return d.toISOString();
    },

    async todayUploads() {
        try {
            const { data } = await db.from("case_evidence")
                .select("*, cases(case_id), officers(officer_id, first_name, last_name)")
                .gte("created_at", this.startOfToday())
                .order("created_at", { ascending: false }).limit(50);
            return data || [];
        } catch (e) { return []; }
    },

    async pendingReview() {
        try {
            const { data } = await db.from("case_evidence")
                .select("*, cases(case_id), officers(officer_id, first_name, last_name)")
                .in("status", ["Attached", "Available", "Uploaded"])
                .is("reviewed_at", null)
                .order("created_at", { ascending: false }).limit(50);
            return data || [];
        } catch (e) { return []; }
    },

    async missingBodycams() {
        try {
            const { data } = await db.from("shifts")
                .select("*, officers(officer_id, first_name, last_name)")
                .not("ended_at", "is", null)
                .eq("bodycam_ready", true)
                .or("bodycam_uploaded.is.null,bodycam_uploaded.eq.false")
                .order("ended_at", { ascending: false }).limit(40);
            return data || [];
        } catch (e) { return []; }
    },

    async processing() {
        try {
            const { data } = await db.from("bodycam_sessions")
                .select("*, officers(officer_id, first_name, last_name), shifts(shift_id)")
                .not("cloud_id", "is", null)
                .neq("integrity_status", "Verified")
                .neq("integrity_status", "Tampered")
                .order("uploaded_at", { ascending: false }).limit(40);
            return data || [];
        } catch (e) { return []; }
    },

    async flagged() {
        try {
            const { data } = await db.from("bodycam_sessions")
                .select("*, officers(officer_id, first_name, last_name), shifts(shift_id)")
                .eq("integrity_status", "Tampered")
                .order("integrity_verified_at", { ascending: false }).limit(40);
            return data || [];
        } catch (e) { return []; }
    },

    /* ----------------------------------------------------- */
    /* rendering                                              */
    /* ----------------------------------------------------- */

    officerLabel(o) {
        return o ? (o.officer_id + " " +
            (o.first_name + " " + o.last_name).trim()) : "—";
    },

    section(title, rows, sub, rowFn, alertIfAny) {

        const card = document.createElement("div");
        card.className = "ecSection";

        const head = document.createElement("div");
        head.className = "ecSectionHead";
        head.innerHTML =
            `<h2>${this.esc(title)} <span class="ecCount ${
                alertIfAny && rows.length ? "crit" : ""}">${rows.length}</span></h2>` +
            `<small class="muted">${this.esc(sub)}</small>`;
        card.appendChild(head);

        if (!rows.length) {
            const p = document.createElement("p");
            p.className = "muted";
            p.style.margin = "6px 0 0";
            p.textContent = "Nothing here — all clear.";
            card.appendChild(p);
        } else {
            const list = document.createElement("div");
            list.className = "ecList";
            rows.forEach(r => list.appendChild(rowFn(r)));
            card.appendChild(list);
        }

        return card;

    },

    row(iconName, main, sub, right, onClick) {
        const r = document.createElement("div");
        r.className = "ecRow";
        r.innerHTML =
            `<span class="exName">
                <span class="exIcon">${pimsIcon(iconName, 18)}</span>
                <span class="exNameText"><b>${main}</b>${
                    sub ? `<small>${sub}</small>` : ""}</span>
            </span>
            <span class="ecRight">${right || ""}</span>`;
        if (onClick) r.onclick = onClick;
        else r.style.cursor = "default";
        return r;
    },

    evidenceRow(e) {
        const off = e.officers ? this.officerLabel(e.officers) : (e.uploaded_by || "—");
        return this.row("evidence",
            this.esc(e.evidence_id) + " · " + this.esc(e.type),
            (e.cases ? this.esc(e.cases.case_id) + " · " : "") + this.esc(off) +
            (e.locked ? " · " + pimsIcon("access", 11) + " locked" : ""),
            EvidenceService.statusChip(e.status),
            () => location.href = e.case_id
                ? "case.html?id=" + e.case_id : "evidence.html");
    },

    shiftRow(s) {
        return this.row("alerts",
            this.esc(this.officerLabel(s.officers)),
            this.esc(s.shift_id) + " · ended " +
            (s.ended_at ? new Date(s.ended_at).toLocaleString() : "—"),
            `<span class="dotChip"><i style="background:#ef4444"></i>No footage</span>`,
            () => location.href = "shift.html?id=" + s.id);
    },

    bodycamRow(b, color, badge) {
        return this.row("surveillance",
            this.esc(b.session_id || "session") + " · " +
            this.esc(this.officerLabel(b.officers)),
            (b.shifts ? "Shift " + this.esc(b.shifts.shift_id) + " · " : "") +
            (b.file_name ? this.esc(b.file_name) : "clip"),
            `<span class="dotChip"><i style="background:${color}"></i>${
                this.esc(badge)}</span>`,
            b.file_url
                ? () => location.href = "bodycam-player.html?session=" + b.id
                : null);
    }

};

document.addEventListener("DOMContentLoaded", () => EvidenceCenter.init());

window.EvidenceCenter = EvidenceCenter;
