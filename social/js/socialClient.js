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

/* SHA-256 hex — used when linking a police account (the PIMS PIN
   is stored as a SHA-256 hash, same as PIMS itself). */

async function sha256Hex(text) {

    const bytes = new TextEncoder().encode(text);

    const hash = await crypto.subtle.digest("SHA-256", bytes);

    return [...new Uint8Array(hash)]

        .map(b => b.toString(16).padStart(2, "0"))

        .join("");

}

function escapeRegex(s) {

    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

}

/* best-effort public IP (used for moderation / ban enforcement).
   Resolves to null if the lookup fails — nothing blocks on it. */

async function getClientIp() {

    try {

        const ctrl = new AbortController();

        const t = setTimeout(() => ctrl.abort(), 3500);

        const res = await fetch("https://api.ipify.org?format=json",

            { signal: ctrl.signal });

        clearTimeout(t);

        const data = await res.json();

        return data && data.ip ? data.ip : null;

    } catch (e) {

        return null;

    }

}

/* the current viewer's quick context (id + admin), set by pages
   after they load badges — the post card reads it to decide which
   Actions to show. */

const SocialViewer = { id: null, isAdmin: false };

/* the current viewer's moderation status (set in require) */

const SocialStatus = { muted: false, muteUntil: null, warning: null };

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

        SocialViewer.id = user.id;

        let blocked = false, reason = null, kind = null, until = null;

        /* fast banned-flag check (works after the S5 patch) */

        try {

            const { data } = await window.sdb.from("social_profiles")

                .select("banned, banned_reason")

                .eq("user_id", user.id).maybeSingle();

            if (data && data.banned) {

                blocked = true; reason = data.banned_reason; kind = "ban";

            }

        } catch (e) { /* column missing pre-patch — ignore */ }

        /* richer status (after the S6 patch): timeouts / mutes / warns */

        const st = await SocialAPI.selfStatus();

        if (st && st.blocked) {

            blocked = true; reason = st.block_reason;

            kind = st.block_kind; until = st.block_until;

        }

        SocialStatus.muted = !!(st && st.muted);

        SocialStatus.muteUntil = (st && st.mute_until) || null;

        SocialStatus.warning = (st && st.warning) || null;

        if (blocked) { this.bannedScreen(reason, kind, until); return null; }

        /* one-time warning notice */

        if (SocialStatus.warning && !sessionStorage.getItem("shibaWarnSeen")) {

            sessionStorage.setItem("shibaWarnSeen", "1");

            setTimeout(() => SToast.info(

                "Warning from moderators: " + SocialStatus.warning), 700);

        }

        return user;

    },

    /* full-page notice for a blocked account, then clear the session */

    bannedScreen(reason, kind, until) {

        const title = kind === "timeout" ? "You are timed out" : "Account suspended";

        const untilTxt = until

            ? '<p class="bannedReason">Until: ' +
              escapeHtml(new Date(until).toLocaleString()) + '</p>'

            : '';

        document.body.innerHTML =

            '<div class="bannedWrap">' +
            '<div class="bannedCard">' +
            '<div class="bannedMark">!</div>' +
            '<h1>' + title + '</h1>' +
            '<p>Your access to SHIBA Social is currently restricted for ' +
            'violating the Terms of Use.</p>' +
            (reason ? '<p class="bannedReason">Reason: ' +
                escapeHtml(reason) + '</p>' : '') +
            untilTxt +
            '<p class="bannedFoot">If you believe this is a mistake, ' +
            'contact the administrators.</p>' +
            '</div></div>';

        try { window.sdb.auth.signOut(); } catch (e) { /* ignore */ }

        localStorage.removeItem(this.KEY);

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
/* SocialMod — the moderation bot. Scans post text against an  */
/* admin-managed banned-terms list (kept in the DB, not the    */
/* repo) and skips anything on the learned-safe allow list.    */
/* ---------------------------------------------------------- */

const SocialMod = {

    _terms: null,

    _allow: null,

    async load() {

        try {

            const [t, a] = await Promise.all([

                window.sdb.from("social_mod_terms")

                    .select("term, category, active"),

                window.sdb.from("social_mod_allow").select("term")

            ]);

            this._terms = (t.data || []).filter(x => x.active !== false);

            this._allow = new Set(

                (a.data || []).map(x => (x.term || "").toLowerCase()));

        } catch (e) {

            this._terms = [];

            this._allow = new Set();

        }

    },

    /* returns { flagged, categories:[], matched:[], reason } */

    scan(text) {

        const terms = this._terms || [];

        const allow = this._allow || new Set();

        /* normalise: lowercase, punctuation → spaces, padded */

        const hay = " " +
            String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ") +
            " ";

        const matched = [];

        const cats = new Set();

        terms.forEach(t => {

            const term = (t.term || "").toLowerCase().trim();

            if (!term || allow.has(term)) return;

            const re = new RegExp(

                "(^|[^a-z0-9])" + escapeRegex(term) + "([^a-z0-9]|$)");

            if (re.test(hay)) {

                matched.push(t.term);

                cats.add(t.category || "Flagged");

            }

        });

        const flagged = matched.length > 0;

        return {

            flagged,

            categories: [...cats],

            matched,

            reason: flagged

                ? ("Matched: " + matched.join(", ") +

                   " — " + [...cats].join(", "))

                : ""

        };

    }

};

/* ---------------------------------------------------------- */
/* SocialAPI — posts, feed, likes, comments, follows, badges   */
/* ---------------------------------------------------------- */

const SocialAPI = {

    /* ---- posts ------------------------------------------- */

    async createPost(userId, imageFile, caption, title) {

        const blob = await compressImage(imageFile, 1080, 0.82);

        const { path, url } = await uploadToCloud("posts", userId, blob);

        const row = {

            author_id: userId,

            image_url: url,

            image_path: path,

            caption: (caption || "").trim() || null,

            title: (title || "").trim() || null

        };

        let res = await window.sdb

            .from("social_posts").insert(row).select().single();

        if (res.error && row.title) {

            /* the title column may not exist yet — retry without it */

            delete row.title;

            res = await window.sdb

                .from("social_posts").insert(row).select().single();

        }

        if (res.error) throw res.error;

        return res.data;

    },

    /* bump a post's view counter (atomic RPC). Fire-and-forget;
       silently no-ops until the S4 patch is run. */

    async incrementViews(postId) {

        try {

            const { data } = await window.sdb

                .rpc("increment_post_views", { p_post_id: postId });

            return data;

        } catch (e) { return null; }

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

    async _hydrate(posts, viewerId, friendIds, noFilter) {

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

        if (noFilter) return built;

        return built.filter(p =>

            !p.author.is_private ||

            p.author_id === viewerId ||

            friendIds.has(p.author_id));

    },

    /* admin: every post by an author, unfiltered (private included) */

    async adminListPosts(authorId, viewerId) {

        const { data, error } = await window.sdb.from("social_posts")

            .select("*").eq("author_id", authorId)

            .order("created_at", { ascending: false }).limit(100);

        if (error) throw error;

        return this._hydrate(data || [], viewerId, new Set(), true);

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

    },

    /* ---- moderation ------------------------------------- */

    /* raise a flag on a post from a scan result (keeps a snapshot
       so the record survives the post being deleted) */

    async flagPost(post, scan) {

        try {

            await window.sdb.from("social_flags").insert({

                post_id: post.id,

                author_id: post.author_id,

                category: scan.categories.join(", "),

                matched: scan.matched.join(","),

                reason: scan.reason,

                snapshot_title: post.title || null,

                snapshot_caption: post.caption || null,

                snapshot_image: post.image_url || null

            });

        } catch (e) { console.warn("flagPost:", e.message); }

    },

    /* a user manually reports a post → lands in the same admin
       queue as bot flags (covers images and anything the bot
       misses). No matched terms, so a "False" review learns nothing. */

    async reportPost(post, reason) {

        const me = SocialSession.cached();

        const who = me && me.username ? "@" + me.username : "a user";

        const { error } = await window.sdb.from("social_flags").insert({

            post_id: post.id,

            author_id: post.author_id,

            category: "User report",

            matched: null,

            reason: "Reported by " + who +

                (reason ? " — " + reason : ""),

            snapshot_title: post.title || null,

            snapshot_caption: post.caption || null,

            snapshot_image: post.image_url || null

        });

        if (error) throw error;

    },

    async listPendingFlags() {

        const { data, error } = await window.sdb

            .from("social_flags")

            .select("*")

            .eq("status", "Pending")

            .order("created_at", { ascending: false });

        if (error) throw error;

        return data || [];

    },

    async confirmFlag(flagId, reason) {

        const { data, error } = await window.sdb

            .rpc("social_confirm_flag", { p_flag: flagId, p_reason: reason || null });

        if (error) throw error;

        return data;

    },

    async cancelFlag(flagId) {

        const { data, error } = await window.sdb

            .rpc("social_cancel_flag", { p_flag: flagId });

        if (error) throw error;

        return data;

    },

    async falseFlag(flagId) {

        const { data, error } = await window.sdb

            .rpc("social_false_flag", { p_flag: flagId });

        if (error) throw error;

        return data;

    },

    /* banned-terms manager */

    async listBannedTerms() {

        const { data, error } = await window.sdb

            .from("social_mod_terms")

            .select("*")

            .order("created_at", { ascending: false });

        if (error) throw error;

        return data || [];

    },

    async addBannedTerm(term, category, by) {

        const { error } = await window.sdb.from("social_mod_terms")

            .insert({

                term: term.trim().toLowerCase(),

                category: category || "Hate ideology",

                created_by: by || null

            });

        if (error) throw error;

    },

    async removeBannedTerm(id) {

        const { error } = await window.sdb.from("social_mod_terms")

            .delete().eq("id", id);

        if (error) throw error;

    },

    async listAllowTerms() {

        const { data } = await window.sdb.from("social_mod_allow")

            .select("*").order("created_at", { ascending: false });

        return data || [];

    },

    async removeAllowTerm(id) {

        const { error } = await window.sdb.from("social_mod_allow")

            .delete().eq("id", id);

        if (error) throw error;

    },

    /* ban enforcement */

    async checkBanned(email, phone, ip) {

        try {

            const { data } = await window.sdb.rpc("social_check_banned", {

                p_email: email || null,

                p_phone: phone || null,

                p_ip: ip || null

            });

            return !!data;

        } catch (e) { return false; }

    },

    /* delete a post (owner or admin — RLS off for now) */

    async deletePost(postId) {

        const { error } = await window.sdb.from("social_posts")

            .delete().eq("id", postId);

        if (error) throw error;

    },

    /* ---- sanctions (admin, via DEFINER RPCs) ------------- */

    async sanction(userId, kind, reason, minutes) {

        const { data, error } = await window.sdb.rpc("social_sanction", {

            p_user: userId, p_kind: kind,

            p_reason: reason || null, p_minutes: minutes || null

        });

        if (error) throw error;

        return data;

    },

    async liftSanction(userId, kind) {

        const { data, error } = await window.sdb.rpc("social_lift", {

            p_user: userId, p_kind: kind || null

        });

        if (error) throw error;

        return data;

    },

    async selfStatus() {

        try {

            const { data } = await window.sdb.rpc("social_self_status");

            return data || { blocked: false };

        } catch (e) { return { blocked: false }; }

    },

    async adminSanctions(userId) {

        try {

            const { data } = await window.sdb

                .rpc("social_admin_sanctions", { p_user: userId });

            return data || [];

        } catch (e) { return []; }

    },

    /* look up a user for the admin panel (full profile — admins see
       private accounts and contact details) */

    async adminGetUser(query) {

        const raw = (query || "").trim();

        if (!raw) return null;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

            .test(raw);

        let u = null;

        if (isUuid) {

            const r = await window.sdb.from("users")

                .select("id, username").eq("id", raw).maybeSingle();

            u = r.data;

        } else {

            const r = await window.sdb.from("users").select("id, username")

                .eq("username", raw.toLowerCase().replace(/^@/, "")).maybeSingle();

            u = r.data;

        }

        if (!u) return null;

        const { data: p } = await window.sdb.from("social_profiles")

            .select("*").eq("user_id", u.id).maybeSingle();

        return { id: u.id, username: u.username, profile: p || {} };

    }

};
