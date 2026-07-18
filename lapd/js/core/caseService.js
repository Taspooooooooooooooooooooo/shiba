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

    SETUP_HINT_62:
        "This tab needs a one-time setup — run lapd/SETUP-PATCH-12.sql " +
        "(or RUN-ALL-PENDING.sql) in the Supabase SQL Editor.",

    /* ----------------------------------------------------- */
    /* case timeline — the CASE'S own chronological history   */
    /* (separate from officer_timeline). Fire-and-forget:     */
    /* degrades silently until PATCH-12 is run.               */
    /* ----------------------------------------------------- */

    async caseEvent(caseUuid, event, details) {

        if (!window.db || !caseUuid) return;

        try {

            await db.from("case_timeline").insert([{
                case_id: caseUuid,
                event: event,
                details: details || null,
                actor: localStorage.getItem("username") || null
            }]);

        } catch (e) { /* table missing — PATCH-12 not run yet */ }

    },

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

        /* fan-out: case timeline + audit + per-officer timeline +
           notifications. MUST be awaited — the wizard navigates to
           the new case file right after create() resolves, and an
           un-awaited request would be cancelled by the navigation. */

        const fanout = [];

        fanout.push(this.caseEvent(row.id, "Case created",
            title + (incidentType ? " · " + incidentType : "")));

        fanout.push(AuditService.log({
            action: "CASE_CREATED",
            target: caseId + " — " + title,
            details: (incidentType ? incidentType + " · " : "") +
                (priority || "Medium"),
            officerId: leadOfficerId || null
        }));

        for (const a of assignees) {

            if (!a.officerId) continue;

            fanout.push(this.caseEvent(row.id, "Officer assigned",
                a.label + " · " + (a.role || "Officer")));

            fanout.push(TimelineService.add(a.officerId,
                "Assigned to a case",
                caseId + " · " + (a.role || "Officer")));

            if (a.userId) {

                fanout.push(NotificationService.send({
                    to: a.userId,
                    title: "New case assignment",
                    message: "You were assigned to " + caseId + " (" + title +
                        ") as " + (a.role || "Officer") + "."
                }));

            }

        }

        await Promise.allSettled(fanout);

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

        this.caseEvent(caseRow.id, "Status changed",
            (caseRow.status || "—") + " → " + newStatus);

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

    },

    async timeline(caseUuid) {

        const { data, error } = await db
            .from("case_timeline")
            .select("*")
            .eq("case_id", caseUuid)
            .order("created_at", { ascending: false })
            .limit(200);

        if (error) return { error };

        return { rows: data || [] };

    },

    /* audit entries about this case (matched on the CASE- id) */

    async audit(casePublicId) {

        const { data, error } = await db
            .from("audit_logs")
            .select("*")
            .ilike("target", "%" + casePublicId + "%")
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) return { error };

        return { rows: data || [] };

    },

    /* ----------------------------------------------------- */
    /* notes — author + pinned + edited marker; never deleted */
    /* ----------------------------------------------------- */

    async notes(caseUuid) {

        const { data, error } = await db
            .from("case_notes")
            .select("*")
            .eq("case_id", caseUuid)
            .order("pinned", { ascending: false })
            .order("created_at", { ascending: false });

        if (error) return { error };

        return { rows: data || [] };

    },

    async addNote(caseRow, body) {

        if (!window.db || !body?.trim()) return false;

        const { error } = await db
            .from("case_notes")
            .insert([{
                case_id: caseRow.id,
                author: localStorage.getItem("username") || null,
                body: body.trim()
            }]);

        if (error) {

            UI?.error(this.SETUP_HINT_62);

            return false;

        }

        this.caseEvent(caseRow.id, "Note added", null);

        AuditService.log({
            action: "CASE_NOTE_ADDED",
            target: caseRow.case_id
        });

        return true;

    },

    /* only the author edits their own note (client-side check —
       same trust level as the rest of the permission gating) */

    async editNote(note, body) {

        if (!window.db || !body?.trim()) return false;

        const me = localStorage.getItem("username") || "";

        if (note.author && note.author !== me) {

            UI?.error("Only the author can edit this note.");

            return false;

        }

        const { error } = await db
            .from("case_notes")
            .update({ body: body.trim(),
                      edited_at: new Date().toISOString() })
            .eq("id", note.id);

        if (error) { UI?.error("Could not save the note."); return false; }

        return true;

    },

    async togglePin(note) {

        if (!window.db) return false;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const { error } = await db
            .from("case_notes")
            .update({ pinned: !note.pinned })
            .eq("id", note.id);

        if (error) { UI?.error("Could not update the note."); return false; }

        return true;

    },

    /* ----------------------------------------------------- */
    /* assignment management — the same fan-out as creating   */
    /* ----------------------------------------------------- */

    async assign(caseRow, { officerId, userId, label, role }) {

        if (!window.db || !officerId) return false;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const { error } = await db
            .from("case_assignments")
            .insert([{
                case_id: caseRow.id,
                officer_id: officerId,
                role: role || "Officer",
                assigned_by: localStorage.getItem("username") || null
            }]);

        if (error) {

            /* unique (case_id, officer_id) — already on the case */

            if ((error.code || "") === "23505" ||
                /duplicate|unique/i.test(error.message || "")) {

                UI?.error("That officer is already on this case.");

            } else {

                UI?.error("Could not assign the officer.");

            }

            return false;

        }

        this.caseEvent(caseRow.id, "Officer assigned",
            label + " · " + (role || "Officer"));

        AuditService.log({
            action: "CASE_OFFICER_ASSIGNED",
            target: caseRow.case_id + " — " + label,
            details: role || "Officer",
            officerId: officerId
        });

        TimelineService.add(officerId, "Assigned to a case",
            caseRow.case_id + " · " + (role || "Officer"));

        if (userId) {

            NotificationService.send({
                to: userId,
                title: "New case assignment",
                message: "You were assigned to " + caseRow.case_id + " (" +
                    caseRow.title + ") as " + (role || "Officer") + "."
            });

        }

        UI?.success(label + " assigned");

        return true;

    },

    /* the row is removed, but the case timeline + audit keep the
       full history of who was on the case. */

    async unassign(caseRow, assignment) {

        if (!window.db) return false;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const { error } = await db
            .from("case_assignments")
            .delete()
            .eq("id", assignment.id);

        if (error) { UI?.error("Could not remove the assignment."); return false; }

        this.caseEvent(caseRow.id, "Officer removed",
            assignment.officer_label + " · " + assignment.role);

        AuditService.log({
            action: "CASE_OFFICER_REMOVED",
            target: caseRow.case_id + " — " + assignment.officer_label,
            details: assignment.role,
            officerId: assignment.officer_id
        });

        TimelineService.add(assignment.officer_id, "Removed from a case",
            caseRow.case_id);

        if (assignment.officers?.user_id) {

            NotificationService.send({
                to: assignment.officers.user_id,
                title: "Case assignment removed",
                message: "You were removed from " + caseRow.case_id + " (" +
                    caseRow.title + ")."
            });

        }

        UI?.success(assignment.officer_label + " removed");

        return true;

    },

    /* ----------------------------------------------------- */
    /* evidence (Sprint 6.3) — every piece is its own object  */
    /* with an EVID- id and a SHA-256 hash of the file.       */
    /* Evidence is never deleted from the UI.                 */
    /* ----------------------------------------------------- */

    EVIDENCE_TYPES: ["Photo", "Video", "Audio", "Document",
                     "Bodycam", "Other"],

    PERSON_ROLES: ["Victim", "Witness", "Suspect", "Other"],

    SETUP_HINT_63:
        "This tab needs a one-time setup — run lapd/SETUP-PATCH-13.sql " +
        "(or RUN-ALL-PENDING.sql) in the Supabase SQL Editor.",

    /* storage uses a dedicated ANON client — the cloud bucket's
       policies are anon-only, so the authenticated session client
       gets rejected (learned in v0.10.1). */

    _storage: null,

    storage() {

        if (!this._storage) {

            this._storage = window.supabase.createClient(
                "https://vtqyqzuhifzqzqszhtwq.supabase.co",
                "sb_publishable_NunfAEMxNJA39nzFxtn42g_hsmzxcv8",
                { auth: { persistSession: false, autoRefreshToken: false } }
            ).storage;

        }

        return this._storage;

    },

    /* SHA-256 of the file, computed in the browser before upload —
       later re-hashing the file proves it wasn't tampered with */

    async sha256(file) {

        const buf = await file.arrayBuffer();

        const digest = await crypto.subtle.digest("SHA-256", buf);

        return [...new Uint8Array(digest)]
            .map(b => b.toString(16).padStart(2, "0")).join("");

    },

    async evidence(caseUuid) {

        const { data, error } = await db
            .from("case_evidence")
            .select("*")
            .eq("case_id", caseUuid)
            .order("created_at", { ascending: false });

        if (error) return { error };

        return { rows: data || [] };

    },

    /* 11-char share id — the same format SHIBA Cloud uses */

    cloudFileId() {

        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
                      "abcdefghijklmnopqrstuvwxyz0123456789";

        const bytes = new Uint8Array(11);

        crypto.getRandomValues(bytes);

        return [...bytes].map(b => chars[b % chars.length]).join("");

    },

    async addEvidence(caseRow, { file, type, description }) {

        if (!window.db) return false;

        const evId = await IdService.next("EVIDENCE",
            () => "EVID-" + String(Date.now()).slice(-6));

        let fileUrl = null, fileName = null, fileSize = null, hash = null;

        let uploadedPath = null, cloudId = null;

        if (file) {

            hash = await this.sha256(file);

            /* the file goes THROUGH SHIBA Cloud — same bucket, same
               path layout, and a cloud_files row so it shows up in
               the uploader's cloud account (like officer photos) */

            cloudId = this.cloudFileId();

            uploadedPath = cloudId + "/" + file.name;

            const { error: upErr } = await this.storage()
                .from("cloud")
                .upload(uploadedPath, file);

            if (upErr) {

                console.error("EVIDENCE UPLOAD ERROR:", upErr);

                UI?.error("Could not upload the file.");

                return false;

            }

            fileUrl = this.storage().from("cloud")
                .getPublicUrl(uploadedPath).data.publicUrl;

            fileName = file.name;

            fileSize = file.size;

            let authId = null;

            try {

                const { data } = await db.auth.getUser();

                authId = data?.user?.id || null;

            } catch (e) { /* no session — owner_id stays null */ }

            const { error: cfErr } = await db
                .from("cloud_files")
                .insert([{
                    id: cloudId,
                    name: file.name,
                    path: uploadedPath,
                    size: file.size,
                    mime: file.type || null,
                    owner_username:
                        localStorage.getItem("username") || null,
                    owner_id: authId
                }]);

            if (cfErr) {

                console.warn("cloud_files register:", cfErr.message);

                cloudId = null;   /* file still uploaded — keep going */

            }

        }

        const { error } = await db
            .from("case_evidence")
            .insert([{
                evidence_id: evId,
                case_id: caseRow.id,
                type: type || "Other",
                description: description || null,
                file_url: fileUrl,
                file_name: fileName,
                file_size: fileSize,
                hash: hash,
                cloud_id: cloudId,
                uploaded_by: localStorage.getItem("username") || null
            }]);

        if (error) {

            /* don't orphan the upload if the table is missing */

            if (uploadedPath) {

                try {

                    await this.storage().from("cloud").remove([uploadedPath]);

                    if (cloudId) {

                        await db.from("cloud_files")
                            .delete().eq("id", cloudId);

                    }

                } catch (e) { /* best effort */ }

            }

            UI?.error(this.SETUP_HINT_63);

            return false;

        }

        await Promise.allSettled([

            this.caseEvent(caseRow.id, "Evidence uploaded",
                evId + " · " + (type || "Other") +
                (fileName ? " · " + fileName : "")),

            AuditService.log({
                action: "CASE_EVIDENCE_ADDED",
                target: caseRow.case_id + " — " + evId,
                details: (type || "Other") +
                    (hash ? " · sha256 " + hash.slice(0, 12) + "…" : "")
            })

        ]);

        UI?.success(evId + " added");

        return true;

    },

    /* ----------------------------------------------------- */
    /* people (Sprint 6.3) — victims, witnesses, suspects     */
    /* ----------------------------------------------------- */

    async persons(caseUuid) {

        const { data, error } = await db
            .from("case_persons")
            .select("*")
            .eq("case_id", caseUuid)
            .order("created_at", { ascending: true });

        if (error) return { error };

        return { rows: data || [] };

    },

    async addPerson(caseRow, { name, role, details }) {

        if (!window.db || !name?.trim()) return false;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const personId = await IdService.next("PERSON",
            () => "PRSN-" + String(Date.now()).slice(-6));

        const { error } = await db
            .from("case_persons")
            .insert([{
                person_id: personId,
                case_id: caseRow.id,
                role: role || "Other",
                name: name.trim(),
                details: details?.trim() || null,
                added_by: localStorage.getItem("username") || null
            }]);

        if (error) {

            UI?.error(this.SETUP_HINT_63);

            return false;

        }

        await Promise.allSettled([

            this.caseEvent(caseRow.id, "Person added",
                personId + " · " + (role || "Other") + " · " + name.trim()),

            AuditService.log({
                action: "CASE_PERSON_ADDED",
                target: caseRow.case_id + " — " + personId,
                details: (role || "Other") + " · " + name.trim()
            })

        ]);

        UI?.success(personId + " added");

        return true;

    },

    async removePerson(caseRow, person) {

        if (!window.db) return false;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const { error } = await db
            .from("case_persons")
            .delete()
            .eq("id", person.id);

        if (error) { UI?.error("Could not remove the person."); return false; }

        await Promise.allSettled([

            this.caseEvent(caseRow.id, "Person removed",
                person.person_id + " · " + person.role + " · " + person.name),

            AuditService.log({
                action: "CASE_PERSON_REMOVED",
                target: caseRow.case_id + " — " + person.person_id,
                details: person.role + " · " + person.name
            })

        ]);

        UI?.success(person.person_id + " removed");

        return true;

    }

};

window.CaseService = CaseService;
