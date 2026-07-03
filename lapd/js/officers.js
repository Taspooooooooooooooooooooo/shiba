/* ============================================================
   SHIBA PIMS
   Officers Logic Engine
============================================================ */
import { supabase } from "./supabaseClient.js"

class OfficersEngine {
   getTimeline(officerId){

    return this.timeline[officerId] || [];

}
   addTimeline(officerId, text) {

    if(!this.timeline[officerId]){

        this.timeline[officerId] = [];

    }

    const event = {

        time: new Date().toLocaleString(),

        text: text

    };

    this.timeline[officerId].unshift(event);

}

    constructor() {

        this.officers = [];
        this.initDemoData();
       this.timeline = {};
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

        this.addTimeline(officer.id,"Officer created sucessfully!");

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

            this.addTimeline(officer.id, `Promoted to ${officer.rank}`);

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
Officers.view = function(id){

    const officer = this.officers.find(o => o.id === id);

    if(!officer) return;

    currentOfficerId = id;

    document.getElementById("drawerName").innerText = officer.name;
    document.getElementById("drawerRank").innerText = officer.rank;
    document.getElementById("drawerBadge").innerText = officer.badge;
    document.getElementById("drawerDivision").innerText = officer.division;
    document.getElementById("drawerStatus").innerText = officer.status;

    document.getElementById("drawerPhoto").src =
        officer.photo || "https://via.placeholder.com/100";

    // TIMELINE RENDER
    const timeline = this.getTimeline(id);

    const container = document.getElementById("drawerTimeline");

    container.innerHTML = "";

    if(timeline.length === 0){

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

};

/* GLOBAL INSTANCE */

const Officers = new OfficersEngine();

/* INIT RENDER */

document.addEventListener("DOMContentLoaded", () => {

    Officers.render();

});
/* ============================
   MODAL CONTROL
============================ */

const modal = document.getElementById("officerModal");

const openBtn = document.getElementById("createOfficerBtn");
const closeBtn = document.getElementById("closeModal");
const confirmBtn = document.getElementById("createOfficerConfirm");

openBtn.onclick = () => {
    modal.classList.remove("hidden");
};

closeBtn.onclick = () => {
    modal.classList.add("hidden");
};

/* ============================
   CREATE OFFICER ACTION
============================ */

confirmBtn.onclick = () => {

    const name = document.getElementById("offName").value;
    const division = document.getElementById("offDivision").value;
    const photo = document.getElementById("offPhoto").value;
    const rank = document.getElementById("offRank").value;

    if(!name || !division){

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

let currentOfficerId = null;

/* ============================
   OPEN DRAWER
============================ */

Officers.view = function(id){

    const officer = this.officers.find(o => o.id === id);

    if(!officer) return;

    currentOfficerId = id;

    document.getElementById("drawerName").innerText = officer.name;
    document.getElementById("drawerRank").innerText = officer.rank;
    document.getElementById("drawerBadge").innerText = officer.badge;
    document.getElementById("drawerDivision").innerText = officer.division;
    document.getElementById("drawerStatus").innerText = officer.status;

    document.getElementById("drawerPhoto").src =
        officer.photo || "https://via.placeholder.com/100";

    document.getElementById("officerDrawer").classList.remove("hidden");

};

/* ============================
   CLOSE DRAWER
============================ */

document.getElementById("closeDrawer").onclick = () => {

    document.getElementById("officerDrawer")
    .classList.add("hidden");

    currentOfficerId = null;

};
