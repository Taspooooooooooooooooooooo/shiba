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

    }

};

document.addEventListener("DOMContentLoaded", () => ShiftsList.init());

window.ShiftsList = ShiftsList;
