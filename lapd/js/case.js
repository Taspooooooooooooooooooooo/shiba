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
        { key: "general", label: "General", icon: "📋", live: true },
        { key: "assignments", label: "Assignments", icon: "👮", live: true },
        { key: "people", label: "People", icon: "🧑‍🤝‍🧑", live: true },
        { key: "timeline", label: "Timeline", icon: "📜", live: true },
        { key: "evidence", label: "Evidence", icon: "🧰", live: true },
        { key: "notes", label: "Notes", icon: "🗒", live: true },
        { key: "history", label: "History", icon: "🧭", live: true },
        { key: "audit", label: "Audit", icon: "🧾", live: true }
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

    wfBtn(wrap, label, cls, fn) {

        const b = document.createElement("button");
        b.className = cls;
        b.textContent = label;
        b.onclick = async () => {
            b.disabled = true;
            const ok = await fn();
            b.disabled = false;
            if (ok) this.load();
        };
        wrap.appendChild(b);
        return b;

    },

    renderStatusControl() {

        const box = document.getElementById("caseStatusCtl");

        if (!box) return;

        box.innerHTML = "";

        const c = this.caseRow;

        const wrap = document.createElement("div");
        wrap.className = "caseStatusMove";

        /* priority — Sergeant+ */

        if (this.canAssign &&
            !["Closed", "Archived"].includes(c.status)) {

            const pr = document.createElement("select");
            pr.className = "uiModalInput";
            pr.title = "Change priority";
            pr.innerHTML = CaseService.PRIORITIES.map(p =>
                `<option ${p === c.priority ? "selected" : ""}>${p}</option>`)
                .join("");
            pr.onchange = async () => {
                if (await CaseService.setPriority(c, pr.value)) this.load();
                else pr.value = c.priority;
            };
            wrap.appendChild(pr);

        }

        const working = CaseService.WORKING.includes(c.status);

        if (working) {

            /* generic mover between working statuses — Sergeant+ */

            if (this.canAssign) {

                const sel = document.createElement("select");
                sel.className = "uiModalInput";
                sel.innerHTML = "<option value=''>Move to…</option>" +
                    CaseService.nextStatuses(c.status).map(s =>
                        `<option>${this.esc(s)}</option>`).join("");
                sel.onchange = async () => {
                    if (!sel.value) return;
                    if (await CaseService.setStatus(c, sel.value)) this.load();
                    else sel.value = "";
                };
                wrap.appendChild(sel);

            }

            if (this.canRequestClosure && c.status !== "Draft") {

                this.wfBtn(wrap, "📨 Request closure", "primaryBtn",
                    async () => {
                        const summary = await UI.promptText({
                            title: "Request closure · " + c.case_id,
                            label: "Closing summary (the supervisor sees this)",
                            multiline: true,
                            confirmText: "Submit for review"
                        });
                        if (summary === null) return false;
                        return CaseService.requestClosure(c, summary);
                    });

            }

        } else if (c.status === "Supervisor Review") {

            if (this.isLieutenant) {

                this.wfBtn(wrap, "✅ Approve closure", "primaryBtn",
                    () => UI.confirm({
                        title: "Approve closure?",
                        message: c.case_id + " will move to Approved For " +
                            "Closing.",
                        confirmText: "Approve"
                    }).then(ok => ok && CaseService.approveClosure(c)));

                this.wfBtn(wrap, "↩ Return", "ghostBtn",
                    async () => {
                        const reason = await UI.promptText({
                            title: "Return to investigation · " + c.case_id,
                            label: "What still needs work?",
                            multiline: true, required: true,
                            confirmText: "Return case"
                        });
                        if (reason === null) return false;
                        return CaseService.returnToInvestigation(c, reason);
                    });

            } else {

                const note = document.createElement("small");
                note.className = "muted";
                note.textContent = "Awaiting a Lieutenant+ review.";
                wrap.appendChild(note);

            }

        } else if (c.status === "Approved For Closing") {

            if (this.isLieutenant) {

                this.wfBtn(wrap, "🔒 Close case", "primaryBtn",
                    () => UI.confirm({
                        title: "Close " + c.case_id + "?",
                        message: "The case stays in the archive forever — " +
                            "it can be reopened by a Lieutenant+.",
                        confirmText: "Close case", danger: true
                    }).then(ok => ok && CaseService.closeCase(c)));

                this.wfBtn(wrap, "↩ Return", "ghostBtn",
                    async () => {
                        const reason = await UI.promptText({
                            title: "Return to investigation · " + c.case_id,
                            label: "Why is it going back?",
                            multiline: true, required: true,
                            confirmText: "Return case"
                        });
                        if (reason === null) return false;
                        return CaseService.returnToInvestigation(c, reason);
                    });

            }

        } else if (c.status === "Closed" || c.status === "Archived") {

            if (this.isLieutenant) {

                this.wfBtn(wrap, "🔓 Reopen", "ghostBtn",
                    async () => {
                        const reason = await UI.promptText({
                            title: "Reopen " + c.case_id,
                            label: "Reason for reopening",
                            multiline: true, required: true,
                            confirmText: "Reopen case"
                        });
                        if (reason === null) return false;
                        return CaseService.reopen(c, reason);
                    });

                if (c.status === "Closed") {

                    this.wfBtn(wrap, "📦 Archive", "ghostBtn",
                        () => UI.confirm({
                            title: "Archive " + c.case_id + "?",
                            message: "Archived is the final state — the " +
                                "case stays searchable forever.",
                            confirmText: "Archive"
                        }).then(ok => ok && CaseService.archive(c)));

                }

            }

        }

        if (wrap.childNodes.length) box.appendChild(wrap);

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
            b.innerHTML =
                `<span class="caseTabIcon">${t.icon || ""}</span>` +
                this.esc(t.label) + (t.live ? "" : " · soon");
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

        if (this.tab === "general") {
            body.innerHTML = this.viewGeneral();
            body.appendChild(await this.buildRelatedCard());
        }
        else if (this.tab === "assignments") await this.viewAssignments(body);
        else if (this.tab === "people") await this.viewPeople(body);
        else if (this.tab === "timeline") await this.viewTimeline(body);
        else if (this.tab === "evidence") await this.viewEvidence(body);
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
    /* RELATED CASES — links work both ways (Sprint 6.4)         */
    /* --------------------------------------------------------- */

    async buildRelatedCard() {

        const card = this.card("🔗 Related Cases",
            "Same suspect, same location, a follow-up — linked cases " +
            "show up on both files.");

        if (this.canAssign) {

            const bar = document.createElement("div");
            bar.className = "personBar";

            const input = document.createElement("input");
            input.className = "uiModalInput";
            input.placeholder = "CASE-2026-000123";

            const link = document.createElement("button");
            link.className = "primaryBtn";
            link.textContent = "Link case";
            link.onclick = async () => {
                if (!input.value.trim()) return;
                link.disabled = true;
                const ok = await CaseService.relate(
                    this.caseRow, input.value);
                link.disabled = false;
                if (ok) this.renderBody();
            };

            bar.append(input, link);
            card.appendChild(bar);

        }

        const { rows, error } = await CaseService.related(this.id);

        if (error) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = CaseService.SETUP_HINT_64;
            card.appendChild(p);

        } else if (!rows.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = "No related cases.";
            card.appendChild(p);

        } else {

            rows.forEach(rel => {

                const row = document.createElement("div");
                row.className = "reviewRow";

                const main = document.createElement("div");
                main.className = "rrMain";
                main.innerHTML =
                    `<div class="rrTitle">${this.esc(rel.other.case_id)}
                     <span class="certStatus">` +
                    CaseService.statusChip(rel.other.status) + `</span></div>
                     <div class="rrSub">${this.esc(rel.other.title)} ·
                     ${CaseService.priorityChip(rel.other.priority)}</div>`;

                const open = document.createElement("a");
                open.className = "primaryBtn";
                open.style.textDecoration = "none";
                open.textContent = "Open";
                open.href = "case.html?id=" +
                    encodeURIComponent(rel.other.id);

                row.append(main, open);

                if (this.canAssign) {

                    const un = document.createElement("button");
                    un.className = "formQRemove";
                    un.textContent = "✕";
                    un.title = "Unlink";
                    un.style.position = "static";
                    un.onclick = async () => {
                        if (await CaseService.unrelate(this.caseRow, rel))
                            this.renderBody();
                    };
                    row.appendChild(un);

                }

                card.appendChild(row);

            });

        }

        return card;

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
    /* PEOPLE — victims, witnesses, suspects (Sergeant+ edits)   */
    /* --------------------------------------------------------- */

    ROLE_ICONS: { "Victim": "🤕", "Witness": "👁", "Suspect": "🚨",
                  "Other": "👤" },

    async viewPeople(body) {

        body.innerHTML = "";

        const card = this.card("🧑‍🤝‍🧑 People",
            "Victims, witnesses and suspects on this case — each with " +
            "their own ID.");

        /* ---- Explorer toolbar ---- */

        const toolbar = document.createElement("div");
        toolbar.className = "exToolbar";

        if (this.canAssign) {

            const addBtn = document.createElement("button");
            addBtn.className = "exBtn";
            addBtn.textContent = "➕ Add person";

            toolbar.appendChild(addBtn);

            const panel = document.createElement("div");
            panel.className = "personBar hidden";

            const name = document.createElement("input");
            name.className = "uiModalInput";
            name.placeholder = "Full name…";

            const role = document.createElement("select");
            role.className = "uiModalInput";
            role.innerHTML = CaseService.PERSON_ROLES.map(r =>
                `<option>${this.ROLE_ICONS[r]} ${r}</option>`).join("");

            const details = document.createElement("input");
            details.className = "uiModalInput";
            details.placeholder = "Details (optional)…";

            const add = document.createElement("button");
            add.className = "primaryBtn";
            add.textContent = "Add";
            add.onclick = async () => {
                if (!name.value.trim()) { UI.error("A name is required."); return; }
                add.disabled = true;
                const ok = await CaseService.addPerson(this.caseRow, {
                    name: name.value,
                    role: role.value.replace(/^\S+\s/, ""),
                    details: details.value
                });
                add.disabled = false;
                if (ok) this.renderBody();
            };

            panel.append(name, role, details, add);

            addBtn.onclick = () => panel.classList.toggle("hidden");

            card.append(toolbar, panel);

        }

        /* ---- Explorer details view ---- */

        const { rows, error } = await CaseService.persons(this.id);

        if (error) {

            card.appendChild(this.hint63());

        } else if (!rows.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = "No persons recorded on this case.";
            card.appendChild(p);

        } else {

            const head = document.createElement("div");
            head.className = "exHeader exPeople";
            head.innerHTML =
                "<span>Name</span><span>Role</span><span>ID</span>" +
                "<span>Added</span><span>By</span>";
            card.appendChild(head);

            rows.forEach(person => {

                const row = document.createElement("div");
                row.className = "exRow exPeople";

                row.innerHTML =
                    `<span class="exName">
                        <span class="exIcon">` +
                        `${this.ROLE_ICONS[person.role] || "👤"}</span>
                        <span class="exNameText">
                            <b>${this.esc(person.name)}</b>
                            ${person.details
                                ? `<small>${this.esc(person.details)}</small>`
                                : ""}
                        </span>
                    </span>` +
                    `<span>${this.esc(person.role)}</span>` +
                    `<span>${this.esc(person.person_id || "—")}</span>` +
                    `<span>${new Date(person.created_at).toLocaleDateString()}</span>` +
                    `<span>${this.esc(person.added_by || "—")}</span>`;

                row.onclick = () => this.showPersonDetail(person);

                card.appendChild(row);

            });

        }

        body.appendChild(card);

    },

    /* Explorer "properties" dialog for a person */

    showPersonDetail(person) {

        UI.modal({

            title: (this.ROLE_ICONS[person.role] || "👤") + " " + person.name,

            render: () => {

                const wrap = document.createElement("div");

                const line = (k, v) =>
                    `<div class="rvRow"><small>${k}</small>` +
                    `<div>${this.esc(v || "—")}</div></div>`;

                wrap.innerHTML =
                    `<div class="rvGrid">
                        ${line("Person ID", person.person_id)}
                        ${line("Role", person.role)}
                        ${line("Added", new Date(person.created_at).toLocaleString())}
                        ${line("Added by", person.added_by)}
                        ${line("Case", this.caseRow.case_id)}
                    </div>` +
                    (person.details
                        ? `<div class="apMot" style="margin-top:10px">` +
                          `${this.esc(person.details)}</div>` : "");

                return wrap;

            },

            buttons: [
                { label: "Close", kind: "ghost", value: null },
                ...(this.canAssign
                    ? [{ label: "Remove from case", kind: "danger",
                         value: "remove" }]
                    : [])
            ]

        }).then(async choice => {

            if (choice !== "remove") return;

            const ok = await UI.confirm({
                title: "Remove this person?",
                message: person.name + " (" + person.role +
                    ") will be removed from " + this.caseRow.case_id +
                    ". The case history keeps a record.",
                confirmText: "Remove",
                danger: true
            });

            if (!ok) return;

            if (await CaseService.removePerson(this.caseRow, person))
                this.renderBody();

        });

    },

    /* --------------------------------------------------------- */
    /* EVIDENCE — EVID- objects with a SHA-256 file hash         */
    /* --------------------------------------------------------- */

    fmtSize(bytes) {

        if (bytes == null) return "";

        if (bytes < 1024) return bytes + " B";

        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";

        return (bytes / 1048576).toFixed(1) + " MB";

    },

    EVIDENCE_ICONS: { "Photo": "🖼", "Video": "🎞", "Audio": "🎙",
                      "Document": "📄", "Bodycam": "📹", "Other": "📦" },

    evView: localStorage.getItem("shiba_ev_view") || "list",

    evFileHref(ev) {

        if (ev.cloud_id) return "../cloud/?=" + ev.cloud_id;

        return ev.file_url || null;

    },

    /* Explorer-style evidence browser: toolbar → column list or
       icon grid, like the Windows file manager */

    async viewEvidence(body) {

        body.innerHTML = "";

        const card = this.card("🧰 Evidence",
            "Every piece is its own object — typed, hashed (SHA-256) and " +
            "never deleted.");

        /* ---- toolbar ---- */

        const toolbar = document.createElement("div");
        toolbar.className = "exToolbar";

        const addBtn = document.createElement("button");
        addBtn.className = "exBtn";
        addBtn.textContent = "➕ Add evidence";

        const spacer = document.createElement("div");
        spacer.className = "exSpacer";

        const listBtn = document.createElement("button");
        listBtn.className = "exBtn exView" +
            (this.evView === "list" ? " on" : "");
        listBtn.title = "Details view";
        listBtn.textContent = "☰";

        const gridBtn = document.createElement("button");
        gridBtn.className = "exBtn exView" +
            (this.evView === "grid" ? " on" : "");
        gridBtn.title = "Large icons";
        gridBtn.textContent = "⊞";

        listBtn.onclick = () => {
            this.evView = "list";
            localStorage.setItem("shiba_ev_view", "list");
            this.renderBody();
        };

        gridBtn.onclick = () => {
            this.evView = "grid";
            localStorage.setItem("shiba_ev_view", "grid");
            this.renderBody();
        };

        toolbar.append(addBtn, spacer, listBtn, gridBtn);
        card.appendChild(toolbar);

        /* ---- collapsible add panel ---- */

        const panel = document.createElement("div");
        panel.className = "evBar hidden";

        const fileIn = document.createElement("input");
        fileIn.type = "file";
        fileIn.className = "uiModalInput evFile";

        const type = document.createElement("select");
        type.className = "uiModalInput";
        type.innerHTML = CaseService.EVIDENCE_TYPES.map(t =>
            `<option>${this.EVIDENCE_ICONS[t]} ${t}</option>`).join("");

        const desc = document.createElement("input");
        desc.className = "uiModalInput";
        desc.placeholder = "Description…";

        const add = document.createElement("button");
        add.className = "primaryBtn";
        add.textContent = "Add";
        add.onclick = async () => {

            const file = fileIn.files[0] || null;

            if (!file && !desc.value.trim()) {
                UI.error("Attach a file or write a description.");
                return;
            }

            add.disabled = true;
            add.textContent = file ? "Hashing…" : "Saving…";

            const ok = await CaseService.addEvidence(this.caseRow, {
                file: file,
                type: type.value.replace(/^\S+\s/, ""),
                description: desc.value
            });

            add.disabled = false;
            add.textContent = "Add";

            if (ok) this.renderBody();

        };

        panel.append(fileIn, type, desc, add);
        card.appendChild(panel);

        addBtn.onclick = () => panel.classList.toggle("hidden");

        /* ---- content ---- */

        const { rows, error } = await CaseService.evidence(this.id);

        if (error) {

            card.appendChild(this.hint63());

        } else if (!rows.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = "This folder is empty.";
            card.appendChild(p);

        } else if (this.evView === "grid") {

            const grid = document.createElement("div");
            grid.className = "exGrid";

            rows.forEach(ev => {

                const tile = document.createElement("button");
                tile.className = "exTile";
                tile.innerHTML =
                    `<span class="exTileIcon">` +
                    `${this.EVIDENCE_ICONS[ev.type] || "📦"}</span>` +
                    `<span class="exTileName">` +
                    `${this.esc(ev.file_name || ev.evidence_id)}</span>` +
                    `<small>${this.esc(ev.evidence_id)}</small>`;
                tile.onclick = () => this.showEvidenceDetail(ev);
                grid.appendChild(tile);

            });

            card.appendChild(grid);

        } else {

            /* details view — column header + rows, Explorer-style */

            const head = document.createElement("div");
            head.className = "exHeader";
            head.innerHTML =
                "<span>Name</span><span>Type</span><span>Size</span>" +
                "<span>Logged</span><span>By</span>";
            card.appendChild(head);

            rows.forEach(ev => {

                const row = document.createElement("div");
                row.className = "exRow";

                row.innerHTML =
                    `<span class="exName">
                        <span class="exIcon">` +
                        `${this.EVIDENCE_ICONS[ev.type] || "📦"}</span>
                        <span class="exNameText">
                            <b>${this.esc(ev.file_name || ev.evidence_id)}</b>
                            <small>${this.esc(ev.evidence_id)}` +
                            `${ev.hash ? " · #" + this.esc(ev.hash.slice(0, 10)) + "…" : ""}` +
                            `</small>
                        </span>
                    </span>` +
                    `<span>${this.esc(ev.type)}</span>` +
                    `<span>${ev.file_size != null
                        ? this.fmtSize(ev.file_size) : "—"}</span>` +
                    `<span>${new Date(ev.created_at).toLocaleDateString()}</span>` +
                    `<span>${this.esc(ev.uploaded_by || "—")}</span>`;

                row.onclick = () => this.showEvidenceDetail(ev);

                card.appendChild(row);

            });

        }

        body.appendChild(card);

    },

    /* Explorer "properties" dialog for one evidence item */

    showEvidenceDetail(ev) {

        UI.modal({

            title: (this.EVIDENCE_ICONS[ev.type] || "📦") + " " +
                (ev.file_name || ev.evidence_id),

            render: () => {

                const wrap = document.createElement("div");

                const line = (k, v) =>
                    `<div class="rvRow"><small>${k}</small>` +
                    `<div>${this.esc(v || "—")}</div></div>`;

                wrap.innerHTML =
                    `<div class="rvGrid">
                        ${line("Evidence ID", ev.evidence_id)}
                        ${line("Type", ev.type)}
                        ${line("Size", ev.file_size != null
                            ? this.fmtSize(ev.file_size) : "—")}
                        ${line("Logged", new Date(ev.created_at).toLocaleString())}
                        ${line("Logged by", ev.uploaded_by)}
                        ${line("Case", this.caseRow.case_id)}
                    </div>` +
                    (ev.description
                        ? `<div class="apMot" style="margin-top:10px">` +
                          `${this.esc(ev.description)}</div>` : "") +
                    (ev.hash
                        ? `<div class="evHash" style="margin-top:10px" ` +
                          `title="Full SHA-256">#️⃣ ${this.esc(ev.hash)}</div>`
                        : "");

                return wrap;

            },

            buttons: [
                { label: "Close", kind: "ghost", value: null },
                ...(ev.scan_token
                    ? [{ label: "🏷 Barcode", kind: "ghost", value: "barcode" }]
                    : []),
                ...(this.evFileHref(ev)
                    ? [{ label: "Open file", kind: "primary", value: "open" }]
                    : [])
            ]

        }).then(choice => {

            if (choice === "open") {

                window.open(this.evFileHref(ev), "_blank", "noopener");

            } else if (choice === "barcode") {

                this.showEvidenceBarcode(ev);

            }

        });

    },

    hint63() {

        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = CaseService.SETUP_HINT_63;
        return p;

    },

    /* big printable PDF417 label for an evidence item — the code
       carries the secret scan token, never a link */

    showEvidenceBarcode(ev) {

        UI.modal({

            title: "🏷 " + ev.evidence_id + " · evidence label",

            render: () => {

                const wrap = document.createElement("div");

                const box = document.createElement("div");
                box.className = "evBarcodeBox";

                BarcodeService.renderPdf417(box,
                    BarcodeService.evidence(ev, this.caseRow.case_id),
                    { scale: 4, height: 18 });

                const meta = document.createElement("p");
                meta.className = "uiModalMsg";
                meta.style.textAlign = "center";
                meta.textContent = ev.evidence_id + " · " + ev.type +
                    " · " + this.caseRow.case_id;

                wrap.append(box, meta);

                return wrap;

            },

            buttons: [{ label: "Close", kind: "primary", value: null }]

        });

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

        /* review-workflow gates */

        this.isLieutenant = await CaseService.roleAtLeast("Lieutenant");

        this.canRequestClosure =
            (await CaseService.roleAtLeast("Sergeant")) ||
            (await CaseService.isLead(row));

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
