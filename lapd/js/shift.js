/* ==========================================================
   SHIBA PIMS
   Duty / Shift UI (Phase 7 · Sprint 7.1a) — lives on the
   dashboard: the big START SHIFT button, the 6-step start
   wizard, and the live duty widget (per-second timer, status
   engine, break system). The full End Shift wizard + history
   arrive in Sprint 7.1b.
========================================================== */

const ShiftUI = {

    officer: null,

    shift: null,

    rankName: null,

    _timer: null,

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    /* --------------------------------------------------------- */
    /* render the duty card                                      */
    /* --------------------------------------------------------- */

    async render() {

        const area = document.getElementById("shiftArea");

        if (!area) return;

        clearInterval(this._timer);

        const { officer, shift, error } =
            await ShiftService.myActiveShift();

        this.officer = officer;

        this.shift = shift;

        if (!officer) {

            area.innerHTML =
                "<p class='muted'>Duty tracking needs your account linked " +
                "to an officer.</p>";

            return;

        }

        if (error) {

            area.innerHTML =
                `<p class="muted">${ShiftService.SETUP_HINT}</p>`;

            return;

        }

        if (!shift) {

            area.innerHTML = `
                <div class="shiftOff">
                    <div>
                        <h2>${pimsIcon("shifts", 20)} Duty</h2>
                        <p class="muted">You are <b>off duty</b>. Start a
                           shift to go on the clock — vehicle, radio,
                           equipment and bodycam are logged with it.</p>
                    </div>
                    <button class="shiftStartBtn" id="shiftStart">
                        ${pimsIcon("shifts", 20)} START SHIFT</button>
                </div>`;

            document.getElementById("shiftStart").onclick =
                () => this.openWizard();

            return;

        }

        this.renderActive(area);

    },

    /* --------------------------------------------------------- */
    /* the live duty widget                                      */
    /* --------------------------------------------------------- */

    renderActive(area) {

        const s = this.shift;

        const onBreak = s.status === "Break";

        area.innerHTML = `
            <div class="shiftHead">
                <div>
                    <h2>${pimsIcon("shifts", 20)} On Duty
                        <span class="grantKind">${this.esc(s.shift_id || "")}</span>
                        <span class="dotChip"><i style="background:${
                            onBreak ? "#f97316" : "#22c55e"}"></i>${
                            onBreak ? "On break" : "Active"}</span>
                    </h2>
                    <small class="muted">since ${
                        new Date(s.started_at).toLocaleTimeString()}</small>
                </div>
                <div class="shiftTimer" id="shiftTimer">00:00:00</div>
            </div>

            <div class="shiftMeta">
                <div><small>Vehicle</small><b>${this.esc(
                    s.vehicle_unit
                        ? s.vehicle_unit + " · " + (s.vehicle_type || "")
                        : "No vehicle")}</b></div>
                <div><small>Callsign</small><b>${this.esc(s.callsign || "—")}</b></div>
                <div><small>Radio</small><b>${this.esc(
                    (s.primary_channel || "—") +
                    (s.secondary_channel ? " / " + s.secondary_channel : ""))}</b></div>
                <div><small>Bodycam</small><b>${s.bodycam_ready
                    ? this.esc(s.bodycam_session_id || "Ready")
                    : "Off"}</b></div>
                <div><small>Activity</small><b id="shiftActivityNow">${
                    this.esc(s.activity || "—")}</b></div>
                <div><small>Break total</small><b id="shiftBreakTotal">${
                    Math.round((s.break_seconds || 0) / 60)} min</b></div>
            </div>

            <div class="shiftControls" id="shiftControls"></div>`;

        /* controls */

        const box = document.getElementById("shiftControls");

        if (!onBreak) {

            const sel = document.createElement("select");
            sel.className = "uiModalInput";
            sel.title = "Change activity";
            sel.innerHTML = ShiftService.ACTIVITIES.map(a =>
                `<option ${a === s.activity ? "selected" : ""}>${a}</option>`)
                .join("");
            sel.onchange = async () => {
                if (await ShiftService.setActivity(s, sel.value))
                    this.render();
                else sel.value = s.activity;
            };
            box.appendChild(sel);

            const br = document.createElement("button");
            br.className = "ghostBtn";
            br.innerHTML = pimsIcon("history", 15) + " Start break";
            br.onclick = () => this.pickBreak();
            box.appendChild(br);

        } else {

            const back = document.createElement("button");
            back.className = "primaryBtn";
            back.innerHTML = pimsIcon("sync", 15) + " Return from break";
            back.onclick = async () => {
                if (await ShiftService.endBreak(s)) this.render();
            };
            box.appendChild(back);

        }

        const end = document.createElement("button");
        end.className = "dangerBtn";
        end.innerHTML = pimsIcon("signout", 15) + " End shift";
        end.onclick = () => this.endShift();
        box.appendChild(end);

        /* the live per-second timer */

        const timerEl = document.getElementById("shiftTimer");

        const tick = () => {

            if (!timerEl.isConnected) { clearInterval(this._timer); return; }

            timerEl.textContent = ShiftService.fmtDuration(
                Date.now() - new Date(s.started_at).getTime());

            if (onBreak && s.break_started_at) {

                const bt = ShiftService.fmtDuration(
                    Date.now() - new Date(s.break_started_at).getTime());

                document.getElementById("shiftBreakTotal").textContent =
                    (s.break_type || "break") + " · " + bt;

            }

        };

        tick();

        this._timer = setInterval(tick, 1000);

    },

    /* --------------------------------------------------------- */
    /* break picker                                              */
    /* --------------------------------------------------------- */

    async pickBreak() {

        const choice = await UI.modal({

            title: "Start a break",

            render: () => {
                const p = document.createElement("p");
                p.className = "uiModalMsg";
                p.textContent = "The break timer runs until you return — " +
                    "supervisors see break time on the shift.";
                return p;
            },

            buttons: [
                { label: "Cancel", kind: "ghost", value: null },
                ...ShiftService.BREAK_TYPES.map(t =>
                    ({ label: t, kind: "primary", value: t }))
            ]

        });

        if (!choice) return;

        if (await ShiftService.startBreak(this.shift, choice)) this.render();

    },

    /* --------------------------------------------------------- */
    /* the 5-step END SHIFT wizard                               */
    /* --------------------------------------------------------- */

    END_STEPS: ["Summary", "Bodycam", "Vehicle", "Comments", "Finish"],

    ewiz: null,

    endShift() {

        const s = this.shift;

        this.ewiz = {
            step: 0,
            data: {
                bodycamUploaded: !!s.bodycam_ready,
                vehicleReturned: !!s.vehicle_unit,
                comments: ""
            }
        };

        const overlay = document.createElement("div");
        overlay.className = "uiModalBack";
        overlay.innerHTML =
            `<div class="uiModal caseWizard">
                <div class="uiModalHead" id="ewHead"></div>
                <div class="wizSteps" id="ewDots"></div>
                <div class="uiModalBody" id="ewBody"></div>
                <div class="uiModalFoot" id="ewFoot"></div>
             </div>`;

        overlay.onclick = e => { if (e.target === overlay) this.closeEnd(); };

        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.classList.add("show"));

        this.ewiz.overlay = overlay;

        this.renderEndStep();

    },

    closeEnd() {

        const o = this.ewiz?.overlay;

        if (!o) return;

        o.classList.remove("show");

        setTimeout(() => o.remove(), 160);

        this.ewiz = null;

    },

    renderEndStep() {

        const i = this.ewiz.step;

        document.getElementById("ewHead").textContent =
            "End Shift — Step " + (i + 1) + " of 5: " + this.END_STEPS[i];

        document.getElementById("ewDots").innerHTML =
            this.END_STEPS.map((n, k) =>
                `<span class="wizDot ${k === i ? "on" : ""}` +
                `${k < i ? " done" : ""}">${k + 1}</span>`).join("");

        const body = document.getElementById("ewBody");

        if (i === 0) this.endSummary(body);
        else if (i === 1) this.endBodycam(body);
        else if (i === 2) this.endVehicle(body);
        else if (i === 3) this.endComments(body);
        else this.endFinish(body);

        const foot = document.getElementById("ewFoot");
        foot.innerHTML = "";

        const cancel = document.createElement("button");
        cancel.className = "ghostBtn";
        cancel.textContent = "Cancel";
        cancel.onclick = () => this.closeEnd();
        foot.appendChild(cancel);

        if (i > 0) {
            const back = document.createElement("button");
            back.className = "ghostBtn";
            back.textContent = "← Back";
            back.onclick = () => {
                this.collectEnd(); this.ewiz.step--; this.renderEndStep();
            };
            foot.appendChild(back);
        }

        if (i < 4) {
            const next = document.createElement("button");
            next.className = "primaryBtn";
            next.textContent = "Next →";
            next.onclick = () => {
                this.collectEnd(); this.ewiz.step++; this.renderEndStep();
            };
            foot.appendChild(next);
        } else {
            const go = document.createElement("button");
            go.className = "dangerBtn";
            go.innerHTML = pimsIcon("signout", 16) + " Close shift";
            go.onclick = () => this.submitEnd(go);
            foot.appendChild(go);
        }

    },

    endSummary(body) {

        const sum = ShiftService.summary(this.shift);

        const s = this.shift;

        const line = (k, v) =>
            `<div class="rvRow"><small>${k}</small><div>${this.esc(v)}</div></div>`;

        body.innerHTML =
            `<p class="uiModalMsg">Here's your shift at a glance.</p>
            <div class="rvGrid">
                ${line("Shift", s.shift_id)}
                ${line("Total time", ShiftService.hm(sum.durationSec))}
                ${line("Active time", ShiftService.hm(sum.activeSec))}
                ${line("Break time", ShiftService.hm(sum.breakSec))}
                ${line("Vehicle", s.vehicle_unit
                    ? s.vehicle_unit + " · " + (s.vehicle_type || "") : "None")}
                ${line("Bodycam", s.bodycam_session_id || "Off")}
            </div>` +
            (sum.overtime
                ? `<p class="uiModalMsg" style="color:#e08a5a;margin-top:10px">
                     ${pimsIcon("alerts", 14)} Over 8 hours — this shift is
                     flagged as overtime.</p>` : "");

    },

    yesNo(name, val, yesLabel, noLabel) {

        return `<div class="equipGrid">
            <label class="equipItem">
                <input type="radio" name="${name}" value="yes" ${val ? "checked" : ""}>
                <span>${yesLabel}</span>
            </label>
            <label class="equipItem">
                <input type="radio" name="${name}" value="no" ${val ? "" : "checked"}>
                <span>${noLabel}</span>
            </label>
        </div>`;

    },

    endBodycam(body) {

        const s = this.shift;

        if (!s.bodycam_ready) {

            body.innerHTML =
                `<p class="uiModalMsg">No bodycam was active on this shift —
                    nothing to upload.</p>`;

            this.ewiz.data.bodycamUploaded = false;

            return;

        }

        body.innerHTML =
            `<p class="uiModalMsg">Bodycam session
                <b>${this.esc(s.bodycam_session_id || "")}</b> — has the
                footage been uploaded? (Full bodycam handling arrives in a
                later sprint.)</p>` +
            this.yesNo("ewBodycam", this.ewiz.data.bodycamUploaded,
                "YES — uploaded", "NO — not yet");

    },

    endVehicle(body) {

        const s = this.shift;

        if (!s.vehicle_unit) {

            body.innerHTML =
                `<p class="uiModalMsg">No vehicle was assigned on this
                    shift.</p>`;

            this.ewiz.data.vehicleReturned = true;

            return;

        }

        body.innerHTML =
            `<p class="uiModalMsg">Vehicle <b>${this.esc(s.vehicle_unit)}</b>
                — has it been returned / handed off?</p>` +
            this.yesNo("ewVehicle", this.ewiz.data.vehicleReturned,
                "YES — returned", "NO");

    },

    endComments(body) {

        body.innerHTML =
            `<label class="wizLabel">Shift summary / comments (optional)</label>
             <textarea id="ewComments" class="uiModalInput" rows="5"
                placeholder="Anything worth noting — incidents, vehicle issues, handover…">${
                this.esc(this.ewiz.data.comments || "")}</textarea>`;

    },

    endFinish(body) {

        const d = this.ewiz.data;

        const s = this.shift;

        const line = (k, v) =>
            `<div class="rvRow"><small>${k}</small><div>${this.esc(v)}</div></div>`;

        body.innerHTML =
            `<p class="uiModalMsg">Closing <b>${this.esc(s.shift_id)}</b> —
                this returns you to <b>Off Duty</b>.</p>
            <div class="rvGrid">
                ${s.bodycam_ready
                    ? line("Bodycam uploaded", d.bodycamUploaded ? "Yes" : "No") : ""}
                ${s.vehicle_unit
                    ? line("Vehicle returned", d.vehicleReturned ? "Yes" : "No") : ""}
                ${line("Comment", d.comments ? "Added" : "None")}
            </div>`;

    },

    collectEnd() {

        const d = this.ewiz.data;

        const bc = document.querySelector("input[name=ewBodycam]:checked");

        if (bc) d.bodycamUploaded = bc.value === "yes";

        const vh = document.querySelector("input[name=ewVehicle]:checked");

        if (vh) d.vehicleReturned = vh.value === "yes";

        const c = document.getElementById("ewComments");

        if (c) d.comments = c.value.trim();

    },

    async submitEnd(btn) {

        this.collectEnd();

        btn.disabled = true;

        const ok = await ShiftService.end(this.shift, {
            comments: this.ewiz.data.comments || null,
            bodycamUploaded: this.ewiz.data.bodycamUploaded,
            vehicleReturned: this.ewiz.data.vehicleReturned
        });

        btn.disabled = false;

        if (ok) { this.closeEnd(); this.render(); }

    },

    /* --------------------------------------------------------- */
    /* the 6-step START SHIFT wizard                             */
    /* --------------------------------------------------------- */

    STEPS: ["Officer", "Vehicle", "Radio", "Equipment",
            "Bodycam", "Start"],

    wiz: null,

    async openWizard() {

        /* rank name for the verification step */

        if (!this.rankName && this.officer?.rank_id) {

            try {

                const { data } = await db.from("ranks")
                    .select("name").eq("id", this.officer.rank_id)
                    .maybeSingle();

                this.rankName = data?.name || null;

            } catch (e) { /* optional */ }

        }

        this.wiz = {
            step: 0,
            data: {
                vehicleType: "Patrol Car",
                equipment: Object.fromEntries(
                    ShiftService.EQUIPMENT.map(k => [k, true])),
                bodycamReady: true
            }
        };

        const overlay = document.createElement("div");
        overlay.className = "uiModalBack";
        overlay.innerHTML =
            `<div class="uiModal caseWizard">
                <div class="uiModalHead" id="swHead"></div>
                <div class="wizSteps" id="swDots"></div>
                <div class="uiModalBody" id="swBody"></div>
                <div class="uiModalFoot" id="swFoot"></div>
             </div>`;

        overlay.onclick = e => {
            if (e.target === overlay) this.closeWizard();
        };

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

        const i = this.wiz.step;

        document.getElementById("swHead").textContent =
            "Start Shift — Step " + (i + 1) + " of 6: " + this.STEPS[i];

        document.getElementById("swDots").innerHTML =
            this.STEPS.map((n, k) =>
                `<span class="wizDot ${k === i ? "on" : ""}` +
                `${k < i ? " done" : ""}">${k + 1}</span>`).join("");

        const body = document.getElementById("swBody");

        if (i === 0) this.stepOfficer(body);
        else if (i === 1) this.stepVehicle(body);
        else if (i === 2) this.stepRadio(body);
        else if (i === 3) this.stepEquipment(body);
        else if (i === 4) this.stepBodycam(body);
        else this.stepStart(body);

        /* footer */

        const foot = document.getElementById("swFoot");
        foot.innerHTML = "";

        const cancel = document.createElement("button");
        cancel.className = "ghostBtn";
        cancel.textContent = "Cancel";
        cancel.onclick = () => this.closeWizard();
        foot.appendChild(cancel);

        if (i > 0) {
            const back = document.createElement("button");
            back.className = "ghostBtn";
            back.textContent = "← Back";
            back.onclick = () => {
                this.collect(); this.wiz.step--; this.renderStep();
            };
            foot.appendChild(back);
        }

        if (i < 5) {
            const next = document.createElement("button");
            next.className = "primaryBtn";
            next.textContent = "Next →";
            next.onclick = () => {
                this.collect(); this.wiz.step++; this.renderStep();
            };
            foot.appendChild(next);
        } else {
            const go = document.createElement("button");
            go.className = "shiftStartBtn";
            go.innerHTML = pimsIcon("shifts", 17) + " START SHIFT";
            go.onclick = () => this.submit(go);
            foot.appendChild(go);
        }

    },

    stepOfficer(body) {

        const o = this.officer;

        const line = (k, v) =>
            `<div class="rvRow"><small>${k}</small>` +
            `<div>${this.esc(v || "—")}</div></div>`;

        body.innerHTML =
            `<p class="uiModalMsg">Confirm this is you — the shift is
                logged on this officer.</p>
            <div class="rvGrid">
                ${line("Officer", (o.first_name + " " + o.last_name).trim())}
                ${line("Officer ID", o.officer_id)}
                ${line("Badge", o.badge_number)}
                ${line("Rank", this.rankName)}
                ${line("Division", o.divisions?.name)}
                ${line("Roster status", o.status)}
            </div>`;

    },

    stepVehicle(body) {

        const d = this.wiz.data;

        body.innerHTML =
            `<label class="wizLabel">Vehicle type</label>
             <select id="swVehType" class="uiModalInput">${
                ShiftService.VEHICLE_TYPES.map(t =>
                    `<option ${t === d.vehicleType ? "selected" : ""}>${t}</option>`
                ).join("")}</select>
             <label class="wizLabel">Unit</label>
             <input id="swVehUnit" class="uiModalInput"
                    placeholder="e.g. 1A23"
                    value="${this.esc(d.vehicleUnit || "")}">`;

        const type = document.getElementById("swVehType");

        const unit = document.getElementById("swVehUnit");

        const sync = () => {
            unit.disabled = type.value === "No Vehicle";
            if (unit.disabled) unit.value = "";
        };

        type.onchange = sync;

        sync();

    },

    stepRadio(body) {

        const d = this.wiz.data;

        const chan = (id, sel, optional) =>
            `<select id="${id}" class="uiModalInput">` +
            (optional ? `<option value="">— none —</option>` : "") +
            ShiftService.CHANNELS.map(c =>
                `<option ${c === sel ? "selected" : ""}>${c}</option>`
            ).join("") + `</select>`;

        body.innerHTML =
            `<label class="wizLabel">Callsign</label>
             <input id="swCallsign" class="uiModalInput"
                    placeholder="defaults to your unit"
                    value="${this.esc(d.callsign || d.vehicleUnit || "")}">
             <div class="wizGrid">
                <div><label class="wizLabel">Primary channel</label>
                    ${chan("swChan1", d.primaryChannel || "Dispatch")}</div>
                <div><label class="wizLabel">Secondary channel</label>
                    ${chan("swChan2", d.secondaryChannel || "", true)}</div>
             </div>`;

    },

    stepEquipment(body) {

        const d = this.wiz.data;

        body.innerHTML =
            `<p class="uiModalMsg">Confirm your equipment. You can start
                with items missing — the shift records it and supervisors
                see it.</p>
             <div class="equipGrid">${
                ShiftService.EQUIPMENT.map(k => `
                    <label class="equipItem">
                        <input type="checkbox" data-eq="${k}"
                               ${d.equipment[k] ? "checked" : ""}>
                        <span>${k}</span>
                    </label>`).join("")}</div>`;

    },

    stepBodycam(body) {

        const d = this.wiz.data;

        body.innerHTML =
            `<p class="uiModalMsg">Is your bodycam ready? A bodycam
                session id is issued with the shift.</p>
             <div class="equipGrid">
                <label class="equipItem">
                    <input type="radio" name="swBodycam" value="yes"
                           ${d.bodycamReady ? "checked" : ""}>
                    <span>YES — bodycam ready</span>
                </label>
                <label class="equipItem">
                    <input type="radio" name="swBodycam" value="no"
                           ${d.bodycamReady ? "" : "checked"}>
                    <span>NO</span>
                </label>
             </div>`;

    },

    stepStart(body) {

        const d = this.wiz.data;

        const missing = ShiftService.EQUIPMENT
            .filter(k => d.equipment[k] === false);

        const line = (k, v) =>
            `<div class="rvRow"><small>${k}</small>` +
            `<div>${this.esc(v || "—")}</div></div>`;

        body.innerHTML =
            `<div class="rvGrid">
                ${line("Officer", this.officer.officer_id)}
                ${line("Vehicle", d.vehicleType === "No Vehicle"
                    ? "No vehicle"
                    : (d.vehicleUnit || "—") + " · " + d.vehicleType)}
                ${line("Callsign", d.callsign || d.vehicleUnit)}
                ${line("Radio", (d.primaryChannel || "—") +
                    (d.secondaryChannel ? " / " + d.secondaryChannel : ""))}
                ${line("Bodycam", d.bodycamReady ? "Ready" : "No")}
                ${line("Equipment", missing.length
                    ? "Missing: " + missing.join(", ")
                    : "Complete")}
            </div>` +
            (missing.length
                ? `<p class="uiModalMsg" style="color:#e08a5a;margin-top:10px">
                     Missing equipment is recorded on the shift and
                     visible to supervisors.</p>`
                : "");

    },

    collect() {

        const d = this.wiz.data;
        const g = id => document.getElementById(id);

        if (g("swVehType")) {
            d.vehicleType = g("swVehType").value;
            d.vehicleUnit = g("swVehUnit").value.trim();
        }

        if (g("swCallsign")) {
            d.callsign = g("swCallsign").value.trim();
            d.primaryChannel = g("swChan1").value;
            d.secondaryChannel = g("swChan2").value || null;
        }

        document.querySelectorAll("[data-eq]").forEach(cb => {
            d.equipment[cb.dataset.eq] = cb.checked;
        });

        const bc = document.querySelector(
            "input[name=swBodycam]:checked");

        if (bc) d.bodycamReady = bc.value === "yes";

    },

    async submit(btn) {

        this.collect();

        const d = this.wiz.data;

        btn.disabled = true;

        const result = await ShiftService.start(this.officer, {
            vehicleUnit: d.vehicleType === "No Vehicle"
                ? null : (d.vehicleUnit || null),
            vehicleType: d.vehicleType === "No Vehicle"
                ? null : d.vehicleType,
            callsign: d.callsign || null,
            primaryChannel: d.primaryChannel || null,
            secondaryChannel: d.secondaryChannel || null,
            equipment: d.equipment,
            bodycamReady: d.bodycamReady
        });

        btn.disabled = false;

        if (result.ok) {

            this.closeWizard();

            this.render();

        }

    },

    /* --------------------------------------------------------- */

    init() {

        if (!document.getElementById("shiftArea")) return;

        if (!window.db) return;

        this.render();

    }

};

document.addEventListener("DOMContentLoaded", () => ShiftUI.init());

window.ShiftUI = ShiftUI;
