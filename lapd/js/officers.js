/* ============================================================
   SHIBA PIMS
   Officers Logic Engine
============================================================ */

class OfficersEngine {

    constructor() {

        this.officers = [];

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
       CREATE OFFICER
    ========================== */

    createOfficer(data) {

        const officer = {

            id: this.generateID(),

            name: data.name,

            badge: this.generateBadge(),

            rank: "Officer",

            division: data.division || "Patrol",

            status: "On Duty",

            lastActive: "Now",

            createdAt: new Date().toISOString()

        };

        this.officers.push(officer);

        UI?.success("Officer created successfully");

        this.render();

        return officer;

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
       DELETE OFFICER
    ========================== */

    deleteOfficer(id) {

        this.officers = this.officers.filter(o => o.id !== id);

        UI?.warning("Officer removed");

        this.render();

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
       PROMOTE SYSTEM
    ========================== */

    promote(id) {

        const officer = this.officers.find(o => o.id === id);

        if (!officer) return;

        const ranks = [
            "Officer",
            "Officer II",
            "Corporal",
            "Sergeant I",
            "Sergeant II",
            "Lieutenant",
            "Captain"
        ];

        let index = ranks.indexOf(officer.rank);

        if (index < ranks.length - 1) {

            officer.rank = ranks[index + 1];

            UI?.success(`${officer.name} promoted to ${officer.rank}`);

        } else {

            UI?.info("Max rank reached");

        }

        this.render();

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
       VIEW OFFICER (future drawer)
    ========================== */

    view(id) {

        const officer = this.officers.find(o => o.id === id);

        if (!officer) return;

        alert(
            `${officer.name}\n${officer.rank}\n${officer.badge}`
        );

    }

}

/* GLOBAL INSTANCE */

const Officers = new OfficersEngine();

/* INIT RENDER */

document.addEventListener("DOMContentLoaded", () => {

    Officers.render();

});
