/* ============================================================
   SHIBA PIMS
   Officers Logic Engine
============================================================ */

class OfficersEngine {

    constructor() {

        this.officers = [];
        this.timeline = {};
        this.initDemoData();

    }

    /* =========================
       DEMO DATA
    ========================== */

    initDemoData() {

        this.officers.push({
            id: this.generateID(),
            name: "John Smith",
            badge: "SH-2026-00421",
            rank: "Sergeant II",
            division: "Metro",
            status: "On Duty",
            lastActive: "Now"
        });

        this.officers.push({
            id: this.generateID(),
            name: "Mike Johnson",
            badge: "SH-2026-00112",
            rank: "Officer",
            division: "Patrol",
            status: "Off Duty",
            lastActive: "2h ago"
        });

    }

    /* =========================
       LOAD FROM DATABASE
       (keeps demo data if the
       database is empty/offline)
    ========================== */

    async load() {

        if (!window.db) {
            this.renderList();
            return;
        }

        const { data, error } = await db
            .from("officers")
            .select("*");

        if (error) {
            console.error(error);
            this.renderList();
            return;
        }

        if (data && data.length > 0) {

            this.officers = data.map(row => ({
                id: row.id,
                name: row.first_name || row.name || "Unknown",
                badge: row.badge_number || row.badge || "—",
                rank: row.rank || "Officer",
                division: row.division || "—",
                status: row.status || "Off Duty",
                lastActive: row.last_active || "—"
            }));

        }

        this.renderList();

    }

    /* =========================
       CREATE OFFICER
    ========================== */

    async createOfficer(officer) {

        if (!window.db) return;

        const badge = "BDG-" + Math.floor(Math.random() * 99999);

        const { data, error } = await db
            .from("officers")
            .insert([{
                first_name: officer.name,
                division_id: null,
                rank_id: null,
                badge_number: badge,
                photo_url: officer.photo || null,
                status: "Off Duty"
            }])
            .select();

        if (error) {
            console.error(error);
            return;
        }

        this.addTimeline(data[0].id, "Officer created");

        this.load();

    }

    /* =========================
       DELETE OFFICER
    ========================== */

    async deleteOfficer(id) {

        if (!window.db) return;

        await db
            .from("officers")
            .delete()
            .eq("id", id);

        this.load();

    }

    /* =========================
       PROMOTE SYSTEM
    ========================== */

    async promote(id) {

        const officer = this.officers.find(o => o.id === id);

        if (!officer) return;

        const ranks = ["Officer", "Officer II", "Corporal", "Sergeant I", "Sergeant II", "Lieutenant"];

        let index = ranks.indexOf(officer.rank || "Officer");

        let newRank = ranks[Math.min(index + 1, ranks.length - 1)];

        if (window.db) {

            await db
                .from("officers")
                .update({ rank: newRank })
                .eq("id", id);

        }

        officer.rank = newRank;

        this.addTimeline(id, "Promoted to " + newRank);

        this.load();

    }

    /* =========================
       TIMELINE (local)
    ========================== */

    addTimeline(officerId, text) {

        if (!this.timeline[officerId]) {
            this.timeline[officerId] = [];
        }

        this.timeline[officerId].unshift({
            time: new Date().toLocaleString(),
            text: text
        });

    }

    getTimeline(officerId) {

        return this.timeline[officerId] || [];

    }

    /* =========================
       ID GENERATOR
    ========================== */

    generateID() {

        return "OFF-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    }

    generateBadge() {

        const year = new Date().getFullYear();

        const num = Math.floor(Math.random() * 90000) + 10000;

        return `SH-${year}-${num}`;

    }

    /* =========================
       SEARCH + FILTER
    ========================== */

    search(query) {

        return this.officers.filter(o =>
            o.name.toLowerCase().includes(query.toLowerCase()) ||
            o.badge.toLowerCase().includes(query.toLowerCase()) ||
            o.rank.toLowerCase().includes(query.toLowerCase()) ||
            o.division.toLowerCase().includes(query.toLowerCase())
        );

    }

    /* =========================
       RENDER TABLE
    ========================== */

    render(list = this.officers) {

        const tbody = document.getElementById("officersTable");

        if (!tbody) return;

        tbody.innerHTML = "";

        list.forEach(officer => {

            const row = document.createElement("tr");

            row.innerHTML = `

                <td>${this.getStatus(officer.status)}</td>
                <td>${officer.name}</td>
                <td>${officer.badge}</td>
                <td>${officer.rank}</td>
                <td>${officer.division}</td>
                <td>${officer.lastActive}</td>
                <td>
                    <button onclick="Officers.view('${officer.id}')">View</button>
                    <button onclick="Officers.promote('${officer.id}')">Promote</button>
                    <button onclick="Officers.deleteOfficer('${officer.id}')">Delete</button>
                </td>

            `;

            tbody.appendChild(row);

        });

    }

    renderList() {

        this.render(this.officers);

    }

    /* =========================
       STATUS UI
    ========================== */

    getStatus(status) {

        if (status === "On Duty") return "🟢 On Duty";
        if (status === "Off Duty") return "⚫ Off Duty";
        if (status === "Training") return "🔵 Training";
        if (status === "Suspended") return "🔴 Suspended";

        return "⚪ Unknown";

    }

    /* =========================
       VIEW OFFICER (drawer)
    ========================== */

    view(id) {

        const officer = this.officers.find(o => o.id === id);

        if (!officer) return;

        currentOfficerId = id;

        document.getElementById("drawerName").innerText = officer.name;
        document.getElementById("drawerRank").innerText = officer.rank;
        document.getElementById("drawerBadge").innerText = officer.badge;
        document.getElementById("drawerDivision").innerText = officer.division;
        document.getElementById("drawerStatus").innerText = officer.status;

        document.getElementById("drawerPhoto").src =
            officer.photo || "https://via.placeholder.com/100";

        const timeline = this.getTimeline(id);

        const container = document.getElementById("drawerTimeline");

        container.innerHTML = "";

        if (timeline.length === 0) {

            container.innerHTML = "<p>No activity yet</p>";

        } else {

            timeline.forEach(t => {

                const div = document.createElement("div");

                div.className = "timelineItem";

                div.innerHTML = `
                    <small>${t.time}</small><br>
                    <span>${t.text}</span>
                    <hr>
                `;

                container.appendChild(div);

            });

        }

        document.getElementById("officerDrawer")
            .classList.remove("hidden");

    }

}

/* GLOBAL INSTANCE */

const Officers = new OfficersEngine();

window.Officers = Officers;

let currentOfficerId = null;

/* ============================
   PAGE WIRING
   (only runs on pages that
   actually have these elements)
============================ */

document.addEventListener("DOMContentLoaded", () => {

    Officers.load();

    /* MODAL CONTROL */

    const modal = document.getElementById("officerModal");

    const openBtn = document.getElementById("createOfficerBtn");
    const closeBtn = document.getElementById("closeModal");
    const confirmBtn = document.getElementById("createOfficerConfirm");

    if (modal && openBtn) {

        openBtn.onclick = () => {
            modal.classList.remove("hidden");
        };

    }

    if (modal && closeBtn) {

        closeBtn.onclick = () => {
            modal.classList.add("hidden");
        };

    }

    if (modal && confirmBtn) {

        confirmBtn.onclick = () => {

            const name = document.getElementById("offName").value;
            const division = document.getElementById("offDivision").value;
            const photo = document.getElementById("offPhoto").value;
            const rank = document.getElementById("offRank").value;

            if (!name || !division) {

                UI?.error("Please fill required fields");

                return;

            }

            Officers.createOfficer({
                name,
                division,
                photo,
                rank
            });

            modal.classList.add("hidden");

            document.getElementById("offName").value = "";
            document.getElementById("offDivision").value = "";
            document.getElementById("offPhoto").value = "";

        };

    }

    /* CLOSE DRAWER */

    const closeDrawer = document.getElementById("closeDrawer");

    if (closeDrawer) {

        closeDrawer.onclick = () => {

            document.getElementById("officerDrawer")
                .classList.add("hidden");

            currentOfficerId = null;

        };

    }

    /* SEARCH */

    const searchInput = document.getElementById("searchInput");

    if (searchInput) {

        searchInput.addEventListener("input", () => {

            Officers.render(Officers.search(searchInput.value));

        });

    }

});
