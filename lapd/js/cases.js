/* ==========================================================
   SHIBA PIMS
   Cases (Phase 6 · Sprint 6.1) — dashboard + create wizard.
   A case is a container; creating one cascades across the
   whole system (see CaseService.create).
========================================================== */

const Cases = {

    officers: [],

    officerMap: {},

    divisions: [],

    me: null,

    canCreate: false,

    canAssign: false,

    wiz: null,      /* { step, data, assignees, overlay } */

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    officerName(o) {
        return o ? (o.first_name + " " + o.last_name).trim() : "—";
    },

    /* --------------------------------------------------------- */
    /* reference data                                            */
    /* --------------------------------------------------------- */

    async loadRefs() {

        const [{ data: offs }, { data: divs }] = await Promise.all([
            db.from("officers")
                .select("id, officer_id, first_name, last_name, user_id, status")
                .order("officer_id"),
            db.from("divisions").select("id, name").order("name")
        ]);

        this.officers = (offs || []).filter(o =>
            o.status !== "Retired" && o.status !== "Terminated");

        this.officers.forEach(o => {
            this.officerMap[o.id] = {
                id: o.id,
                officer_id: o.officer_id,
                name: this.officerName(o),
                label: o.officer_id + " — " + this.officerName(o),
                user_id: o.user_id
            };
        });

        this.divisions = divs || [];

    },

    /* --------------------------------------------------------- */
    /* filters                                                   */
    /* --------------------------------------------------------- */

    populateFilters() {

        const st = document.getElementById("caseFilterStatus");
        st.innerHTML = "<option value=''>All statuses</option>" +
            CaseService.STATUSES.map(s =>
                `<option value="${s}">${this.esc(s)}</option>`).join("");

        const pr = document.getElementById("caseFilterPriority");
        pr.innerHTML = "<option value=''>All priorities</option>" +
            CaseService.PRIORITIES.map(p =>
                `<option value="${p}">${this.esc(p)}</option>`).join("");

        const dv = document.getElementById("caseFilterDivision");
        dv.innerHTML = "<option value=''>All divisions</option>" +
            this.divisions.map(d =>
                `<option value="${d.id}">${this.esc(d.name)}</option>`).join("");

    },

    /* --------------------------------------------------------- */
    /* dashboard table                                           */
    /* --------------------------------------------------------- */

    async refresh() {

        const body = document.getElementById("caseRows");

        const { rows, error } = await CaseService.list({
            search: document.getElementById("caseSearch").value,
            status: document.getElementById("caseFilterStatus").value,
            priority: document.getElementById("caseFilterPriority").value,
            divisionId: document.getElementById("caseFilterDivision").value
        });

        if (error) {
            body.innerHTML =
                `<tr><td colspan="7" class="muted">${CaseService.SETUP_HINT}</td></tr>`;
            return;
        }

        if (!rows.length) {
            body.innerHTML =
                `<tr><td colspan="7" class="muted">No cases match.</td></tr>`;
            return;
        }

        body.innerHTML = "";

        rows.forEach(c => body.appendChild(this.rowEl(c)));

    },

    rowEl(c) {

        const tr = document.createElement("tr");

        tr.className = "caseRow";

        const lead = c.lead_officer_id
            ? (this.officerMap[c.lead_officer_id]?.officer_id || "—") : "—";

        tr.innerHTML =
            `<td><b>${this.esc(c.case_id)}</b></td>` +
            `<td>${this.esc(c.title)}</td>` +
            `<td>${CaseService.priorityChip(c.priority)}</td>` +
            `<td>${this.esc(c.divisions?.name || "—")}</td>` +
            `<td>${this.esc(lead)}</td>` +
            `<td>${CaseService.statusChip(c.status)}</td>` +
            `<td>${new Date(c.updated_at || c.created_at).toLocaleDateString()}</td>`;

        tr.onclick = () =>
            location.href = "case.html?id=" + encodeURIComponent(c.id);

        return tr;

    },

    /* --------------------------------------------------------- */
    /* create wizard                                             */
    /* --------------------------------------------------------- */

    STEP_NAMES: ["General", "Description", "Officers", "Review"],

    openWizard() {

        this.wiz = { step: 0, data: {}, assignees: [], overlay: null };

        /* default lead = the signed-in officer, if linked */

        if (this.me) {
            this.wiz.data.leadOfficerId = this.me.id;
        }

        const overlay = document.createElement("div");
        overlay.className = "uiModalBack";

        overlay.innerHTML =
            `<div class="uiModal caseWizard">
                <div class="uiModalHead" id="wizHead"></div>
                <div class="wizSteps" id="wizDots"></div>
                <div class="uiModalBody" id="wizBody"></div>
                <div class="uiModalFoot" id="wizFoot"></div>
             </div>`;

        overlay.onclick = e => { if (e.target === overlay) this.closeWizard(); };

        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.classList.add("show"));

        this.wiz.overlay = overlay;

        this.renderStep();

    },

    closeWizard() {

        const o = this.wiz?.overlay;

        if (!o) return;

        o.classList.remove("show");

        setTimeout(() => o.remove(), 160);

        this.wiz = null;

    },

    renderStep() {

        const step = this.wiz.step;

        document.getElementById("wizHead").textContent =
            "Create Case — Step " + (step + 1) + " of 4: " +
            this.STEP_NAMES[step];

        document.getElementById("wizDots").innerHTML =
            this.STEP_NAMES.map((n, i) =>
                `<span class="wizDot ${i === step ? "on" : ""}` +
                `${i < step ? " done" : ""}">${i + 1}</span>`).join("");

        const body = document.getElementById("wizBody");

        if (step === 0) body.innerHTML = this.stepGeneral();
        else if (step === 1) body.innerHTML = this.stepDescription();
        else if (step === 2) this.stepOfficers(body);
        else body.innerHTML = this.stepReview();

        /* footer */

        const foot = document.getElementById("wizFoot");
        foot.innerHTML = "";

        const cancel = document.createElement("button");
        cancel.className = "ghostBtn";
        cancel.textContent = "Cancel";
        cancel.onclick = () => this.closeWizard();
        foot.appendChild(cancel);

        if (step > 0) {
            const back = document.createElement("button");
            back.className = "ghostBtn";
            back.textContent = "← Back";
            back.onclick = () => { this.collectStep(); this.wiz.step--; this.renderStep(); };
            foot.appendChild(back);
        }

        if (step < 3) {
            const next = document.createElement("button");
            next.className = "primaryBtn";
            next.textContent = "Next →";
            next.onclick = () => this.next();
            foot.appendChild(next);
        } else {
            const create = document.createElement("button");
            create.className = "primaryBtn";
            create.textContent = "✅ Create Case";
            create.onclick = () => this.submit(create);
            foot.appendChild(create);
        }

    },

    field(label, html) {
        return `<label class="wizLabel">${label}</label>${html}`;
    },

    stepGeneral() {

        const d = this.wiz.data;

        const types = CaseService.INCIDENT_TYPES.map(t =>
            `<option ${d.incidentType === t ? "selected" : ""}>${this.esc(t)}</option>`).join("");

        const divs = "<option value=''>—</option>" + this.divisions.map(dv =>
            `<option value="${dv.id}" ${d.divisionId === dv.id ? "selected" : ""}>` +
            `${this.esc(dv.name)}</option>`).join("");

        const prio = CaseService.PRIORITIES.map(p =>
            `<option ${((d.priority || "Medium") === p) ? "selected" : ""}>${p}</option>`).join("");

        return `
            ${this.field("Incident title *",
                `<input id="wTitle" class="uiModalInput" value="${this.esc(d.title || "")}"
                        placeholder="e.g. Armed robbery at 5th & Main">`)}
            <div class="wizGrid">
                <div>${this.field("Incident type",
                    `<select id="wType" class="uiModalInput">${types}</select>`)}</div>
                <div>${this.field("Priority",
                    `<select id="wPriority" class="uiModalInput">${prio}</select>`)}</div>
            </div>
            <div class="wizGrid">
                <div>${this.field("Division",
                    `<select id="wDivision" class="uiModalInput">${divs}</select>`)}</div>
                <div>${this.field("Location",
                    `<input id="wLocation" class="uiModalInput" value="${this.esc(d.location || "")}"
                            placeholder="Address / area">`)}</div>
            </div>
            <div class="wizGrid">
                <div>${this.field("Incident date",
                    `<input id="wDate" type="date" class="uiModalInput" value="${this.esc(d.incidentDate || "")}">`)}</div>
                <div>${this.field("Incident time",
                    `<input id="wTime" type="time" class="uiModalInput" value="${this.esc(d.incidentTime || "")}">`)}</div>
            </div>`;

    },

    stepDescription() {

        const d = this.wiz.data;

        return this.field("What happened?",
            `<textarea id="wDesc" class="uiModalInput" rows="8"
                       placeholder="Describe the incident in detail…">${this.esc(d.description || "")}</textarea>`);

    },

    stepOfficers(body) {

        const d = this.wiz.data;

        const leadOpts = "<option value=''>—</option>" + this.officers.map(o =>
            `<option value="${o.id}" ${d.leadOfficerId === o.id ? "selected" : ""}>` +
            `${this.esc(this.officerMap[o.id].label)}</option>`).join("");

        let html =
            this.field("Lead Investigator",
                `<select id="wLead" class="uiModalInput" ${this.canAssign ? "" : "disabled"}>${leadOpts}</select>`);

        if (!this.canAssign) {
            html += `<p class="uiModalMsg" style="margin-top:6px">You'll be the
                     Lead Investigator. Only a Sergeant+ can assign other
                     officers.</p>`;
        } else {
            html += `<label class="wizLabel" style="margin-top:14px">Additional officers</label>
                     <div id="wAssignees"></div>
                     <button type="button" id="wAddOfficer" class="formAddQ">➕ Add an officer</button>`;
        }

        body.innerHTML = html;

        if (this.canAssign) {

            this.renderAssignees();

            document.getElementById("wAddOfficer").onclick = () => {
                this.wiz.assignees.push({ officerId: "", role: "Officer" });
                this.renderAssignees();
            };

        }

    },

    renderAssignees() {

        const box = document.getElementById("wAssignees");

        if (!box) return;

        box.innerHTML = "";

        this.wiz.assignees.forEach((a, i) => {

            const row = document.createElement("div");
            row.className = "wizAssignee";

            const offOpts = "<option value=''>— pick officer —</option>" +
                this.officers.map(o =>
                    `<option value="${o.id}" ${a.officerId === o.id ? "selected" : ""}>` +
                    `${this.esc(this.officerMap[o.id].label)}</option>`).join("");

            const roleOpts = CaseService.ROLES.filter(r => r !== "Lead Investigator")
                .map(r => `<option ${a.role === r ? "selected" : ""}>${r}</option>`).join("");

            row.innerHTML =
                `<select class="uiModalInput waOff">${offOpts}</select>` +
                `<select class="uiModalInput waRole">${roleOpts}</select>` +
                `<button type="button" class="formQRemove waDel">✕</button>`;

            row.querySelector(".waOff").onchange = e => a.officerId = e.target.value;
            row.querySelector(".waRole").onchange = e => a.role = e.target.value;
            row.querySelector(".waDel").onclick = () => {
                this.wiz.assignees.splice(i, 1);
                this.renderAssignees();
            };

            box.appendChild(row);

        });

    },

    stepReview() {

        const d = this.wiz.data;

        const leadLabel = d.leadOfficerId
            ? this.officerMap[d.leadOfficerId]?.label : "—";

        const divName = d.divisionId
            ? (this.divisions.find(v => v.id === d.divisionId)?.name || "—") : "—";

        const extras = this.wiz.assignees.filter(a => a.officerId)
            .map(a => `<div class="apQa">${this.esc(this.officerMap[a.officerId]?.label)}
                       · ${this.esc(a.role)}</div>`).join("") ||
            "<div class='apQa muted'>None</div>";

        const line = (k, v) =>
            `<div class="rvRow"><small>${k}</small><div>${this.esc(v || "—")}</div></div>`;

        return `
            <div class="rvGrid">
                ${line("Title", d.title)}
                ${line("Type", d.incidentType)}
                ${line("Priority", d.priority || "Medium")}
                ${line("Division", divName)}
                ${line("Location", d.location)}
                ${line("Date / time",
                    [d.incidentDate, d.incidentTime].filter(Boolean).join(" ") || "—")}
                ${line("Lead", leadLabel)}
            </div>
            ${d.description
                ? `<div class="apMot" style="margin-top:10px">${this.esc(d.description)}</div>` : ""}
            <label class="wizLabel" style="margin-top:12px">Assigned officers</label>
            ${extras}`;

    },

    collectStep() {

        const d = this.wiz.data;
        const g = id => document.getElementById(id);

        if (this.wiz.step === 0 && g("wTitle")) {
            d.title = g("wTitle").value.trim();
            d.incidentType = g("wType").value;
            d.priority = g("wPriority").value;
            d.divisionId = g("wDivision").value || null;
            d.location = g("wLocation").value.trim();
            d.incidentDate = g("wDate").value || null;
            d.incidentTime = g("wTime").value || null;
        } else if (this.wiz.step === 1 && g("wDesc")) {
            d.description = g("wDesc").value.trim();
        } else if (this.wiz.step === 2 && g("wLead")) {
            d.leadOfficerId = g("wLead").value || null;
        }

    },

    next() {

        this.collectStep();

        if (this.wiz.step === 0 && !this.wiz.data.title) {
            UI.error("An incident title is required.");
            return;
        }

        this.wiz.step++;
        this.renderStep();

    },

    async submit(btn) {

        this.collectStep();

        const d = this.wiz.data;

        if (!d.title) { UI.error("An incident title is required."); return; }

        /* build the assignee list: lead + extras (deduped) */

        const list = [];
        const seen = new Set();

        if (d.leadOfficerId) {
            const m = this.officerMap[d.leadOfficerId];
            list.push({ officerId: m.id, userId: m.user_id,
                        label: m.label, role: "Lead Investigator" });
            seen.add(d.leadOfficerId);
        }

        this.wiz.assignees.forEach(a => {
            if (a.officerId && !seen.has(a.officerId)) {
                const m = this.officerMap[a.officerId];
                list.push({ officerId: m.id, userId: m.user_id,
                            label: m.label, role: a.role || "Officer" });
                seen.add(a.officerId);
            }
        });

        btn.disabled = true;

        const result = await CaseService.create({
            title: d.title,
            incidentType: d.incidentType,
            divisionId: d.divisionId,
            priority: d.priority || "Medium",
            location: d.location,
            incidentDate: d.incidentDate,
            incidentTime: d.incidentTime,
            description: d.description,
            leadOfficerId: d.leadOfficerId,
            assignees: list,
            createdBy: localStorage.getItem("username") || null
        });

        btn.disabled = false;

        if (result.ok) {
            this.closeWizard();
            location.href = "case.html?id=" + encodeURIComponent(result.row.id);
        }

    },

    /* --------------------------------------------------------- */
    /* init                                                       */
    /* --------------------------------------------------------- */

    async init() {

        if (!window.db) return;

        this.canCreate = await PermissionService.can("cases.create");
        this.canAssign = await PermissionService.can("cases.assign");

        this.me = await PermissionService.myOfficer();

        await this.loadRefs();

        this.populateFilters();

        if (this.canCreate) {
            const btn = document.getElementById("caseCreate");
            btn.classList.remove("hidden");
            btn.onclick = () => this.openWizard();
        }

        let t = null;
        document.getElementById("caseSearch").addEventListener("input", () => {
            clearTimeout(t);
            t = setTimeout(() => this.refresh(), 200);
        });

        ["caseFilterStatus", "caseFilterPriority", "caseFilterDivision"]
            .forEach(id => document.getElementById(id)
                .addEventListener("change", () => this.refresh()));

        this.refresh();

    }

};

document.addEventListener("DOMContentLoaded", () => Cases.init());

window.Cases = Cases;
