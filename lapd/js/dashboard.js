/* ==========================================================
   SHIBA PIMS
   Live Dashboard (Phase 1)
   Real numbers from the database, the live audit feed,
   weekly activity chart, permission-gated quick actions.
   Refreshes itself every 30 seconds.
========================================================== */

const Dashboard = {

    /* ----------------------------------------------------- */
    /* helpers                                                */
    /* ----------------------------------------------------- */

    setStat(id, value) {

        const el = document.getElementById(id);

        if (el) el.innerText = value;

    },

    prettyAction(action) {

        return (action || "")
            .toLowerCase()
            .split("_")
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

    },

    async count(table, filter = null) {

        let query = db
            .from(table)
            .select("*", { count: "exact", head: true });

        if (filter) query = filter(query);

        const { count, error } = await query;

        return error ? "—" : (count || 0);

    },

    /* ----------------------------------------------------- */
    /* widgets                                                */
    /* ----------------------------------------------------- */

    async loadStats() {

        const [officers, onDuty, openCases, reports, cloudFiles] =
            await Promise.all([

                this.count("officers"),

                this.count("officers", q => q.eq("status", "On Duty")),

                this.count("cases", q => q.eq("status", "Open")),

                this.count("reports"),

                this.count("cloud_files")

            ]);

        this.setStat("statOfficers", officers);

        this.setStat("statOnDuty", onDuty);

        this.setStat("statCases", openCases);

        this.setStat("statReports", reports);

        this.setStat("statCloud", cloudFiles);

        /* unread notifications for the logged-in account */

        let unread = 0;

        try {

            const { data } = await db.auth.getUser();

            if (data?.user) {

                unread = await NotificationService.unreadCount(data.user.id);

            }

        } catch (e) { /* no session */ }

        this.setStat("statNotifs", unread);

    },

    /* ----------------------------------------------------- */
    /* live activity feed (audit engine)                      */
    /* ----------------------------------------------------- */

    async loadFeed() {

        const feed = document.getElementById("activityFeed");

        if (!feed) return;

        const entries = await AuditService.list(8);

        if (!entries.length) {

            feed.innerHTML = "<p>No recent activity.</p>";

            return;

        }

        feed.innerHTML = "";

        entries.forEach(entry => {

            const item = document.createElement("div");

            item.className = "feedItem";

            const time = document.createElement("span");

            time.className = "feedTime";

            time.textContent =
                new Date(entry.created_at).toLocaleString();

            const action = document.createElement("strong");

            action.textContent = this.prettyAction(entry.action);

            const target = document.createElement("span");

            target.className = "feedTarget";

            target.textContent = entry.target || "";

            const id = document.createElement("small");

            id.textContent = entry.action_id || "";

            item.append(time, action, target, id);

            feed.appendChild(item);

        });

    },

    /* ----------------------------------------------------- */
    /* weekly activity chart (audit events per day)           */
    /* ----------------------------------------------------- */

    async loadChart() {

        const chart = document.getElementById("weeklyChart");

        if (!chart) return;

        const start = new Date(Date.now() - 6 * 86400000);

        start.setHours(0, 0, 0, 0);

        const { data, error } = await db
            .from("audit_logs")
            .select("created_at")
            .gte("created_at", start.toISOString());

        if (error) {

            chart.innerHTML =
                "<p style='color:#b8c5d6'>Chart unavailable.</p>";

            return;

        }

        const days = [...Array(7)].map((_, i) =>
            new Date(start.getTime() + i * 86400000));

        const counts = days.map(day => {

            const next = new Date(day.getTime() + 86400000);

            return (data || []).filter(r => {

                const t = new Date(r.created_at);

                return t >= day && t < next;

            }).length;

        });

        const max = Math.max(...counts, 1);

        chart.innerHTML = "";

        days.forEach((day, i) => {

            const col = document.createElement("div");

            col.className = "chartBar";

            const value = document.createElement("small");

            value.textContent = counts[i];

            const bar = document.createElement("div");

            bar.className = "bar";

            bar.style.height =
                Math.max(4, Math.round(counts[i] / max * 100)) + "%";

            const label = document.createElement("span");

            label.textContent = day.toLocaleDateString(undefined,
                { weekday: "short" });

            col.append(value, bar, label);

            chart.appendChild(col);

        });

    },

    /* ----------------------------------------------------- */
    /* live presence — who's using SHIBA PIMS right now       */
    /* (Supabase Realtime presence; everyone on a PIMS page   */
    /* joins the same channel)                                */
    /* ----------------------------------------------------- */

    startPresence() {

        if (!window.db || this.presence) return;

        const me =
            localStorage.getItem("username") ||
            ("officer-" + Math.random().toString(36).slice(2, 8));

        this.presence = db.channel("pims-presence", {
            config: { presence: { key: me } }
        });

        this.presence.on("presence", { event: "sync" }, () => {

            const state = this.presence.presenceState();

            this.setStat("statOnline", Object.keys(state).length);

        });

        this.presence.subscribe(async (status) => {

            if (status === "SUBSCRIBED") {

                await this.presence.track({
                    username: me,
                    at: new Date().toISOString()
                });

            }

        });

    },

    /* ----------------------------------------------------- */
    /* refresh cycle                                          */
    /* ----------------------------------------------------- */

    async load() {

        if (!window.db) return;

        await Promise.all([

            this.loadStats(),

            this.loadFeed(),

            this.loadChart()

        ]);

    }

};

document.addEventListener("DOMContentLoaded", async () => {

    /* quick actions the current role may not use */

    PermissionService.gate("officers.create",
        document.getElementById("qaCreateOfficer"));

    Dashboard.load();

    Dashboard.startPresence();

    /* stays live — refresh every 30 seconds */

    setInterval(() => Dashboard.load(), 30000);

});

window.Dashboard = Dashboard;
