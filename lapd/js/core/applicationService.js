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
            label: "SWAT",
            icon: "ballistics",
            questions: [
                "Why do you want to join SWAT?",
                "Relevant tactical experience?",
                "Firearm qualification status?"
            ],
            grantsDivision: "SWAT",
            grantsGroup: null
        },

        "K9": {
            label: "K9 Unit",
            icon: "k9",
            questions: [
                "Why the K9 unit?",
                "Experience handling animals?"
            ],
            grantsDivision: "K9",
            grantsGroup: null
        },

        "Detective": {
            label: "Detective",
            icon: "forensics",
            questions: [
                "Why do you want to become a Detective?",
                "Notable cases you've worked?"
            ],
            grantsDivision: "Detectives",
            grantsGroup: null
        },

        "Traffic": {
            label: "Traffic",
            icon: "patrol",
            questions: ["Why the Traffic division?"],
            grantsDivision: "Traffic",
            grantsGroup: null
        },

        "Transfer": {
            label: "Division Transfer",
            icon: "sync",
            questions: [
                "Which division do you want to transfer to?",
                "Reason for the transfer?"
            ],
            grantsDivision: null,
            grantsGroup: null
        },

        "Training": {
            label: "Training Program",
            icon: "bookings",
            questions: [
                "Which training program?",
                "Why should you be selected?"
            ],
            grantsDivision: null,
            grantsGroup: "training-officer"
        },

        "Special Permission": {
            label: "Special Permission",
            icon: "access",
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

        const color =
            status === "Accepted" ? "#22c55e"
            : status === "Denied" ? "#ef4444"
            : status === "Changes Requested" ? "#f97316"
            : status === "Under Review" ? "#3b82f6"
            : "#eab308";

        return `<span class="dotChip"><i style="background:${color}"></i>` +
            `${status || "Submitted"}</span>`;

    },

    /* ----------------------------------------------------- */
    /* submit                                                 */
    /* ----------------------------------------------------- */

    /* true when an error is "that column doesn't exist yet" —
       lets the app keep working before PATCH 10 is run. */

    _missingColumn(error, col) {

        const s = ((error?.message || "") + " " + (error?.code || ""))
            .toLowerCase();

        return s.includes("pgrst204") ||
            (s.includes(col.toLowerCase()) &&
             (s.includes("does not exist") || s.includes("could not find") ||
              s.includes("schema cache")));

    },

    async submit({ officerId, officerLabel, officerUserId, type,
                   motivation, answers, linkedCertificate }) {

        if (!window.db) return { ok: false };

        const appId = await IdService.next("APPLICATION");

        const base = {
            application_id: appId,
            officer_id: officerId,
            type: type,
            motivation: motivation || null,
            answers: answers || {}
        };

        let { data, error } = await db
            .from("applications")
            .insert([{ ...base, linked_certificate: linkedCertificate || null }])
            .select();

        /* PATCH 10 not run yet → retry without the new column */

        if (error && this._missingColumn(error, "linked_certificate")) {

            if (linkedCertificate) {
                UI?.warning("Certificate link needs PATCH-10 — " +
                    "submitted without it.");
            }

            ({ data, error } = await db
                .from("applications")
                .insert([base])
                .select());

        }

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

        const base = {
            motivation: motivation || null,
            answers: answers || {},
            status: "Submitted",
            decision_reason: null,
            reviewed_by: null,
            decided_at: null
        };

        let { error } = await db
            .from("applications")
            .update({
                ...base,
                linked_certificate: linkedCertificate || null,
                updated_at: new Date().toISOString()
            })
            .eq("id", app.id)
            .eq("officer_id", app.officer_id);

        /* PATCH 10 not run yet → retry without the new columns */

        if (error &&
            (this._missingColumn(error, "linked_certificate") ||
             this._missingColumn(error, "updated_at"))) {

            ({ error } = await db
                .from("applications")
                .update(base)
                .eq("id", app.id)
                .eq("officer_id", app.officer_id));

        }

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
