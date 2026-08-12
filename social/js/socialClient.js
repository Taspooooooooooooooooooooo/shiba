/* ==========================================================
   SHIBA SOCIAL
   Shared client + tiny toolkit (auth, storage, helpers)

   Social SHARES the SHIBA account system (public.users) with
   PIMS, but runs a COMPLETELY SEPARATE auth session:

     - PIMS uses the default supabase-js session.
     - Social uses its OWN session (a distinct storageKey).

   That separation is deliberate and important: logging into
   Social must NEVER grant access to PIMS, which is gated by
   the officer PIN. Same accounts, independent front doors.
========================================================== */

/* internal auth address: <username>@shiba.is-a.dev — this is
   how a username maps to a Supabase Auth account. It is NEVER
   an inbox; mail is never sent there. Must match PIMS exactly
   or existing accounts break. */

const SHIBA_AUTH_DOMAIN = "@shiba.is-a.dev";

const SUPABASE_URL = "https://vtqyqzuhifzqzqszhtwq.supabase.co";

const SUPABASE_ANON = "sb_publishable_NunfAEMxNJA39nzFxtn42g_hsmzxcv8";

/* Social's own authenticated client — note the custom storageKey
   so this session lives in its own localStorage slot and does not
   touch PIMS's session at all. */

window.sdb = window.sdb || window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON,
    {
        auth: {
            storageKey: "shiba-social-auth",
            persistSession: true,
            autoRefreshToken: true
        }
    }
);

/* Dedicated ANON storage client (no session) for the public
   "cloud" bucket — the bucket's policies accept the anon client
   only, exactly like the PIMS evidence/bodycam uploaders. Photos
   live under a social/ path prefix inside that bucket. */

window.scloud = window.scloud || window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON,
    { auth: { persistSession: false, autoRefreshToken: false } }
).storage;

const SOCIAL_BUCKET = "cloud";

/* ---------------------------------------------------------- */
/* helpers                                                     */
/* ---------------------------------------------------------- */

function usernameToEmail(username) {

    return username.trim().toLowerCase() + SHIBA_AUTH_DOMAIN;

}

/* same username rules as PIMS: 3-24 chars, a-z 0-9 . _ - */

function isValidUsername(username) {

    return /^[a-z0-9._-]{3,24}$/.test(username);

}

/* ---------------------------------------------------------- */
/* image compression                                           */
/* Photos are shrunk in the browser BEFORE upload so a small   */
/* community sits comfortably inside Supabase's free storage.  */
/* Returns a JPEG Blob no larger than `maxSize` on its long    */
/* edge. Falls back to the original file if anything fails.    */
/* ---------------------------------------------------------- */

function compressImage(file, maxSize = 1080, quality = 0.82) {

    return new Promise(resolve => {

        if (!file || !file.type || !file.type.startsWith("image/")) {

            resolve(file);

            return;

        }

        const url = URL.createObjectURL(file);

        const img = new Image();

        img.onload = () => {

            let { width, height } = img;

            if (width > maxSize || height > maxSize) {

                if (width >= height) {

                    height = Math.round(height * (maxSize / width));

                    width = maxSize;

                } else {

                    width = Math.round(width * (maxSize / height));

                    height = maxSize;

                }

            }

            const canvas = document.createElement("canvas");

            canvas.width = width;

            canvas.height = height;

            canvas.getContext("2d").drawImage(img, 0, 0, width, height);

            URL.revokeObjectURL(url);

            canvas.toBlob(

                blob => resolve(blob || file),

                "image/jpeg",

                quality

            );

        };

        img.onerror = () => {

            URL.revokeObjectURL(url);

            resolve(file);

        };

        img.src = url;

    });

}

/* upload an already-compressed blob to the cloud bucket under a
   social/<folder>/ prefix; returns { path, url } or throws. */

async function uploadToCloud(folder, userId, blob) {

    const ext = (blob.type && blob.type.includes("png")) ? "png" : "jpg";

    const path =
        "social/" + folder + "/" + userId + "/" +
        Date.now() + "-" +
        Math.random().toString(36).slice(2, 8) + "." + ext;

    const { error } = await window.scloud
        .from(SOCIAL_BUCKET)
        .upload(path, blob, {
            contentType: blob.type || "image/jpeg",
            upsert: false
        });

    if (error) throw error;

    const { data } = window.scloud
        .from(SOCIAL_BUCKET)
        .getPublicUrl(path);

    return { path, url: data.publicUrl };

}

/* ---------------------------------------------------------- */
/* SocialSession — the single source of truth for who is       */
/* signed into Social (independent of any PIMS session).       */
/* ---------------------------------------------------------- */

const SocialSession = {

    KEY: "shibaSocialUser",

    /* cached profile for instant UI paints; the real gate is
       always the live Supabase session below. */

    cached() {

        try {

            return JSON.parse(localStorage.getItem(this.KEY) || "null");

        } catch (e) {

            return null;

        }

    },

    save(user) {

        localStorage.setItem(this.KEY, JSON.stringify(user));

    },

    /* live check — resolves to the auth user or null */

    async user() {

        try {

            const { data } = await window.sdb.auth.getSession();

            return data?.session?.user || null;

        } catch (e) {

            return null;

        }

    },

    /* page guard for logged-in-only pages. Redirects to the
       Social landing page if there is no live session. */

    async require() {

        const user = await this.user();

        if (!user) {

            window.location.href = "index.html";

            return null;

        }

        return user;

    },

    async logout() {

        try { await window.sdb.auth.signOut(); } catch (e) { /* ignore */ }

        localStorage.removeItem(this.KEY);

        window.location.href = "index.html";

    }

};

/* ---------------------------------------------------------- */
/* SToast — a tiny self-contained toast (Social stays lean and */
/* does not pull in the whole PIMS UI stack).                  */
/* ---------------------------------------------------------- */

const SToast = {

    show(message, type = "info") {

        let host = document.getElementById("sToastHost");

        if (!host) {

            host = document.createElement("div");

            host.id = "sToastHost";

            document.body.appendChild(host);

        }

        const t = document.createElement("div");

        t.className = "sToast " + type;

        t.textContent = message;

        host.appendChild(t);

        requestAnimationFrame(() => t.classList.add("show"));

        setTimeout(() => {

            t.classList.remove("show");

            setTimeout(() => t.remove(), 300);

        }, 3200);

    },

    ok(m) { this.show(m, "ok"); },

    err(m) { this.show(m, "err"); },

    info(m) { this.show(m, "info"); }

};
