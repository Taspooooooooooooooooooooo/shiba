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
        else if (this.tab === "bodycam") await this.viewBodycam(body);
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

    /* the live Bodycam module (Sprint 7.5) — recording sessions,
       markers (bookmark / evidence / incident) and footage upload.
       An Evidence marker dropped while responding to a case becomes
       real case_evidence automatically. */

    async viewBodycam(body) {

        clearInterval(this._bcTimer);

        body.innerHTML = "";

        const s = this.shift;

        const canEdit = this.isMine && !s.ended_at;

        const { summary, sessions, error } =
            await BodycamService.shiftSummary(this.id);

        /* ---- summary + controls ---- */

        const top = this.card("Bodycam",
            "Recording clips, markers and evidence for this shift.");

        if (error) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = BodycamService.SETUP_HINT_75;
            top.appendChild(p);
            body.appendChild(top);
            return;

        }

        const live = sessions.find(x => x.status === "Recording") || null;

        const stat = (label, v, cls = "") =>
            `<div class="statChip ${cls}"><b>${v}</b><span>${label}</span></div>`;

        const stats = document.createElement("div");
        stats.className = "caseStats";
        stats.innerHTML =
            stat("Sessions", summary.sessions) +
            stat("Recorded", BodycamService.hms(summary.totalSec)) +
            stat("Uploaded", summary.uploaded) +
            stat("Markers", summary.markers) +
            stat("Evidence", summary.evidence, summary.evidence ? "crit" : "");
        top.appendChild(stats);

        if (canEdit) {

            top.appendChild(this.bcControls(live));

        } else {

            const p = document.createElement("p");
            p.className = "muted";
            p.style.marginTop = "10px";
            p.textContent = live
                ? "This officer's bodycam is recording."
                : "Only the officer on this shift can control the bodycam.";
            top.appendChild(p);

        }

        body.appendChild(top);

        /* ---- sessions + their markers ---- */

        const list = this.card("Recording sessions", null);

        if (!sessions.length) {

            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = "No recording sessions yet." +
                (canEdit ? " Start recording above." : "");
            list.appendChild(p);

        } else {

            for (const sess of sessions) {

                list.appendChild(await this.bcSessionBlock(sess, canEdit));

            }

        }

        body.appendChild(list);

        /* live per-second timers for any recording session */

        this._bcTimer = setInterval(() => {

            const marks = document.querySelectorAll(".bcLive[data-start]");

            if (!marks.length) return;

            if (!document.body.contains(marks[0])) {
                clearInterval(this._bcTimer); return;
            }

            marks.forEach(el => {
                el.textContent = BodycamService.hms(
                    Math.round((Date.now() -
                        new Date(el.dataset.start).getTime()) / 1000));
            });

        }, 1000);

    },

    /* the recording control strip */

    bcControls(live) {

        const wrap = document.createElement("div");
        wrap.className = "bcControls";

        if (!live) {

            const start = document.createElement("button");
            start.className = "shiftStartBtn";
            start.innerHTML = pimsIcon("surveillance", 16) +
                " Start recording";
            start.onclick = async () => {
                start.disabled = true;
                const r = await BodycamService.startRecording(this.shift);
                if (r.ok) this.renderBody(); else start.disabled = false;
            };
            wrap.appendChild(start);

            const hint = document.createElement("p");
            hint.className = "muted";
            hint.style.cssText = "flex-basis:100%;margin:6px 0 0";
            hint.textContent = "Start a clip, then drop markers. An " +
                "evidence marker while you're on an incident is logged " +
                "to that case automatically.";
            wrap.appendChild(hint);

            return wrap;

        }

        /* recording: live badge + marker composer + stop */

        const badge = document.createElement("div");
        badge.className = "bcRecBadge";
        badge.innerHTML =
            `<span class="opsDot" style="background:#ef4444"></span>REC · ` +
            `<b class="bcLive" data-start="${this.esc(live.started_at)}">` +
            `00:00</b> · ${this.esc(live.session_id || "")}`;
        wrap.appendChild(badge);

        const kind = document.createElement("select");
        kind.className = "uiModalInput";
        kind.style.maxWidth = "150px";
        kind.innerHTML = BodycamService.MARKER_KINDS.map(k =>
            `<option value="${k}">${k}</option>`).join("");
        wrap.appendChild(kind);

        const label = document.createElement("input");
        label.className = "uiModalInput";
        label.placeholder = "Marker label (optional)";
        label.style.flex = "1";
        wrap.appendChild(label);

        const mark = document.createElement("button");
        mark.className = "primaryBtn";
        mark.innerHTML = pimsIcon("tags", 15) + " Add marker";
        mark.onclick = async () => {
            mark.disabled = true;
            const r = await BodycamService.addMarker(this.shift, live, {
                kind: kind.value, label: label.value });
            mark.disabled = false;
            if (r.ok) { label.value = ""; this.renderBody(); }
        };
        wrap.appendChild(mark);

        const stop = document.createElement("button");
        stop.className = "dangerBtn";
        stop.innerHTML = pimsIcon("signout", 15) + " Stop recording";
        stop.onclick = async () => {
            stop.disabled = true;
            const r = await BodycamService.stopRecording(this.shift, live);
            if (r.ok) this.renderBody(); else stop.disabled = false;
        };
        wrap.appendChild(stop);

        if (this.shift.current_case_id) {

            const inc = document.createElement("p");
            inc.className = "muted";
            inc.style.cssText = "flex-basis:100%;margin:4px 0 0;color:#a855f7";
            inc.innerHTML = pimsIcon("warrants", 13) +
                " On an incident — evidence markers link to the case.";
            wrap.appendChild(inc);

        }

        return wrap;

    },

    /* one session with its markers */

    async bcSessionBlock(sess, canEdit) {

        const block = document.createElement("div");
        block.className = "bcSession";

        const recording = sess.status === "Recording";

        const dot = BodycamService.STATUS_COLORS[sess.status] || "#6b7280";

        const dur = recording
            ? `<b class="bcLive" data-start="${this.esc(sess.started_at)}">` +
              `00:00</b>`
            : BodycamService.hms(sess.recorded_seconds);

        const head = document.createElement("div");
        head.className = "bcSessionHead";
        head.innerHTML =
            `<span class="exName">
                <span class="exIcon">${pimsIcon("surveillance", 18)}</span>
                <span class="exNameText">
                    <b>${this.esc(sess.session_id || "session")}</b>
                    <small>
                        <span class="dotChip"><i style="background:${dot}"></i>${
                            this.esc(sess.status)}</span> ·
                        ${new Date(sess.started_at).toLocaleTimeString()}
                    </small>
                </span>
            </span>
            <span class="bcSessionMeta">${pimsIcon("history", 13)} ${dur}${
                sess.cloud_id
                    ? " · " + BodycamUI.integrityBadge(sess) : ""}${
                sess.file_size
                    ? " · " + BodycamService.fmtBytes(sess.file_size) : ""}</span>`;
        block.appendChild(head);

        /* per-session actions */

        if (canEdit) {

            const acts = document.createElement("div");
            acts.className = "bcSessionActions";

            if (!sess.cloud_id && !recording) {

                const up = document.createElement("button");
                up.className = "ghostBtn";
                up.innerHTML = pimsIcon("cloud", 14) + " Upload footage";
                up.onclick = () => BodycamUI.uploadWizard(
                    this.shift, sess, () => this.renderBody());

                acts.appendChild(up);

            }

            if (sess.cloud_id) {

                const ver = document.createElement("button");
                ver.className = "ghostBtn";
                ver.innerHTML = pimsIcon("verified", 14) + " Verify";
                ver.onclick = () => BodycamUI.verify(
                    this.shift, sess, () => this.renderBody());

                acts.appendChild(ver);

            }

            if (recording) {

                const stop = document.createElement("button");
                stop.className = "ghostBtn";
                stop.innerHTML = pimsIcon("signout", 14) + " Stop";
                stop.onclick = async () => {
                    stop.disabled = true;
                    const r = await BodycamService.stopRecording(this.shift, sess);
                    if (r.ok) this.renderBody(); else stop.disabled = false;
                };
                acts.appendChild(stop);

            }

            if (acts.children.length) block.appendChild(acts);

        }

        /* markers */

        const { rows: marks } = await BodycamService.markers(sess.id);

        if (marks && marks.length) {

            const mbox = document.createElement("div");
            mbox.className = "bcMarkers";

            marks.forEach(m => mbox.appendChild(this.bcMarkerRow(m, sess, canEdit)));

            block.appendChild(mbox);

        } else {

            const none = document.createElement("p");
            none.className = "muted";
            none.style.cssText = "margin:6px 0 0;font-size:12px";
            none.textContent = "No markers on this clip.";
            block.appendChild(none);

        }

        return block;

    },

    bcMarkerRow(m, sess, canEdit) {

        const row = document.createElement("div");
        row.className = "bcMarkerRow";

        const color = BodycamService.KIND_COLORS[m.kind] || "#6b7280";

        const linked = m.linked_case_id
            ? `<a class="bcEvLink" href="case.html?id=${this.esc(
                  m.linked_case_id)}">${pimsIcon("verified", 12)} logged as evidence</a>`
            : "";

        row.innerHTML =
            `<span class="bcMarkKind"><span class="dotChip">` +
            `<i style="background:${color}"></i>${this.esc(m.kind)}</span></span>` +
            `<span class="bcMarkAt">@ ${BodycamService.hms(m.offset_seconds)}</span>` +
            `<span class="bcMarkText">${this.esc(m.label || "—")}` +
            (m.note ? `<small>${this.esc(m.note)}</small>` : "") +
            `</span>` +
            `<span class="bcMarkLink">${linked}</span>`;

        /* an unlinked evidence/incident marker can be attached to a case */

        if (canEdit && !m.linked_case_id &&
            (m.kind === "Evidence" || m.kind === "Incident")) {

            const attach = document.createElement("button");
            attach.className = "ghostBtn bcAttach";
            attach.textContent = "Attach to case…";
            attach.onclick = async () => {
                const caseId = await UI.promptText({
                    title: "Log as case evidence",
                    message: "Enter the case ID this marker belongs to " +
                        "(e.g. CASE-2026-000001). It's added as Bodycam evidence.",
                    label: "Case ID",
                    placeholder: "CASE-2026-000001",
                    required: true,
                    confirmText: "Log evidence"
                });
                if (!caseId) return;
                const r = await BodycamService.attachMarkerToCase(
                    m, sess, this.shift, caseId);
                if (r.ok) this.renderBody();
            };
            row.querySelector(".bcMarkLink").appendChild(attach);

        }

        return row;

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
