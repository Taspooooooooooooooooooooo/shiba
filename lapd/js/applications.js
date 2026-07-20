/* ==========================================================
   SHIBA PIMS
   Applications (Phase 5) — officers apply, Sergeant I+ review.

   Reworked:
     * the applicant is auto-detected from the signed-in account
       (no "applying as" picker)
     * a Google-Forms-style form: default questions per type, plus
       add / remove your own questions
     * optionally link one of your certificates (e.g. a Firearm
       Qualification)
     * edit & resubmit when a reviewer requests changes
     * reviewers OPEN each application in a detail dialog to decide
       (nothing sensitive is just listed in the open)
     * every dialog is in-app (UI.modal / UI.confirm / UI.promptText)
       — no native browser prompt / confirm / alert
========================================================== */

const Applications = {

    officer: null,      // the signed-in user's officer record

    certs: [],          // that officer's approved certificates

    type: null,

    canReview: false,

    /* --------------------------------------------------------- */
    /* helpers                                                    */
    /* --------------------------------------------------------- */

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    officerLabel(o) {
        return o ? (o.officer_id + " — " +
            (o.first_name + " " + o.last_name).trim()) : "—";
    },

    /* --------------------------------------------------------- */
    /* Google-Forms-style question cards                          */
    /* --------------------------------------------------------- */

    /* one question card. `custom` → the question label is an
       editable input (applicant-authored); otherwise it's a fixed
       label carried in data-q. Every card can be removed. */

    addQuestionCard(container, question, answer, custom, focus) {

        const card = document.createElement("div");

        card.className = "formQ";

        const remove = document.createElement("button");

        remove.type = "button";

        remove.className = "formQRemove";

        remove.textContent = "✕";

        remove.title = "Remove this question";

        remove.onclick = () => card.remove();

        card.appendChild(remove);

        if (custom) {

            const li = document.createElement("input");

            li.className = "formQLabelEdit";

            li.placeholder = "Type your question…";

            li.value = question || "";

            card.appendChild(li);

            if (focus) setTimeout(() => li.focus(), 20);

        } else {

            const l = document.createElement("label");

            l.className = "formQLabel";

            l.textContent = question;

            card.appendChild(l);

            card.dataset.q = question;

        }

        const ta = document.createElement("textarea");

        ta.className = "formQAnswer";

        ta.rows = 2;

        ta.value = answer || "";

        card.appendChild(ta);

        container.appendChild(card);

        return card;

    },

    collectAnswers(container) {

        const out = {};

        container.querySelectorAll(".formQ").forEach(card => {

            const custom = card.querySelector(".formQLabelEdit");

            const q = custom ? custom.value.trim() : (card.dataset.q || "");

            if (!q) return;

            out[q] = (card.querySelector(".formQAnswer")?.value || "").trim();

        });

        return out;

    },

    renderQuestions() {

        const box = document.getElementById("apQuestions");

        box.innerHTML = "";

        const def = ApplicationService.TYPES[this.type];

        if (!def) return;

        def.questions.forEach(q => this.addQuestionCard(box, q, "", false));

    },

    /* --------------------------------------------------------- */
    /* certificate link field (optional, all types)              */
    /* --------------------------------------------------------- */

    /* returns a label+select node, or null if the officer has no
       approved certificates to link. */

    makeCertField(selectedId) {

        if (!this.certs.length) return null;

        const wrap = document.createElement("div");

        const label = document.createElement("label");

        label.className = "wizLabel";

        label.innerHTML = pimsIcon("attach", 14) + " Link a certificate (optional)";

        const sel = document.createElement("select");

        sel.className = "certLinkSelect uiModalInput";

        sel.innerHTML =
            `<option value="">— none —</option>` +
            this.certs.map(c =>
                `<option value="${this.esc(c.certificate_id)}">` +
                `${this.esc(c.certificate_id)} · ${this.esc(c.type)}` +
                `${c.title ? " · " + this.esc(c.title) : ""}</option>`
            ).join("");

        if (selectedId) sel.value = selectedId;

        wrap.append(label, sel);

        return wrap;

    },

    renderCertLink() {

        const box = document.getElementById("apCertLink");

        box.innerHTML = "";

        const field = this.makeCertField("");

        if (field) box.appendChild(field);

    },

    /* --------------------------------------------------------- */
    /* submit                                                     */
    /* --------------------------------------------------------- */

    async submit() {

        if (!this.officer) {
            UI.error("Your account isn't linked to an officer.");
            return;
        }

        if (!this.type) { UI.error("Pick an application type."); return; }

        const answers = this.collectAnswers(
            document.getElementById("apQuestions"));

        const linked =
            document.querySelector("#apCertLink .certLinkSelect")?.value || null;

        const btn = document.getElementById("apSubmit");

        btn.disabled = true;

        const result = await ApplicationService.submit({
            officerId: this.officer.id,
            officerLabel: this.officerLabel(this.officer),
            officerUserId: this.officer.user_id,
            type: this.type,
            motivation: document.getElementById("apMotivation").value.trim(),
            answers: answers,
            linkedCertificate: linked
        });

        btn.disabled = false;

        if (result.ok) {

            document.getElementById("apMotivation").value = "";

            this.renderQuestions();

            const cs =
                document.querySelector("#apCertLink .certLinkSelect");

            if (cs) cs.value = "";

            this.refresh();

        }

    },

    /* --------------------------------------------------------- */
    /* My Applications (own only — not everyone's)               */
    /* --------------------------------------------------------- */

    myAppRow(app) {

        const row = document.createElement("div");

        row.className = "certItem";

        const info = document.createElement("div");

        info.className = "certInfo";

        info.innerHTML =
            `<strong>${this.esc(app.application_id || "—")}</strong> ` +
            `<span class="grantKind">${this.esc(app.type)}</span>` +
            `<span class="certStatus">` +
            ApplicationService.statusChip(app.status) + `</span>` +
            `<small>${new Date(app.created_at).toLocaleDateString()}` +
            `${app.reviewed_by ? " · by " + this.esc(app.reviewed_by) : ""}` +
            `</small>` +
            (app.motivation
                ? `<div class="apMot">${this.esc(app.motivation)}</div>` : "");

        /* a reviewer's requested-changes / denial note, made prominent */

        if (app.decision_reason &&
            (app.status === "Changes Requested" || app.status === "Denied")) {

            const note = document.createElement("div");

            note.style.cssText =
                "margin-top:8px;padding:10px 12px;border-radius:10px;" +
                "background:" +
                (app.status === "Denied" ? "#ff556618" : "#f5a62318") + ";" +
                "border:1px solid " +
                (app.status === "Denied" ? "#ff556644" : "#f5a62344") + ";" +
                "color:#e6d6b0;font-size:12.5px";

            note.textContent =
                (app.status === "Denied" ? "Denied: " : "Changes requested: ")
                + app.decision_reason;

            info.appendChild(note);

        }

        row.appendChild(info);

        /* edit & resubmit when changes were requested */

        if (app.status === "Changes Requested") {

            const actions = document.createElement("div");

            actions.className = "certActions";

            const edit = document.createElement("button");

            edit.className = "primaryBtn";

            edit.textContent = "Edit & resubmit";

            edit.onclick = () => this.openEdit(app);

            actions.appendChild(edit);

            row.appendChild(actions);

        }

        return row;

    },

    /* --------------------------------------------------------- */
    /* edit & resubmit (applicant, in-app modal)                 */
    /* --------------------------------------------------------- */

    openEdit(app) {

        let qBox, certBox, motField;

        UI.modal({

            title: "Edit " + app.application_id + " · " + app.type,

            buttons: [],   /* custom footer built below */

            render: close => {

                const wrap = document.createElement("div");

                if (app.decision_reason) {

                    const n = document.createElement("div");

                    n.style.cssText =
                        "margin-bottom:12px;padding:10px 12px;border-radius:10px;" +
                        "background:#f5a62318;border:1px solid #f5a62344;" +
                        "color:#e6d6b0;font-size:12.5px";

                    n.textContent =
                        "Reviewer asked: " + app.decision_reason;

                    wrap.appendChild(n);

                }

                qBox = document.createElement("div");

                const answers = (app.answers && typeof app.answers === "object")
                    ? app.answers : {};

                const entries = Object.entries(answers);

                if (entries.length) {

                    entries.forEach(([q, a]) =>
                        this.addQuestionCard(qBox, q, a, false));

                } else {

                    const def = ApplicationService.TYPES[app.type];

                    (def?.questions || []).forEach(q =>
                        this.addQuestionCard(qBox, q, "", false));

                }

                wrap.appendChild(qBox);

                const addBtn = document.createElement("button");

                addBtn.type = "button";

                addBtn.className = "formAddQ";

                addBtn.innerHTML = pimsIcon("add", 14) + " Add a question";

                addBtn.onclick = () =>
                    this.addQuestionCard(qBox, "", "", true, true);

                wrap.appendChild(addBtn);

                certBox = document.createElement("div");

                const cf = this.makeCertField(app.linked_certificate);

                if (cf) certBox.appendChild(cf);

                wrap.appendChild(certBox);

                const ml = document.createElement("label");

                ml.className = "wizLabel";

                ml.textContent = "Motivation (short summary)";

                motField = document.createElement("textarea");

                motField.className = "uiModalInput";

                motField.rows = 3;

                motField.value = app.motivation || "";

                wrap.append(ml, motField);

                /* custom footer so Save can stay open on failure */

                const foot = document.createElement("div");

                foot.className = "uiModalFoot";

                const cancel = document.createElement("button");

                cancel.className = "ghostBtn";

                cancel.textContent = "Cancel";

                cancel.onclick = () => close(null);

                const save = document.createElement("button");

                save.className = "primaryBtn";

                save.textContent = "Resubmit";

                save.onclick = async () => {

                    save.disabled = true;

                    const result = await ApplicationService.update(app, {
                        motivation: motField.value.trim(),
                        answers: this.collectAnswers(qBox),
                        linkedCertificate:
                            certBox.querySelector(".certLinkSelect")?.value || null
                    });

                    save.disabled = false;

                    if (result.ok) { close(null); this.refresh(); }

                };

                foot.append(cancel, save);

                wrap.appendChild(foot);

                return wrap;

            }

        });

    },

    /* --------------------------------------------------------- */
    /* Review Queue (Sergeant I+): compact rows -> Open dialog   */
    /* --------------------------------------------------------- */

    reviewRow(app) {

        const row = document.createElement("div");

        row.className = "reviewRow";

        const main = document.createElement("div");

        main.className = "rrMain";

        main.innerHTML =
            `<div class="rrTitle">${this.esc(app.application_id)} ` +
            `<span class="grantKind">${this.esc(app.type)}</span> ` +
            `<span class="certStatus">` +
            ApplicationService.statusChip(app.status) + `</span></div>` +
            `<div class="rrSub">${this.esc(app.officer_label)} · ` +
            `${new Date(app.created_at).toLocaleDateString()}` +
            `${app.linked_certificate ? " · " +
                this.esc(app.linked_certificate) : ""}</div>`;

        const open = document.createElement("button");

        open.className = "primaryBtn";

        open.textContent = "Open";

        open.onclick = () => this.openDetail(app);

        row.append(main, open);

        return row;

    },

    async openDetail(app) {

        const decision = await UI.modal({

            title: app.application_id + " · " + app.type,

            render: () => {

                const wrap = document.createElement("div");

                const meta = document.createElement("p");

                meta.className = "uiModalMsg";

                meta.innerHTML =
                    `<b>${this.esc(app.officer_label)}</b> · ` +
                    ApplicationService.statusChip(app.status) + ` · ` +
                    new Date(app.created_at).toLocaleString();

                wrap.appendChild(meta);

                if (app.motivation) {

                    const m = document.createElement("div");

                    m.className = "apMot";

                    m.textContent = app.motivation;

                    wrap.appendChild(m);

                }

                const answers = (app.answers && typeof app.answers === "object")
                    ? Object.entries(app.answers) : [];

                answers.forEach(([q, a]) => {

                    const qa = document.createElement("div");

                    qa.className = "detailQa";

                    const b = document.createElement("b");

                    b.textContent = q;

                    const s = document.createElement("span");

                    s.textContent = a || "—";

                    qa.append(b, s);

                    wrap.appendChild(qa);

                });

                if (app.linked_certificate) {

                    const lc = document.createElement("div");

                    lc.className = "linkedCert";

                    lc.innerHTML = pimsIcon("attach", 13) + " Linked certificate: " +
                        app.linked_certificate;

                    wrap.appendChild(lc);

                }

                if (app.decision_reason) {

                    const dr = document.createElement("p");

                    dr.className = "uiModalMsg";

                    dr.style.marginTop = "10px";

                    dr.innerHTML = "<b>Last note:</b> " +
                        this.esc(app.decision_reason);

                    wrap.appendChild(dr);

                }

                return wrap;

            },

            buttons: [
                { label: "Close", kind: "ghost", value: null },
                { label: "Request changes", kind: "ghost", value: "changes" },
                { label: "Deny", kind: "danger", value: "deny" },
                { label: "Accept", kind: "primary", value: "accept" }
            ]

        });

        if (!decision) return;

        if (decision === "accept") {

            const def = ApplicationService.TYPES[app.type];

            const grants = [
                def?.grantsDivision ? "the " + def.grantsDivision + " division" : "",
                def?.grantsGroup ? "the " + def.grantsGroup + " group" : ""
            ].filter(Boolean).join(" and ");

            const ok = await UI.confirm({
                title: "Accept this application?",
                message: "Accepting " + app.application_id +
                    (grants ? " will grant " + app.officer_label +
                        " " + grants + "." : "."),
                confirmText: "Accept"
            });

            if (!ok) return;

            if (await ApplicationService.decide(app, "Accepted", null))
                this.refresh();

            return;

        }

        if (decision === "deny") {

            const reason = await UI.promptText({
                title: "Deny " + app.application_id,
                label: "Reason (the applicant will see this)",
                placeholder: "Why is this being denied?",
                multiline: true,
                required: true,
                confirmText: "Deny application"
            });

            if (reason === null) return;

            if (await ApplicationService.decide(app, "Denied", reason))
                this.refresh();

            return;

        }

        if (decision === "changes") {

            const reason = await UI.promptText({
                title: "Request changes · " + app.application_id,
                label: "What should the applicant change?",
                placeholder: "Describe what needs fixing…",
                multiline: true,
                required: true,
                confirmText: "Send request"
            });

            if (reason === null) return;

            if (await ApplicationService.decide(
                app, "Changes Requested", reason)) this.refresh();

        }

    },

    /* --------------------------------------------------------- */
    /* refresh both lists                                        */
    /* --------------------------------------------------------- */

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

                rows.forEach(a => box.appendChild(this.reviewRow(a)));

            }

        }

        const all = document.getElementById("appList");

        if (!this.officer) {

            all.innerHTML =
                "<p class='muted'>Your account isn't linked to an officer, " +
                "so you have no applications.</p>";

            return;

        }

        const { rows, error } =
            await ApplicationService.forOfficer(this.officer.id);

        if (error) {

            all.innerHTML =
                `<p class="muted">${ApplicationService.SETUP_HINT}</p>`;

            return;

        }

        all.innerHTML = "";

        if (!rows.length) {

            all.innerHTML =
                "<p class='muted'>You haven't submitted any applications yet.</p>";

            return;

        }

        rows.forEach(a => all.appendChild(this.myAppRow(a)));

    },

    /* --------------------------------------------------------- */
    /* init                                                       */
    /* --------------------------------------------------------- */

    async init() {

        if (!window.db) return;

        this.canReview = await PermissionService.can("applications.review");

        if (this.canReview) {

            document.getElementById("reviewCard").classList.remove("hidden");

        }

        /* auto-detect the signed-in officer */

        this.officer = await PermissionService.myOfficer();

        const banner = document.getElementById("applyingAs");

        if (this.officer) {

            const initials =
                ((this.officer.first_name || "?")[0] +
                 (this.officer.last_name || "")[0] || "?").toUpperCase();

            banner.querySelector(".aaAvatar").textContent = initials;

            banner.querySelector(".aaName").textContent =
                (this.officer.first_name + " " +
                 this.officer.last_name).trim() || "—";

            banner.querySelector(".aaMeta").textContent =
                this.officer.officer_id +
                (this.officer.divisions?.name
                    ? " · " + this.officer.divisions.name : "");

            document.getElementById("apSubmit").disabled = false;

            document.getElementById("apAddQ").disabled = false;

            /* load this officer's approved certificates for linking */

            const { rows } =
                await CertificateService.forOfficer(this.officer.id);

            this.certs = (rows || []).filter(c =>
                c.status === "Approved" && !c.revoked_at);

        } else {

            banner.querySelector(".aaAvatar").innerHTML = pimsIcon("alerts", 20);

            banner.querySelector(".aaName").textContent =
                "No officer linked to this account";

            banner.querySelector(".aaMeta").textContent =
                "Ask an admin to link your account to an officer to apply.";

            /* disable the apply controls */

            document.getElementById("apSubmit").disabled = true;

            document.getElementById("apAddQ").disabled = true;

        }

        /* type chips */

        const chips = document.getElementById("apTypes");

        Object.entries(ApplicationService.TYPES).forEach(([key, def], i) => {

            const chip = document.createElement("button");

            chip.type = "button";

            chip.className = "typeChip";

            chip.innerHTML = (def.icon ? pimsIcon(def.icon, 15) + " " : "") +
                Applications.esc(def.label);

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

        /* add-question + certificate link + submit */

        document.getElementById("apAddQ").onclick = () =>
            this.addQuestionCard(
                document.getElementById("apQuestions"), "", "", true, true);

        this.renderCertLink();

        document.getElementById("apSubmit").onclick = () => this.submit();

        this.refresh();

    }

};

document.addEventListener("DOMContentLoaded", () => Applications.init());

window.Applications = Applications;
