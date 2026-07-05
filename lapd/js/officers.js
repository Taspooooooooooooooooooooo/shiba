/* ============================================================
   SHIBA PIMS
   Officers Logic Engine
   (matched to the Supabase schema: officers, ranks,
    divisions, officer_timeline)
============================================================ */

/* =========================
   HELPERS
========================== */

function generateOfficerId() {

    return "OFCR-" + String(Date.now()).slice(-6);

}

function splitName(fullName) {

    const parts = fullName.trim().split(" ");

    return {
        first: parts[0] || "Unknown",
        last: parts.slice(1).join(" ") || "Unknown"
    };

}

/* =========================
   SHIBA CLOUD LINKS
   A share link from OUR cloud (/cloud/?=ID or ?f=ID) is
   resolved to the direct file URL through the shared
   database — no other hosts are accepted.
========================== */

function parseCloudId(value) {

    if (!value) return null;

    let url;

    try {

        url = new URL(value, location.href);

    } catch {

        return null;

    }

    const ourHost =
        url.host === location.host ||
        url.host === "shiba.is-a.dev" ||
        url.host.endsWith(".shiba.is-a.dev");

    if (!ourHost) return null;

    if (!url.pathname.includes("/cloud")) return null;

    const params = new URLSearchParams(url.search);

    const id = params.get("f") || params.get("") || null;

    if (!id || id.startsWith("from")) return null;

    return id;

}

async function resolveCloudPhoto(value) {

    const id = parseCloudId(value);

    if (!id || !window.db) return value || null;

    const { data } = await db
        .from("cloud_files")
        .select("path")
        .eq("id", id)
        .maybeSingle();

    if (!data) return value;

    return db.storage.from("cloud").getPublicUrl(data.path).data.publicUrl;

}

class OfficersEngine {

    constructor() {

        this.officers = [];
        this.ranks = [];
        this.divisions = [];

    }

    /* =========================
       LOAD OFFICERS
    ========================== */

    async load() {

        if (!window.db) {
            this.renderList();
            return;
        }

        const { data, error } = await db
            .from("officers")
            .select("*, ranks(name, level), divisions(name)");

        if (error) {
            console.error("LOAD OFFICERS ERROR:", error);
            UI?.error("Failed to load officers");
            return;
        }

        this.officers = (data || []).map(row => ({
            id: row.id,
            officerId: row.officer_id,
            name: (row.first_name + " " + row.last_name).trim(),
            badge: row.badge_number,
            rank: row.ranks?.name || "—",
            rankLevel: row.ranks?.level ?? null,
            division: row.divisions?.name || "—",
            status: row.status || "Off Duty",
            photo: row.photo_url,
            lastActive: row.updated_at
                ? new Date(row.updated_at).toLocaleDateString()
                : "—"
        }));

        this.renderList();

    }

    /* =========================
       LOAD RANKS + DIVISIONS
       (for create + promote)
    ========================== */

    async loadLookups() {

        if (!window.db) return;

        const [ranksRes, divisionsRes] = await Promise.all([
            db.from("ranks").select("*").order("level"),
            db.from("divisions").select("*")
        ]);

        this.ranks = ranksRes.data || [];
        this.divisions = divisionsRes.data || [];

    }

    /* =========================
       CREATE OFFICER
       (reads the modal inputs,
       returns true on success)
    ========================== */

    async createOfficer() {

        const fullName = document.getElementById("offName").value;
        const photo = document.getElementById("offPhoto")?.value || null;
        const divisionName = document.getElementById("offDivision")?.value || "";
        const rankName = document.getElementById("offRank")?.value || "";

        if (!fullName.trim()) {
            UI?.error("Name is required!");
            return false;
        }

        if (!window.db) {
            UI?.error("No database connection");
            return false;
        }

        const name = splitName(fullName);

        const officerId = generateOfficerId();

        const badge = "BDG-" + Math.floor(10000 + Math.random() * 90000);

        if (this.ranks.length === 0 && this.divisions.length === 0) {
            await this.loadLookups();
        }

        const rank = this.ranks.find(r =>
            r.name.toLowerCase() === rankName.toLowerCase());

        const division = this.divisions.find(d =>
            d.name.toLowerCase() === divisionName.trim().toLowerCase());

        /* SHIBA CLOUD share links become direct file URLs */

        const photoUrl = photo ? await resolveCloudPhoto(photo) : null;

        const { data, error } = await db
            .from("officers")
            .insert([{
                officer_id: officerId,
                first_name: name.first,
                last_name: name.last,
                badge_number: badge,
                photo_url: photoUrl,
                division_id: division?.id || null,
                rank_id: rank?.id || null,
                user_id: null,
                status: "Off Duty",
                hire_date: new Date().toISOString().slice(0, 10),
                notes: null
            }])
            .select();

        if (error) {
            console.error("CREATE OFFICER ERROR:", error);
            UI?.error("Error creating officer!");
            return false;
        }

        console.log("OFFICER CREATED:", data);

        await this.addTimeline(data[0].id, "Officer created");

        await this.load();

        UI?.success(officerId + " was successfully created");

        window.Notifications?.send?.(
            "system",
            "Officer Created",
            `${officerId} was successfully created`
        );

        return true;

    }

    /* =========================
       DELETE OFFICER
    ========================== */

    async deleteOfficer(id) {

        if (!window.db) return;

        /* timeline rows reference the officer, remove them first */

        await db
            .from("officer_timeline")
            .delete()
            .eq("officer_id", id);

        const { error } = await db
            .from("officers")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("DELETE OFFICER ERROR:", error);
            UI?.error("Error deleting officer!");
            return;
        }

        this.load();

    }

    /* =========================
       PROMOTE SYSTEM
       (uses the ranks table)
    ========================== */

    async promote(id) {

        if (!window.db) return;

        if (this.ranks.length === 0) {
            await this.loadLookups();
        }

        if (this.ranks.length === 0) {
            UI?.warning("No ranks defined in the database yet");
            return;
        }

        const officer = this.officers.find(o => o.id === id);

        if (!officer) return;

        const currentLevel = officer.rankLevel ?? -1;

        const next = this.ranks
            .filter(r => r.level > currentLevel)
            .sort((a, b) => a.level - b.level)[0];

        if (!next) {
            UI?.info(officer.name + " already has the highest rank");
            return;
        }

        const { error } = await db
            .from("officers")
            .update({ rank_id: next.id })
            .eq("id", id);

        if (error) {
            console.error("PROMOTE ERROR:", error);
            UI?.error("Error promoting officer!");
            return;
        }

        await this.addTimeline(id, "Promoted to " + next.name);

        this.load();

    }

    /* =========================
       TIMELINE (officer_timeline)
    ========================== */

    async addTimeline(officerId, text) {

        if (!window.db) return;

        const { error } = await db
            .from("officer_timeline")
            .insert([{
                officer_id: officerId,
                action: text,
                details: ""
            }]);

        if (error) {
            console.error("TIMELINE ERROR:", error);
        }

    }

    async getTimeline(officerId) {

        if (!window.db) return [];

        const { data, error } = await db
            .from("officer_timeline")
            .select("*")
            .eq("officer_id", officerId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("TIMELINE ERROR:", error);
            return [];
        }

        return data || [];

    }

    /* =========================
       SEARCH + FILTER
    ========================== */

    search(query) {

        const q = query.toLowerCase();

        return this.officers.filter(o =>
            o.name.toLowerCase().includes(q) ||
            o.badge.toLowerCase().includes(q) ||
            o.officerId.toLowerCase().includes(q) ||
            o.rank.toLowerCase().includes(q) ||
            o.division.toLowerCase().includes(q)
        );

    }

    /* =========================
       RENDER TABLE
    ========================== */

    render(list = this.officers) {

        const tbody = document.getElementById("officersTable");

        if (!tbody) return;

        tbody.innerHTML = "";

        if (list.length === 0) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="7">No officers yet — create one with ＋ Create Officer</td>
                </tr>
            `;

            return;

        }

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

    async view(id) {

        const officer = this.officers.find(o => o.id === id);

        if (!officer) return;

        currentOfficerId = id;

        document.getElementById("drawerName").innerText = officer.name;
        document.getElementById("drawerRank").innerText = officer.rank;
        document.getElementById("drawerBadge").innerText =
            officer.badge + " · " + officer.officerId;
        document.getElementById("drawerDivision").innerText = officer.division;
        document.getElementById("drawerStatus").innerText = officer.status;

        const photoUrl = await resolveCloudPhoto(officer.photo);

        document.getElementById("drawerPhoto").src =
            photoUrl || "https://via.placeholder.com/100";

        document.getElementById("officerDrawer")
            .classList.remove("hidden");

        const timeline = await this.getTimeline(id);

        const container = document.getElementById("drawerTimeline");

        container.innerHTML = "";

        if (timeline.length === 0) {

            container.innerHTML = "<p>No activity yet</p>";

        } else {

            timeline.forEach(t => {

                const div = document.createElement("div");

                div.className = "timelineItem";

                div.innerHTML = `
                    <small>${new Date(t.created_at).toLocaleString()}</small><br>
                    <span>${t.action}</span>
                    <hr>
                `;

                container.appendChild(div);

            });

        }

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

    Officers.loadLookups();

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

        confirmBtn.onclick = async () => {

            const ok = await Officers.createOfficer();

            if (!ok) return;

            modal.classList.add("hidden");

            document.getElementById("offName").value = "";
            document.getElementById("offDivision").value = "";
            document.getElementById("offPhoto").value = "";

        };

    }

    /* PICK PHOTO FROM SHIBA CLOUD */

    const pickBtn = document.getElementById("pickFromCloud");

    if (pickBtn) {

        pickBtn.onclick = () => {

            /* picker popup with its own session id */

            const sid = "from" +
                Math.random().toString(36).slice(2) +
                Math.random().toString(36).slice(2);

            window.__cloudPickSid = sid;

            window.open(
                "../cloud/?=" + sid,
                "shibaCloudPick",
                "width=760,height=820,popup=yes");

        };

        window.addEventListener("message", (e) => {

            if (e.origin !== location.origin) return;

            if (e.data?.type !== "shiba-pick") return;

            if (e.data.sid !== window.__cloudPickSid) return;

            const input = document.getElementById("offPhoto");

            if (input) input.value = e.data.share;

            UI?.success("Photo selected from SHIBA CLOUD: " + e.data.name);

        });

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
