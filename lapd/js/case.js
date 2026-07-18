/* ==========================================================
   SHIBA PIMS
   Case File (Phase 6 · Sprint 6.2) — the digital case folder.

   Live tabs: General · Assignments (with add/remove, Sergeant+)
   · Timeline (the case's own history) · Notes (author / pinned
   / edited) · History (lifecycle) · Audit.
   Evidence arrives in Sprint 6.3.
========================================================== */

const CaseFile = {

    id: null,

    caseRow: null,

    assignmentRows: [],

    officers: [],

    officerMap: {},

    canAssign: false,

    tab: "general",

    TABS: [
        { key: "general", label: "General", live: true },
        { key: "assignments", label: "Assignments", live: true },
        { key: "timeline", label: "Timeline", live: true },
        { key: "evidence", label: "Evidence", live: false },
        { key: "notes", label: "Notes", live: true },
        { key: "history", label: "History", live: true },
        { key: "audit", label: "Audit", live: true }
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

    feedItem(time, action, detail, small) {

        const item = document.createElement("div");
        item.className = "feedItem";

        const t = document.createElement("span");
        t.className = "feedTime";
        t.textContent = time;

        const a = document.createElement("strong");
        a.textContent = action;

        const d = document.createElement("span");
        d.className = "feedTarget";
        d.textContent = detail || "";

        const i = document.createElement("small");
        i.textContent = small || "";

        item.append(t, a, d, i);

        return item;

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
            if (t.live) b.onclick = () => {
                this.tab = t.key;
                this.renderTabs();
                this.renderBody();
            };
            bar.appendChild(b);

        });

    },

    async renderBody() {

        const body = document.getElementById("caseTabBody");

        if (this.tab === "general") body.innerHTML = this.viewGeneral();
        else if (this.tab === "assignments") await this.viewAssignments(body);
        else if (this.tab === "timeline") await this.viewTimeline(body);
        else if (this.tab === "notes") await this.viewNotes(body);
        else if (this.tab === "history") await this.viewHistory(body);
        else if (this.tab === "audit") await this.viewAudit(body);
        else body.innerHTML = "";

    },

    card(title, sub) {

        const card = document.createElement("div");
        card.className = "card";

        const h = document.createElement("h2");
        h.textContent = title;
        card.appendChild(h);

        if (sub) {
            const p = document.createElement("p");
            p.className = "muted";
            p.style.marginTop = "-4px";
            p.textContent = sub;
            card.appendChild(p);
        }

        return card;

    },

    /* --------------------------------------------------------- */
    /* GENERAL                                                    */
    /* --------------------------------------------------------- */

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

    /* --------------------------------------------------------- */
    /* ASSIGNMENTS — list + add/remove (Sergeant+)               */
    /* --------------------------------------------------------- */

    async viewAssignments(body) {

        body.innerHTML = "";

        const card = this.card("👮 Assignments");

        /* add-officer bar (Sergeant+) */

        if (this.canAssign) {

            const bar = document.createElement("div");
            bar.className = "wizAssignee";

            const assigned = new Set(
                this.assignmentRows.map(a => a.officer_id));

            const off = document.createElement("select");
            off.className = "uiModalInput waOff";
            off.innerHTML = "<option value=''>— pick officer —</option>" +
                this.officers.filter(o => !assigned.has(o.id)).map(o =>
                    `<option value="${o.id}">` +
                    `${this.esc(this.officerMap[o.id].label)}</option>`).join("");

            const role = document.createElement("select");
            role.className = "uiModalInput waRole";
            role.innerHTML = CaseService.ROLES.map(r =>
                `<option ${r === "Officer" ? "selected" : ""}>${r}</option>`).join("");

            const add = document.createElement("button");
            add.className = "primaryBtn";
            add.textContent = "Assign";
            add.onclick = async () => {
                if (!off.value) { UI.error("Pick an officer."); return; }
                const m = this.officerMap[off.value];
                add.disabled = true;
                const ok = await CaseService.assign(this.caseRow, {
                    officerId: m.id, userId: m.user_id,
                    label: m.label, role: role.value
                });
                add.disabled = false;
                if (ok) { await this.reloadAssignments(); this.renderBody(); }
            };

            bar.append(off, role, add);
            card.appendChild(bar);

        }

        if (!this.assignmentRows.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = "No officers assigned.";
            card.appendChild(p);

        }

        this.assignmentRows.forEach(a => {

            const row = document.createElement("div");
            row.className = "certItem";

            const info = document.createElement("div");
            info.className = "certInfo";
            info.innerHTML =
                `<strong>${this.esc(a.officer_label)}</strong>
                 <span class="grantKind">${this.esc(a.role)}</span>
                 <small>assigned ${new Date(a.assigned_at).toLocaleDateString()}
                 ${a.assigned_by ? " · by " + this.esc(a.assigned_by) : ""}</small>`;

            row.appendChild(info);

            if (this.canAssign) {

                const actions = document.createElement("div");
                actions.className = "certActions";

                const del = document.createElement("button");
                del.className = "dangerBtn";
                del.textContent = "Remove";
                del.onclick = async () => {

                    const ok = await UI.confirm({
                        title: "Remove from case?",
                        message: a.officer_label + " will be removed from " +
                            this.caseRow.case_id + ". The case history keeps " +
                            "a record of the assignment.",
                        confirmText: "Remove",
                        danger: true
                    });

                    if (!ok) return;

                    if (await CaseService.unassign(this.caseRow, a)) {
                        await this.reloadAssignments();
                        this.renderBody();
                    }

                };

                actions.appendChild(del);
                row.appendChild(actions);

            }

            card.appendChild(row);

        });

        body.appendChild(card);

    },

    async reloadAssignments() {

        const { rows } = await CaseService.assignments(this.id);

        this.assignmentRows = rows || [];

    },

    /* --------------------------------------------------------- */
    /* TIMELINE — the case's own chronological history           */
    /* --------------------------------------------------------- */

    async viewTimeline(body) {

        body.innerHTML = "";

        const card = this.card("📜 Timeline",
            "Everything that happened on this case, newest first.");

        const { rows, error } = await CaseService.timeline(this.id);

        if (error) {

            card.appendChild(this.hint62());

        } else if (!rows.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = "No events yet.";
            card.appendChild(p);

        } else {

            rows.forEach(e => card.appendChild(this.feedItem(
                new Date(e.created_at).toLocaleString(),
                e.event, e.details, e.actor ? "by " + e.actor : "")));

        }

        body.appendChild(card);

    },

    /* --------------------------------------------------------- */
    /* NOTES — author / pinned / edited; never deleted           */
    /* --------------------------------------------------------- */

    async viewNotes(body) {

        body.innerHTML = "";

        const card = this.card("🗒 Notes");

        /* composer — every signed-in officer may write notes */

        const composer = document.createElement("div");
        composer.className = "noteComposer";

        const ta = document.createElement("textarea");
        ta.className = "uiModalInput";
        ta.rows = 3;
        ta.placeholder = "Write a note for this case…";

        const send = document.createElement("button");
        send.className = "primaryBtn";
        send.textContent = "Add note";
        send.onclick = async () => {
            if (!ta.value.trim()) { UI.error("Write something first."); return; }
            send.disabled = true;
            const ok = await CaseService.addNote(this.caseRow, ta.value);
            send.disabled = false;
            if (ok) { ta.value = ""; this.renderBody(); }
        };

        composer.append(ta, send);
        card.appendChild(composer);

        const { rows, error } = await CaseService.notes(this.id);

        if (error) {

            card.appendChild(this.hint62());

        } else if (!rows.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = "No notes yet.";
            card.appendChild(p);

        } else {

            const me = localStorage.getItem("username") || "";

            rows.forEach(n => {

                const item = document.createElement("div");
                item.className = "noteItem" + (n.pinned ? " pinned" : "");

                const head = document.createElement("div");
                head.className = "noteHead";
                head.innerHTML =
                    `<b>${this.esc(n.author || "unknown")}</b>
                     <small>${new Date(n.created_at).toLocaleString()}
                     ${n.edited_at ? " · edited" : ""}
                     ${n.pinned ? " · 📌 pinned" : ""}</small>`;

                const bodyEl = document.createElement("div");
                bodyEl.className = "noteBody";
                bodyEl.textContent = n.body;

                const actions = document.createElement("div");
                actions.className = "noteActions";

                if (this.canAssign) {

                    const pin = document.createElement("button");
                    pin.className = "ghostBtn";
                    pin.textContent = n.pinned ? "Unpin" : "📌 Pin";
                    pin.onclick = async () => {
                        if (await CaseService.togglePin(n)) this.renderBody();
                    };
                    actions.appendChild(pin);

                }

                if (n.author === me) {

                    const edit = document.createElement("button");
                    edit.className = "ghostBtn";
                    edit.textContent = "✏️ Edit";
                    edit.onclick = async () => {

                        const text = await UI.promptText({
                            title: "Edit note",
                            value: n.body,
                            multiline: true,
                            required: true,
                            confirmText: "Save"
                        });

                        if (text === null) return;

                        if (await CaseService.editNote(n, text))
                            this.renderBody();

                    };
                    actions.appendChild(edit);

                }

                item.append(head, bodyEl);

                if (actions.childNodes.length) item.appendChild(actions);

                card.appendChild(item);

            });

        }

        body.appendChild(card);

    },

    /* --------------------------------------------------------- */
    /* HISTORY — the lifecycle (created + status changes)        */
    /* --------------------------------------------------------- */

    async viewHistory(body) {

        body.innerHTML = "";

        const card = this.card("🧭 History",
            "The case's lifecycle — creation and every status change.");

        const { rows, error } = await CaseService.timeline(this.id);

        if (error) {

            card.appendChild(this.hint62());

        } else {

            const lifecycle = rows.filter(e =>
                e.event === "Case created" || e.event === "Status changed");

            if (!lifecycle.length) {

                const p = document.createElement("p");
                p.className = "muted";
                p.textContent = "No lifecycle events yet.";
                card.appendChild(p);

            } else {

                lifecycle.forEach(e => card.appendChild(this.feedItem(
                    new Date(e.created_at).toLocaleString(),
                    e.event, e.details, e.actor ? "by " + e.actor : "")));

            }

        }

        body.appendChild(card);

    },

    /* --------------------------------------------------------- */
    /* AUDIT — every audit entry mentioning this case            */
    /* --------------------------------------------------------- */

    async viewAudit(body) {

        body.innerHTML = "";

        const card = this.card("🧾 Audit",
            "Audit-log entries that reference " + this.caseRow.case_id + ".");

        const { rows, error } = await CaseService.audit(this.caseRow.case_id);

        if (error || !rows?.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = error
                ? "Could not load the audit log."
                : "No audit entries yet.";
            card.appendChild(p);

        } else {

            rows.forEach(e => card.appendChild(this.feedItem(
                new Date(e.created_at).toLocaleString(),
                (e.action || "").replace(/_/g, " "),
                e.details || e.target, e.action_id || "")));

        }

        body.appendChild(card);

    },

    hint62() {

        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = CaseService.SETUP_HINT_62;
        return p;

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

        await this.reloadAssignments();

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

        /* officers for the assign bar */

        if (this.canAssign) {

            const { data } = await db
                .from("officers")
                .select("id, officer_id, first_name, last_name, user_id, status")
                .order("officer_id");

            this.officers = (data || []).filter(o =>
                o.status !== "Retired" && o.status !== "Terminated");

            this.officers.forEach(o => {
                this.officerMap[o.id] = {
                    id: o.id,
                    label: o.officer_id + " — " +
                        (o.first_name + " " + o.last_name).trim(),
                    user_id: o.user_id
                };
            });

        }

        await this.load();

        AuditService.log({
            action: "CASE_VIEWED",
            target: this.caseRow?.case_id || this.id
        });

    }

};

document.addEventListener("DOMContentLoaded", () => CaseFile.init());

window.CaseFile = CaseFile;
