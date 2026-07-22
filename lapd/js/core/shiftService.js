/* ==========================================================
   SHIBA PIMS — Core Service
   ShiftService (Phase 7) — a shift is a DIGITAL DUTY SESSION,
   not an online flag. Starting one fans out across the whole
   system: SHIFT id → row → shift timeline → audit → officer
   goes On Duty → personnel timeline → notification.

   Sprint 7.1a: start cascade, one-active-shift guard, the
   activity (status) engine and the break system. The End
   Shift wizard + history arrive in 7.1b.
========================================================== */

const ShiftService = {

    /* what an officer can be doing while on duty ("Break" is
       reached through the break system, not this list) */

    ACTIVITIES: [
        "Patrolling", "Responding", "Traffic Stop", "Court",
        "Training", "Administrative", "Report Writing",
        "Emergency", "Unavailable"
    ],

    BREAK_TYPES: ["Lunch", "Coffee", "Administrative", "Personal"],

    EQUIPMENT: ["Radio", "Bodycam", "Firearm", "Taser",
                "First Aid Kit", "MDT"],

    VEHICLE_TYPES: ["Patrol Car", "SUV", "Motorcycle", "Van",
                    "Air Unit", "No Vehicle"],

    CHANNELS: ["Dispatch", "Metro", "Patrol", "Traffic", "SWAT",
               "K9", "Air Support"],

    SETUP_HINT:
        "Shifts need a one-time setup — run lapd/SETUP-PATCH-15.sql " +
        "(or RUN-ALL-PENDING.sql) in the Supabase SQL Editor.",

    /* the shift's own chronological log — fire-and-forget */

    async shiftEvent(shiftUuid, event, details) {

        if (!window.db || !shiftUuid) return;

        try {

            await db.from("shift_timeline").insert([{
                shift_id: shiftUuid,
                event: event,
                details: details || null,
                actor: localStorage.getItem("username") || null
            }]);

        } catch (e) { /* table missing — PATCH-15 not run yet */ }

    },

    /* ----------------------------------------------------- */
    /* queries                                                */
    /* ----------------------------------------------------- */

    /* the signed-in officer's OPEN shift (or null) */

    async myActiveShift() {

        const officer = await PermissionService.myOfficer();

        if (!officer || !window.db) return { officer: null, shift: null };

        const { data, error } = await db
            .from("shifts")
            .select("*")
            .eq("officer_id", officer.id)
            .is("ended_at", null)
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) return { officer, shift: null, error };

        return { officer, shift: data || null };

    },

    async timeline(shiftUuid) {

        const { data, error } = await db
            .from("shift_timeline")
            .select("*")
            .eq("shift_id", shiftUuid)
            .order("created_at", { ascending: false })
            .limit(200);

        if (error) return { error };

        return { rows: data || [] };

    },

    SETUP_HINT_72:
        "This tab needs a one-time setup — run lapd/SETUP-PATCH-17.sql " +
        "(or RUN-ALL-PENDING.sql) in the Supabase SQL Editor.",

    /* one shift + its officer + linked case */

    async byId(id) {

        const { data, error } = await db
            .from("shifts")
            .select("*, officers(officer_id, first_name, last_name), " +
                "cases(case_id, title)")
            .eq("id", id)
            .maybeSingle();

        if (error || !data) return { error: error || { message: "not found" } };

        data.officer_label = data.officers
            ? (data.officers.officer_id + " " +
               (data.officers.first_name + " " +
                data.officers.last_name).trim())
            : "—";

        return { row: data };

    },

    /* audit entries mentioning this shift's public id */

    async audit(shiftPublicId) {

        const { data, error } = await db
            .from("audit_logs")
            .select("*")
            .ilike("target", "%" + shiftPublicId + "%")
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) return { error };

        return { rows: data || [] };

    },

    /* ----------------------------------------------------- */
    /* shift notes — the officer's own notes DURING the shift */
    /* (not case notes)                                       */
    /* ----------------------------------------------------- */

    async notes(shiftUuid) {

        const { data, error } = await db
            .from("shift_notes")
            .select("*")
            .eq("shift_id", shiftUuid)
            .order("created_at", { ascending: false });

        if (error) return { error };

        return { rows: data || [] };

    },

    async addNote(shift, body) {

        if (!window.db || !body?.trim()) return false;

        const { error } = await db
            .from("shift_notes")
            .insert([{
                shift_id: shift.id,
                author: localStorage.getItem("username") || null,
                body: body.trim()
            }]);

        if (error) { UI?.error(this.SETUP_HINT_72); return false; }

        this.shiftEvent(shift.id, "Note added", null);

        return true;

    },

    /* ----------------------------------------------------- */
    /* incident mode — respond to a case from the shift       */
    /* ----------------------------------------------------- */

    async respondToCase(shift, caseRow) {

        if (!window.db || !caseRow) return false;

        const { error } = await db
            .from("shifts")
            .update({
                current_case_id: caseRow.id,
                activity: "Responding"
            })
            .eq("id", shift.id);

        if (error) { UI?.error("Could not set incident mode."); return false; }

        await Promise.allSettled([

            this.shiftEvent(shift.id, "Responding to case",
                caseRow.case_id + (caseRow.title ? " · " + caseRow.title : "")),

            AuditService.log({
                action: "SHIFT_INCIDENT",
                target: shift.shift_id + " -> " + caseRow.case_id,
                officerId: shift.officer_id
            })

        ]);

        UI?.success("On incident — " + caseRow.case_id);

        return true;

    },

    async clearIncident(shift, activity) {

        if (!window.db) return false;

        const { error } = await db
            .from("shifts")
            .update({
                current_case_id: null,
                activity: activity || "Patrolling"
            })
            .eq("id", shift.id);

        if (error) { UI?.error("Could not clear incident."); return false; }

        await this.shiftEvent(shift.id, "Cleared incident",
            "back to " + (activity || "Patrolling"));

        return true;

    },

    /* an officer's shift history, newest first */

    async forOfficer(officerId, limit = 100) {

        const { data, error } = await db
            .from("shifts")
            .select("*")
            .eq("officer_id", officerId)
            .order("started_at", { ascending: false })
            .limit(limit);

        if (error) return { error };

        return { rows: data || [] };

    },

    /* ----------------------------------------------------- */
    /* statistics (Sprint 7.3) — computed from shift history  */
    /* ----------------------------------------------------- */

    async officerStats(officerId) {

        const { rows, error } = await this.forOfficer(officerId, 500);

        if (error) return { error };

        /* only CLOSED shifts count toward totals */

        const closed = rows.filter(s => s.ended_at);

        const now = new Date();

        const monthKey = now.getFullYear() + "-" + now.getMonth();

        let lifetimeSec = 0, monthSec = 0, breakSec = 0;

        let longestSec = 0, overtime = 0;

        closed.forEach(s => {

            const sum = this.summary(s);

            lifetimeSec += sum.activeSec;

            breakSec += sum.breakSec;

            if (sum.durationSec > longestSec) longestSec = sum.durationSec;

            if (s.overtime) overtime++;

            const d = new Date(s.started_at);

            if (d.getFullYear() + "-" + d.getMonth() === monthKey) {

                monthSec += sum.activeSec;

            }

        });

        const avgSec = closed.length
            ? Math.round(closed.reduce((a, s) =>
                a + this.summary(s).durationSec, 0) / closed.length) : 0;

        return {
            stats: {
                shiftCount: closed.length,
                openCount: rows.length - closed.length,
                lifetimeSec, monthSec, breakSec,
                longestSec, avgSec, overtime
            }
        };

    },

    /* ----------------------------------------------------- */
    /* alerts — thresholds for the duty widget + supervisors  */
    /* ----------------------------------------------------- */

    BREAK_LIMIT_MIN: 30,

    OVERTIME_HOURS: 8,

    /* current break minutes for an open shift on break */

    breakMinutesNow(shift) {

        if (shift.status !== "Break" || !shift.break_started_at) return 0;

        return Math.floor(
            (Date.now() - new Date(shift.break_started_at).getTime())
            / 60000);

    },

    /* fire supervisor notifications once per threshold crossing —
       the caller passes the flags it has already sent */

    async raiseAlert(shift, kind, message) {

        try {

            /* notify the case-agnostic supervisors: officers who hold
               a reviewing tier. Cheap version: notify the shift owner's
               division supervisors is Phase 7.4 — for now audit it and
               notify the officer's own account so it's on record. */

            await AuditService.log({
                action: "SHIFT_ALERT_" + kind,
                target: shift.shift_id,
                details: message,
                officerId: shift.officer_id
            });

            await this.shiftEvent(shift.id, "Alert", message);

        } catch (e) { /* best effort */ }

    },

    /* ----------------------------------------------------- */
    /* scheduling / calendar (Sprint 7.3)                     */
    /* ----------------------------------------------------- */

    SETUP_HINT_73:
        "The calendar needs a one-time setup — run " +
        "lapd/SETUP-PATCH-18.sql (or RUN-ALL-PENDING.sql) in the " +
        "Supabase SQL Editor.",

    async schedule({ officerId, date, startTime, endTime, notes }) {

        if (!window.db || !officerId || !date) return false;

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const { error } = await db
            .from("scheduled_shifts")
            .insert([{
                officer_id: officerId,
                shift_date: date,
                start_time: startTime || null,
                end_time: endTime || null,
                notes: notes || null,
                scheduled_by: localStorage.getItem("username") || null
            }]);

        if (error) { UI?.error(this.SETUP_HINT_73); return false; }

        AuditService.log({
            action: "SHIFT_SCHEDULED",
            target: date + (startTime ? " " + startTime : ""),
            officerId: officerId
        });

        UI?.success("Shift scheduled for " + date);

        return true;

    },

    async scheduledBetween(fromDate, toDate) {

        const { data, error } = await db
            .from("scheduled_shifts")
            .select("*, officers(officer_id, first_name, last_name)")
            .gte("shift_date", fromDate)
            .lte("shift_date", toDate)
            .order("shift_date", { ascending: true });

        if (error) return { error };

        return { rows: (data || []).map(r => {
            r.officer_label = r.officers
                ? (r.officers.officer_id + " " +
                   (r.officers.first_name + " " +
                    r.officers.last_name).trim()) : "—";
            return r;
        }) };

    },

    async cancelScheduled(id) {

        if (!(await PermissionService.can("cases.assign"))) {

            UI?.error("Requires Sergeant or above.");

            return false;

        }

        const { error } = await db
            .from("scheduled_shifts")
            .update({ status: "Cancelled" })
            .eq("id", id);

        if (error) { UI?.error("Could not cancel."); return false; }

        return true;

    },

    /* ----------------------------------------------------- */
    /* summary maths — used by the End Shift wizard, history  */
    /* and (later) statistics                                 */
    /* ----------------------------------------------------- */

    summary(shift) {

        const start = new Date(shift.started_at).getTime();

        const end = shift.ended_at
            ? new Date(shift.ended_at).getTime() : Date.now();

        /* if the shift is still on an open break, count it */

        let breakSec = shift.break_seconds || 0;

        if (!shift.ended_at && shift.status === "Break" &&
            shift.break_started_at) {

            breakSec += Math.max(0, Math.round(
                (Date.now() - new Date(shift.break_started_at).getTime())
                / 1000));

        }

        const durationSec = Math.max(0, Math.round((end - start) / 1000));

        const activeSec = Math.max(0, durationSec - breakSec);

        return {
            durationSec,
            breakSec,
            activeSec,
            hours: durationSec / 3600,
            overtime: durationSec / 3600 > 8,
            bodycamSession: shift.bodycam_session_id || null
        };

    },

    hm(sec) {

        const h = Math.floor((sec || 0) / 3600);

        const m = Math.floor(((sec || 0) % 3600) / 60);

        return (h ? h + "h " : "") + m + "m";

    },

    /* ----------------------------------------------------- */
    /* start — the cascade                                    */
    /* ----------------------------------------------------- */

    async start(officer, { vehicleUnit, vehicleType, callsign,
                           primaryChannel, secondaryChannel,
                           equipment, bodycamReady }) {

        if (!window.db || !officer) return { ok: false };

        /* an officer in a blocked roster state can't go on duty */

        if (["Suspended", "Terminated", "Retired"]
                .includes(officer.status)) {

            UI?.error("You can't start a shift while " +
                officer.status.toLowerCase() + ".");

            return { ok: false };

        }

        /* one active shift per officer */

        const { data: open } = await db
            .from("shifts")
            .select("id, shift_id")
            .eq("officer_id", officer.id)
            .is("ended_at", null)
            .limit(1)
            .maybeSingle();

        if (open) {

            UI?.error("You already have an open shift (" +
                (open.shift_id || "unnamed") + ").");

            return { ok: false };

        }

        const shiftId = await IdService.next("SHIFT",
            () => "SHIFT-" + String(Date.now()).slice(-6));

        /* bodycam ready → issue a bodycam session id (the full
           bodycam module arrives in Sprint 7.5) */

        let bodycamSession = null;

        if (bodycamReady) {

            bodycamSession = await IdService.next("BODYCAM",
                () => "BODY-" + String(Date.now()).slice(-6));

        }

        const { data, error } = await db
            .from("shifts")
            .insert([{
                shift_id: shiftId,
                officer_id: officer.id,
                status: "Active",
                activity: "Patrolling",
                vehicle_unit: vehicleUnit || null,
                vehicle_type: vehicleType || null,
                callsign: callsign || vehicleUnit || null,
                primary_channel: primaryChannel || null,
                secondary_channel: secondaryChannel || null,
                equipment: equipment || {},
                bodycam_ready: !!bodycamReady,
                bodycam_session_id: bodycamSession
            }])
            .select();

        if (error) {

            console.error("SHIFT START ERROR:", error);

            UI?.error(this.SETUP_HINT);

            return { ok: false, reason: error.message };

        }

        const row = data[0];

        const officerLabel = officer.officer_id + " " +
            (officer.first_name + " " + officer.last_name).trim();

        const missing = (ShiftService.EQUIPMENT || [])
            .filter(k => equipment && equipment[k] === false);

        /* the full start cascade — awaited so nothing is lost */

        const fanout = [

            this.shiftEvent(row.id, "Shift started",
                shiftId +
                (vehicleUnit ? " · unit " + vehicleUnit : " · no vehicle") +
                (bodycamSession ? " · bodycam " + bodycamSession : "")),

            AuditService.log({
                action: "SHIFT_STARTED",
                target: shiftId + " — " + officerLabel,
                details: (vehicleUnit || "no vehicle") +
                    (callsign ? " · " + callsign : "") +
                    (missing.length
                        ? " · MISSING EQUIPMENT: " + missing.join(", ")
                        : ""),
                officerId: officer.id
            }),

            /* the shift drives the roster status */

            db.from("officers")
                .update({ status: "On Duty" })
                .eq("id", officer.id),

            TimelineService.add(officer.id, "Shift started",
                shiftId + (vehicleUnit ? " · unit " + vehicleUnit : "")),

        ];

        if (missing.length) {

            fanout.push(this.shiftEvent(row.id,
                "Equipment incomplete", missing.join(", ")));

        }

        if (officer.user_id) {

            fanout.push(NotificationService.send({
                to: officer.user_id,
                title: "Shift started",
                message: shiftId + " is running" +
                    (vehicleUnit ? " — unit " + vehicleUnit : "") + "."
            }));

        }

        await Promise.allSettled(fanout);

        UI?.success(shiftId + " — you are ON DUTY");

        return { ok: true, row: row };

    },

    /* ----------------------------------------------------- */
    /* the status engine                                      */
    /* ----------------------------------------------------- */

    async setActivity(shift, activity) {

        if (!window.db || activity === shift.activity) return false;

        const { error } = await db
            .from("shifts")
            .update({ activity: activity })
            .eq("id", shift.id);

        if (error) { UI?.error("Could not change the status."); return false; }

        await Promise.allSettled([

            this.shiftEvent(shift.id, "Status changed",
                (shift.activity || "—") + " -> " + activity),

            AuditService.log({
                action: "SHIFT_STATUS_CHANGED",
                target: shift.shift_id,
                details: (shift.activity || "—") + " -> " + activity,
                officerId: shift.officer_id
            })

        ]);

        return true;

    },

    /* ----------------------------------------------------- */
    /* the break system                                       */
    /* ----------------------------------------------------- */

    async startBreak(shift, breakType) {

        if (!window.db || shift.status === "Break") return false;

        const { error } = await db
            .from("shifts")
            .update({
                status: "Break",
                break_started_at: new Date().toISOString(),
                break_type: breakType || "Personal",
                break_prev_activity: shift.activity || "Patrolling",
                activity: "Break"
            })
            .eq("id", shift.id);

        if (error) { UI?.error("Could not start the break."); return false; }

        await Promise.allSettled([

            this.shiftEvent(shift.id, "Break started",
                breakType || "Personal"),

            AuditService.log({
                action: "SHIFT_BREAK_STARTED",
                target: shift.shift_id,
                details: breakType || "Personal",
                officerId: shift.officer_id
            })

        ]);

        return true;

    },

    async endBreak(shift) {

        if (!window.db || shift.status !== "Break") return false;

        const started = shift.break_started_at
            ? new Date(shift.break_started_at).getTime() : Date.now();

        const extra = Math.max(0,
            Math.round((Date.now() - started) / 1000));

        const backTo = shift.break_prev_activity || "Patrolling";

        const { error } = await db
            .from("shifts")
            .update({
                status: "Active",
                activity: backTo,
                break_started_at: null,
                break_type: null,
                break_prev_activity: null,
                break_seconds: (shift.break_seconds || 0) + extra
            })
            .eq("id", shift.id);

        if (error) { UI?.error("Could not end the break."); return false; }

        const mins = Math.round(extra / 60);

        await Promise.allSettled([

            this.shiftEvent(shift.id, "Break ended",
                (shift.break_type || "break") + " · " + mins + " min"),

            AuditService.log({
                action: "SHIFT_BREAK_ENDED",
                target: shift.shift_id,
                details: (shift.break_type || "break") + " · " + mins + " min",
                officerId: shift.officer_id
            })

        ]);

        return true;

    },

    /* ----------------------------------------------------- */
    /* end — the close cascade (driven by the End Shift wizard */
    /* in js/shift.js; all args optional so a bare end works)  */
    /* ----------------------------------------------------- */

    _missingCol(error, col) {

        const s = ((error?.message || "") + " " + (error?.code || ""))
            .toLowerCase();

        return s.includes("pgrst204") ||
            (s.includes(col.toLowerCase()) &&
             (s.includes("does not exist") ||
              s.includes("could not find") ||
              s.includes("schema cache")));

    },

    async end(shift, { comments, bodycamUploaded, vehicleReturned } = {}) {

        if (!window.db || shift.ended_at) return false;

        /* a shift ending mid-break banks the open break first */

        let breakSeconds = shift.break_seconds || 0;

        if (shift.status === "Break" && shift.break_started_at) {

            breakSeconds += Math.max(0, Math.round(
                (Date.now() -
                 new Date(shift.break_started_at).getTime()) / 1000));

        }

        const merged = { ...shift, break_seconds: breakSeconds,
            break_started_at: null, ended_at: new Date().toISOString() };

        const sum = this.summary(merged);

        /* base fields exist since PATCH-15 */

        const base = {
            status: "Closed",
            ended_at: merged.ended_at,
            end_comments: comments || null,
            break_seconds: breakSeconds,
            break_started_at: null,
            overtime: sum.overtime
        };

        /* extra fields need PATCH-16 — degrade if not run yet */

        const extended = {
            ...base,
            bodycam_uploaded: bodycamUploaded ?? null,
            vehicle_returned: vehicleReturned ?? null,
            end_summary: {
                duration_sec: sum.durationSec,
                active_sec: sum.activeSec,
                break_sec: sum.breakSec,
                overtime: sum.overtime,
                bodycam_session: sum.bodycamSession,
                vehicle_unit: shift.vehicle_unit || null
            }
        };

        let { error } = await db
            .from("shifts").update(extended).eq("id", shift.id);

        if (error && (this._missingCol(error, "bodycam_uploaded") ||
                      this._missingCol(error, "vehicle_returned") ||
                      this._missingCol(error, "end_summary"))) {

            ({ error } = await db
                .from("shifts").update(base).eq("id", shift.id));

        }

        if (error) { UI?.error("Could not end the shift."); return false; }

        const dur = this.hm(sum.durationSec);

        await Promise.allSettled([

            this.shiftEvent(shift.id, "Shift ended",
                shift.shift_id + " · " + dur +
                (sum.overtime ? " · OVERTIME" : "")),

            AuditService.log({
                action: "SHIFT_ENDED",
                target: shift.shift_id,
                details: dur + " (active " + this.hm(sum.activeSec) +
                    ", break " + this.hm(sum.breakSec) + ")" +
                    (sum.overtime ? " · overtime" : ""),
                officerId: shift.officer_id
            }),

            db.from("officers")
                .update({ status: "Off Duty" })
                .eq("id", shift.officer_id),

            TimelineService.add(shift.officer_id, "Shift ended",
                shift.shift_id + " · " + dur)

        ]);

        UI?.success(shift.shift_id + " closed — you are OFF DUTY");

        return true;

    },

    /* ----------------------------------------------------- */
    /* display helpers                                        */
    /* ----------------------------------------------------- */

    fmtDuration(ms) {

        const s = Math.max(0, Math.floor(ms / 1000));

        const h = String(Math.floor(s / 3600)).padStart(2, "0");

        const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");

        const sec = String(s % 60).padStart(2, "0");

        return h + ":" + m + ":" + sec;

    }

};

window.ShiftService = ShiftService;
