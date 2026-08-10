/* ==========================================================
   SHIBA PIMS
   Evidence Room (Phase 8 · Sprint 8.2) — the central store for
   EVERY piece of digital evidence in the department. Filter by
   text, type, status, source, division and date; open any item
   for its full chain of custody and jump straight to its case,
   the officer who logged it, or its barcode.

   Access is rank-scoped (best-effort UX — real enforcement is
   the Phase 9 RLS pass):
     • Officer   → their own uploads + evidence on their cases
     • Sergeant  → their division
     • Lieut.+   → everything
========================================================== */

const EvidenceRoom = {

    filters: { search: "", type: "", status: "", source: "",
               divisionId: "", from: "", to: "" },

    scope: { level: "officer", officerId: null, divisionId: null,
             divisionName: null, caseIds: [] },

    divisions: [],

    _searchTimer: null,

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    TYPE_ICONS: { "Photo": "image", "Video": "video", "Audio": "audio",
                  "Document": "document", "Bodycam": "video",
                  "Dashcam": "video", "Screenshot": "image",
                  "Digital": "evidence", "Other": "evidence" },

    /* ----------------------------------------------------- */
    /* scope                                                 */
    /* ----------------------------------------------------- */

    async resolveScope() {

        const officer = await PermissionService.myOfficer();

        this.scope.officerId = officer?.id || null;
        this.scope.divisionId = officer?.division_id || null;
        this.scope.divisionName = officer?.divisions?.name || null;

        const role = await PermissionService.role();

        /* keyword match on the role/rank name — robust to the exact
           names in use (learned in the Live Ops supervisor fix) */

        if (/lieutenant|captain|commander|chief|super|admin|deputy|inspector|colonel|major|superintend/i
                .test(role || "")) {
            this.scope.level = "all";
        } else if (/sergeant/i.test(role || "")) {
            this.scope.level = "division";
        } else {
            this.scope.level = "officer";
        }

        /* officer tier also sees evidence on the cases they're on */

        if (this.scope.level === "officer" && this.scope.officerId) {

            try {

                const { data } = await db
                    .from("case_assignments")
                    .select("case_id")
                    .eq("officer_id", this.scope.officerId);

                this.scope.caseIds = [...new Set(
                    (data || []).map(r => r.case_id).filter(Boolean))];

            } catch (e) { this.scope.caseIds = []; }

        }

    },

    scopeParams() {

        if (this.scope.level === "all") return {};

        if (this.scope.level === "division") {

            return this.scope.divisionId
                ? { divisionId: this.scope.divisionId }
                : { ownerScope: { officerId: this.scope.officerId,
                                  caseIds: [] } };

        }

        /* officer */

        return { ownerScope: { officerId: this.scope.officerId || "none",
                               caseIds: this.scope.caseIds } };

    },

    renderScopeBanner() {

        const box = document.getElementById("evrScope");

        const map = {
            all: { c: "#22c55e",
                   t: "Department-wide access — you can see all evidence." },
            division: { c: "#0ea5e9",
                        t: "Division access — evidence for " +
                           (this.scope.divisionName || "your division") + "." },
            officer: { c: "#eab308",
                       t: "Officer access — your own evidence and the cases " +
                          "you're assigned to." }
        };

        const m = map[this.scope.level] || map.officer;

        box.innerHTML = `<span class="dotChip"><i style="background:${m.c}">` +
            `</i>${this.esc(m.t)}</span>`;

    },

    /* ----------------------------------------------------- */
    /* filters                                               */
    /* ----------------------------------------------------- */

    async loadDivisions() {

        try {
            const { data } = await db.from("divisions")
                .select("id, name").order("name");
            this.divisions = data || [];
        } catch (e) { this.divisions = []; }

    },

    renderFilters() {

        const box = document.getElementById("evrFilters");

        box.innerHTML = "";

        const search = document.createElement("input");
        search.className = "uiModalInput evrSearch";
        search.placeholder = "Search evidence id, file or description…";
        search.value = this.filters.search;
        search.oninput = () => {
            this.filters.search = search.value;
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => this.load(), 300);
        };

        const sel = (key, label, options) => {
            const s = document.createElement("select");
            s.className = "uiModalInput";
            s.title = label;
            s.innerHTML = `<option value="">${label}</option>` +
                options.map(o =>
                    `<option value="${o}" ${this.filters[key] === o
                        ? "selected" : ""}>${o}</option>`).join("");
            s.onchange = () => { this.filters[key] = s.value; this.load(); };
            return s;
        };

        const typeSel = sel("type", "All types", EvidenceService.TYPES);
        const statusSel = sel("status", "Any status", EvidenceService.STATUSES);
        const sourceSel = sel("source", "Any source", EvidenceService.SOURCES);

        box.append(search, typeSel, statusSel, sourceSel);

        /* division filter only matters when you can see across divisions */

        if (this.scope.level === "all" && this.divisions.length) {
            const d = document.createElement("select");
            d.className = "uiModalInput";
            d.title = "All divisions";
            d.innerHTML = `<option value="">All divisions</option>` +
                this.divisions.map(dv =>
                    `<option value="${dv.id}" ${this.filters.divisionId === dv.id
                        ? "selected" : ""}>${this.esc(dv.name)}</option>`).join("");
            d.onchange = () => { this.filters.divisionId = d.value; this.load(); };
            box.appendChild(d);
        }

        const from = document.createElement("input");
        from.type = "date"; from.className = "uiModalInput evrDate";
        from.title = "From date"; from.value = this.filters.from;
        from.onchange = () => { this.filters.from = from.value; this.load(); };

        const to = document.createElement("input");
        to.type = "date"; to.className = "uiModalInput evrDate";
        to.title = "To date"; to.value = this.filters.to;
        to.onchange = () => { this.filters.to = to.value; this.load(); };

        const reset = document.createElement("button");
        reset.className = "ghostBtn";
        reset.textContent = "Reset";
        reset.onclick = () => {
            this.filters = { search: "", type: "", status: "", source: "",
                             divisionId: "", from: "", to: "" };
            this.renderFilters();
            this.load();
        };

        box.append(from, to, reset);

    },

    /* ----------------------------------------------------- */
    /* load + render                                         */
    /* ----------------------------------------------------- */

    async load() {

        const out = document.getElementById("evrResults");

        const f = this.filters;

        const args = {
            search: f.search || undefined,
            type: f.type || undefined,
            status: f.status || undefined,
            source: f.source || undefined,
            divisionId: f.divisionId || undefined,
            from: f.from ? new Date(f.from).toISOString() : undefined,
            to: f.to ? new Date(f.to + "T23:59:59").toISOString() : undefined,
            ...this.scopeParams()
        };

        const { rows, error } = await EvidenceService.list(args);

        if (error) {
            out.innerHTML = `<p class="muted">${
                this.esc(EvidenceService.SETUP_HINT_81)}</p>`;
            document.getElementById("evrStats").innerHTML = "";
            return;
        }

        this.renderStats(rows);
        this.renderResults(rows);

    },

    renderStats(rows) {

        const n = s => rows.filter(r => r.status === s).length;

        const stat = (label, v, cls = "") =>
            `<div class="statChip ${cls}"><b>${v}</b><span>${label}</span></div>`;

        document.getElementById("evrStats").innerHTML =
            `<div class="caseStats">` +
            stat("Total", rows.length) +
            stat("Attached", n("Attached")) +
            stat("Reviewed", n("Reviewed")) +
            stat("Bodycam", rows.filter(r => r.source === "Bodycam").length) +
            stat("Locked", rows.filter(r => r.locked).length,
                rows.some(r => r.locked) ? "crit" : "") +
            `</div>`;

    },

    renderResults(rows) {

        const out = document.getElementById("evrResults");

        out.innerHTML = "";

        if (!rows.length) {
            out.innerHTML = `<p class="muted">No evidence matches these ` +
                `filters.</p>`;
            return;
        }

        const head = document.createElement("div");
        head.className = "evrHead";
        head.innerHTML =
            "<span>Evidence</span><span>Type</span><span>Status</span>" +
            "<span>Case</span><span>Logged by</span><span>Logged</span>";
        out.appendChild(head);

        rows.forEach(ev => {

            const row = document.createElement("div");
            row.className = "evrRow";

            const statusChip = ev.status
                ? EvidenceService.statusChip(ev.status) : "—";

            row.innerHTML =
                `<span class="exName">
                    <span class="exIcon">${pimsFileIcon(
                        this.TYPE_ICONS[ev.type] || "evidence", 24)}</span>
                    <span class="exNameText">
                        <b>${this.esc(ev.file_name || ev.evidence_id)}</b>
                        <small>${this.esc(ev.evidence_id)}${
                            ev.locked ? " · " + pimsIcon("access", 11)
                                + " locked" : ""}</small>
                    </span>
                </span>` +
                `<span>${this.esc(ev.type)}</span>` +
                `<span>${statusChip}</span>` +
                `<span>${ev.case_label
                    ? this.esc(ev.case_label) : "<i class='muted'>—</i>"}</span>` +
                `<span>${this.esc(ev.officer_label || ev.uploaded_by || "—")}</span>` +
                `<span>${new Date(ev.created_at).toLocaleDateString()}</span>`;

            row.onclick = () => this.openDetail(ev);

            out.appendChild(row);

        });

    },

    /* ----------------------------------------------------- */
    /* detail dialog — status, source, chain of custody +    */
    /* one-click jumps to case / personnel / file / barcode  */
    /* ----------------------------------------------------- */

    custodyHtml(rows) {

        if (!rows || !rows.length) return "";

        const items = rows.map(c =>
            `<div class="cocRow">
                <span class="cocDot"></span>
                <span class="cocMain">
                    <b>${this.esc(c.action)}</b>
                    ${c.details ? `<small>${this.esc(c.details)}</small>` : ""}
                </span>
                <span class="cocBy">${this.esc(c.actor_label || c.actor || "—")}</span>
                <span class="cocWhen">${new Date(c.created_at).toLocaleString()}</span>
            </div>`).join("");

        return `<label class="wizLabel" style="margin-top:16px">` +
            `Chain of custody</label><div class="cocList">${items}</div>`;

    },

    fmtSize(bytes) {
        if (bytes == null) return "—";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / 1048576).toFixed(1) + " MB";
    },

    evFileHref(ev) {
        if (ev.cloud_id) return "../cloud/?=" + ev.cloud_id;
        return ev.file_url || null;
    },

    async openDetail(ev, opts = {}) {

        if (opts.view !== false) EvidenceService.markViewed(ev);

        /* re-fetch for the freshest row + joined labels — unless this is a
           post-action refresh, where the passed object is already mutated
           and an immediate re-read can be momentarily stale */

        let full = ev;
        if (!opts.fresh) {
            const byId = await EvidenceService.byId(ev.id);
            full = (byId && byId.row) || ev;
        }

        const cust = await EvidenceService.custody(ev.id);
        const custody = cust.rows || [];

        const canReview = await PermissionService.can("cases.assign");
        const canCommand = await EvidenceService.isCommand();

        const casePub = full.cases?.case_id || ev.case_label;
        const divName = full.divisions?.name || ev.division_label;
        const offLabel = ev.officer_label ||
            (full.officers ? (full.officers.officer_id + " " +
                (full.officers.first_name + " " +
                 full.officers.last_name).trim()) : full.uploaded_by);

        /* re-open with fresh data after an action, without re-logging a view */
        const refresh = (close) => { if (close) close(); this.load();
            this.openDetail(full, { view: false, fresh: true }); };

        UI.modal({

            title: full.type + " · " + (full.file_name || full.evidence_id),

            render: (close) => {

                const wrap = document.createElement("div");

                const line = (k, v, raw) =>
                    `<div class="rvRow"><small>${k}</small>` +
                    `<div>${raw ? (v || "—") : this.esc(v || "—")}</div></div>`;

                wrap.innerHTML =
                    (full.locked
                        ? `<div class="evLockBanner">${pimsIcon("access", 14)}
                             LOCKED — ${this.esc(full.locked_reason || "hold")}${
                             full.locked_by ? " · by " + this.esc(full.locked_by)
                             : ""}</div>` : "") +
                    `<div class="rvGrid">
                        ${line("Evidence ID", full.evidence_id)}
                        ${line("Type", full.type)}
                        ${line("Status", EvidenceService.statusChip(full.status), true)}
                        ${line("Source", full.source || "Manual")}
                        ${line("Case", casePub || "Not attached")}
                        ${line("Division", divName)}
                        ${line("Logged by", offLabel)}
                        ${line("Size", this.fmtSize(full.file_size))}
                        ${line("Logged", new Date(full.created_at).toLocaleString())}
                        ${full.reviewed_by
                            ? line("Reviewed by", full.reviewed_by) : ""}
                        ${line("Retention", (full.retention_policy || "Standard") +
                            (full.retain_until ? " until " + full.retain_until : ""))}
                    </div>` +
                    (full.description
                        ? `<div class="apMot" style="margin-top:10px">` +
                          `${this.esc(full.description)}</div>` : "") +
                    (full.hash
                        ? `<div class="evHash" style="margin-top:10px" ` +
                          `title="Full SHA-256">#${this.esc(full.hash)}</div>` : "") +
                    this.custodyHtml(custody);

                /* ---- action toolbar ---- */

                const bar = document.createElement("div");
                bar.className = "evrActions";

                const btn = (label, primary, icon) => {
                    const b = document.createElement("button");
                    b.className = primary ? "primaryBtn" : "ghostBtn";
                    b.innerHTML = (icon || "") + " " + label;
                    return b;
                };

                /* Download — requires a reason, logged to custody */
                if (this.evFileHref(full)) {
                    const dl = btn("Download", true, pimsIcon("cloud", 14));
                    dl.onclick = async () => {
                        const reason = await UI.promptText({
                            title: "Download evidence",
                            message: "Downloads are recorded in the chain of " +
                                "custody. Why are you accessing this file?",
                            label: "Reason", placeholder: "e.g. Case review, court prep",
                            required: true, confirmText: "Download" });
                        if (!reason) return;
                        const href = await EvidenceService.download(full, reason);
                        if (href) window.open(href, "_blank", "noopener");
                        refresh(close);
                    };
                    bar.appendChild(dl);
                }

                /* Mark reviewed */
                if (canReview && full.status !== "Reviewed" && !full.locked) {
                    const rv = btn("Mark reviewed", false, pimsIcon("verified", 14));
                    rv.onclick = async () => {
                        if (await EvidenceService.markReviewed(full)) refresh(close);
                    };
                    bar.appendChild(rv);
                }

                /* Lock / Unlock (Lieutenant+) */
                if (canCommand && !full.locked) {
                    const lk = btn("Lock", false, pimsIcon("access", 14));
                    lk.onclick = async () => {
                        const reason = await UI.promptText({
                            title: "Lock evidence",
                            message: "Locking blocks any edit, review or removal " +
                                "until it's unlocked. Common reason: Court Submission.",
                            label: "Lock reason", placeholder: "e.g. Court Submission",
                            required: true, confirmText: "Lock" });
                        if (!reason) return;
                        if (await EvidenceService.lock(full, reason)) refresh(close);
                    };
                    bar.appendChild(lk);
                } else if (canCommand && full.locked) {
                    const ul = btn("Unlock", false, pimsIcon("access", 14));
                    ul.onclick = async () => {
                        const reason = await UI.promptText({
                            title: "Unlock evidence",
                            message: "Unlocking is recorded in the chain of custody.",
                            label: "Reason (optional)", confirmText: "Unlock" });
                        if (reason === null) return;
                        if (await EvidenceService.unlock(full, reason)) refresh(close);
                    };
                    bar.appendChild(ul);
                }

                /* Retention (Sergeant+) */
                if (canReview && !full.locked) {
                    const ret = document.createElement("select");
                    ret.className = "uiModalInput";
                    ret.style.maxWidth = "150px";
                    ret.title = "Retention policy";
                    ret.innerHTML = EvidenceService.RETENTION_POLICIES.map(pn =>
                        `<option ${pn === (full.retention_policy || "Standard")
                            ? "selected" : ""}>${pn}</option>`).join("");
                    ret.onchange = async () => {
                        let retainUntil = null;
                        if (ret.value === "Custom") {
                            retainUntil = await UI.promptText({
                                title: "Retain until",
                                message: "Keep this evidence until (YYYY-MM-DD):",
                                label: "Date", placeholder: "2030-01-01",
                                required: true });
                            if (!retainUntil) {
                                ret.value = full.retention_policy || "Standard";
                                return;
                            }
                        }
                        if (await EvidenceService.setRetention(full,
                            { policy: ret.value, retainUntil })) refresh(close);
                    };
                    bar.appendChild(ret);
                }

                /* Export */
                const exR = btn("Report", false, pimsIcon("print", 14));
                exR.onclick = () => EvidenceService.exportReport(full, custody);
                const exJ = btn("JSON", false, pimsIcon("export", 14));
                exJ.onclick = () => EvidenceService.exportMetadata(full, custody);
                bar.append(exR, exJ);

                if (full.scan_token) {
                    const bc = btn("Barcode", false, pimsIcon("scanner", 14));
                    bc.onclick = () => this.showBarcode(full, casePub);
                    bar.appendChild(bc);
                }
                if (full.case_id) {
                    const oc = btn("Open case", false, pimsIcon("cases", 14));
                    oc.onclick = () => location.href = "case.html?id=" + full.case_id;
                    bar.appendChild(oc);
                }
                if (full.uploaded_by_officer) {
                    const oo = btn("Officer", false, pimsIcon("officers", 14));
                    oo.onclick = () => location.href =
                        "personnel.html?id=" + full.uploaded_by_officer;
                    bar.appendChild(oo);
                }

                wrap.appendChild(bar);

                return wrap;

            },

            buttons: [{ label: "Close", kind: "ghost", value: null }]

        });

    },

    showBarcode(ev, casePub) {

        UI.modal({
            title: ev.evidence_id + " · evidence label",
            render: () => {
                const wrap = document.createElement("div");
                const box = document.createElement("div");
                box.className = "evBarcodeBox";
                BarcodeService.renderPdf417(box,
                    BarcodeService.evidence(ev, casePub || ""),
                    { scale: 4, height: 18 });
                const meta = document.createElement("p");
                meta.className = "uiModalMsg";
                meta.style.textAlign = "center";
                meta.textContent = ev.evidence_id + " · " + ev.type +
                    (casePub ? " · " + casePub : "");
                wrap.append(box, meta);
                return wrap;
            },
            buttons: [{ label: "Close", kind: "primary", value: null }]
        });

    },

    /* ----------------------------------------------------- */

    async init() {

        if (!window.db) return;

        await this.resolveScope();

        this.renderScopeBanner();

        if (this.scope.level === "all") await this.loadDivisions();

        this.renderFilters();

        await this.load();

    }

};

document.addEventListener("DOMContentLoaded", () => EvidenceRoom.init());

window.EvidenceRoom = EvidenceRoom;
