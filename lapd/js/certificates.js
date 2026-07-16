/* ==========================================================
   SHIBA PIMS
   Certificates Center (Phase 5)
   Issue → Pending → Approve (Lieutenant+) → the cascade.
   Every certificate document carries a secure QR that only
   the SHIBA Scanner + our database can validate.
========================================================== */

const Certificates = {

    officers: [],

    ranks: [],

    canIssue: false,

    canApprove: false,

    /* ----------------------------------------------------- */
    /* setup                                                  */
    /* ----------------------------------------------------- */

    async loadLookups() {

        const { data: officers } = await db
            .from("officers")
            .select("id, officer_id, first_name, last_name, user_id, status")
            .order("officer_id");

        this.officers = (officers || []).filter(o =>
            o.status !== "Retired" && o.status !== "Terminated");

        const { data: ranks } = await db
            .from("ranks")
            .select("id, name, level")
            .order("level");

        this.ranks = ranks || [];

    },

    officerLabel(o) {

        return o.officer_id + " — " +
            (o.first_name + " " + o.last_name).trim();

    },

    fillForm() {

        const officerSel = document.getElementById("certOfficer");

        officerSel.innerHTML = "";

        this.officers.forEach(o => {

            const opt = document.createElement("option");

            opt.value = o.id;

            opt.textContent = this.officerLabel(o);

            officerSel.appendChild(opt);

        });

        const typeSel = document.getElementById("certType");

        typeSel.innerHTML = "";

        CertificateService.TYPES.forEach(t => {

            const opt = document.createElement("option");

            opt.textContent = t;

            typeSel.appendChild(opt);

        });

        const rankSel = document.getElementById("certRank");

        rankSel.innerHTML = "";

        this.ranks.forEach(r => {

            const opt = document.createElement("option");

            opt.value = r.id;

            opt.textContent = r.name;

            rankSel.appendChild(opt);

        });

        /* promotions show the rank picker */

        typeSel.onchange = () => {

            rankSel.classList.toggle("hidden",
                typeSel.value !== "Promotion");

        };

        /* ?officer=<uuid> preselects (from Personnel File) */

        const pre = new URLSearchParams(location.search).get("officer");

        if (pre) officerSel.value = pre;

        document.getElementById("certDate").value =
            new Date().toISOString().slice(0, 10);

    },

    /* ----------------------------------------------------- */
    /* issue                                                  */
    /* ----------------------------------------------------- */

    async issue() {

        const officerId = document.getElementById("certOfficer").value;

        const officer = this.officers.find(o => o.id === officerId);

        if (!officer) {

            UI.error("Pick an officer.");

            return;

        }

        const type = document.getElementById("certType").value;

        const rankSel = document.getElementById("certRank");

        const newRankId = type === "Promotion" ? rankSel.value : null;

        const newRankName = type === "Promotion"
            ? rankSel.options[rankSel.selectedIndex]?.textContent
            : null;

        const btn = document.getElementById("certIssue");

        btn.disabled = true;

        const result = await CertificateService.issue({
            officerId: officerId,
            officerLabel: this.officerLabel(officer),
            officerUserId: officer.user_id,
            type: type,
            title: document.getElementById("certTitle").value.trim(),
            reason: document.getElementById("certReason").value.trim(),
            newRankId: newRankId,
            newRankName: newRankName,
            effectiveDate: document.getElementById("certDate").value || null
        });

        btn.disabled = false;

        if (result.ok) {

            document.getElementById("certTitle").value = "";

            document.getElementById("certReason").value = "";

            this.refresh();

        }

    },

    /* ----------------------------------------------------- */
    /* lists                                                  */
    /* ----------------------------------------------------- */

    certRow(cert, withActions) {

        const row = document.createElement("div");

        row.className = "certItem";

        const info = document.createElement("div");

        info.className = "certInfo";

        info.innerHTML =
            `<strong>${cert.certificate_id || "—"}</strong> ` +
            `<span class="grantKind">${cert.type}</span>` +
            `<span class="certStatus">${CertificateService.statusChip(cert.status, cert.revoked_at)}</span>` +
            `<small>${cert.officer_label}` +
            `${cert.new_rank_name ? " · → " + cert.new_rank_name : ""}` +
            `${cert.reason ? " · " + cert.reason : ""}` +
            ` · ${new Date(cert.created_at).toLocaleDateString()}</small>`;

        row.appendChild(info);

        const actions = document.createElement("div");

        actions.className = "certActions";

        const view = document.createElement("button");

        view.textContent = "📄 View";

        view.onclick = () => this.openDocument(cert);

        actions.appendChild(view);

        if (withActions && this.canApprove && cert.status === "Pending") {

            const approve = document.createElement("button");

            approve.className = "primaryBtn";

            approve.textContent = "✅ Approve";

            approve.onclick = async () => {

                if (await CertificateService.approve(cert)) this.refresh();

            };

            const reject = document.createElement("button");

            reject.className = "dangerBtn";

            reject.textContent = "Reject";

            reject.onclick = async () => {

                const reason = prompt("Reason for rejection:");

                if (reason === null) return;

                if (await CertificateService.reject(cert, reason)) {

                    this.refresh();

                }

            };

            actions.append(approve, reject);

        }

        row.appendChild(actions);

        return row;

    },

    async refresh() {

        /* pending queue (approvers only) */

        if (this.canApprove) {

            const box = document.getElementById("pendingList");

            const { rows, error } = await CertificateService.listPending();

            if (error) {

                box.innerHTML =
                    `<p class="muted">${CertificateService.SETUP_HINT}</p>`;

            } else {

                document.getElementById("pendingCount").textContent =
                    rows.length + " waiting";

                box.innerHTML = "";

                if (!rows.length) {

                    box.innerHTML =
                        "<p class='muted'>Nothing waiting for approval.</p>";

                }

                rows.forEach(c => box.appendChild(this.certRow(c, true)));

            }

        }

        /* all certificates */

        const all = document.getElementById("certList");

        const { rows, error } = await CertificateService.listAll(50);

        if (error) {

            all.innerHTML =
                `<p class="muted">${CertificateService.SETUP_HINT}</p>`;

            return;

        }

        all.innerHTML = "";

        if (!rows.length) {

            all.innerHTML = "<p class='muted'>No certificates yet.</p>";

            return;

        }

        rows.forEach(c => all.appendChild(this.certRow(c, false)));

    },

    /* ----------------------------------------------------- */
    /* the official document                                  */
    /* ----------------------------------------------------- */

    openDocument(cert) {

        document.getElementById("cdType").textContent =
            cert.title || cert.type;

        document.getElementById("cdOfficer").textContent =
            "awarded to " + cert.officer_label +
            (cert.new_rank_name ? " — " + cert.new_rank_name : "");

        document.getElementById("cdReason").textContent = cert.reason || "";

        document.getElementById("cdId").textContent =
            cert.certificate_id || "—";

        document.getElementById("cdStatus").textContent =
            CertificateService.statusChip(cert.status, cert.revoked_at);

        document.getElementById("cdIssuedBy").textContent =
            cert.issued_by || "—";

        document.getElementById("cdApprovedBy").textContent =
            cert.approved_by || "—";

        document.getElementById("cdEffective").textContent =
            cert.effective_date || "—";

        document.getElementById("cdCreated").textContent =
            new Date(cert.created_at).toLocaleDateString();

        /* secure QR — encodes the scanner URL with the secret token */

        const qrBox = document.getElementById("cdQr");

        qrBox.innerHTML = "";

        try {

            const qr = qrcode(0, "M");

            qr.addData(CertificateService.scannerUrl(cert.qr_token));

            qr.make();

            qrBox.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0 });

        } catch (e) {

            qrBox.innerHTML = "<small class='muted'>QR unavailable</small>";

        }

        /* PDF417 credential strip — same secret token, licence-style */

        CertificateService.renderPdf417(
            document.getElementById("cdPdf417"),
            CertificateService.barcodePayload(cert));

        document.getElementById("certModal").classList.remove("hidden");

        AuditService.log({
            action: "CERTIFICATE_VIEWED",
            target: cert.certificate_id + " — " + cert.officer_label,
            officerId: cert.officer_id
        });

    },

    /* ----------------------------------------------------- */
    /* init                                                   */
    /* ----------------------------------------------------- */

    async init() {

        if (!window.db) return;

        /* deep link with an officer → straight into the Studio */

        const pre = new URLSearchParams(location.search).get("officer");

        if (pre) {

            location.href = "cert-studio.html?officer=" + pre;

            return;

        }

        this.canIssue = await PermissionService.can("certificates.issue");

        this.canApprove =
            await PermissionService.can("certificates.approve");

        if (this.canIssue) {

            document.getElementById("issueCard").classList.remove("hidden");

        }

        if (this.canApprove) {

            document.getElementById("pendingCard").classList.remove("hidden");

        }

        document.getElementById("cdClose").onclick = () =>
            document.getElementById("certModal").classList.add("hidden");

        document.getElementById("cdPrint").onclick = () => window.print();

        await this.refresh();

        /* deep link from a Personnel File: ?view=<uuid> */

        const viewId = new URLSearchParams(location.search).get("view");

        if (viewId) {

            const cert = await CertificateService.byId(viewId);

            if (cert) this.openDocument(cert);

        }

    }

};

document.addEventListener("DOMContentLoaded", () => Certificates.init());

window.Certificates = Certificates;
