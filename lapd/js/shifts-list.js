/* ==========================================================
   SHIBA PIMS
   Shifts list (Phase 7 · Sprint 7.2) — the signed-in officer's
   active shift + history. Rows open the full Shift File.
========================================================== */

const ShiftsList = {

    officer: null,

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    async init() {

        if (!window.db) return;

        this.officer = await PermissionService.myOfficer();

        const active = document.getElementById("shiftsActive");

        const hist = document.getElementById("shiftsHistory");

        if (!this.officer) {

            active.innerHTML =
                "<p class='muted'>Your account isn't linked to an officer.</p>";

            hist.innerHTML = "";

            return;

        }

        /* active shift banner */

        const { shift } = await ShiftService.myActiveShift();

        if (shift) {

            const sum = ShiftService.summary(shift);

            active.innerHTML =
                `<div class="shiftHead">
                    <div>
                        <h2><span class="dotChip"><i style="background:${
                            shift.status === "Break" ? "#f97316" : "#22c55e"
                        }"></i>${shift.status === "Break" ? "On break"
                            : "On duty"}</span>
                            <span class="grantKind">${this.esc(shift.shift_id)}</span>
                        </h2>
                        <small class="muted">${this.esc(shift.activity)} ·
                            ${ShiftService.hm(sum.durationSec)} ·
                            ${this.esc(shift.vehicle_unit || "no vehicle")}</small>
                    </div>
                    <a class="primaryBtn" style="text-decoration:none"
                       href="shift.html?id=${this.esc(shift.id)}">Open shift file</a>
                </div>
                <p class="muted" style="margin-top:8px">Change status, take a
                   break or end the shift from the <a href="dashboard.html"
                   style="color:var(--pims-gold)">Dashboard</a>.</p>`;

        } else {

            active.innerHTML =
                `<div class="shiftOff">
                    <div>
                        <h2>Off duty</h2>
                        <p class="muted">You have no active shift. Start one
                           from the Dashboard.</p>
                    </div>
                    <a class="shiftStartBtn" style="text-decoration:none"
                       href="dashboard.html">
                       ${pimsIcon("shifts", 20)} GO TO DASHBOARD</a>
                </div>`;

        }

        /* history */

        const { rows, error } =
            await ShiftService.forOfficer(this.officer.id);

        if (error) {

            hist.innerHTML = `<p class="muted">${ShiftService.SETUP_HINT}</p>`;

            return;

        }

        if (!rows.length) {

            hist.innerHTML = "<p class='muted'>No shifts on record yet.</p>";

            return;

        }

        hist.innerHTML = "";

        const head = document.createElement("div");
        head.className = "exHeader exShifts";
        head.innerHTML =
            "<span>Shift</span><span>Vehicle</span>" +
            "<span>Duration</span><span>When</span>";
        hist.appendChild(head);

        rows.forEach(sh => {

            const sum = ShiftService.summary(sh);

            const open = !sh.ended_at;

            const dot = open ? "#22c55e" : (sh.overtime ? "#e08a5a" : "#6b7280");

            const row = document.createElement("div");
            row.className = "exRow exShifts";

            row.innerHTML =
                `<span class="exName">
                    <span class="exIcon">${pimsIcon("shifts", 18)}</span>
                    <span class="exNameText">
                        <b>${this.esc(sh.shift_id || "—")}</b>
                        <small>${this.esc(sh.callsign || sh.activity || "")}</small>
                    </span>
                </span>` +
                `<span>${this.esc(sh.vehicle_unit || "—")}</span>` +
                `<span><span class="dotChip"><i style="background:${dot}"></i>` +
                    `${ShiftService.hm(sum.durationSec)}${open ? " (open)" : ""}` +
                    `${sh.overtime ? " · OT" : ""}</span></span>` +
                `<span>${new Date(sh.started_at).toLocaleDateString()}</span>`;

            row.onclick = () =>
                location.href = "shift.html?id=" + encodeURIComponent(sh.id);

            hist.appendChild(row);

        });

        /* calendar */

        this.calMonth = new Date();

        this.canSchedule = await PermissionService.can("cases.assign");

        if (this.canSchedule) {

            await this.loadOfficers();

            const btn = document.getElementById("calSchedule");
            btn.classList.remove("hidden");
            btn.onclick = () => this.openSchedule();

        }

        document.getElementById("calPrev").onclick = () => {
            this.calMonth.setMonth(this.calMonth.getMonth() - 1);
            this.renderCalendar();
        };

        document.getElementById("calNext").onclick = () => {
            this.calMonth.setMonth(this.calMonth.getMonth() + 1);
            this.renderCalendar();
        };

        this.renderCalendar();

    },

    async loadOfficers() {

        if (this.officers) return;

        const { data } = await db.from("officers")
            .select("id, officer_id, first_name, last_name, status")
            .order("officer_id");

        this.officers = (data || []).filter(o =>
            o.status !== "Retired" && o.status !== "Terminated");

    },

    ymd(d) {
        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0");
    },

    async renderCalendar() {

        const grid = document.getElementById("calGrid");

        const m = this.calMonth;

        document.getElementById("calTitle").textContent =
            m.toLocaleString(undefined, { month: "long", year: "numeric" });

        const first = new Date(m.getFullYear(), m.getMonth(), 1);

        const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);

        const { rows, error } = await ShiftService.scheduledBetween(
            this.ymd(first), this.ymd(last));

        if (error) {

            grid.innerHTML = `<p class="muted">${ShiftService.SETUP_HINT_73}</p>`;

            return;

        }

        const byDay = {};

        (rows || []).filter(r => r.status !== "Cancelled").forEach(r => {
            (byDay[r.shift_date] = byDay[r.shift_date] || []).push(r);
        });

        /* leading blanks (week starts Monday) */

        let startDow = first.getDay() - 1;
        if (startDow < 0) startDow = 6;

        let html = `<div class="calWeekhead">` +
            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                .map(d => `<span>${d}</span>`).join("") + `</div><div class="calDays">`;

        for (let i = 0; i < startDow; i++) html += `<div class="calCell blank"></div>`;

        const todayStr = this.ymd(new Date());

        for (let day = 1; day <= last.getDate(); day++) {

            const key = this.ymd(new Date(m.getFullYear(), m.getMonth(), day));

            const items = byDay[key] || [];

            const chips = items.slice(0, 3).map(r =>
                `<span class="calChip" title="${this.esc(r.officer_label)}${
                    r.start_time ? " · " + r.start_time : ""}">${
                    this.esc((r.officers?.officer_id) || "shift")}</span>`).join("");

            html += `<div class="calCell${key === todayStr ? " today" : ""}"
                          data-date="${key}">
                        <span class="calNum">${day}</span>
                        ${chips}${items.length > 3
                            ? `<span class="calMore">+${items.length - 3}</span>` : ""}
                     </div>`;

        }

        html += `</div>`;

        grid.innerHTML = html;

        if (this.canSchedule) {

            grid.querySelectorAll(".calCell[data-date]").forEach(cell => {
                cell.style.cursor = "pointer";
                cell.onclick = () => this.openSchedule(cell.dataset.date);
            });

        }

    },

    openSchedule(presetDate) {

        let officer, date, start, end, notes;

        UI.modal({

            title: "Schedule a shift",

            buttons: [],

            render: close => {

                const wrap = document.createElement("div");

                const offOpts = this.officers.map(o =>
                    `<option value="${o.id}">${this.esc(o.officer_id + " — " +
                        (o.first_name + " " + o.last_name).trim())}</option>`).join("");

                wrap.innerHTML =
                    `<label class="wizLabel">Officer</label>
                     <select class="uiModalInput" id="scOff">${offOpts}</select>
                     <label class="wizLabel">Date</label>
                     <input type="date" class="uiModalInput" id="scDate"
                            value="${presetDate || ""}">
                     <div class="wizGrid">
                        <div><label class="wizLabel">Start</label>
                            <input type="time" class="uiModalInput" id="scStart"></div>
                        <div><label class="wizLabel">End</label>
                            <input type="time" class="uiModalInput" id="scEnd"></div>
                     </div>
                     <label class="wizLabel">Notes (optional)</label>
                     <input class="uiModalInput" id="scNotes" placeholder="e.g. Metro patrol">`;

                const foot = document.createElement("div");
                foot.className = "uiModalFoot";

                const cancel = document.createElement("button");
                cancel.className = "ghostBtn";
                cancel.textContent = "Cancel";
                cancel.onclick = () => close(null);

                const save = document.createElement("button");
                save.className = "primaryBtn";
                save.textContent = "Schedule";
                save.onclick = async () => {
                    const d = wrap.querySelector("#scDate").value;
                    if (!d) { UI.error("Pick a date."); return; }
                    save.disabled = true;
                    const ok = await ShiftService.schedule({
                        officerId: wrap.querySelector("#scOff").value,
                        date: d,
                        startTime: wrap.querySelector("#scStart").value || null,
                        endTime: wrap.querySelector("#scEnd").value || null,
                        notes: wrap.querySelector("#scNotes").value.trim() || null
                    });
                    save.disabled = false;
                    if (ok) { close(null); this.renderCalendar(); }
                };

                foot.append(cancel, save);
                wrap.appendChild(foot);

                return wrap;

            }

        });

    }

};

document.addEventListener("DOMContentLoaded", () => ShiftsList.init());

window.ShiftsList = ShiftsList;
