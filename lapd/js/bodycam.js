/* ==========================================================
   SHIBA PIMS
   Bodycam Dashboard (Phase 8 · Sprint 8.3) — the officer's own
   bodycam: the current recording (live), storage, integrity and
   every clip they've recorded. Start/stop happens on the duty
   widget or the Shift File; here you watch, upload and verify.
========================================================== */

const BodycamDash = {

    officer: null,
    shift: null,
    sessions: [],
    current: null,
    _timer: null,

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    async init() {

        if (!window.db) return;

        this.officer = await PermissionService.myOfficer();

        if (!this.officer) {
            document.getElementById("bcDashCurrent").innerHTML =
                "<p class='muted'>Bodycam tracking needs your account linked " +
                "to an officer.</p>";
            document.getElementById("bcDashList").innerHTML = "";
            return;
        }

        await this.reload();

    },

    async reload() {

        /* my active shift (for start/stop controls) */

        try {
            const r = await ShiftService.myActiveShift();
            this.shift = r.shift || null;
        } catch (e) { this.shift = null; }

        const { rows, error } =
            await BodycamService.forOfficer(this.officer.id, 100);

        if (error) {
            document.getElementById("bcDashCurrent").innerHTML =
                `<p class="muted">${this.esc(BodycamService.SETUP_HINT_75)}</p>`;
            document.getElementById("bcDashList").innerHTML = "";
            return;
        }

        this.sessions = rows;

        this.current = rows.find(s => s.status === "Recording") ||
            rows[0] || null;

        await this.renderCurrent();
        this.renderStats();
        this.renderList();

    },

    /* ----------------------------------------------------- */
    /* current session                                       */
    /* ----------------------------------------------------- */

    async renderCurrent() {

        clearInterval(this._timer);

        const box = document.getElementById("bcDashCurrent");

        const s = this.current;

        if (!s) {
            box.innerHTML =
                `<h2>${pimsIcon("surveillance", 18)} Current session</h2>
                 <p class="muted">No bodycam clips yet.` +
                (this.shift
                    ? " Start recording from your duty widget or Shift File."
                    : " Start a shift to record.") + `</p>`;
            return;
        }

        const recording = s.status === "Recording";

        const marks = await BodycamService.markers(s.id);
        const evCount = (marks.rows || []).filter(m => m.kind === "Evidence").length;
        const markCount = (marks.rows || []).length;

        const bat = BodycamService.battery(s);
        const batColor = bat > 50 ? "#22c55e" : bat > 20 ? "#eab308" : "#ef4444";

        const stat = (label, v, raw) =>
            `<div class="rvRow"><small>${label}</small>` +
            `<div>${raw ? v : this.esc(v)}</div></div>`;

        box.innerHTML =
            `<div class="bcDashHead">
                <div>
                    <h2 style="margin:0">${pimsIcon("surveillance", 18)}
                        Current session
                        <span class="grantKind">${this.esc(s.session_id || "")}</span>
                    </h2>
                    <small class="muted">started ${
                        new Date(s.started_at).toLocaleString()}</small>
                </div>
                <div class="bcDashRec ${recording ? "on" : ""}">
                    ${recording
                        ? `<span class="opsDot" style="background:#ef4444"></span>
                           REC <b class="bcLive" data-start="${
                            this.esc(s.started_at)}">00:00</b>`
                        : `<b>${BodycamService.hms(s.recorded_seconds)}</b>`}
                </div>
            </div>

            <div class="rvGrid" style="margin-top:14px">
                ${stat("Status", BodycamUI.statusBadge(s), true)}
                ${stat("Integrity", BodycamUI.integrityBadge(s), true)}
                ${stat("Duration", recording
                    ? `<span class="bcLive" data-start="${this.esc(s.started_at)}">00:00</span>`
                    : BodycamService.hms(s.recorded_seconds), true)}
                ${stat("Storage used",
                    BodycamService.fmtBytes(BodycamService.estimatedBytes(s)) +
                    (s.file_size ? "" : " (est.)"))}
                ${stat("Evidence markers", evCount + " of " + markCount)}
                ${stat("Battery", `<div class="batWrap"><div class="batBar">` +
                    `<i style="width:${bat}%;background:${batColor}"></i></div>` +
                    `<span>${bat}% <small>(sim)</small></span></div>`, true)}
            </div>

            <div class="bcDashActions" id="bcDashActions"></div>`;

        this.renderActions(s, recording);

        /* live timer */

        if (recording) {
            const tick = () => {
                const els = document.querySelectorAll(".bcLive[data-start]");
                if (!els.length || !document.body.contains(els[0])) {
                    clearInterval(this._timer); return;
                }
                els.forEach(el => el.textContent = BodycamService.hms(
                    Math.round((Date.now() -
                        new Date(el.dataset.start).getTime()) / 1000)));
            };
            tick();
            this._timer = setInterval(tick, 1000);
        }

    },

    renderActions(s, recording) {

        const box = document.getElementById("bcDashActions");

        box.innerHTML = "";

        const mine = this.officer && s.officer_id === this.officer.id;

        /* start recording — needs my active shift and no live clip */

        if (mine && this.shift && !this.sessions.some(x => x.status === "Recording")) {
            const start = document.createElement("button");
            start.className = "primaryBtn";
            start.innerHTML = pimsIcon("surveillance", 15) + " Start recording";
            start.onclick = async () => {
                start.disabled = true;
                const r = await BodycamService.startRecording(this.shift);
                if (r.ok) this.reload(); else start.disabled = false;
            };
            box.appendChild(start);
        }

        if (mine && recording) {
            const stop = document.createElement("button");
            stop.className = "dangerBtn";
            stop.innerHTML = pimsIcon("signout", 15) + " Stop recording";
            stop.onclick = async () => {
                stop.disabled = true;
                const r = await BodycamService.stopRecording(this.shift, s);
                if (r.ok) this.reload(); else stop.disabled = false;
            };
            box.appendChild(stop);
        }

        if (mine && !s.cloud_id && !recording) {
            const up = document.createElement("button");
            up.className = "ghostBtn";
            up.innerHTML = pimsIcon("cloud", 15) + " Upload footage";
            up.onclick = () => BodycamUI.uploadWizard(
                this.shift, s, () => this.reload());
            box.appendChild(up);
        }

        if (s.cloud_id) {
            const ver = document.createElement("button");
            ver.className = "ghostBtn";
            ver.innerHTML = pimsIcon("verified", 15) + " Verify integrity";
            ver.onclick = () => BodycamUI.verify(
                this.shift, s, () => this.reload());
            box.appendChild(ver);
        }

        if (s.shift_id) {
            const open = document.createElement("a");
            open.className = "ghostBtn";
            open.style.textDecoration = "none";
            open.href = "shift.html?id=" + s.shift_id;
            open.innerHTML = pimsIcon("cases", 15) + " Open shift file";
            box.appendChild(open);
        }

    },

    /* ----------------------------------------------------- */
    /* stats + list                                          */
    /* ----------------------------------------------------- */

    renderStats() {

        const rows = this.sessions;

        const totalSec = rows.reduce((a, s) =>
            a + BodycamService.sessionSeconds(s), 0);

        const bytes = rows.reduce((a, s) =>
            a + BodycamService.estimatedBytes(s), 0);

        const verified = rows.filter(s =>
            s.integrity_status === "Verified").length;

        const stat = (label, v, cls = "") =>
            `<div class="statChip ${cls}"><b>${v}</b><span>${label}</span></div>`;

        document.getElementById("bcDashStats").innerHTML =
            `<div class="caseStats">` +
            stat("Clips", rows.length) +
            stat("Recorded", BodycamService.hms(totalSec)) +
            stat("Storage", BodycamService.fmtBytes(bytes)) +
            stat("Verified", verified) +
            stat("Tampered", rows.filter(s => s.integrity_status === "Tampered").length,
                rows.some(s => s.integrity_status === "Tampered") ? "crit" : "") +
            `</div>`;

    },

    renderList() {

        const out = document.getElementById("bcDashList");

        const rows = this.sessions;

        out.innerHTML = "";

        if (!rows.length) {
            out.innerHTML = "<p class='muted'>No recording sessions yet.</p>";
            return;
        }

        const head = document.createElement("div");
        head.className = "evrHead bcListHead";
        head.innerHTML =
            "<span>Session</span><span>Status</span><span>Integrity</span>" +
            "<span>Duration</span><span>Size</span><span>Started</span>";
        out.appendChild(head);

        rows.forEach(s => {

            const row = document.createElement("div");
            row.className = "evrRow bcListRow";
            row.innerHTML =
                `<span class="exName">
                    <span class="exIcon">${pimsIcon("surveillance", 22)}</span>
                    <span class="exNameText"><b>${this.esc(s.session_id ||
                        "session")}</b></span>
                </span>` +
                `<span>${BodycamUI.statusBadge(s)}</span>` +
                `<span>${s.cloud_id ? BodycamUI.integrityBadge(s)
                    : "<i class='muted'>—</i>"}</span>` +
                `<span>${BodycamService.hms(s.recorded_seconds ||
                    BodycamService.sessionSeconds(s))}</span>` +
                `<span>${s.file_size
                    ? BodycamService.fmtBytes(s.file_size) : "—"}</span>` +
                `<span>${new Date(s.started_at).toLocaleDateString()}</span>`;

            if (s.shift_id) {
                row.onclick = () => location.href = "shift.html?id=" + s.shift_id;
            } else {
                row.style.cursor = "default";
            }

            out.appendChild(row);

        });

    }

};

document.addEventListener("DOMContentLoaded", () => BodycamDash.init());

window.BodycamDash = BodycamDash;
