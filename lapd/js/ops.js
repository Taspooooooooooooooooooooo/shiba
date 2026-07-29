/* ==========================================================
   SHIBA PIMS
   Live Operations Center (Phase 7 · Sprint 7.4) — a live
   command screen for Sergeant+: every officer on duty at a
   glance, updating in real time. Reads existing shift data;
   Supabase Realtime drives updates with a poll fallback.
========================================================== */

const Ops = {

    rows: [],

    _timer: null,

    _channel: null,

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    /* activity → dot colour */

    activityColor(s) {

        if (s.status === "Break") return "#f97316";

        if (s.current_case_id || s.activity === "Responding" ||
            s.activity === "Emergency") return "#ef4444";

        if (s.activity === "Report Writing" ||
            s.activity === "Administrative" ||
            s.activity === "Court") return "#3b82f6";

        return "#22c55e";

    },

    /* --------------------------------------------------------- */
    /* render                                                    */
    /* --------------------------------------------------------- */

    render() {

        const board = document.getElementById("opsBoard");

        const rows = this.rows;

        /* stats */

        const onBreak = rows.filter(s => s.status === "Break").length;

        const onIncident = rows.filter(s => s.current_case_id).length;

        const overtime = rows.filter(s =>
            (Date.now() - new Date(s.started_at).getTime()) / 3600000 >
            ShiftService.OVERTIME_HOURS).length;

        const stat = (label, n, cls = "") =>
            `<div class="statChip ${cls}"><b>${n}</b><span>${label}</span></div>`;

        document.getElementById("opsStats").innerHTML =
            stat("On duty", rows.length) +
            stat("On break", onBreak) +
            stat("On incident", onIncident, onIncident ? "crit" : "") +
            stat("Overtime", overtime, overtime ? "crit" : "");

        document.getElementById("opsSub").textContent =
            rows.length + (rows.length === 1 ? " officer" : " officers") +
            " on duty · updated " + new Date().toLocaleTimeString();

        if (!rows.length) {

            board.innerHTML = "<p class='muted'>No officers are on duty.</p>";

            return;

        }

        const head = document.createElement("div");
        head.className = "opsHeadRow";
        head.innerHTML =
            "<span>Officer</span><span>Status</span><span>Vehicle</span>" +
            "<span>Incident</span><span>Bodycam</span><span>On duty</span>";

        board.innerHTML = "";
        board.appendChild(head);

        rows.forEach(s => {

            const durMs = Date.now() - new Date(s.started_at).getTime();

            const breakMin = ShiftService.breakMinutesNow(s);

            const overrun = breakMin >= ShiftService.BREAK_LIMIT_MIN;

            const ot = durMs / 3600000 > ShiftService.OVERTIME_HOURS;

            const row = document.createElement("div");
            row.className = "opsRow";

            row.innerHTML =
                `<span class="opsOfficer">
                    <span class="dotChip"><i style="background:${
                        this.activityColor(s)}"></i></span>
                    <span>
                        <b>${this.esc((s.officers?.officer_id) || "—")}</b>
                        <small>${this.esc(s.shift_id)}</small>
                    </span>
                 </span>` +
                `<span>${this.esc(s.status === "Break"
                    ? "Break" + (breakMin ? " · " + breakMin + "m" : "")
                    : s.activity || "—")}${overrun
                        ? ` <span class="opsFlag">!</span>` : ""}</span>` +
                `<span>${this.esc(s.vehicle_unit || "—")}</span>` +
                `<span>${s.cases
                    ? this.esc(s.cases.case_id) : "—"}</span>` +
                `<span>${s.bodycam_ready
                    ? '<span class="dotChip"><i style="background:#22c55e"></i>on</span>'
                    : "off"}</span>` +
                `<span class="opsTime" data-start="${s.started_at}">${
                    ShiftService.fmtDuration(durMs)}${
                    ot ? ` <span class="opsFlag">OT</span>` : ""}</span>`;

            row.onclick = () => this.detail(s);

            board.appendChild(row);

        });

    },

    /* live per-second re-tick of the on-duty timers (cheap: just
       the time column, no re-fetch) */

    retimeOnly() {

        document.querySelectorAll(".opsTime[data-start]").forEach(el => {

            const ms = Date.now() - new Date(el.dataset.start).getTime();

            const ot = ms / 3600000 > ShiftService.OVERTIME_HOURS;

            el.innerHTML = ShiftService.fmtDuration(ms) +
                (ot ? ` <span class="opsFlag">OT</span>` : "");

        });

    },

    /* --------------------------------------------------------- */
    /* detail drawer                                             */
    /* --------------------------------------------------------- */

    detail(s) {

        const sum = ShiftService.summary(s);

        UI.modal({

            title: (s.officers?.officer_id || "") + " · " + s.shift_id,

            render: () => {

                const wrap = document.createElement("div");

                const line = (k, v, raw) =>
                    `<div class="rvRow"><small>${k}</small><div>${
                        raw ? (v || "—") : this.esc(v || "—")}</div></div>`;

                wrap.innerHTML =
                    `<div class="rvGrid">
                        ${line("Officer", s.officer_label)}
                        ${line("Status", s.status)}
                        ${line("Activity", s.activity)}
                        ${line("On duty", ShiftService.fmtDuration(
                            Date.now() - new Date(s.started_at).getTime()))}
                        ${line("Break so far", ShiftService.hm(sum.breakSec))}
                        ${line("Vehicle", s.vehicle_unit
                            ? s.vehicle_unit + " · " + (s.vehicle_type || "") : "None")}
                        ${line("Callsign", s.callsign)}
                        ${line("Radio", (s.primary_channel || "—") +
                            (s.secondary_channel ? " / " + s.secondary_channel : ""))}
                        ${line("Bodycam", s.bodycam_ready
                            ? (s.bodycam_session_id || "on") : "off")}
                        ${line("Incident", s.cases
                            ? s.cases.case_id + " · " + (s.cases.title || "") : "None")}
                    </div>`;

                return wrap;

            },

            buttons: [
                { label: "Close", kind: "ghost", value: null },
                { label: "Shift file", kind: "ghost", value: "shift" },
                ...(s.current_case_id
                    ? [{ label: "Open case", kind: "primary", value: "case" }]
                    : [{ label: "Personnel", kind: "primary", value: "officer" }])
            ]

        }).then(choice => {

            if (choice === "shift")
                location.href = "shift.html?id=" + encodeURIComponent(s.id);
            else if (choice === "case")
                location.href = "case.html?id=" + encodeURIComponent(s.current_case_id);
            else if (choice === "officer")
                location.href = "personnel.html?id=" + encodeURIComponent(s.officer_id);

        });

    },

    /* --------------------------------------------------------- */
    /* data + realtime                                           */
    /* --------------------------------------------------------- */

    async refresh() {

        const { rows, error } = await ShiftService.activeShifts();

        if (error) {

            document.getElementById("opsBoard").innerHTML =
                `<p class="muted">${ShiftService.SETUP_HINT}</p>`;

            return;

        }

        this.rows = rows;

        this.render();

    },

    subscribeRealtime() {

        try {

            this._channel = db
                .channel("ops-shifts")
                .on("postgres_changes",
                    { event: "*", schema: "public", table: "shifts" },
                    () => this.refresh())
                .subscribe();

        } catch (e) { /* realtime not available — poll covers it */ }

    },

    /* --------------------------------------------------------- */
    /* init                                                      */
    /* --------------------------------------------------------- */

    async init() {

        if (!window.db) return;

        const board = document.getElementById("opsBoard");

        /* Sergeant+ only */

        if (!(await ShiftService.roleAtLeast("Sergeant"))) {

            document.getElementById("opsStats").innerHTML = "";

            document.getElementById("opsLive").style.display = "none";

            board.innerHTML =
                "<p class='muted'>The Live Operations Center is for " +
                "Sergeant and above.</p>";

            return;

        }

        await this.refresh();

        this.subscribeRealtime();

        /* poll fallback (in case realtime isn't enabled on the table)
           + keeps the on-duty timers moving */

        this._timer = setInterval(() => {

            this.retimeOnly();

            /* full refetch every ~15s */

            if (!this._pollN) this._pollN = 0;

            if (++this._pollN % 15 === 0) this.refresh();

        }, 1000);

    }

};

document.addEventListener("DOMContentLoaded", () => Ops.init());

window.addEventListener("beforeunload", () => {
    if (Ops._channel) { try { db.removeChannel(Ops._channel); } catch (e) {} }
});

window.Ops = Ops;
