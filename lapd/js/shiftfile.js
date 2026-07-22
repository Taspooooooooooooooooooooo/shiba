/* ==========================================================
   SHIBA PIMS
   Shift File (Phase 7 · Sprint 7.2) — the full digital record
   of one duty session. Explorer-style tabs: General · Timeline
   · Notes · Cases · Bodycam · Vehicle · Equipment · Statistics
   · Audit. Reports arrive with Phase 8.
========================================================== */

const ShiftFile = {

    id: null,

    shift: null,

    isMine: false,

    tab: "general",

    TABS: [
        { key: "general", label: "General", icon: "cases" },
        { key: "timeline", label: "Timeline", icon: "history" },
        { key: "notes", label: "Notes", icon: "messages" },
        { key: "cases", label: "Cases", icon: "warrants" },
        { key: "bodycam", label: "Bodycam", icon: "surveillance" },
        { key: "vehicle", label: "Vehicle", icon: "patrol" },
        { key: "equipment", label: "Equipment", icon: "access" },
        { key: "stats", label: "Statistics", icon: "analytics" },
        { key: "audit", label: "Audit", icon: "search" }
    ],

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    /* --------------------------------------------------------- */
    /* header                                                    */
    /* --------------------------------------------------------- */

    renderHeader() {

        const s = this.shift;

        const open = !s.ended_at;

        const dot = open ? "#22c55e" : (s.overtime ? "#e08a5a" : "#6b7280");

        document.getElementById("shiftHeader").innerHTML =
            `<div class="caseHeadTop">
                <div>
                    <div class="caseHeadId">${this.esc(s.shift_id)}</div>
                    <h1 class="caseHeadTitle">${this.esc(s.officer_label)}</h1>
                    <div class="caseHeadMeta">
                        <span class="dotChip"><i style="background:${dot}"></i>${
                            open ? (s.status === "Break" ? "On break"
                                : "On duty") : "Closed"}</span> ·
                        ${this.esc(s.activity || "—")} ·
                        ${this.esc(s.vehicle_unit || "no vehicle")}
                    </div>
                </div>
                <div class="caseHeadStatus">
                    <div class="shiftTimer" id="shiftFileTimer">--:--:--</div>
                    <small class="muted">${open ? "running" :
                        ShiftService.hm(ShiftService.summary(s).durationSec)
                        + " total"}</small>
                </div>
            </div>
            <a href="shifts.html" class="caseBack">← All shifts</a>`;

        /* live timer for an open shift */

        clearInterval(this._timer);

        const el = document.getElementById("shiftFileTimer");

        if (open) {

            const tick = () => {
                if (!el.isConnected) { clearInterval(this._timer); return; }
                el.textContent = ShiftService.fmtDuration(
                    Date.now() - new Date(s.started_at).getTime());
            };
            tick();
            this._timer = setInterval(tick, 1000);

        } else {

            el.textContent = ShiftService.fmtDuration(
                new Date(s.ended_at).getTime() -
                new Date(s.started_at).getTime());

        }

    },

    /* --------------------------------------------------------- */
    /* tabs                                                      */
    /* --------------------------------------------------------- */

    renderTabs() {

        const bar = document.getElementById("shiftTabs");

        bar.innerHTML = "";

        this.TABS.forEach(t => {

            const b = document.createElement("button");
            b.className = "caseTab" + (t.key === this.tab ? " on" : "");
            b.innerHTML =
                `<span class="caseTabIcon">${pimsIcon(t.icon, 16)}</span>` +
                this.esc(t.label);
            b.onclick = () => {
                this.tab = t.key; this.renderTabs(); this.renderBody();
            };
            bar.appendChild(b);

        });

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

    async renderBody() {

        const body = document.getElementById("shiftTabBody");

        if (this.tab === "general") body.innerHTML = this.viewGeneral();
        else if (this.tab === "timeline") await this.viewTimeline(body);
        else if (this.tab === "notes") await this.viewNotes(body);
        else if (this.tab === "cases") body.innerHTML = this.viewCases();
        else if (this.tab === "bodycam") body.innerHTML = this.viewBodycam();
        else if (this.tab === "vehicle") body.innerHTML = this.viewVehicle();
        else if (this.tab === "equipment") body.innerHTML = this.viewEquipment();
        else if (this.tab === "stats") body.innerHTML = this.viewStats();
        else if (this.tab === "audit") await this.viewAudit(body);

    },

    line(k, v, raw) {
        return `<div class="rvRow"><small>${k}</small><div>${
            raw ? (v || "—") : this.esc(v || "—")}</div></div>`;
    },

    /* --------------------------------------------------------- */
    /* GENERAL                                                   */
    /* --------------------------------------------------------- */

    viewGeneral() {

        const s = this.shift;

        const sum = ShiftService.summary(s);

        return `<div class="card">
            <h2>General</h2>
            <div class="rvGrid">
                ${this.line("Shift", s.shift_id)}
                ${this.line("Officer", s.officer_label)}
                ${this.line("Status", s.status)}
                ${this.line("Current activity", s.activity)}
                ${this.line("Started", new Date(s.started_at).toLocaleString())}
                ${this.line("Ended", s.ended_at
                    ? new Date(s.ended_at).toLocaleString() : "Still open")}
                ${this.line("Total time", ShiftService.hm(sum.durationSec))}
                ${this.line("Active time", ShiftService.hm(sum.activeSec))}
                ${this.line("Break time", ShiftService.hm(sum.breakSec))}
                ${this.line("Overtime", s.overtime ? "Yes" : "No")}
            </div>
            ${s.end_comments
                ? `<label class="wizLabel" style="margin-top:14px">Closing comment</label>
                   <div class="caseDesc">${this.esc(s.end_comments)}</div>` : ""}
        </div>`;

    },

    /* --------------------------------------------------------- */
    /* TIMELINE                                                  */
    /* --------------------------------------------------------- */

    EVENT_ICONS: {
        "Shift started": "shifts", "Shift ended": "signout",
        "Status changed": "sync", "Break started": "history",
        "Break ended": "sync", "Note added": "tags",
        "Responding to case": "warrants", "Cleared incident": "verified",
        "Equipment incomplete": "alerts"
    },

    async viewTimeline(body) {

        body.innerHTML = "";

        const card = this.card("Timeline",
            "Everything that happened on this shift, newest first.");

        const { rows, error } = await ShiftService.timeline(this.id);

        if (error || !rows.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = error ? ShiftService.SETUP_HINT : "No events yet.";
            card.appendChild(p);

        } else {

            const head = document.createElement("div");
            head.className = "exHeader exCols3";
            head.innerHTML =
                "<span>Event</span><span>By</span><span>When</span>";
            card.appendChild(head);

            rows.forEach(e => {

                const row = document.createElement("div");
                row.className = "exRow exCols3";
                row.style.cursor = "default";
                row.innerHTML =
                    `<span class="exName">
                        <span class="exIcon">${pimsIcon(
                            this.EVENT_ICONS[e.event] || "history", 18)}</span>
                        <span class="exNameText">
                            <b>${this.esc(e.event)}</b>
                            ${e.details ? `<small>${this.esc(e.details)}</small>` : ""}
                        </span>
                    </span>` +
                    `<span>${this.esc(e.actor || "—")}</span>` +
                    `<span>${new Date(e.created_at).toLocaleString()}</span>`;
                card.appendChild(row);

            });

        }

        body.appendChild(card);

    },

    /* --------------------------------------------------------- */
    /* NOTES — the officer's own shift notes                     */
    /* --------------------------------------------------------- */

    async viewNotes(body) {

        body.innerHTML = "";

        const card = this.card("Notes",
            "Notes the officer wrote during this shift (not case notes).");

        if (this.isMine && !this.shift.ended_at) {

            const composer = document.createElement("div");
            composer.className = "noteComposer";

            const ta = document.createElement("textarea");
            ta.className = "uiModalInput";
            ta.rows = 2;
            ta.placeholder = "e.g. Vehicle had a technical issue…";

            const send = document.createElement("button");
            send.className = "primaryBtn";
            send.textContent = "Add note";
            send.onclick = async () => {
                if (!ta.value.trim()) { UI.error("Write something first."); return; }
                send.disabled = true;
                const ok = await ShiftService.addNote(this.shift, ta.value);
                send.disabled = false;
                if (ok) { ta.value = ""; this.renderBody(); }
            };

            composer.append(ta, send);
            card.appendChild(composer);

        }

        const { rows, error } = await ShiftService.notes(this.id);

        if (error) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = ShiftService.SETUP_HINT_72;
            card.appendChild(p);

        } else if (!rows.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = "No shift notes.";
            card.appendChild(p);

        } else {

            rows.forEach(n => {

                const item = document.createElement("div");
                item.className = "noteItem";
                item.innerHTML =
                    `<div class="noteHead">
                        <b>${this.esc(n.author || "unknown")}</b>
                        <small>${new Date(n.created_at).toLocaleString()}</small>
                     </div>
                     <div class="noteBody">${this.esc(n.body)}</div>`;
                card.appendChild(item);

            });

        }

        body.appendChild(card);

    },

    /* --------------------------------------------------------- */
    /* CASES · BODYCAM · VEHICLE · EQUIPMENT · STATS             */
    /* --------------------------------------------------------- */

    viewCases() {

        const s = this.shift;

        if (!s.cases) {

            return `<div class="card"><h2>Cases</h2>
                <p class="muted">No case is linked to this shift. When an
                   officer responds to a case from their duty widget it
                   shows here (incident mode).</p></div>`;

        }

        return `<div class="card"><h2>Cases</h2>
            <div class="reviewRow">
                <div class="rrMain">
                    <div class="rrTitle">${this.esc(s.cases.case_id)}</div>
                    <div class="rrSub">${this.esc(s.cases.title || "")}</div>
                </div>
                <a class="primaryBtn" style="text-decoration:none"
                   href="case.html?id=${this.esc(s.current_case_id)}">Open case</a>
            </div>
            <p class="muted" style="margin-top:8px">This was the officer's
               active incident during the shift.</p>
        </div>`;

    },

    viewBodycam() {

        const s = this.shift;

        return `<div class="card"><h2>Bodycam</h2>
            <div class="rvGrid">
                ${this.line("Bodycam ready", s.bodycam_ready ? "Yes" : "No")}
                ${this.line("Session", s.bodycam_session_id)}
                ${this.line("Uploaded", s.bodycam_uploaded == null
                    ? "—" : (s.bodycam_uploaded ? "Yes" : "No"))}
            </div>
            <p class="muted" style="margin-top:10px">Recording time,
               bookmarks and evidence markers arrive with the Bodycam
               module (a later sprint).</p>
        </div>`;

    },

    viewVehicle() {

        const s = this.shift;

        return `<div class="card"><h2>Vehicle & Radio</h2>
            <div class="rvGrid">
                ${this.line("Unit", s.vehicle_unit)}
                ${this.line("Type", s.vehicle_type)}
                ${this.line("Callsign", s.callsign)}
                ${this.line("Primary channel", s.primary_channel)}
                ${this.line("Secondary channel", s.secondary_channel)}
                ${this.line("Returned", s.vehicle_returned == null
                    ? "—" : (s.vehicle_returned ? "Yes" : "No"))}
            </div>
        </div>`;

    },

    viewEquipment() {

        const s = this.shift;

        const eq = s.equipment || {};

        const items = ShiftService.EQUIPMENT.map(k => {
            const on = eq[k] !== false;
            return `<div class="rvRow"><small>${k}</small>` +
                `<div><span class="dotChip"><i style="background:${
                    on ? "#22c55e" : "#e08a5a"}"></i>${
                    on ? "Confirmed" : "Missing"}</span></div></div>`;
        }).join("");

        const missing = ShiftService.EQUIPMENT.filter(k => eq[k] === false);

        return `<div class="card"><h2>Equipment</h2>
            <div class="rvGrid">${items}</div>
            ${missing.length
                ? `<p class="uiModalMsg" style="color:#e08a5a;margin-top:10px">
                     ${pimsIcon("alerts", 14)} Started with missing:
                     ${this.esc(missing.join(", "))}.</p>` : ""}
        </div>`;

    },

    viewStats() {

        const sum = ShiftService.summary(this.shift);

        const s = this.shift;

        const stat = (label, v, cls = "") =>
            `<div class="statChip ${cls}"><b>${v}</b>` +
            `<span>${label}</span></div>`;

        return `<div class="card"><h2>Statistics</h2>
            <div class="caseStats">
                ${stat("Total", ShiftService.hm(sum.durationSec))}
                ${stat("Active", ShiftService.hm(sum.activeSec))}
                ${stat("Break", ShiftService.hm(sum.breakSec))}
                ${stat("Overtime", s.overtime ? "Yes" : "No",
                    s.overtime ? "crit" : "")}
            </div>
            <p class="muted" style="margin-top:12px">Lifetime and monthly
               statistics across all shifts arrive in Sprint 7.3.</p>
        </div>`;

    },

    /* --------------------------------------------------------- */
    /* AUDIT                                                     */
    /* --------------------------------------------------------- */

    async viewAudit(body) {

        body.innerHTML = "";

        const card = this.card("Audit",
            "Audit-log entries that reference " + this.shift.shift_id + ".");

        const { rows, error } = await ShiftService.audit(this.shift.shift_id);

        if (error || !rows?.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = "No audit entries yet.";
            card.appendChild(p);

        } else {

            const head = document.createElement("div");
            head.className = "exHeader exCols3";
            head.innerHTML =
                "<span>Action</span><span>Entry</span><span>When</span>";
            card.appendChild(head);

            rows.forEach(e => {
                const row = document.createElement("div");
                row.className = "exRow exCols3";
                row.style.cursor = "default";
                row.innerHTML =
                    `<span class="exName">
                        <span class="exIcon">${pimsIcon("search", 18)}</span>
                        <span class="exNameText">
                            <b>${this.esc((e.action || "").replace(/_/g, " "))}</b>
                            ${e.details ? `<small>${this.esc(e.details)}</small>` : ""}
                        </span>
                    </span>` +
                    `<span>${this.esc(e.action_id || "—")}</span>` +
                    `<span>${new Date(e.created_at).toLocaleString()}</span>`;
                card.appendChild(row);
            });

        }

        body.appendChild(card);

    },

    /* --------------------------------------------------------- */
    /* load                                                      */
    /* --------------------------------------------------------- */

    async load() {

        const { row, error } = await ShiftService.byId(this.id);

        if (error || !row) {
            document.getElementById("shiftHeader").innerHTML =
                `<p class="muted">Shift not found. ${ShiftService.SETUP_HINT}</p>`;
            document.getElementById("shiftTabs").innerHTML = "";
            document.getElementById("shiftTabBody").innerHTML = "";
            return;
        }

        this.shift = row;

        const mine = await PermissionService.myOfficerId();

        this.isMine = mine && mine === row.officer_id;

        this.renderHeader();
        this.renderTabs();
        this.renderBody();

    },

    async init() {

        if (!window.db) return;

        this.id = new URLSearchParams(location.search).get("id");

        if (!this.id) {
            document.getElementById("shiftHeader").innerHTML =
                "<p class='muted'>No shift specified.</p>";
            return;
        }

        await this.load();

    }

};

document.addEventListener("DOMContentLoaded", () => ShiftFile.init());

window.ShiftFile = ShiftFile;
