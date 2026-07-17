/* ==========================================================
   SHIBA PIMS — Core Service
   CaseService (Phase 6) — a case is a CONTAINER (a digital
   case file), not a form. Creating one fans out across the
   whole system: ID → folder → assignments → timeline →
   audit → notifications → dashboard.

   Sprint 6.1: cases + assignments, dashboard, create wizard,
   the create cascade, and status advancement. Notes,
   evidence, persons, relationships and the Kanban board
   arrive in later 6.x sprints.
========================================================== */

const CaseService = {

    /* full lifecycle — nothing is ever hard-deleted; Archived
       is the terminal state. */

    STATUSES: [
        "Draft",
        "Open",
        "Investigation",
        "Evidence Collection",
        "Supervisor Review",
        "Approved For Closing",
        "Closed",
        "Archived"
    ],

    PRIORITIES: ["Low", "Medium", "High", "Critical"],

    INCIDENT_TYPES: [
        "Patrol Stop", "Theft", "Burglary", "Robbery", "Assault",
        "Homicide", "Narcotics", "Traffic Collision", "DUI",
        "Domestic Disturbance", "Vandalism", "Fraud", "Missing Person",
        "Pursuit", "Weapons", "Other"
    ],

    ROLES: [
        "Lead Investigator",
        "Officer",
        "Supervisor",
        "Evidence Technician"
    ],

    SETUP_HINT:
        "Cases need a one-time setup — run lapd/SETUP-PATCH-11.sql " +
        "(or RUN-ALL-PENDING.sql) in the Supabase SQL Editor.",

    /* ----------------------------------------------------- */
    /* display helpers                                        */
    /* ----------------------------------------------------- */

    statusChip(status) {

        const map = {
            "Draft": "⚪ Draft",
            "Open": "🟢 Open",
            "Investigation": "🔵 Investigation",
            "Evidence Collection": "🟣 Evidence Collection",
            "Supervisor Review": "🟠 Supervisor Review",
            "Approved For Closing": "🟡 Approved For Closing",
            "Closed": "🔴 Closed",
            "Archived": "⚫ Archived"
        };

        return map[status] || status || "—";

    },

    priorityChip(priority) {

        const map = {
            "Low": "🟢 Low",
            "Medium": "🟡 Medium",
            "High": "🟠 High",
            "Critical": "🔴 Critical"
        };

        return map[priority] || priority || "—";

    },

    /* status transitions offered in the UI (forward + a couple
       of supervisor moves). The full review workflow — Request
       Closure / Approve / Reopen — is Sprint 6.4. */

    nextStatuses(current) {

        const i = this.STATUSES.indexOf(current);

        const out = [];

        if (i >= 0 && i < this.STATUSES.length - 1) {

            out.push(this.STATUSES[i + 1]);          /* advance one step */

        }

        if (current !== "Draft" && current !== "Open") {

            out.push("Open");                        /* send back to Open */

        }

        return [...new Set(out)].filter(s => s !== current);

    },

    /* ----------------------------------------------------- */
    /* create — the 8-step cascade                            */
    /* ----------------------------------------------------- */

    /* assignees: [{ officerId, userId, label, role }] — the lead
       is included here with role "Lead Investigator". */

    async create({ title, incidentType, divisionId, priority, location,
                   incidentDate, incidentTime, description,
                   leadOfficerId, assignees = [], createdBy }) {

        if (!window.db) return { ok: false };

        if (!title) { UI?.error("A case title is required."); return { ok: false }; }

        const caseId = await IdService.next("CASE");

        const { data, error } = await db
            .from("cases")
            .insert([{
                case_id: caseId,
                title: title,
                incident_type: incidentType || null,
                division_id: divisionId || null,
                priority: priority || "Medium",
                location: location || null,
                incident_date: incidentDate || null,
                incident_time: incidentTime || null,
                description: description || null,
                status: "Open",
                lead_officer_id: leadOfficerId || null,
                created_by: createdBy || null
            }])
            .select();

        if (error) {

            console.error("CASE CREATE ERROR:", error);

            UI?.error(this.SETUP_HINT);

            return { ok: false, reason: error.message };

        }

        const row = data[0];

        /* assignments (lead + any extra officers) */

        const rows = assignees
            .filter(a => a.officerId)
            .map(a => ({
                case_id: row.id,
                officer_id: a.officerId,
                role: a.role || "Officer",
                assigned_by: createdBy || null
            }));

        if (rows.length) {

            const { error: aErr } = await db
                .from("case_assignments")
                .insert(rows);

            if (aErr) console.warn("case assignment insert:", aErr.message);

        }

        /* fan-out: audit + per-officer timeline + notifications */

        AuditService.log({
            action: "CASE_CREATED",
            target: caseId + " — " + title,
            details: (incidentType ? incidentType + " · " : "") +
                (priority || "Medium"),
            officerId: leadOfficerId || null
        });

        for (const a of assignees) {

            if (!a.officerId) continue;

            TimelineService.add(a.officerId, "Assigned to a case",
                caseId + " · " + (a.role || "Officer"));

            if (a.userId) {

                NotificationService.send({
                    to: a.userId,
                    title: "New case assignment",
                    message: "You were assigned to " + caseId + " (" + title +
                        ") as " + (a.role || "Officer") + "."
                });

            }

        }

        UI?.success(caseId + " created");

        return { ok: true, row: row };

    },

    /* ----------------------------------------------------- */
    /* status change                                          */
    /* ----------------------------------------------------- */

    async setStatus(caseRow, newStatus, actorLabel) {

        if (!window.db) return false;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const patch = { status: newStatus, updated_at: new Date().toISOString() };

        if (newStatus === "Closed" || newStatus === "Archived") {

            patch.closed_at = new Date().toISOString();

        }

        const { error } = await db
            .from("cases")
            .update(patch)
            .eq("id", caseRow.id);

        if (error) { UI?.error("Could not update the status."); return false; }

        AuditService.log({
            action: "CASE_STATUS_CHANGED",
            target: caseRow.case_id,
            details: (caseRow.status || "—") + " → " + newStatus,
            officerId: caseRow.lead_officer_id || null
        });

        if (caseRow.lead_officer_id) {

            TimelineService.add(caseRow.lead_officer_id, "Case status changed",
                caseRow.case_id + " · " + newStatus);

        }

        UI?.success(caseRow.case_id + " · " + newStatus);

        return true;

    },

    /* ----------------------------------------------------- */
    /* queries                                                */
    /* ----------------------------------------------------- */

    async list({ search, status, priority, divisionId } = {}) {

        let q = db
            .from("cases")
            .select("*, divisions(name)")
            .order("updated_at", { ascending: false })
            .limit(200);

        if (status) q = q.eq("status", status);

        if (priority) q = q.eq("priority", priority);

        if (divisionId) q = q.eq("division_id", divisionId);

        if (search) {

            const s = search.trim();

            q = q.or(
                `case_id.ilike.%${s}%,title.ilike.%${s}%,location.ilike.%${s}%`);

        }

        const { data, error } = await q;

        if (error) return { error };

        return { rows: data || [] };

    },

    async byId(id) {

        const { data, error } = await db
            .from("cases")
            .select("*, divisions(name)")
            .eq("id", id)
            .maybeSingle();

        if (error || !data) return { error: error || { message: "not found" } };

        return { row: data };

    },

    async assignments(caseUuid) {

        const { data, error } = await db
            .from("case_assignments")
            .select("*, officers(officer_id, first_name, last_name, user_id)")
            .eq("case_id", caseUuid)
            .order("assigned_at", { ascending: true });

        if (error) return { error };

        return { rows: (data || []).map(r => {

            r.officer_label = r.officers
                ? (r.officers.officer_id + " " +
                   (r.officers.first_name + " " + r.officers.last_name).trim())
                : "—";

            return r;

        }) };

    }

};

window.CaseService = CaseService;
