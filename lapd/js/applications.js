/* ==========================================================
   SHIBA PIMS
   Applications (Phase 5) — officers apply, Sergeant+ review.
========================================================== */

const Applications = {

    officers: [],

    type: null,

    canReview: false,

    async loadOfficers() {

        const { data } = await db
            .from("officers")
            .select("id, officer_id, first_name, last_name, user_id, status")
            .order("officer_id");

        this.officers = (data || []).filter(o =>
            o.status !== "Retired" && o.status !== "Terminated");

    },

    officerLabel(o) {

        return o ? (o.officer_id + " — " +
            (o.first_name + " " + o.last_name).trim()) : "—";

    },

    currentOfficer() {

        const id = document.getElementById("apOfficer").value;

        return this.officers.find(o => o.id === id) || null;

    },

    /* ----------------------------------------------------- */
    /* apply form                                             */
    /* ----------------------------------------------------- */

    renderQuestions() {

        const box = document.getElementById("apQuestions");

        box.innerHTML = "";

        const def = ApplicationService.TYPES[this.type];

        if (!def) return;

        def.questions.forEach((q, i) => {

            const label = document.createElement("label");

            label.className = "wizLabel";

            label.textContent = q;

            const input = document.createElement("input");

            input.className = "apAnswer";

            input.dataset.q = q;

            input.id = "apQ" + i;

            box.append(label, input);

        });

    },

    async submit() {

        const officer = this.currentOfficer();

        if (!officer) { UI.error("Pick an officer."); return; }

        if (!this.type) { UI.error("Pick an application type."); return; }

        const answers = {};

        document.querySelectorAll("#apQuestions .apAnswer").forEach(inp => {

            answers[inp.dataset.q] = inp.value.trim();

        });

        const btn = document.getElementById("apSubmit");

        btn.disabled = true;

        const result = await ApplicationService.submit({
            officerId: officer.id,
            officerLabel: this.officerLabel(officer),
            officerUserId: officer.user_id,
            type: this.type,
            motivation: document.getElementById("apMotivation").value.trim(),
            answers: answers
        });

        btn.disabled = false;

        if (result.ok) {

            document.getElementById("apMotivation").value = "";

            document.querySelectorAll("#apQuestions .apAnswer")
                .forEach(i => i.value = "");

            this.refresh();

        }

    },

    /* ----------------------------------------------------- */
    /* rows                                                   */
    /* ----------------------------------------------------- */

    appRow(app, withActions) {

        const row = document.createElement("div");

        row.className = "certItem";

        const answers = app.answers && typeof app.answers === "object"
            ? Object.entries(app.answers)
                .map(([q, a]) => `<div class="apQa"><b>${q}</b> ${a || "—"}</div>`)
                .join("")
            : "";

        row.innerHTML =
            `<div class="certInfo">` +
            `<strong>${app.application_id || "—"}</strong> ` +
            `<span class="grantKind">${app.type}</span>` +
            `<span class="certStatus">` +
            ApplicationService.statusChip(app.status) + `</span>` +
            `<small>${app.officer_label} · ` +
            `${new Date(app.created_at).toLocaleDateString()}` +
            `${app.reviewed_by ? " · by " + app.reviewed_by : ""}` +
            `${app.decision_reason ? " · " + app.decision_reason : ""}</small>` +
            (app.motivation ? `<div class="apMot">${app.motivation}</div>` : "") +
            answers +
            `</div>`;

        if (withActions && this.canReview &&
            ["Submitted", "Under Review", "Changes Requested"]
                .includes(app.status)) {

            const actions = document.createElement("div");

            actions.className = "certActions";

            const accept = document.createElement("button");

            accept.className = "primaryBtn";

            accept.textContent = "✅ Accept";

            accept.onclick = async () => {

                if (await ApplicationService.decide(app, "Accepted", null)) {

                    this.refresh();

                }

            };

            const deny = document.createElement("button");

            deny.className = "dangerBtn";

            deny.textContent = "Deny";

            deny.onclick = async () => {

                const reason = prompt("Reason for denial:");

                if (reason === null) return;

                if (await ApplicationService.decide(app, "Denied", reason)) {

                    this.refresh();

                }

            };

            const changes = document.createElement("button");

            changes.textContent = "Request changes";

            changes.onclick = async () => {

                const reason = prompt("What needs changing?");

                if (reason === null) return;

                if (await ApplicationService.decide(
                    app, "Changes Requested", reason)) {

                    this.refresh();

                }

            };

            actions.append(accept, deny, changes);

            row.appendChild(actions);

        }

        return row;

    },

    async refresh() {

        if (this.canReview) {

            const box = document.getElementById("reviewList");

            const { rows, error } = await ApplicationService.listOpen();

            if (error) {

                box.innerHTML =
                    `<p class="muted">${ApplicationService.SETUP_HINT}</p>`;

            } else {

                document.getElementById("reviewCount").textContent =
                    rows.length + " open";

                box.innerHTML = "";

                if (!rows.length) {

                    box.innerHTML =
                        "<p class='muted'>No applications to review.</p>";

                }

                rows.forEach(a => box.appendChild(this.appRow(a, true)));

            }

        }

        const all = document.getElementById("appList");

        const { rows, error } = await ApplicationService.listAll(50);

        if (error) {

            all.innerHTML =
                `<p class="muted">${ApplicationService.SETUP_HINT}</p>`;

            return;

        }

        all.innerHTML = "";

        if (!rows.length) {

            all.innerHTML = "<p class='muted'>No applications yet.</p>";

            return;

        }

        rows.forEach(a => all.appendChild(this.appRow(a, false)));

    },

    /* ----------------------------------------------------- */
    /* init                                                   */
    /* ----------------------------------------------------- */

    async init() {

        if (!window.db) return;

        this.canReview = await PermissionService.can("applications.review");

        if (this.canReview) {

            document.getElementById("reviewCard").classList.remove("hidden");

        }

        await this.loadOfficers();

        const officerSel = document.getElementById("apOfficer");

        this.officers.forEach(o => {

            const opt = document.createElement("option");

            opt.value = o.id;

            opt.textContent = this.officerLabel(o);

            officerSel.appendChild(opt);

        });

        const pre = new URLSearchParams(location.search).get("officer");

        if (pre) officerSel.value = pre;

        /* type chips */

        const chips = document.getElementById("apTypes");

        Object.entries(ApplicationService.TYPES).forEach(([key, def], i) => {

            const chip = document.createElement("button");

            chip.type = "button";

            chip.className = "typeChip";

            chip.textContent = def.label;

            chip.onclick = () => {

                this.type = key;

                document.querySelectorAll("#apTypes .typeChip")
                    .forEach(c => c.classList.remove("on"));

                chip.classList.add("on");

                this.renderQuestions();

            };

            chips.appendChild(chip);

            if (i === 0) chip.click();

        });

        document.getElementById("apSubmit").onclick = () => this.submit();

        this.refresh();

    }

};

document.addEventListener("DOMContentLoaded", () => Applications.init());

window.Applications = Applications;
