/* ==========================================================
   SHIBA PIMS — Core Service
   TimelineService — an officer's career history in the
   officer_timeline table (promotions, cases, certificates,
   profile changes, ...).
========================================================== */

const TimelineService = {

    async add(officerId, action, details = "") {

        if (!window.db || !officerId) return;

        const { error } = await db
            .from("officer_timeline")
            .insert([{
                officer_id: officerId,
                action: action,
                details: details
            }]);

        if (error) console.error("TIMELINE ERROR:", error);

    },

    async list(officerId, limit = 50) {

        if (!window.db || !officerId) return [];

        const { data, error } = await db
            .from("officer_timeline")
            .select("*")
            .eq("officer_id", officerId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) {

            console.error("TIMELINE LIST ERROR:", error);

            return [];

        }

        return data || [];

    }

};

window.TimelineService = TimelineService;
