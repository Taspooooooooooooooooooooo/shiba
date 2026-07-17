/* ==========================================================
   SHIBA PIMS
   Case File (Phase 6 · Sprint 6.1) — the digital case folder.
   Sprint 6.1 tabs: General + Assignments, plus status control.
   Timeline / Evidence / Notes / History / Audit arrive in the
   next 6.x sprints (shown as "soon").
========================================================== */

const CaseFile = {

    id: null,

    caseRow: null,

    assignmentRows: [],

    canAssign: false,

    tab: "general",

    TABS: [
        { key: "general", label: "General", live: true },
        { key: "assignments", label: "Assignments", live: true },
        { key: "timeline", label: "Timeline", live: false },
        { key: "evidence", label: "Evidence", live: false },
        { key: "notes", label: "Notes", live: false },
        { key: "history", label: "History", live: false },
        { key: "audit", label: "Audit", live: false }
    ],

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    leadLabel() {

        const lead = this.assignmentRows.find(a => a.role === "Lead Investigator");

        return lead ? lead.officer_label : "—";

    },

    /* --------------------------------------------------------- */
    /* header + status control                                   */
    /* --------------------------------------------------------- */

    renderHeader() {

        const c = this.caseRow;

        const header = document.getElementById("caseHeader");

        header.innerHTML =
            `<div class="caseHeadTop">
                <div>
                    <div class="caseHeadId">${this.esc(c.case_id)}</div>
                    <h1 class="caseHeadTitle">${this.esc(c.title)}</h1>
                    <div class="caseHeadMeta">
                        ${CaseService.priorityChip(c.priority)} ·
                        ${this.esc(c.divisions?.name || "No division")} ·
                        ${this.esc(c.incident_type || "—")}
                    </div>
                </div>
                <div class="caseHeadStatus">
                    <div class="caseStatusPill">${CaseService.statusChip(c.status)}</div>
                    <div id="caseStatusCtl"></div>
                </div>
            </div>
            <a href="cases.html" class="caseBack">← All cases</a>`;

        this.renderStatusControl();

    },

    renderStatusControl() {

        const box = document.getElementById("caseStatusCtl");

        if (!box) return;

        box.innerHTML = "";

        if (!this.canAssign) return;

        const options = CaseService.nextStatuses(this.caseRow.status);

        if (!options.length) return;

        const wrap = document.createElement("div");
        wrap.className = "caseStatusMove";

        const sel = document.createElement("select");
        sel.className = "uiModalInput";
        sel.innerHTML = "<option value=''>Move to…</option>" +
            options.map(s => `<option>${this.esc(s)}</option>`).join("");

        const go = document.createElement("button");
        go.className = "primaryBtn";
        go.textContent = "Apply";
        go.onclick = async () => {
            if (!sel.value) return;
            go.disabled = true;
            const ok = await CaseService.setStatus(
                this.caseRow, sel.value,
                localStorage.getItem("username") || "");
            go.disabled = false;
            if (ok) this.load();
        };

        wrap.append(sel, go);
        box.appendChild(wrap);

    },

    /* --------------------------------------------------------- */
    /* tabs                                                       */
    /* --------------------------------------------------------- */

    renderTabs() {

        const bar = document.getElementById("caseTabs");

        bar.innerHTML = "";

        this.TABS.forEach(t => {

            const b = document.createElement("button");
            b.className = "caseTab" + (t.key === this.tab ? " on" : "") +
                (t.live ? "" : " soon");
            b.textContent = t.label + (t.live ? "" : " · soon");
            if (t.live) b.onclick = () => { this.tab = t.key; this.renderTabs(); this.renderBody(); };
            bar.appendChild(b);

        });

    },

    renderBody() {

        const body = document.getElementById("caseTabBody");

        if (this.tab === "general") body.innerHTML = this.viewGeneral();
        else if (this.tab === "assignments") body.innerHTML = this.viewAssignments();
        else body.innerHTML = "";

    },

    viewGeneral() {

        const c = this.caseRow;

        const line = (k, v) =>
            `<div class="rvRow"><small>${k}</small><div>${this.esc(v || "—")}</div></div>`;

        return `
            <div class="card">
                <h2>📋 General</h2>
                <div class="rvGrid">
                    ${line("Case ID", c.case_id)}
                    ${line("Status", CaseService.statusChip(c.status))}
                    ${line("Priority", CaseService.priorityChip(c.priority))}
                    ${line("Incident type", c.incident_type)}
                    ${line("Division", c.divisions?.name)}
                    ${line("Location", c.location)}
                    ${line("Lead Investigator", this.leadLabel())}
                    ${line("Incident date",
                        [c.incident_date, c.incident_time].filter(Boolean).join(" "))}
                    ${line("Created by", c.created_by)}
                    ${line("Created", new Date(c.created_at).toLocaleString())}
                    ${line("Last updated",
                        new Date(c.updated_at || c.created_at).toLocaleString())}
                </div>
                ${c.description
                    ? `<label class="wizLabel" style="margin-top:14px">Description</label>
                       <div class="caseDesc">${this.esc(c.description)}</div>` : ""}
            </div>`;

    },

    viewAssignments() {

        const rows = this.assignmentRows.length
            ? this.assignmentRows.map(a => `
                <div class="certItem">
                    <div class="certInfo">
                        <strong>${this.esc(a.officer_label)}</strong>
                        <span class="grantKind">${this.esc(a.role)}</span>
                        <small>assigned ${new Date(a.assigned_at).toLocaleDateString()}
                        ${a.assigned_by ? " · by " + this.esc(a.assigned_by) : ""}</small>
                    </div>
                </div>`).join("")
            : "<p class='muted'>No officers assigned.</p>";

        return `
            <div class="card">
                <h2>👮 Assignments</h2>
                <p class="muted" style="margin-top:-4px">Managing assignments
                   from the case file arrives in Sprint 6.2 — for now they're
                   set when the case is created.</p>
                ${rows}
            </div>`;

    },

    /* --------------------------------------------------------- */
    /* load                                                       */
    /* --------------------------------------------------------- */

    async load() {

        const { row, error } = await CaseService.byId(this.id);

        if (error || !row) {
            document.getElementById("caseHeader").innerHTML =
                `<p class="muted">Case not found. ${CaseService.SETUP_HINT}</p>`;
            document.getElementById("caseTabs").innerHTML = "";
            document.getElementById("caseTabBody").innerHTML = "";
            return;
        }

        this.caseRow = row;

        const { rows } = await CaseService.assignments(this.id);

        this.assignmentRows = rows || [];

        this.renderHeader();
        this.renderTabs();
        this.renderBody();

    },

    async init() {

        if (!window.db) return;

        this.id = new URLSearchParams(location.search).get("id");

        if (!this.id) {
            document.getElementById("caseHeader").innerHTML =
                "<p class='muted'>No case specified.</p>";
            return;
        }

        this.canAssign = await PermissionService.can("cases.assign");

        await this.load();

        AuditService.log({
            action: "CASE_VIEWED",
            target: this.caseRow?.case_id || this.id
        });

    }

};

document.addEventListener("DOMContentLoaded", () => CaseFile.init());

window.CaseFile = CaseFile;
