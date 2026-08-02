/* ==========================================================
   SHIBA PIMS — Core Service
   BodycamService (Phase 7 · Sprint 7.5) — the last Phase 7 piece.

   A bodycam SESSION is a real recording clip on a shift, not
   just the id string issued at start. Officers start/stop
   recording, drop MARKERS (bookmark / evidence / incident) at
   a point in the footage, and upload the footage through SHIBA
   Cloud. An EVIDENCE marker dropped while responding to a case
   becomes real case_evidence (type "Bodycam") automatically —
   this is how a shift feeds a case.

   Needs a one-time setup: lapd/SETUP-PATCH-19.sql. Degrades
   gracefully (SETUP_HINT_75) until it's run.
========================================================== */

const BodycamService = {

    MARKER_KINDS: ["Bookmark", "Evidence", "Incident"],

    KIND_COLORS: {
        "Bookmark": "#3b82f6",
        "Evidence": "#a855f7",
        "Incident": "#ef4444"
    },

    STATUS_COLORS: {
        "Recording": "#22c55e",
        "Stopped": "#eab308",
        "Uploaded": "#3b82f6",
        "Archived": "#6b7280"
    },

    SETUP_HINT_75:
        "The bodycam module needs a one-time setup — run " +
        "lapd/SETUP-PATCH-19.sql (or RUN-ALL-PENDING.sql) in the " +
        "Supabase SQL Editor.",

    _missingTable(error) {

        const s = ((error?.message || "") + " " + (error?.code || ""))
            .toLowerCase();

        return s.includes("pgrst205") ||
            (s.includes("bodycam") &&
             (s.includes("does not exist") ||
              s.includes("could not find") ||
              s.includes("schema cache") ||
              s.includes("relation")));

    },

    /* ----------------------------------------------------- */
    /* storage — the same dedicated ANON client the evidence  */
    /* uploader uses (the cloud bucket's policies are anon-    */
    /* only; the authenticated client is rejected — v0.10.1). */
    /* ----------------------------------------------------- */

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

    async sha256(file) {

        const buf = await file.arrayBuffer();

        const digest = await crypto.subtle.digest("SHA-256", buf);

        return [...new Uint8Array(digest)]
            .map(b => b.toString(16).padStart(2, "0")).join("");

    },

    /* 11-char share id — the same format SHIBA Cloud uses */

    cloudFileId() {

        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
                      "abcdefghijklmnopqrstuvwxyz0123456789";

        const bytes = new Uint8Array(11);

        crypto.getRandomValues(bytes);

        return [...bytes].map(b => chars[b % chars.length]).join("");

    },

    /* fire-and-forget case-timeline write — kept local so this
       service has no hard dependency on CaseService (which the
       shift file page doesn't load) */

    async _caseEvent(caseUuid, event, details) {

        if (!window.db || !caseUuid) return;

        try {

            await db.from("case_timeline").insert([{
                case_id: caseUuid,
                event: event,
                details: details || null,
                actor: localStorage.getItem("username") || null
            }]);

        } catch (e) { /* table missing / no case timeline */ }

    },

    /* ----------------------------------------------------- */
    /* queries                                                */
    /* ----------------------------------------------------- */

    async sessionsForShift(shiftUuid) {

        const { data, error } = await db
            .from("bodycam_sessions")
            .select("*")
            .eq("shift_id", shiftUuid)
            .order("started_at", { ascending: true });

        if (error) return { error };

        return { rows: data || [] };

    },

    /* the currently-Recording session on a shift (or null) */

    async liveSession(shiftUuid) {

        const { data, error } = await db
            .from("bodycam_sessions")
            .select("*")
            .eq("shift_id", shiftUuid)
            .eq("status", "Recording")
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) return { error };

        return { session: data || null };

    },

    async markers(sessionUuid) {

        const { data, error } = await db
            .from("bodycam_markers")
            .select("*")
            .eq("session_id", sessionUuid)
            .order("offset_seconds", { ascending: true });

        if (error) return { error };

        return { rows: data || [] };

    },

    /* all markers on a shift (across every session), for counts */

    async markersForShift(shiftUuid) {

        const { data, error } = await db
            .from("bodycam_markers")
            .select("*")
            .eq("shift_id", shiftUuid)
            .order("created_at", { ascending: true });

        if (error) return { error };

        return { rows: data || [] };

    },

    /* ----------------------------------------------------- */
    /* recording lifecycle                                    */
    /* ----------------------------------------------------- */

    /* seconds a session has recorded — live if still Recording */

    sessionSeconds(session) {

        if (!session) return 0;

        if (session.status === "Recording" && session.started_at) {

            return Math.max(0, Math.round(
                (Date.now() - new Date(session.started_at).getTime()) / 1000));

        }

        return session.recorded_seconds || 0;

    },

    async startRecording(shift) {

        if (!window.db || !shift) return { ok: false };

        /* only one live session at a time */

        const { session: live } = await this.liveSession(shift.id);

        if (live) {

            UI?.error("Bodycam is already recording (" +
                (live.session_id || "session") + ").");

            return { ok: false, session: live };

        }

        const sessionId = await IdService.next("BODYCAM",
            () => "BODY-" + String(Date.now()).slice(-6));

        const { data, error } = await db
            .from("bodycam_sessions")
            .insert([{
                session_id: sessionId,
                shift_id: shift.id,
                officer_id: shift.officer_id,
                status: "Recording",
                created_by: localStorage.getItem("username") || null
            }])
            .select();

        if (error) {

            UI?.error(this._missingTable(error)
                ? this.SETUP_HINT_75 : "Could not start recording.");

            return { ok: false };

        }

        const row = data[0];

        /* keep the shift's headline bodycam fields current */

        try {

            await db.from("shifts")
                .update({ bodycam_ready: true,
                          bodycam_session_id: sessionId })
                .eq("id", shift.id);

            shift.bodycam_ready = true;

            shift.bodycam_session_id = sessionId;

        } catch (e) { /* non-fatal */ }

        await Promise.allSettled([

            ShiftService?.shiftEvent?.(shift.id, "Bodycam recording started",
                sessionId),

            AuditService.log({
                action: "BODYCAM_RECORDING_STARTED",
                target: shift.shift_id + " — " + sessionId,
                officerId: shift.officer_id
            })

        ]);

        UI?.success("Recording — " + sessionId);

        return { ok: true, session: row };

    },

    async stopRecording(shift, session) {

        if (!window.db || !session || session.status !== "Recording")
            return { ok: false };

        const secs = this.sessionSeconds(session);

        const { data, error } = await db
            .from("bodycam_sessions")
            .update({
                status: "Stopped",
                stopped_at: new Date().toISOString(),
                recorded_seconds: secs
            })
            .eq("id", session.id)
            .select();

        if (error) { UI?.error("Could not stop recording."); return { ok: false }; }

        await Promise.allSettled([

            ShiftService?.shiftEvent?.(shift?.id || session.shift_id,
                "Bodycam recording stopped",
                (session.session_id || "") + " · " + this.hms(secs)),

            AuditService.log({
                action: "BODYCAM_RECORDING_STOPPED",
                target: (shift?.shift_id || "") + " — " + session.session_id,
                details: this.hms(secs),
                officerId: session.officer_id
            })

        ]);

        UI?.success("Stopped — " + this.hms(secs) + " recorded");

        return { ok: true, session: data[0] };

    },

    /* ----------------------------------------------------- */
    /* markers                                                */
    /* ----------------------------------------------------- */

    /* drop a marker at the session's current position. For an
       Evidence marker on a shift that's responding to a case, the
       marker is promoted into real case_evidence right away. */

    async addMarker(shift, session, { kind, label, note } = {}) {

        if (!window.db || !session) return { ok: false };

        kind = this.MARKER_KINDS.includes(kind) ? kind : "Bookmark";

        const offset = this.sessionSeconds(session);

        const { data, error } = await db
            .from("bodycam_markers")
            .insert([{
                session_id: session.id,
                shift_id: session.shift_id || shift?.id || null,
                kind: kind,
                offset_seconds: offset,
                label: label?.trim() || null,
                note: note?.trim() || null,
                created_by: localStorage.getItem("username") || null
            }])
            .select();

        if (error) {

            UI?.error(this._missingTable(error)
                ? this.SETUP_HINT_75 : "Could not add the marker.");

            return { ok: false };

        }

        let marker = data[0];

        await Promise.allSettled([

            ShiftService?.shiftEvent?.(session.shift_id || shift?.id,
                "Bodycam marker",
                kind + " @ " + this.hms(offset) +
                (label ? " · " + label : "")),

            AuditService.log({
                action: "BODYCAM_MARKER_ADDED",
                target: (shift?.shift_id || "") + " — " +
                    (session.session_id || ""),
                details: kind + " @ " + this.hms(offset),
                officerId: session.officer_id
            })

        ]);

        /* Evidence marker + active incident → auto-link to the case */

        let linkedTo = null;

        if (kind === "Evidence" && shift?.current_case_id) {

            const res = await this._promote(marker, session, shift,
                shift.current_case_id, null);

            if (res.ok) { marker = res.marker; linkedTo = res.casePublicId; }

        }

        UI?.success(kind + " marker @ " + this.hms(offset) +
            (linkedTo ? " → " + linkedTo : ""));

        return { ok: true, marker, linkedTo };

    },

    /* promote an Evidence marker into case_evidence. If casePublicId
       is given (manual attach) we look the case up; otherwise caseUuid
       is used directly (auto-link during an incident). */

    async _promote(marker, session, shift, caseUuid, casePublicId) {

        let cUuid = caseUuid, cPub = casePublicId;

        if (!cUuid && cPub) {

            const { data: c } = await db
                .from("cases")
                .select("id, case_id")
                .ilike("case_id", cPub.trim())
                .maybeSingle();

            if (!c) { UI?.error("No case with that ID."); return { ok: false }; }

            cUuid = c.id; cPub = c.case_id;

        }

        if (!cPub && cUuid) {

            const { data: c } = await db
                .from("cases").select("case_id").eq("id", cUuid).maybeSingle();

            cPub = c?.case_id || null;

        }

        if (!cUuid) return { ok: false };

        /* already linked? don't duplicate */

        if (marker.linked_evidence_id) {

            UI?.error("This marker is already logged as evidence.");

            return { ok: false };

        }

        const evId = await IdService.next("EVIDENCE",
            () => "EVID-" + String(Date.now()).slice(-6));

        const desc = "Bodycam marker · " + (session.session_id || "session") +
            " @ " + this.hms(marker.offset_seconds) +
            (marker.label ? " · " + marker.label : "") +
            (marker.note ? " — " + marker.note : "");

        /* the evidence is backed by the session's uploaded footage if
           there is any (cloud_id / file / hash), else it's a pointer */

        const { data: evData, error: evErr } = await db
            .from("case_evidence")
            .insert([{
                evidence_id: evId,
                case_id: cUuid,
                type: "Bodycam",
                description: desc,
                file_url: session.file_url || null,
                file_name: session.file_name || null,
                file_size: session.file_size || null,
                hash: session.hash || null,
                cloud_id: session.cloud_id || null,
                uploaded_by: localStorage.getItem("username") || null
            }])
            .select();

        if (evErr) {

            UI?.error("Could not log the evidence.");

            return { ok: false };

        }

        const evRow = evData[0];

        /* link the marker back to the case + evidence */

        const { data: mData } = await db
            .from("bodycam_markers")
            .update({ linked_case_id: cUuid, linked_evidence_id: evRow.id })
            .eq("id", marker.id)
            .select();

        await Promise.allSettled([

            this._caseEvent(cUuid, "Evidence uploaded",
                evId + " · Bodycam · " + (session.session_id || "")),

            AuditService.log({
                action: "CASE_EVIDENCE_ADDED",
                target: (cPub || "case") + " — " + evId,
                details: "Bodycam marker from " + (shift?.shift_id ||
                    session.session_id || "")
            })

        ]);

        return {
            ok: true,
            marker: (mData && mData[0]) || marker,
            evidence: evRow,
            casePublicId: cPub
        };

    },

    /* manual attach — used from the shift file when a marker wasn't
       auto-linked (no active incident at the time) */

    async attachMarkerToCase(marker, session, shift, casePublicId) {

        if (!casePublicId?.trim()) return { ok: false };

        const res = await this._promote(marker, session, shift,
            marker.linked_case_id || null, casePublicId);

        if (res.ok) UI?.success((res.evidence?.evidence_id || "Evidence") +
            " → " + (res.casePublicId || "case"));

        return res;

    },

    /* ----------------------------------------------------- */
    /* footage upload — routed THROUGH SHIBA Cloud            */
    /* ----------------------------------------------------- */

    async uploadFootage(shift, session, file) {

        if (!window.db || !session || !file) return { ok: false };

        const hash = await this.sha256(file);

        const cloudId = this.cloudFileId();

        const uploadedPath = cloudId + "/" + file.name;

        const { error: upErr } = await this.storage()
            .from("cloud")
            .upload(uploadedPath, file);

        if (upErr) {

            console.error("BODYCAM UPLOAD ERROR:", upErr);

            UI?.error("Could not upload the footage.");

            return { ok: false };

        }

        const fileUrl = this.storage().from("cloud")
            .getPublicUrl(uploadedPath).data.publicUrl;

        /* register it in the uploader's cloud account (like evidence) */

        let authId = null;

        try {

            const { data } = await db.auth.getUser();

            authId = data?.user?.id || null;

        } catch (e) { /* no session */ }

        const { error: cfErr } = await db
            .from("cloud_files")
            .insert([{
                id: cloudId,
                name: file.name,
                path: uploadedPath,
                size: file.size,
                mime: file.type || null,
                owner_username: localStorage.getItem("username") || null,
                owner_id: authId
            }]);

        if (cfErr) console.warn("cloud_files register:", cfErr.message);

        const { data, error } = await db
            .from("bodycam_sessions")
            .update({
                status: session.status === "Recording"
                    ? "Recording" : "Uploaded",
                file_url: fileUrl,
                file_name: file.name,
                file_size: file.size,
                hash: hash,
                cloud_id: cloudId,
                uploaded_at: new Date().toISOString(),
                uploaded_by: localStorage.getItem("username") || null
            })
            .eq("id", session.id)
            .select();

        if (error) {

            /* don't orphan the upload */

            try { await this.storage().from("cloud").remove([uploadedPath]); }
            catch (e) { /* best effort */ }

            UI?.error("Could not save the footage.");

            return { ok: false };

        }

        await Promise.allSettled([

            ShiftService?.shiftEvent?.(session.shift_id || shift?.id,
                "Bodycam footage uploaded",
                (session.session_id || "") + " · " + file.name),

            AuditService.log({
                action: "BODYCAM_FOOTAGE_UPLOADED",
                target: (shift?.shift_id || "") + " — " +
                    (session.session_id || ""),
                details: file.name + " · sha256 " + hash.slice(0, 12) + "…",
                officerId: session.officer_id
            })

        ]);

        UI?.success("Footage uploaded — " + file.name);

        return { ok: true, session: data[0] };

    },

    /* ----------------------------------------------------- */
    /* shift-level roll-up — sessions, recorded time, markers */
    /* ----------------------------------------------------- */

    async shiftSummary(shiftUuid) {

        const { rows, error } = await this.sessionsForShift(shiftUuid);

        if (error) return { error };

        const { rows: marks } = await this.markersForShift(shiftUuid);

        const totalSec = rows.reduce((a, s) =>
            a + this.sessionSeconds(s), 0);

        const evidence = (marks || []).filter(m =>
            m.kind === "Evidence").length;

        return {
            summary: {
                sessions: rows.length,
                recording: rows.some(s => s.status === "Recording"),
                uploaded: rows.filter(s => s.cloud_id).length,
                totalSec: totalSec,
                markers: (marks || []).length,
                evidence: evidence
            },
            sessions: rows,
            markers: marks || []
        };

    },

    /* ----------------------------------------------------- */
    /* display helpers                                        */
    /* ----------------------------------------------------- */

    hms(sec) {

        sec = Math.max(0, Math.floor(sec || 0));

        const h = Math.floor(sec / 3600);

        const m = Math.floor((sec % 3600) / 60);

        const s = sec % 60;

        const pad = n => String(n).padStart(2, "0");

        return (h ? h + ":" : "") + pad(m) + ":" + pad(s);

    }

};

window.BodycamService = BodycamService;
