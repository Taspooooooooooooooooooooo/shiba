/* ==========================================================
   SHIBA PIMS
   Certificate Studio (Phase 5) — issuing feels like signing
   an official document, not filling a form. Left: the steps.
   Right: a LIVE preview of the certificate that updates as
   you type. Smart templates pre-write the official wording
   per type; Generate creates a Pending certificate.
========================================================== */

const CertStudio = {

    officers: [],

    ranks: [],

    type: "Promotion",

    statementDirty: false,

    /* per-type official wording — {officer} {rank} resolve live */

    TEMPLATES: {

        "Promotion":
            "By the authority of the SHIBA Police Department, {officer} " +
            "is hereby promoted to the rank of {rank}, in recognition of " +
            "outstanding service and dedication to duty.",

        "Award":
            "The SHIBA Police Department hereby awards {officer} this " +
            "distinction in recognition of exceptional performance and " +
            "service beyond the call of duty.",

        "Commendation":
            "The SHIBA Police Department formally commends {officer} for " +
            "exemplary conduct and professionalism in the line of duty.",

        "Training":
            "This certifies that {officer} has successfully completed all " +
            "requirements of the prescribed training program.",

        "Firearm Qualification":
            "This certifies that {officer} has met all marksmanship and " +
            "safety standards required for firearm qualification.",

        "Medical":
            "This certifies that {officer} has completed the required " +
            "medical evaluation in accordance with department policy.",

        "Suspension":
            "By order of the SHIBA Police Department, {officer} is hereby " +
            "suspended from active duty pending further review.",

        "Probation":
            "By order of the SHIBA Police Department, {officer} is hereby " +
            "placed on probationary status subject to departmental review.",

        "Termination":
            "By order of the SHIBA Police Department, the service of " +
            "{officer} is hereby terminated effective as of the date below."

    },

    /* ----------------------------------------------------- */
    /* helpers                                                */
    /* ----------------------------------------------------- */

    currentOfficer() {

        const id = document.getElementById("stOfficer").value;

        return this.officers.find(o => o.id === id) || null;

    },

    officerLabel(o) {

        return o ? (o.officer_id + " — " +
            (o.first_name + " " + o.last_name).trim()) : "—";

    },

    resolvedStatement() {

        const o = this.currentOfficer();

        const rankSel = document.getElementById("stRank");

        const rank = rankSel.options[rankSel.selectedIndex]?.textContent
            || "the new rank";

        return document.getElementById("stStatement").value
            .replaceAll("{officer}", o
                ? (o.first_name + " " + o.last_name).trim()
                : "the officer")
            .replaceAll("{rank}", rank);

    },

    applyTemplate() {

        const o = this.currentOfficer();

        const rankSel = document.getElementById("stRank");

        const rank = rankSel.options[rankSel.selectedIndex]?.textContent
            || "the new rank";

        const text = (this.TEMPLATES[this.type] || "")
            .replaceAll("{officer}", o
                ? (o.first_name + " " + o.last_name).trim()
                : "the officer")
            .replaceAll("{rank}", rank);

        document.getElementById("stStatement").value = text;

        this.statementDirty = false;

    },

    /* ----------------------------------------------------- */
    /* live preview                                           */
    /* ----------------------------------------------------- */

    updatePreview() {

        const o = this.currentOfficer();

        const rankSel = document.getElementById("stRank");

        const rank = rankSel.options[rankSel.selectedIndex]?.textContent;

        document.getElementById("pvTitle").textContent =
            document.getElementById("stTitle").value.trim() ||
            this.type + " Certificate";

        document.getElementById("pvOfficer").textContent =
            "awarded to " + this.officerLabel(o) +
            (this.type === "Promotion" && rank ? " — " + rank : "");

        document.getElementById("pvStatement").textContent =
            this.resolvedStatement();

        document.getElementById("pvIssuedBy").textContent =
            localStorage.getItem("username") || "—";

        document.getElementById("pvEffective").textContent =
            document.getElementById("stDate").value || "—";

        document.getElementById("pvCreated").textContent =
            new Date().toLocaleDateString();

    },

    /* ----------------------------------------------------- */
    /* officer info card (read-only, auto-loaded)             */
    /* ----------------------------------------------------- */

    async renderOfficerCard() {

        const o = this.currentOfficer();

        const box = document.getElementById("stOfficerCard");

        if (!o) { box.innerHTML = ""; return; }

        box.innerHTML = `
            <img src="${o.photo_url || "https://via.placeholder.com/64"}" alt="">
            <div class="officerCardFields">
                <div><small>Name</small><b>${(o.first_name + " " + o.last_name).trim()}</b></div>
                <div><small>Officer ID</small><b>${o.officer_id}</b></div>
                <div><small>Badge</small><b>${o.badge_number}</b></div>
                <div><small>Current rank</small><b>${o.rankName || "—"}</b></div>
                <div><small>Division</small><b>${o.divisionName || "—"}</b></div>
                <div><small>Hired</small><b>${o.hire_date || "—"}</b></div>
            </div>`;

    },

    /* ----------------------------------------------------- */
    /* generate                                               */
    /* ----------------------------------------------------- */

    async generate() {

        const o = this.currentOfficer();

        if (!o) { UI.error("Pick an officer."); return; }

        const rankSel = document.getElementById("stRank");

        const btn = document.getElementById("studioGenerate");

        btn.disabled = true;

        btn.textContent = "Generating...";

        const result = await CertificateService.issue({
            officerId: o.id,
            officerLabel: this.officerLabel(o),
            officerUserId: o.user_id,
            type: this.type,
            title: document.getElementById("stTitle").value.trim() ||
                this.type + " Certificate",
            reason: this.resolvedStatement(),
            newRankId: this.type === "Promotion" ? rankSel.value : null,
            newRankName: this.type === "Promotion"
                ? rankSel.options[rankSel.selectedIndex]?.textContent
                : null,
            effectiveDate: document.getElementById("stDate").value || null
        });

        btn.disabled = false;

        btn.textContent = "Generate → Pending Approval";

        if (!result.ok) return;

        document.getElementById("studioStatus").textContent =
            "🟡 Pending Approval";

        document.getElementById("pvId").textContent =
            result.row.certificate_id;

        document.getElementById("pvStatus").textContent = "🟡 Pending";

        /* offer the real document (with its secure QR) */

        btn.textContent = "📄 Open the certificate";

        btn.onclick = () =>
            location.href = "certificates.html?view=" + result.row.id;

    },

    /* ----------------------------------------------------- */
    /* init                                                   */
    /* ----------------------------------------------------- */

    async init() {

        if (!window.db) return;

        if (!(await PermissionService.can("certificates.issue"))) {

            UI.error("You don't have permission to issue certificates.");

            setTimeout(() => location.href = "certificates.html", 1200);

            return;

        }

        /* lookups */

        const { data: officers } = await db
            .from("officers")
            .select("*, ranks(name), divisions(name)")
            .order("officer_id");

        this.officers = (officers || [])
            .filter(o => o.status !== "Retired" && o.status !== "Terminated")
            .map(o => {
                o.rankName = o.ranks?.name || null;
                o.divisionName = o.divisions?.name || null;
                return o;
            });

        const { data: ranks } = await db
            .from("ranks").select("id, name, level").order("level");

        this.ranks = ranks || [];

        /* type chips */

        const chips = document.getElementById("typeChips");

        CertificateService.TYPES.forEach(t => {

            const chip = document.createElement("button");

            chip.type = "button";

            chip.className = "typeChip" + (t === this.type ? " on" : "");

            chip.textContent = t;

            chip.onclick = () => {

                this.type = t;

                document.querySelectorAll(".typeChip").forEach(c =>
                    c.classList.toggle("on", c.textContent === t));

                document.getElementById("stRankRow")
                    .classList.toggle("hidden", t !== "Promotion");

                document.getElementById("stTitle").value = "";

                this.applyTemplate();

                this.updatePreview();

            };

            chips.appendChild(chip);

        });

        /* officer select */

        const officerSel = document.getElementById("stOfficer");

        this.officers.forEach(o => {

            const opt = document.createElement("option");

            opt.value = o.id;

            opt.textContent = this.officerLabel(o);

            officerSel.appendChild(opt);

        });

        const pre = new URLSearchParams(location.search).get("officer");

        if (pre) officerSel.value = pre;

        /* rank select */

        const rankSel = document.getElementById("stRank");

        this.ranks.forEach(r => {

            const opt = document.createElement("option");

            opt.value = r.id;

            opt.textContent = r.name;

            rankSel.appendChild(opt);

        });

        document.getElementById("stRankRow")
            .classList.toggle("hidden", this.type !== "Promotion");

        document.getElementById("stDate").value =
            new Date().toISOString().slice(0, 10);

        /* live wiring */

        officerSel.onchange = () => {

            this.renderOfficerCard();

            if (!this.statementDirty) this.applyTemplate();

            this.updatePreview();

        };

        rankSel.onchange = () => {

            if (!this.statementDirty) this.applyTemplate();

            this.updatePreview();

        };

        ["stTitle", "stDate"].forEach(id =>
            document.getElementById(id).addEventListener("input",
                () => this.updatePreview()));

        document.getElementById("stStatement").addEventListener("input",
            () => { this.statementDirty = true; this.updatePreview(); });

        document.getElementById("studioGenerate").onclick =
            () => this.generate();

        /* first paint */

        await this.renderOfficerCard();

        this.applyTemplate();

        this.updatePreview();

    }

};

document.addEventListener("DOMContentLoaded", () => CertStudio.init());

window.CertStudio = CertStudio;
