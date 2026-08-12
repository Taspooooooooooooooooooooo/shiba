/* ==========================================================
   SHIBA SOCIAL
   Shared client + toolkit (auth, storage, helpers, API)

   Social SHARES the SHIBA account system (public.users) with
   PIMS, but runs a COMPLETELY SEPARATE auth session (its own
   storageKey). Logging into Social must NEVER grant access to
   PIMS, which is gated by the officer PIN. Same accounts,
   independent front doors.
========================================================== */

const SHIBA_AUTH_DOMAIN = "@shiba.is-a.dev";

const SUPABASE_URL = "https://vtqyqzuhifzqzqszhtwq.supabase.co";

const SUPABASE_ANON = "sb_publishable_NunfAEMxNJA39nzFxtn42g_hsmzxcv8";

/* Social's own authenticated client (custom storageKey) */

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

/* Dedicated ANON storage client for the public "cloud" bucket */

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

function isValidUsername(username) {

    return /^[a-z0-9._-]{3,24}$/.test(username);

}

/* ---------------------------------------------------------- */
/* image compression (shrink before upload)                    */
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

            canvas.toBlob(blob => resolve(blob || file), "image/jpeg", quality);

        };

        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };

        img.src = url;

    });

}

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

    const { data } = window.scloud.from(SOCIAL_BUCKET).getPublicUrl(path);

    return { path, url: data.publicUrl };

}

/* ---------------------------------------------------------- */
/* SocialSession — who is signed into Social                   */
/* ---------------------------------------------------------- */

const SocialSession = {

    KEY: "shibaSocialUser",

    cached() {

        try {

            return JSON.parse(localStorage.getItem(this.KEY) || "null");

        } catch (e) { return null; }

    },

    save(user) {

        localStorage.setItem(this.KEY, JSON.stringify(user));

    },

    async user() {

        try {

            const { data } = await window.sdb.auth.getSession();

            return data?.session?.user || null;

        } catch (e) { return null; }

    },

    async require() {

        const user = await this.user();

        if (!user) { window.location.href = "index.html"; return null; }

        return user;

    },

    async logout() {

        try { await window.sdb.auth.signOut(); } catch (e) { /* ignore */ }

        localStorage.removeItem(this.KEY);

        window.location.href = "index.html";

    }

};

/* ---------------------------------------------------------- */
/* SToast — tiny self-contained toast                          */
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

/* ---------------------------------------------------------- */
/* small shared helpers                                        */
/* ---------------------------------------------------------- */

function escapeHtml(value) {

    return String(value == null ? "" : value)

        .replace(/&/g, "&amp;")

        .replace(/</g, "&lt;")

        .replace(/>/g, "&gt;")

        .replace(/"/g, "&quot;")

        .replace(/'/g, "&#39;");

}

function escapeAttr(value) { return escapeHtml(value); }

function initialOf(name) {

    return (name && name[0] ? name[0] : "?").toUpperCase();

}

function timeAgo(iso) {

    const then = new Date(iso).getTime();

    const s = Math.max(1, Math.floor((Date.now() - then) / 1000));

    if (s < 60) return s + "s";

    const m = Math.floor(s / 60); if (m < 60) return m + "m";

    const h = Math.floor(m / 60); if (h < 24) return h + "h";

    const d = Math.floor(h / 24); if (d < 7) return d + "d";

    const w = Math.floor(d / 7); if (w < 5) return w + "w";

    const mo = Math.floor(d / 30); if (mo < 12) return mo + "mo";

    return Math.floor(d / 365) + "y";

}

/* ---------------------------------------------------------- */
/* BADGES — admin shield / verified check / police officer.    */
/* All inline SVG (emoji-free).                                */
/* ---------------------------------------------------------- */

const SOCIAL_BADGE_SVG = {

    admin:
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
        '<path fill="#f4b23e" d="M12 2l7 3v6c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V5z"/>' +
        '<path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round" d="M8.5 12l2.2 2.2 4-4.4"/></svg>',

    verified:
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
        '<path fill="#3d9bfd" d="M12 1.8l2.3 1.8 2.9-.1 1 2.8 2.4 1.7-.8 2.8.8 2.8' +
        '-2.4 1.7-1 2.8-2.9-.1L12 22.2l-2.3-1.8-2.9.1-1-2.8-2.4-1.7.8-2.8-.8-2.8' +
        '2.4-1.7 1-2.8 2.9.1z"/>' +
        '<path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round" d="M8.6 12l2.2 2.2 4.6-4.8"/></svg>',

    officer:
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="10" fill="#3358c9"/>' +
        '<path fill="#fff" d="M12 6l1.6 3.3 3.6.5-2.6 2.6.6 3.6L12 18.3l-3.2 1.7.6-3.6' +
        '-2.6-2.6 3.6-.5z"/></svg>'

};

const SOCIAL_BADGE_LABEL = {

    admin: "Administrator",

    verified: "Verified",

    officer: "Police officer"

};

/* render a run of badge chips from a list of keys */

function badgeChipsHtml(keys) {

    if (!keys || !keys.length) return "";

    return keys.map(k =>

        '<span class="vBadge" title="' + SOCIAL_BADGE_LABEL[k] + '" ' +
        'aria-label="' + SOCIAL_BADGE_LABEL[k] + '">' +
        (SOCIAL_BADGE_SVG[k] || "") + '</span>'

    ).join("");

}

/* which badges are VISIBLE to a viewer, given the owner's flags,
   per-badge visibility, and whether the viewer is the owner or a
   friend (mutual follower). `facts` = { is_officer, is_admin }. */

function resolveBadges(profile, facts, ctx) {

    profile = profile || {};

    facts = facts || {};

    ctx = ctx || {};

    const canSee = v =>
        ctx.isSelf || v === "public" || (v === "friends" && ctx.isFriend);

    const out = [];

    if (facts.is_admin && canSee(profile.badge_admin_vis || "public"))

        out.push("admin");

    if (profile.is_verified && canSee(profile.badge_verified_vis || "public"))

        out.push("verified");

    if (facts.is_officer && canSee(profile.badge_officer_vis || "public"))

        out.push("officer");

    return out;

}

/* ---------------------------------------------------------- */
/* SocialAPI — posts, feed, likes, comments, follows, badges   */
/* ---------------------------------------------------------- */

const SocialAPI = {

    /* ---- posts ------------------------------------------- */

    async createPost(userId, imageFile, caption) {

        const blob = await compressImage(imageFile, 1080, 0.82);

        const { path, url } = await uploadToCloud("posts", userId, blob);

        const { data, error } = await window.sdb

            .from("social_posts")

            .insert({

                author_id: userId,

                image_url: url,

                image_path: path,

                caption: (caption || "").trim() || null

            })

            .select()

            .single();

        if (error) throw error;

        return data;

    },

    /* newest-first global feed. Private accounts' posts are shown
       only to the viewer and their friends. */

    async listFeed(viewerId, limit = 30) {

        const friends = await this.friendIds(viewerId);

        const { data: posts, error } = await window.sdb

            .from("social_posts")

            .select("*")

            .order("created_at", { ascending: false })

            .limit(limit);

        if (error) throw error;

        return this._hydrate(posts || [], viewerId, friends);

    },

    async listByAuthor(authorId, viewerId, limit = 60) {

        const friends = await this.friendIds(viewerId);

        const { data: posts, error } = await window.sdb

            .from("social_posts")

            .select("*")

            .eq("author_id", authorId)

            .order("created_at", { ascending: false })

            .limit(limit);

        if (error) throw error;

        return this._hydrate(posts || [], viewerId, friends);

    },

    /* fetch profile rows WITH the S3 columns; if those columns
       don't exist yet (patch not run) fall back to base columns
       so the feed keeps working. Returns a plain array. */

    async _profileRows(userIds) {

        let res = await window.sdb.from("social_profiles")

            .select("user_id, display_name, avatar_url, is_private, " +
                    "is_verified, badge_officer_vis, badge_admin_vis, " +
                    "badge_verified_vis")

            .in("user_id", userIds);

        if (res.error) {

            res = await window.sdb.from("social_profiles")

                .select("user_id, display_name, avatar_url")

                .in("user_id", userIds);

        }

        return res.data || [];

    },

    /* attach author (with resolved badges), like/comment counts,
       and drop private authors' posts for non-friends. */

    async _hydrate(posts, viewerId, friendIds) {

        if (!posts.length) return [];

        friendIds = friendIds || new Set();

        const postIds = posts.map(p => p.id);

        const authorIds = [...new Set(posts.map(p => p.author_id))];

        const [profs, likes, comments, badgeMap] = await Promise.all([

            this._profileRows(authorIds),

            window.sdb.from("social_likes")

                .select("post_id, user_id").in("post_id", postIds),

            window.sdb.from("social_comments")

                .select("post_id").in("post_id", postIds),

            this.getBadges(authorIds)

        ]);

        const profMap = {};

        profs.forEach(p => { profMap[p.user_id] = p; });

        const likeCount = {}, likedByMe = {};

        (likes.data || []).forEach(l => {

            likeCount[l.post_id] = (likeCount[l.post_id] || 0) + 1;

            if (l.user_id === viewerId) likedByMe[l.post_id] = true;

        });

        const cmtCount = {};

        (comments.data || []).forEach(c => {

            cmtCount[c.post_id] = (cmtCount[c.post_id] || 0) + 1;

        });

        const built = posts.map(p => {

            const prof = profMap[p.author_id] || {};

            const isSelf = p.author_id === viewerId;

            const isFriend = friendIds.has(p.author_id);

            return {

                ...p,

                author: {

                    user_id: p.author_id,

                    display_name: prof.display_name || "Someone",

                    avatar_url: prof.avatar_url || null,

                    is_private: !!prof.is_private,

                    badges: resolveBadges(prof, badgeMap[p.author_id],

                        { isSelf, isFriend })

                },

                likeCount: likeCount[p.id] || 0,

                likedByMe: !!likedByMe[p.id],

                commentCount: cmtCount[p.id] || 0

            };

        });

        return built.filter(p =>

            !p.author.is_private ||

            p.author_id === viewerId ||

            friendIds.has(p.author_id));

    },

    async toggleLike(postId, userId, currentlyLiked) {

        if (currentlyLiked) {

            const { error } = await window.sdb.from("social_likes")

                .delete().eq("post_id", postId).eq("user_id", userId);

            if (error) throw error;

            return false;

        }

        const { error } = await window.sdb.from("social_likes")

            .insert({ post_id: postId, user_id: userId });

        if (error && !/duplicate|unique/i.test(error.message || "")) throw error;

        return true;

    },

    async listComments(postId) {

        const { data: comments, error } = await window.sdb

            .from("social_comments")

            .select("*")

            .eq("post_id", postId)

            .order("created_at", { ascending: true });

        if (error) throw error;

        if (!comments || !comments.length) return [];

        const authorIds = [...new Set(comments.map(c => c.author_id))];

        const { data: profs } = await window.sdb.from("social_profiles")

            .select("user_id, display_name, avatar_url")

            .in("user_id", authorIds);

        const map = {};

        (profs || []).forEach(p => { map[p.user_id] = p; });

        return comments.map(c => ({

            ...c,

            author: map[c.author_id] ||

                { display_name: "Someone", avatar_url: null }

        }));

    },

    async addComment(postId, userId, body) {

        const { data, error } = await window.sdb.from("social_comments")

            .insert({ post_id: postId, author_id: userId, body: body.trim() })

            .select().single();

        if (error) throw error;

        return data;

    },

    /* ---- follows / friends ------------------------------- */

    async follow(followerId, followingId) {

        const { error } = await window.sdb.from("social_follows")

            .insert({ follower_id: followerId, following_id: followingId });

        if (error && !/duplicate|unique/i.test(error.message || "")) throw error;

        return true;

    },

    async unfollow(followerId, followingId) {

        const { error } = await window.sdb.from("social_follows")

            .delete()

            .eq("follower_id", followerId)

            .eq("following_id", followingId);

        if (error) throw error;

        return false;

    },

    async followCounts(userId) {

        try {

            const [f1, f2] = await Promise.all([

                window.sdb.from("social_follows")

                    .select("id", { count: "exact", head: true })

                    .eq("following_id", userId),

                window.sdb.from("social_follows")

                    .select("id", { count: "exact", head: true })

                    .eq("follower_id", userId)

            ]);

            return { followers: f1.count || 0, following: f2.count || 0 };

        } catch (e) {

            return { followers: 0, following: 0 };

        }

    },

    async relationship(viewerId, targetId) {

        if (viewerId === targetId)

            return { self: true, iFollow: false, followsMe: false, isFriend: false };

        try {

            const [a, b] = await Promise.all([

                window.sdb.from("social_follows").select("id")

                    .eq("follower_id", viewerId).eq("following_id", targetId)

                    .maybeSingle(),

                window.sdb.from("social_follows").select("id")

                    .eq("follower_id", targetId).eq("following_id", viewerId)

                    .maybeSingle()

            ]);

            const iFollow = !!(a.data);

            const followsMe = !!(b.data);

            return { self: false, iFollow, followsMe, isFriend: iFollow && followsMe };

        } catch (e) {

            return { self: false, iFollow: false, followsMe: false, isFriend: false };

        }

    },

    /* the viewer's friend set = users they follow who follow back */

    async friendIds(viewerId) {

        try {

            const [outRes, inRes] = await Promise.all([

                window.sdb.from("social_follows")

                    .select("following_id").eq("follower_id", viewerId),

                window.sdb.from("social_follows")

                    .select("follower_id").eq("following_id", viewerId)

            ]);

            const following = new Set((outRes.data || []).map(r => r.following_id));

            const friends = new Set();

            (inRes.data || []).forEach(r => {

                if (following.has(r.follower_id)) friends.add(r.follower_id);

            });

            return friends;

        } catch (e) {

            return new Set();

        }

    },

    /* ---- derived badges (officer / admin) ---------------- */

    async getBadges(userIds) {

        if (!userIds || !userIds.length) return {};

        try {

            const { data, error } = await window.sdb

                .rpc("social_badges", { p_user_ids: userIds });

            if (error) { console.warn("social_badges:", error.message); return {}; }

            const map = {};

            (data || []).forEach(b => { map[b.user_id] = b; });

            return map;

        } catch (e) {

            return {};

        }

    }

};
