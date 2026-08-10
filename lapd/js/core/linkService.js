/* ==========================================================
   SHIBA PIMS — Core Service
   LinkService — SHIBA Links, a link shortener built into PIMS.
   Officers mint short slugs (owned by their account) that
   redirect through /s/?<slug>. Resolution + click-counting
   happen in the resolve_short_link RPC; this service is the
   create / list / manage side.

   Needs a one-time setup: lapd/SETUP-PATCH-23.sql.
========================================================== */

const LinkService = {

    /* unambiguous alphabet (no 0/O/1/l/I) */
    ALPHABET: "abcdefghijkmnpqrstuvwxyz23456789",

    SETUP_HINT:
        "SHIBA Links needs a one-time setup — run lapd/SETUP-PATCH-23.sql " +
        "(or RUN-ALL-PENDING.sql) in the Supabase SQL Editor.",

    randomSlug(len = 6) {
        const b = new Uint8Array(len);
        crypto.getRandomValues(b);
        return [...b].map(x => this.ALPHABET[x % this.ALPHABET.length]).join("");
    },

    /* the public short URL for a slug — domain-agnostic */
    shortUrl(slug) {
        return location.origin + "/s/?" + slug;
    },

    /* normalise + validate a destination; returns the URL or null */
    normalizeUrl(str) {
        let s = (str || "").trim();
        if (!s) return null;
        if (!/^https?:\/\//i.test(s)) s = "https://" + s;
        try {
            const u = new URL(s);
            if (!/^https?:$/.test(u.protocol)) return null;
            if (!u.hostname.includes(".")) return null;
            return u.href;
        } catch (e) { return null; }
    },

    /* custom slugs: letters/numbers/-/_ only, 3–40 chars */
    validSlug(s) {
        return /^[a-zA-Z0-9_-]{3,40}$/.test(s || "");
    },

    async create({ targetUrl, slug, title }) {

        if (!window.db) return { ok: false };

        const url = this.normalizeUrl(targetUrl);

        if (!url) { UI?.error("Enter a valid URL (http/https)."); return { ok: false }; }

        const custom = (slug || "").trim();

        if (custom && !this.validSlug(custom)) {
            UI?.error("Slug can be 3–40 letters, numbers, - or _.");
            return { ok: false };
        }

        let authId = null;
        try {
            const { data } = await db.auth.getUser();
            authId = data?.user?.id || null;
        } catch (e) { /* no session */ }

        const row = {
            target_url: url,
            title: title?.trim() || null,
            created_by: localStorage.getItem("username") || null,
            owner_id: authId
        };

        /* custom slug = one attempt (report collision); random = retry */

        const attempts = custom
            ? [custom]
            : Array.from({ length: 5 }, () => this.randomSlug());

        for (const s of attempts) {

            const { data, error } = await db
                .from("short_links")
                .insert([{ ...row, slug: s }])
                .select();

            if (!error) {
                AuditService.log({
                    action: "LINK_CREATED",
                    target: s + " -> " + url
                });
                UI?.success("Short link created — /s/?" + s);
                return { ok: true, link: data[0] };
            }

            const dup = (error.code || "") === "23505" ||
                /duplicate|unique/i.test(error.message || "");

            if (dup && custom) {
                UI?.error("That slug is already taken — try another.");
                return { ok: false };
            }

            if (!dup) {
                UI?.error(/relation|schema|column|does not exist/i
                    .test(error.message || "") ? this.SETUP_HINT
                    : "Could not create the link.");
                return { ok: false };
            }
            /* random collision — loop tries the next slug */
        }

        UI?.error("Couldn't find a free slug — please retry.");
        return { ok: false };

    },

    async list({ mine } = {}) {

        let q = db.from("short_links")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(500);

        if (mine) q = q.eq("created_by", localStorage.getItem("username") || "");

        const { data, error } = await q;

        if (error) return { error };

        return { rows: data || [] };

    },

    async setActive(link, active) {
        if (!window.db) return false;
        const { error } = await db.from("short_links")
            .update({ active: !!active }).eq("id", link.id);
        if (error) { UI?.error("Could not update the link."); return false; }
        AuditService.log({
            action: active ? "LINK_ENABLED" : "LINK_DISABLED",
            target: link.slug
        });
        return true;
    },

    async remove(link) {
        if (!window.db) return false;
        const { error } = await db.from("short_links")
            .delete().eq("id", link.id);
        if (error) { UI?.error("Could not delete the link."); return false; }
        AuditService.log({ action: "LINK_DELETED", target: link.slug });
        return true;
    }

};

window.LinkService = LinkService;
