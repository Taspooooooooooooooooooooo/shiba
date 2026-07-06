/* ==========================================================
   SHIBA PIMS — Core Service
   NotificationService — messages in the notifications
   table, each with its own NOTIF-2026-… id. `to` is the
   receiving USER account (users.id); null = system-wide
   entry (no specific receiver yet).
========================================================== */

const NotificationService = {

    async send({ to = null, title, message = "" }) {

        if (!window.db || !title) return;

        try {

            const notificationId = await IdService.next("NOTIFICATION");

            let senderId = null;

            try {

                const { data } = await db.auth.getUser();

                senderId = data?.user?.id || null;

            } catch (e) { /* system */ }

            const row = {
                notification_id: notificationId,
                receiver_id: to,
                sender_id: senderId,
                title: title,
                message: message
            };

            let { error } = await db.from("notifications").insert([row]);

            if (error && /foreign key|violates/i.test(error.message)) {

                row.sender_id = null;

                ({ error } = await db.from("notifications").insert([row]));

            }

            if (error) console.error("NOTIFICATION ERROR:", error);

        } catch (e) {

            console.error("NOTIFICATION ERROR:", e);

        }

    },

    async list(userId, limit = 25) {

        if (!window.db || !userId) return [];

        const { data, error } = await db
            .from("notifications")
            .select("*")
            .eq("receiver_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) {

            console.error("NOTIFICATION LIST ERROR:", error);

            return [];

        }

        return data || [];

    },

    async unreadCount(userId) {

        if (!window.db || !userId) return 0;

        const { count, error } = await db
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("receiver_id", userId)
            .eq("is_read", false);

        return error ? 0 : (count || 0);

    },

    async markRead(id) {

        if (!window.db) return;

        await db
            .from("notifications")
            .update({ is_read: true })
            .eq("id", id);

    }

};

window.NotificationService = NotificationService;
