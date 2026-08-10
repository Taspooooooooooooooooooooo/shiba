/* ==========================================================
   SHIBA PIMS
   Bodycam Player (Phase 8 · Sprint 8.4) — a real review player
   for a bodycam clip: HTML5 video of the uploaded footage, a
   timeline with every marker + annotation plotted as a
   click-to-seek tick, and panels for Markers, Bookmarks,
   Comments and Evidence. Supervisors drop bookmarks and
   timestamped comments at the current frame; comments ping the
   officer.  Open with ?session=<uuid>.
========================================================== */

const BodycamPlayer = {

    id: null,
    session: null,
    markers: [],
    annotations: [],
    evidence: [],
    video: null,
    tab: "markers",
    canView: false,
    canAnnotate: false,

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    hms(sec) { return BodycamService.hms(sec); },

    dot(color, label) {
        return `<span class="dotChip"><i style="background:${color}"></i>${
            this.esc(label)}</span>`;
    },

    /* ----------------------------------------------------- */

    async init() {

        if (!window.db) return;

        const q = new URLSearchParams(location.search);
        this.id = q.get("session") || q.get("id");

        if (!this.id) {
            document.getElementById("bcpHeader").innerHTML =
                "<p class='muted'>No bodycam session specified.</p>";
            return;
        }

        const { row, error } = await BodycamService.sessionById(this.id);

        if (error || !row) {
            const needsSetup = error && BodycamService._missingTable(error);
            document.getElementById("bcpHeader").innerHTML =
                "<p class='muted'>Session not found." +
                (needsSetup ? " " + this.esc(BodycamService.SETUP_HINT_75) : "") +
                "</p>";
            return;
        }

        this.session = row;

        /* access: the owning officer, or a supervisor (Sergeant+) */

        const mine = (await PermissionService.myOfficerId()) === row.officer_id;
        const sup = await PermissionService.can("cases.assign");

        this.canView = mine || sup;
        this.canAnnotate = this.canView;

        if (!this.canView) {
            document.getElementById("bcpHeader").innerHTML =
                "<p class='muted'>You don't have access to this footage. " +
                "It's visible to the officer and their supervisors.</p>";
            document.getElementById("bcpMain").innerHTML = "";
            return;
        }

        await this.loadData();

        this.renderHeader();
        this.renderMain();

    },

    async loadData() {

        const [m, a] = await Promise.all([
            BodycamService.markers(this.id),
            BodycamService.annotations(this.id)
        ]);

        this.markers = m.rows || [];
        this.annotations = a.rows || [];

        try {
            const { data } = await db
                .from("case_evidence")
                .select("*, cases(case_id, title)")
                .eq("bodycam_session_id", this.id)
                .order("created_at", { ascending: true });
            this.evidence = data || [];
        } catch (e) { this.evidence = []; }

    },

    /* ----------------------------------------------------- */
    /* header                                                */
    /* ----------------------------------------------------- */

    renderHeader() {

        const s = this.session;

        const stC = BodycamService.STATUS_COLORS[s.status] || "#6b7280";
        const inSt = s.integrity_status || "Unverified";
        const inC = BodycamService.INTEGRITY_COLORS[inSt] || "#9ca3af";

        document.getElementById("bcpHeader").innerHTML =
            `<div class="caseHeadTop">
                <div>
                    <div class="caseHeadId">${this.esc(s.session_id || "")}</div>
                    <h1 class="caseHeadTitle">Bodycam footage</h1>
                    <div class="caseHeadMeta">
                        ${this.dot(stC, s.status)} ·
                        ${s.cloud_id ? this.dot(inC, inSt) + " · " : ""}
                        ${this.esc(s.officer_label)} ·
                        ${this.hms(s.recorded_seconds || 0)} recorded
                    </div>
                </div>
                <div class="caseHeadStatus">
                    ${s.file_size
                        ? `<small class="muted">${BodycamService.fmtBytes(
                            s.file_size)}</small>` : ""}
                </div>
            </div>
            ${s.shifts?.shift_id
                ? `<a href="shift.html?id=${s.shift_id}" class="caseBack">← Shift ${
                    this.esc(s.shifts.shift_id)}</a>`
                : `<a href="bodycam.html" class="caseBack">← Bodycam</a>`}`;

    },

    /* ----------------------------------------------------- */
    /* main — video + timeline + panels                      */
    /* ----------------------------------------------------- */

    renderMain() {

        const s = this.session;

        const main = document.getElementById("bcpMain");

        const hasVideo = !!s.file_url;

        main.innerHTML =
            `<div class="bcpGrid">
                <div class="bcpLeft card">
                    ${hasVideo
                        ? `<video id="bcpVideo" class="bcpVideo" controls
                             preload="metadata" src="${this.esc(s.file_url)}"></video>`
                        : `<div class="bcpNoVideo">${pimsIcon("surveillance", 40)}
                             <p>No footage uploaded for this clip yet.</p>
                             <small class="muted">Markers and comments are still
                             listed on the right, by timestamp.</small></div>`}
                    <div class="bcpTimeline" id="bcpTimeline">
                        <div class="bcpTrack" id="bcpTrack">
                            <div class="bcpPlayhead" id="bcpPlayhead"></div>
                        </div>
                    </div>
                    <div class="bcpTimeRow">
                        <span class="bcpClock"><b id="bcpCur">0:00</b>
                            <span id="bcpDur" class="muted">/ ${
                                this.hms(s.recorded_seconds || 0)}</span></span>
                        ${this.canAnnotate ? `<span class="bcpQuick">
                            <button class="ghostBtn" id="bcpAddBm">${
                                pimsIcon("tags", 14)} Bookmark here</button>
                            <button class="primaryBtn" id="bcpAddCm">${
                                pimsIcon("messages", 14)} Comment here</button>
                        </span>` : ""}
                    </div>
                </div>
                <div class="bcpRight card">
                    <div class="caseTabs" id="bcpTabs"></div>
                    <div class="bcpPanel" id="bcpPanel"></div>
                </div>
            </div>`;

        this.video = document.getElementById("bcpVideo");

        if (this.video) {
            this.video.addEventListener("loadedmetadata", () => {
                document.getElementById("bcpDur").textContent =
                    "/ " + this.hms(this.video.duration);
                this.renderTicks();
            });
            this.video.addEventListener("timeupdate", () => this.onTime());
        }

        /* plot ticks right away against a fallback scale (recorded time /
           latest timestamp) so the timeline is never empty; re-plotted
           precisely once the video reports its real duration */
        this.renderTicks();

        const track = document.getElementById("bcpTrack");
        track.onclick = (e) => {
            if (!this.video) return;
            const r = track.getBoundingClientRect();
            const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            this.seek(frac * (this.video.duration || 0));
        };

        if (this.canAnnotate) {
            const bm = document.getElementById("bcpAddBm");
            const cm = document.getElementById("bcpAddCm");
            if (bm) bm.onclick = () => this.addBookmark();
            if (cm) cm.onclick = () => this.addComment();
        }

        this.renderTabs();
        this.renderPanel();

    },

    /* the scale used to position ticks: real duration if we have a
       video, else the largest timestamp among items (+ headroom) */

    scaleDuration() {
        if (this.video && this.video.duration) return this.video.duration;
        const offs = [...this.markers, ...this.annotations]
            .map(x => x.offset_seconds || 0);
        const max = offs.length ? Math.max(...offs) : 0;
        return Math.max(max * 1.05, this.session.recorded_seconds || 0, 1);
    },

    renderTicks() {

        const track = document.getElementById("bcpTrack");
        if (!track) return;

        /* clear old ticks (keep the playhead) */
        track.querySelectorAll(".bcpTick").forEach(t => t.remove());

        const dur = this.scaleDuration();

        const add = (offset, color, title) => {
            const t = document.createElement("button");
            t.className = "bcpTick";
            t.style.left = Math.min(99.4, (offset / dur) * 100) + "%";
            t.style.background = color;
            t.title = title;
            t.onclick = (e) => { e.stopPropagation(); this.seek(offset); };
            track.appendChild(t);
        };

        this.markers.forEach(m => add(m.offset_seconds,
            BodycamService.CATEGORY_COLORS[m.category] ||
            BodycamService.KIND_COLORS[m.kind] || "#3b82f6",
            (m.category || m.kind) + " @ " + this.hms(m.offset_seconds) +
            (m.label ? " · " + m.label : "")));

        this.annotations.forEach(a => add(a.offset_seconds,
            a.kind === "Bookmark" ? "#eab308" : "#22c55e",
            a.kind + " @ " + this.hms(a.offset_seconds) +
            (a.body ? " · " + a.body : "")));

    },

    onTime() {
        const ph = document.getElementById("bcpPlayhead");
        const cur = document.getElementById("bcpCur");
        if (!this.video) return;
        const dur = this.video.duration || 1;
        if (ph) ph.style.left = (this.video.currentTime / dur) * 100 + "%";
        if (cur) cur.textContent = this.hms(this.video.currentTime);
    },

    seek(offset) {
        if (!this.video) return;
        this.video.currentTime = Math.max(0, offset);
        this.video.play?.().catch(() => {});
    },

    /* ----------------------------------------------------- */
    /* tabs + panels                                         */
    /* ----------------------------------------------------- */

    TABS: [
        { key: "markers", label: "Markers", icon: "tags" },
        { key: "bookmarks", label: "Bookmarks", icon: "history" },
        { key: "comments", label: "Comments", icon: "messages" },
        { key: "evidence", label: "Evidence", icon: "evidence" }
    ],

    renderTabs() {
        const bar = document.getElementById("bcpTabs");
        bar.innerHTML = "";
        this.TABS.forEach(t => {
            const n = t.key === "markers" ? this.markers.length
                : t.key === "bookmarks"
                    ? this.annotations.filter(a => a.kind === "Bookmark").length
                : t.key === "comments"
                    ? this.annotations.filter(a => a.kind === "Comment").length
                : this.evidence.length;
            const b = document.createElement("button");
            b.className = "caseTab" + (t.key === this.tab ? " on" : "");
            b.innerHTML = `<span class="caseTabIcon">${pimsIcon(t.icon, 16)}</span>` +
                this.esc(t.label) + (n ? ` <span class="bcpCount">${n}</span>` : "");
            b.onclick = () => { this.tab = t.key; this.renderTabs(); this.renderPanel(); };
            bar.appendChild(b);
        });
    },

    seekRow(offset, colorDot, title, sub) {
        const row = document.createElement("div");
        row.className = "bcpSeekRow";
        row.innerHTML =
            `<span class="bcpAt">${colorDot}${this.hms(offset)}</span>
             <span class="bcpSeekText"><b>${title}</b>${
                sub ? `<small>${sub}</small>` : ""}</span>`;
        row.onclick = () => this.seek(offset);
        return row;
    },

    renderPanel() {

        const p = document.getElementById("bcpPanel");
        p.innerHTML = "";

        if (this.tab === "markers") {

            if (!this.markers.length) {
                p.innerHTML = "<p class='muted'>No markers on this clip.</p>";
                return;
            }
            this.markers.forEach(m => {
                const col = BodycamService.CATEGORY_COLORS[m.category] ||
                    BodycamService.KIND_COLORS[m.kind] || "#3b82f6";
                const link = m.linked_case_id
                    ? ` · <a href="case.html?id=${m.linked_case_id}" onclick="event.stopPropagation()">${
                        pimsIcon("verified", 11)} evidence</a>` : "";
                p.appendChild(this.seekRow(m.offset_seconds,
                    this.dot(col, m.category || m.kind),
                    this.esc(m.label || m.category || m.kind),
                    (m.note ? this.esc(m.note) : "") + link));
            });

        } else if (this.tab === "bookmarks" || this.tab === "comments") {

            const isBm = this.tab === "bookmarks";
            const kind = isBm ? "Bookmark" : "Comment";
            const rows = this.annotations.filter(a => a.kind === kind);

            if (this.canAnnotate) p.appendChild(this.composer(kind));

            if (!rows.length) {
                const e = document.createElement("p");
                e.className = "muted";
                e.textContent = isBm ? "No bookmarks yet."
                    : "No comments yet.";
                p.appendChild(e);
            } else {
                rows.forEach(a => p.appendChild(this.seekRow(a.offset_seconds,
                    this.dot(isBm ? "#eab308" : "#22c55e", ""),
                    this.esc(a.body || kind),
                    this.esc(a.author_label || a.author || "—"))));
            }

        } else if (this.tab === "evidence") {

            if (!this.evidence.length) {
                p.innerHTML = "<p class='muted'>No evidence was logged from " +
                    "this clip. Evidence markers become case evidence " +
                    "automatically.</p>";
                return;
            }
            this.evidence.forEach(ev => {
                const row = document.createElement("div");
                row.className = "reviewRow";
                row.innerHTML =
                    `<div class="rrMain">
                        <div class="rrTitle">${this.esc(ev.evidence_id)}</div>
                        <div class="rrSub">${this.esc(ev.description || ev.type)}</div>
                    </div>` +
                    (ev.case_id
                        ? `<a class="ghostBtn" style="text-decoration:none"
                             href="case.html?id=${ev.case_id}">Open case ${
                             this.esc(ev.cases?.case_id || "")}</a>` : "");
                p.appendChild(row);
            });

        }

    },

    composer(kind) {

        const wrap = document.createElement("div");
        wrap.className = "bcpComposer";

        const field = document.createElement(
            kind === "Comment" ? "textarea" : "input");
        field.className = "uiModalInput";
        field.placeholder = kind === "Comment"
            ? "Comment for the officer at the current time…"
            : "Bookmark label (optional)…";
        if (kind === "Comment") field.rows = 2;

        const btn = document.createElement("button");
        btn.className = "primaryBtn";
        btn.innerHTML = pimsIcon("add", 14) + " Add " + kind.toLowerCase() +
            " at " + this.hms(this.video ? this.video.currentTime : 0);

        /* keep the button label's time fresh as the video plays */
        if (this.video) {
            this.video.addEventListener("timeupdate", () => {
                if (!btn.isConnected) return;
                btn.innerHTML = pimsIcon("add", 14) + " Add " +
                    kind.toLowerCase() + " at " + this.hms(this.video.currentTime);
            });
        }

        btn.onclick = async () => {
            const off = this.video ? this.video.currentTime : 0;
            btn.disabled = true;
            const r = await BodycamService.addAnnotation(this.session,
                { kind, offsetSeconds: off, body: field.value });
            btn.disabled = false;
            if (r.ok) { field.value = ""; await this.reload(); }
        };

        wrap.append(field, btn);
        return wrap;

    },

    addBookmark() {
        this.tab = "bookmarks";
        this.renderTabs();
        this.renderPanel();
        const f = document.querySelector(".bcpComposer .uiModalInput");
        if (f) f.focus();
    },

    addComment() {
        this.tab = "comments";
        this.renderTabs();
        this.renderPanel();
        const f = document.querySelector(".bcpComposer .uiModalInput");
        if (f) f.focus();
    },

    async reload() {
        const t = this.video ? this.video.currentTime : 0;
        await this.loadData();
        this.renderTabs();
        this.renderPanel();
        this.renderTicks();
        if (this.video) this.video.currentTime = t;
    }

};

document.addEventListener("DOMContentLoaded", () => BodycamPlayer.init());

window.BodycamPlayer = BodycamPlayer;
