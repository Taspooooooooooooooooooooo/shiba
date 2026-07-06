/* ==========================================================
   SHIBA PIMS
   Personnel File (Phase 2)
   One page per officer: profile header + tabs for General,
   Timeline, Audit, Cases, Certificates. Every opening of a
   file is itself audit-logged.
========================================================== */

const Personnel = {

    officer: null,

    loaded: { timeline: false, audit: false, cases: false },

    /* ----------------------------------------------------- */
    /* header + general tab                                   */
    /* ----------------------------------------------------- */

    async renderHeader() {

        const o = this.officer;

        document.getElementById("pfName").textContent = o.name;

        document.getElementById("pfSubtitle").textContent =
            o.rank + (o.division !== "—" ? " · " + o.division : "");

        document.getElementById("pfIds").textContent =
            o.officerId + " · " + o.badge;

        const status = document.getElementById("pfStatus");

        status.textContent = Officers.getStatus(o.status);

        status.classList.toggle("onduty", o.status === "On Duty");

        const photo = document.getElementById("pfPhoto");

        photo.src = (await resolveCloudPhoto(o.photo)) ||
            "https://via.placeholder.com/110";

    },

    async renderGeneral() {

        const o = this.officer;

        let account = "not activated";

        if (o.userId && window.db) {

            const { data } = await db
                .from("users")
                .select("username")
                .eq("id", o.userId)
                .maybeSingle();

            if (data?.username) account = "@" + data.username;

        }

        const raw = this.raw || {};

        const fields = [
            ["Officer ID", o.officerId],
            ["Badge", o.badge],
            ["Rank", o.rank],
            ["Division", o.division],
            ["Status", o.status],
            ["Account", account],
            ["Joined", raw.hire_date || (raw.created_at
                ? new Date(raw.created_at).toLocaleDateString() : "—")],
            ["Last update", raw.updated_at
                ? new Date(raw.updated_at).toLocaleString() : "—"],
            ["UUID", o.id]
        ];

        const grid = document.getElementById("pfGeneral");

        grid.innerHTML = "";

        fields.forEach(([label, value]) => {

            const item = document.createElement("div");

            item.className = "fieldItem";

            const l = document.createElement("small");

            l.textContent = label;

            const v = document.createElement("div");

            v.textContent = value || "—";

            item.append(l, v);

            grid.appendChild(item);

        });

    },

    /* ----------------------------------------------------- */
    /* lazy tabs                                              */
    /* ----------------------------------------------------- */

    feedRow(container, time, action, detail, id) {

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

        i.textContent = id || "";

        item.append(t, a, d, i);

        container.appendChild(item);

    },

    async renderTimeline() {

        if (this.loaded.timeline) return;

        this.loaded.timeline = true;

        const box = document.getElementById("pfTimeline");

        const entries = await TimelineService.list(this.officer.id, 100);

        box.innerHTML = "";

        if (!entries.length) {

            box.innerHTML = "<p class='muted'>No career events yet.</p>";

            return;

        }

        entries.forEach(e => this.feedRow(box,
            new Date(e.created_at).toLocaleString(),
            e.action, e.details, ""));

    },

    async renderAudit() {

        if (this.loaded.audit) return;

        this.loaded.audit = true;

        const box = document.getElementById("pfAudit");

        const entries = await AuditService.list(50, this.officer.id);

        box.innerHTML = "";

        if (!entries.length) {

            box.innerHTML = "<p class='muted'>No audit entries yet.</p>";

            return;

        }

        const pretty = a => (a || "").toLowerCase().split("_")
            .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

        entries.forEach(e => this.feedRow(box,
            new Date(e.created_at).toLocaleString(),
            pretty(e.action),
            e.target, e.action_id));

    },

    async renderCases() {

        if (this.loaded.cases) return;

        this.loaded.cases = true;

        const box = document.getElementById("pfCases");

        const { data, error } = await db
            .from("cases")
            .select("case_number, title, status, created_at")
            .or("assigned_to.eq." + this.officer.id +
                ",created_by.eq." + this.officer.id)
            .order("created_at", { ascending: false });

        box.innerHTML = "";

        if (error || !data || !data.length) {

            box.innerHTML =
                "<p class='muted'>No cases yet — the full Case System " +
                "arrives in Phase 5.</p>";

            return;

        }

        data.forEach(c => this.feedRow(box,
            new Date(c.created_at).toLocaleString(),
            c.case_number, c.title + " · " + c.status, ""));

    },

    /* ----------------------------------------------------- */
    /* init                                                   */
    /* ----------------------------------------------------- */

    async init() {

        const id = new URLSearchParams(location.search).get("id");

        if (!id || !window.db) {

            document.getElementById("pfName").textContent =
                "No officer selected";

            return;

        }

        await Officers.initPerms();

        await Officers.loadLookups();

        await Officers.load();

        this.officer = Officers.officers.find(o => o.id === id);

        if (!this.officer) {

            document.getElementById("pfName").textContent =
                "Officer not found";

            document.getElementById("pfSubtitle").textContent =
                "This personnel file does not exist (or was deleted).";

            return;

        }

        /* raw row for dates */

        const { data: raw } = await db
            .from("officers")
            .select("hire_date, created_at, updated_at")
            .eq("id", id)
            .maybeSingle();

        this.raw = raw;

        await this.renderHeader();

        await this.renderGeneral();

        /* opening a personnel file is a sensitive action — log it */

        AuditService.log({
            action: "PERSONNEL_FILE_OPENED",
            target: this.officer.officerId + " " + this.officer.name,
            officerId: id
        });

        /* header actions (permission-gated) */

        const promoteBtn = document.getElementById("pfPromoteBtn");

        const resetBtn = document.getElementById("pfResetBtn");

        if (!Officers.perms.promote) promoteBtn.style.display = "none";

        if (!Officers.perms.reset) resetBtn.style.display = "none";

        promoteBtn.onclick = async () => {

            await Officers.promote(id);

            setTimeout(() => location.reload(), 900);

        };

        resetBtn.onclick = () => Officers.resetAccess(id);

        /* tabs */

        document.querySelectorAll("#pfTabs button").forEach(btn => {

            btn.onclick = () => {

                document.querySelectorAll("#pfTabs button")
                    .forEach(b => b.classList.remove("active"));

                btn.classList.add("active");

                document.querySelectorAll(".tabPanel")
                    .forEach(p => p.classList.remove("active"));

                document.getElementById(btn.dataset.tab)
                    .classList.add("active");

                if (btn.dataset.tab === "tabTimeline") this.renderTimeline();

                if (btn.dataset.tab === "tabAudit") this.renderAudit();

                if (btn.dataset.tab === "tabCases") this.renderCases();

            };

        });

    }

};

document.addEventListener("DOMContentLoaded", () => Personnel.init());

window.Personnel = Personnel;
