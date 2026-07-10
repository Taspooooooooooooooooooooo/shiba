/* ==========================================================
   SHIBA PIMS — Core Service
   CertificateService — the official document system.
   Nothing changes rank with a button: a certificate is
   issued (Pending), then approved by Lieutenant+ — and THAT
   triggers the cascade: rank update → timeline → audit →
   notification. Every certificate carries a secret QR token
   that only our scanner + database can validate.
========================================================== */

const CertificateService = {

    TYPES: [
        "Promotion",
        "Award",
        "Commendation",
        "Training",
        "Firearm Qualification",
        "Medical",
        "Suspension",
        "Probation",
        "Termination"
    ],

    SETUP_HINT:
        "Certificates need a one-time setup — run lapd/SETUP-PATCH-8.sql " +
        "(or RUN-ALL-PENDING.sql) in the Supabase SQL Editor.",

    /* ----------------------------------------------------- */
    /* issue — creates a PENDING certificate                  */
    /* ----------------------------------------------------- */

    async issue({ officerId, officerLabel, officerUserId,
                  type, title, reason, newRankId, newRankName,
                  effectiveDate }) {

        if (!window.db) return { ok: false, reason: "No database" };

        if (!(await PermissionService.require("certificates.issue"))) {

            return { ok: false, reason: "No permission" };

        }

        const certId = await IdService.next("CERTIFICATE");

        const issuedBy = localStorage.getItem("username") || "unknown";

        const { data, error } = await db
            .from("certificates")
            .insert([{
                certificate_id: certId,
                officer_id: officerId,
                type: type,
                title: title || type,
                reason: reason || null,
                new_rank_id: newRankId || null,
                effective_date: effectiveDate || null,
                issued_by: issuedBy
            }])
            .select();

        if (error) {

            console.error("CERTIFICATE ISSUE ERROR:", error);

            UI?.error(this.SETUP_HINT);

            return { ok: false, reason: error.message };

        }

        AuditService.log({
            action: "CERTIFICATE_ISSUED",
            target: certId + " (" + type + ") — " + officerLabel,
            details: (newRankName ? "new rank " + newRankName + "; " : "") +
                (reason || ""),
            officerId: officerId
        });

        TimelineService.add(officerId,
            "Certificate issued (pending approval)",
            certId + " · " + type);

        if (officerUserId) {

            NotificationService.send({
                to: officerUserId,
                title: "Certificate Pending",
                message: "A " + type + " certificate (" + certId +
                    ") was issued for you and awaits approval."
            });

        }

        UI?.success(certId + " issued — pending approval");

        return { ok: true, row: data[0] };

    },

    /* ----------------------------------------------------- */
    /* approve — THE cascade                                  */
    /* ----------------------------------------------------- */

    async approve(cert) {

        if (!window.db) return false;

        /* promotions need promotion.approve; the rest
           certificates.approve — both via the Policy Engine */

        const policyName = cert.type === "Promotion"
            ? "promotion.approve" : "certificates.approve";

        const allowed = cert.type === "Promotion"
            ? await PermissionService.checkPolicy("promotion.approve")
            : { allowed: await PermissionService.can("certificates.approve"),
                reason: "Requires Lieutenant or above." };

        if (!allowed.allowed) {

            UI?.error(allowed.reason);

            return false;

        }

        const approver = localStorage.getItem("username") || "unknown";

        const { error } = await db
            .from("certificates")
            .update({
                status: "Approved",
                approved_by: approver,
                approved_at: new Date().toISOString()
            })
            .eq("id", cert.id);

        if (error) {

            console.error("CERTIFICATE APPROVE ERROR:", error);

            UI?.error("Could not approve the certificate.");

            return false;

        }

        /* the cascade */

        if (cert.type === "Promotion" && cert.new_rank_id) {

            await db
                .from("officers")
                .update({ rank_id: cert.new_rank_id })
                .eq("id", cert.officer_id);

            TimelineService.add(cert.officer_id,
                "Promoted to " + (cert.new_rank_name || "new rank"),
                "approved via " + cert.certificate_id);

        } else {

            TimelineService.add(cert.officer_id,
                cert.type + " certificate approved",
                cert.certificate_id);

        }

        AuditService.log({
            action: cert.type === "Promotion"
                ? "PROMOTION_APPROVED" : "CERTIFICATE_APPROVED",
            target: cert.certificate_id + " — " + (cert.officer_label || ""),
            details: cert.type +
                (cert.new_rank_name ? " → " + cert.new_rank_name : ""),
            officerId: cert.officer_id
        });

        if (cert.officer_user_id) {

            NotificationService.send({
                to: cert.officer_user_id,
                title: cert.type === "Promotion"
                    ? "Promotion Approved" : "Certificate Approved",
                message: cert.type === "Promotion"
                    ? "Congratulations! Your promotion to " +
                      (cert.new_rank_name || "a new rank") +
                      " is official (" + cert.certificate_id + ")."
                    : "Your " + cert.type + " certificate (" +
                      cert.certificate_id + ") was approved."
            });

        }

        UI?.success(cert.certificate_id + " approved");

        return true;

    },

    /* ----------------------------------------------------- */
    /* reject                                                 */
    /* ----------------------------------------------------- */

    async reject(cert, reason) {

        if (!window.db) return false;

        if (!(await PermissionService.can("certificates.approve"))) {

            UI?.error("Requires Lieutenant or above.");

            return false;

        }

        const approver = localStorage.getItem("username") || "unknown";

        const { error } = await db
            .from("certificates")
            .update({
                status: "Rejected",
                approved_by: approver,
                approved_at: new Date().toISOString(),
                reason: (cert.reason ? cert.reason + " | " : "") +
                    "REJECTED: " + (reason || "no reason given")
            })
            .eq("id", cert.id);

        if (error) {

            UI?.error("Could not reject the certificate.");

            return false;

        }

        AuditService.log({
            action: "CERTIFICATE_REJECTED",
            target: cert.certificate_id + " — " + (cert.officer_label || ""),
            details: reason || "",
            officerId: cert.officer_id
        });

        TimelineService.add(cert.officer_id,
            cert.type + " certificate rejected",
            cert.certificate_id + (reason ? " · " + reason : ""));

        if (cert.officer_user_id) {

            NotificationService.send({
                to: cert.officer_user_id,
                title: "Certificate Rejected",
                message: "Your " + cert.type + " certificate (" +
                    cert.certificate_id + ") was rejected." +
                    (reason ? " Reason: " + reason : "")
            });

        }

        UI?.success(cert.certificate_id + " rejected");

        return true;

    },

    /* ----------------------------------------------------- */
    /* queries                                                */
    /* ----------------------------------------------------- */

    baseSelect() {

        return "*, officers(officer_id, first_name, last_name, user_id), " +
               "ranks(name)";

    },

    decorate(row) {

        if (!row) return row;

        row.officer_label = row.officers
            ? (row.officers.officer_id + " " +
               (row.officers.first_name + " " +
                row.officers.last_name).trim())
            : "—";

        row.officer_user_id = row.officers?.user_id || null;

        row.new_rank_name = row.ranks?.name || null;

        return row;

    },

    async listPending() {

        const { data, error } = await db
            .from("certificates")
            .select(this.baseSelect())
            .eq("status", "Pending")
            .order("created_at", { ascending: true });

        if (error) return { error };

        return { rows: (data || []).map(r => this.decorate(r)) };

    },

    async listAll(limit = 50) {

        const { data, error } = await db
            .from("certificates")
            .select(this.baseSelect())
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) return { error };

        return { rows: (data || []).map(r => this.decorate(r)) };

    },

    async forOfficer(officerId) {

        const { data, error } = await db
            .from("certificates")
            .select(this.baseSelect())
            .eq("officer_id", officerId)
            .order("created_at", { ascending: false });

        if (error) return { error };

        return { rows: (data || []).map(r => this.decorate(r)) };

    },

    async byId(id) {

        const { data, error } = await db
            .from("certificates")
            .select(this.baseSelect())
            .eq("id", id)
            .maybeSingle();

        if (error || !data) return null;

        return this.decorate(data);

    },

    /* ----------------------------------------------------- */
    /* secure QR                                              */
    /* ----------------------------------------------------- */

    scannerUrl(token) {

        return location.origin + "/lapd/scanner.html?t=" + token;

    },

    async verifyToken(token) {

        if (!window.db) return { valid: false };

        try {

            const { data, error } = await db
                .rpc("verify_qr_token", { p_token: (token || "").trim() });

            if (error) return { valid: false, setup: true };

            return data || { valid: false };

        } catch (e) {

            return { valid: false };

        }

    },

    statusChip(status, revoked) {

        if (revoked) return "⚫ Revoked";

        if (status === "Approved") return "🟢 Approved";

        if (status === "Rejected") return "🔴 Rejected";

        return "🟡 Pending";

    }

};

window.CertificateService = CertificateService;
