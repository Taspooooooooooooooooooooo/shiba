/* ==========================================================
   SHIBA PIMS — Core Service
   IdService — sequential public IDs (OFCR-000001,
   CASE-2026-000001, ...) from the database ID Engine
   (lapd/SETUP-ID-ENGINE.sql). Atomic — no duplicates even
   with simultaneous users.
========================================================== */

const IdService = {

    /* IdService.next("OFFICER") -> "OFCR-000002"
       fallback runs only if the DB engine is unreachable */

    async next(type, fallback = null) {

        if (window.db) {

            const { data, error } = await db
                .rpc("next_public_id", { id_type: type });

            if (!error && data) return data;

            console.warn(
                "IdService: ID engine unreachable (" +
                (error?.message || "no data") + ")");

        }

        if (fallback) return fallback();

        return type + "-" + String(Date.now()).slice(-6);

    }

};

window.IdService = IdService;
