/* ==========================================================
   SHIBA PIMS — Core Service
   ApplicationService — officers apply for special assignments;
   Sergeant+ review them. Same request → approval spirit as
   certificates. Accepting an application can grant a division
   or a permission group.
========================================================== */

const ApplicationService = {

    /* each type defines who may apply (min rank tier is not
       enforced here — everyone may apply), its form questions,
       and what accepting it grants. */

    TYPES: {

        "SWAT": {
            label: "🔫 SWAT",
            questions: [
                "Why do you want to join SWAT?",
                "Relevant tactical experience?",
                "Firearm qualification status?"
            ],
            grantsDivision: "SWAT",
            grantsGroup: null
        },

        "K9": {
            label: "🐕 K9 Unit",
            questions: [
                "Why the K9 unit?",
                "Experience handling animals?"
            ],
            grantsDivision: "K9",
            grantsGroup: null
        },

        "Detective": {
            label: "🕵️ Detective",
            questions: [
                "Why do you want to become a Detective?",
                "Notable cases you've worked?"
            ],
            grantsDivision: "Detectives",
            grantsGroup: null
        },

        "Traffic": {
            label: "🚦 Traffic",
            questions: ["Why the Traffic division?"],
            grantsDivision: "Traffic",
            grantsGroup: null
        },

        "Transfer": {
            label: "🔄 Division Transfer",
            questions: [
                "Which division do you want to transfer to?",
                "Reason for the transfer?"
            ],
            grantsDivision: null,
            grantsGroup: null
        },

        "Training": {
            label: "🎓 Training Program",
            questions: [
                "Which training program?",
                "Why should you be selected?"
            ],
            grantsDivision: null,
            grantsGroup: "training-officer"
        },

        "Special Permission": {
            label: "🛡 Special Permission",
            questions: [
                "Which permission or duty are you requesting?",
                "Justification?"
            ],
            grantsDivision: null,
            grantsGroup: null
        }

    },

    SETUP_HINT:
        "Applications need a one-time setup — run lapd/SETUP-PATCH-9.sql " +
        "(or RUN-ALL-PENDING.sql) in the Supabase SQL Editor.",

    statusChip(status) {

        if (status === "Accepted") return "🟢 Accepted";
        if (status === "Denied") return "🔴 Denied";
        if (status === "Changes Requested") return "🟠 Changes Requested";
        if (status === "Under Review") return "🔵 Under Review";
        return "🟡 Submitted";

    },

    /* ----------------------------------------------------- */
    /* submit                                                 */
    /* ----------------------------------------------------- */

    async submit({ officerId, officerLabel, officerUserId, type,
                   motivation, answers, linkedCertificate }) {

        if (!window.db) return { ok: false };

        const appId = await IdService.next("APPLICATION");

        const { data, error } = await db
            .from("applications")
            .insert([{
                application_id: appId,
                officer_id: officerId,
                type: type,
                motivation: motivation || null,
                answers: answers || {},
                linked_certificate: linkedCertificate || null
            }])
            .select();

        if (error) {

            console.error("APPLICATION SUBMIT ERROR:", error);

            UI?.error(this.SETUP_HINT);

            return { ok: false, reason: error.message };

        }

        AuditService.log({
            action: "APPLICATION_SUBMITTED",
            target: appId + " (" + type + ") — " + officerLabel,
            officerId: officerId
        });

        TimelineService.add(officerId, "Application submitted",
            appId + " · " + type);

        UI?.success(appId + " submitted");

        return { ok: true, row: data[0] };

    },

    /* ----------------------------------------------------- */
    /* update — applicant edits & resubmits after changes     */
    /*          were requested. Owner-guarded by officerId.   */
    /* ----------------------------------------------------- */

    async update(app, { motivation, answers, linkedCertificate }) {

        if (!window.db) return { ok: false };

        if (app.status !== "Changes Requested") {

            UI?.error("Only applications with changes requested can be edited.");

            return { ok: false };

        }

        const { error } = await db
            .from("applications")
            .update({
                motivation: motivation || null,
                answers: answers || {},
                linked_certificate: linkedCertificate || null,
                status: "Submitted",
                decision_reason: null,
                reviewed_by: null,
                decided_at: null,
                updated_at: new Date().toISOString()
            })
            .eq("id", app.id)
            .eq("officer_id", app.officer_id);

        if (error) {

            console.error("APPLICATION UPDATE ERROR:", error);

            UI?.error("Could not save your changes.");

            return { ok: false, reason: error.message };

        }

        AuditService.log({
            action: "APPLICATION_RESUBMITTED",
            target: app.application_id + " (" + app.type + ")",
            officerId: app.officer_id
        });

        TimelineService.add(app.officer_id, "Application resubmitted",
            app.application_id + " · " + app.type);

        UI?.success(app.application_id + " resubmitted");

        return { ok: true };

    },

    /* ----------------------------------------------------- */
    /* decide — accept / deny / request changes               */
    /* ----------------------------------------------------- */

    async decide(app, decision, reason) {

        if (!window.db) return false;

        if (!(await PermissionService.can("applications.review"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        if (decision !== "Accepted" && !reason) {

            UI?.error("A reason is required.");

            return false;

        }

        const reviewer = localStorage.getItem("username") || "unknown";

        const { error } = await db
            .from("applications")
            .update({
                status: decision,
                reviewed_by: reviewer,
                decision_reason: reason || null,
                decided_at: new Date().toISOString()
            })
            .eq("id", app.id);

        if (error) {

            UI?.error("Could not save the decision.");

            return false;

        }

        /* accepting can grant a division and/or a permission group */

        if (decision === "Accepted") {

            const def = this.TYPES[app.type];

            if (def?.grantsDivision) {

                const { data: division } = await db
                    .from("divisions")
                    .select("id")
                    .ilike("name", def.grantsDivision)
                    .maybeSingle();

                if (division) {

                    await db.from("officers")
                        .update({ division_id: division.id })
                        .eq("id", app.officer_id);

                }

            }

            if (def?.grantsGroup) {

                const { data: officer } = await db
                    .from("officers")
                    .select("permission_groups")
                    .eq("id", app.officer_id)
                    .maybeSingle();

                const groups = officer?.permission_groups || [];

                if (!groups.includes(def.grantsGroup)) {

                    groups.push(def.grantsGroup);

                    await db.from("officers")
                        .update({ permission_groups: groups })
                        .eq("id", app.officer_id);

                }

            }

        }

        AuditService.log({
            action: "APPLICATION_" + decision.toUpperCase().replace(" ", "_"),
            target: app.application_id + " — " + (app.officer_label || ""),
            details: app.type + (reason ? " · " + reason : ""),
            officerId: app.officer_id
        });

        TimelineService.add(app.officer_id,
            "Application " + decision.toLowerCase(),
            app.application_id + (reason ? " · " + reason : ""));

        if (app.officer_user_id) {

            NotificationService.send({
                to: app.officer_user_id,
                title: "Application " + decision,
                message: "Your " + app.type + " application (" +
                    app.application_id + ") was " + decision.toLowerCase() +
                    "." + (reason ? " " + reason : "")
            });

        }

        UI?.success(app.application_id + " · " + decision);

        return true;

    },

    /* ----------------------------------------------------- */
    /* queries                                                */
    /* ----------------------------------------------------- */

    baseSelect() {

        return "*, officers(officer_id, first_name, last_name, user_id)";

    },

    decorate(row) {

        if (!row) return row;

        row.officer_label = row.officers
            ? (row.officers.officer_id + " " +
               (row.officers.first_name + " " +
                row.officers.last_name).trim())
            : "—";

        row.officer_user_id = row.officers?.user_id || null;

        return row;

    },

    async listOpen() {

        const { data, error } = await db
            .from("applications")
            .select(this.baseSelect())
            .in("status", ["Submitted", "Under Review", "Changes Requested"])
            .order("created_at", { ascending: true });

        if (error) return { error };

        return { rows: (data || []).map(r => this.decorate(r)) };

    },

    async listAll(limit = 50) {

        const { data, error } = await db
            .from("applications")
            .select(this.baseSelect())
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) return { error };

        return { rows: (data || []).map(r => this.decorate(r)) };

    },

    async forOfficer(officerId) {

        const { data, error } = await db
            .from("applications")
            .select(this.baseSelect())
            .eq("officer_id", officerId)
            .order("created_at", { ascending: false });

        if (error) return { error };

        return { rows: (data || []).map(r => this.decorate(r)) };

    }

};

window.ApplicationService = ApplicationService;
