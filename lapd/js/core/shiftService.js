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
