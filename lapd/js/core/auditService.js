/* ==========================================================
   SHIBA PIMS — Core Service
   AuditService — every important action lands in the
   audit_logs table with its own AUDIT-2026-… id, the acting
   user, and the target. Never throws — auditing must not
   break the action it describes.
========================================================== */

const AuditService = {

    /* AuditService.log({
           action:  "OFFICER_CREATED",
           target:  "OFCR-000002 John Smith",
           details: "division Metro",
           officerId: "<officer uuid>"   (optional link)
       }) */

    async log({ action, target = null, details = null, officerId = null }) {

        if (!window.db || !action) return;

        try {

            const actionId = await IdService.next("AUDIT");

            let userId = null;

            try {

                const { data } = await db.auth.getUser();

                userId = data?.user?.id || null;

            } catch (e) { /* anonymous */ }

            const row = {
                action_id: actionId,
                user_id: userId,
                officer_id: officerId,
                action: action,
                target: target,
                details: details,
                user_agent: navigator.userAgent
            };

            let { error } = await db.from("audit_logs").insert([row]);

            /* the acting account may have no profile row —
               keep the log, drop the link */

            if (error && /foreign key|violates/i.test(error.message)) {

                row.user_id = null;

                ({ error } = await db.from("audit_logs").insert([row]));

            }

            if (error) console.error("AUDIT ERROR:", error);

        } catch (e) {

            console.error("AUDIT ERROR:", e);

        }

    },

    /* latest audit entries, optionally for one officer */

    async list(limit = 50, officerId = null) {

        if (!window.db) return [];

        let query = db
            .from("audit_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit);

        if (officerId) query = query.eq("officer_id", officerId);

        const { data, error } = await query;

        if (error) {

            console.error("AUDIT LIST ERROR:", error);

            return [];

        }

        return data || [];

    }

};

window.AuditService = AuditService;
