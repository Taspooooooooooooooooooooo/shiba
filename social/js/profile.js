/* ==========================================================
   SHIBA SOCIAL — profile (S3)

   Views ANY user's profile:
     profile.html            → your own
     profile.html?id=<uuid>  → someone else's
     profile.html?u=<name>   → someone else's by username

   Adds Follow/Unfollow (a "friend" is a mutual follow), a
   public/private gate on posts, badges (admin shield / verified
   check / police officer) shown per each owner's visibility, and
   — for your own profile — privacy + per-badge visibility + the
   name/bio/avatar editor.
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const viewer = await SocialSession.require();

    if (!viewer) return;

    /* ----------------------------------------------------- */
    /* work out whose profile we're looking at               */
    /* ----------------------------------------------------- */

    const params = new URLSearchParams(location.search);

    const paramId = params.get("id");

    const paramUser = params.get("u");

    let target = null;      /* { id, username } */

    try {

        if (paramId) {

            const { data } = await window.sdb.from("users")

                .select("id, username").eq("id", paramId).maybeSingle();

            if (data) target = { id: data.id, username: data.username };

        } else if (paramUser) {

            const { data } = await window.sdb.from("users")

                .select("id, username")

                .eq("username", paramUser.trim().toLowerCase()).maybeSingle();

            if (data) target = { id: data.id, username: data.username };

        }

    } catch (e) { /* fall through to not-found handling */ }

    if (!target) {

        /* no valid param → your own profile */

        if (!paramId && !paramUser) {

            target = {

                id: viewer.id,

                username: viewer.user_metadata?.username ||

                    SocialSession.cached()?.username || "you"

            };

        } else {

            SToast.err("That profile could not be found.");

            setTimeout(() => window.location.href = "home.html", 900);

            return;

        }

    }

    const isSelf = target.id === viewer.id;

    /* ----------------------------------------------------- */
    /* shared state                                          */
    /* ----------------------------------------------------- */

    let profile = {

        display_name: target.username,

        bio: "",

        avatar_url: null,

        avatar_path: null,

        is_private: false,

        is_verified: false,

        badge_officer_vis: "public",

        badge_admin_vis: "public",

        badge_verified_vis: "public",

        created_at: null

    };

    let targetFacts = {};     /* { is_officer, is_admin } */

    let viewerIsAdmin = false;

    let rel = { self: isSelf, iFollow: false, followsMe: false, isFriend: false };

    let counts = { followers: 0, following: 0 };

    let postCount = 0;

    let pendingAvatarBlob = null;

    /* elements */

    const viewMode = document.getElementById("viewMode");

    const editMode = document.getElementById("editMode");

    const grid = document.getElementById("postGrid");

    const noPosts = document.getElementById("noPosts");

    const lockedPosts = document.getElementById("lockedPosts");

    const relActions = document.getElementById("relActions");

    /* ----------------------------------------------------- */
    /* helpers                                               */
    /* ----------------------------------------------------- */

    function paintAvatar(host, initialEl, url, name) {

        if (url) {

            host.innerHTML = "";

            const img = document.createElement("img");

            img.src = url;

            img.alt = name;

            host.appendChild(img);

        } else {

            host.innerHTML = '<span>' + initialOf(name) + '</span>';

            if (initialEl) initialEl.textContent = initialOf(name);

        }

    }

    /* ----------------------------------------------------- */
    /* load everything + render                              */
    /* ----------------------------------------------------- */

    async function load() {

        /* profile row — try the S3 columns, fall back to the base
           ones if the patch isn't run yet */

        try {

            let res = await window.sdb

                .from("social_profiles")

                .select("display_name, bio, avatar_url, avatar_path, " +
                        "is_private, is_verified, badge_officer_vis, " +
                        "badge_admin_vis, badge_verified_vis, created_at")

                .eq("user_id", target.id)

                .maybeSingle();

            if (res.error) {

                res = await window.sdb.from("social_profiles")

                    .select("display_name, bio, avatar_url, avatar_path, created_at")

                    .eq("user_id", target.id)

                    .maybeSingle();

            }

            if (res.data) profile = { ...profile, ...res.data };

        } catch (e) { /* offline — keep defaults */ }

        /* badges facts (target + viewer), relationship, counts */

        const [badgeMap, relation, cnt] = await Promise.all([

            SocialAPI.getBadges([target.id, viewer.id]),

            isSelf

                ? Promise.resolve({ self: true, iFollow: false,

                    followsMe: false, isFriend: false })

                : SocialAPI.relationship(viewer.id, target.id),

            SocialAPI.followCounts(target.id)

        ]);

        targetFacts = badgeMap[target.id] || {};

        viewerIsAdmin = !!(badgeMap[viewer.id] && badgeMap[viewer.id].is_admin);

        SocialViewer.isAdmin = viewerIsAdmin;

        rel = relation;

        counts = cnt;

        try {

            const { count } = await window.sdb.from("social_posts")

                .select("id", { count: "exact", head: true })

                .eq("author_id", target.id);

            postCount = count || 0;

        } catch (e) { postCount = 0; }

        renderView();

        renderRelActions();

        renderPostsSection();

    }

    /* ----------------------------------------------------- */
    /* render: header                                        */
    /* ----------------------------------------------------- */

    function renderView() {

        const name = profile.display_name || target.username;

        document.getElementById("viewName").textContent = name;

        document.getElementById("viewHandle").textContent = "@" + target.username;

        paintAvatar(

            document.getElementById("viewAvatar"),

            document.getElementById("viewInitial"),

            profile.avatar_url, name);

        /* badges (respect this owner's per-badge visibility) */

        const badges = resolveBadges(profile, targetFacts,

            { isSelf, isFriend: rel.isFriend });

        document.getElementById("viewBadges").innerHTML = badgeChipsHtml(badges);

        /* friends pill */

        document.getElementById("friendPill")

            .classList.toggle("hidden", !rel.isFriend);

        /* bio */

        const bioEl = document.getElementById("viewBio");

        if (profile.bio && profile.bio.trim()) {

            bioEl.textContent = profile.bio;

            bioEl.classList.remove("empty-bio");

        } else {

            bioEl.textContent = isSelf ? "No bio yet." : "";

            bioEl.classList.toggle("empty-bio", true);

        }

        /* stats */

        document.getElementById("statPosts").textContent = postCount;

        document.getElementById("statFollowers").textContent = counts.followers;

        document.getElementById("statFollowing").textContent = counts.following;

    }

    /* ----------------------------------------------------- */
    /* render: relationship actions                          */
    /* ----------------------------------------------------- */

    function renderRelActions() {

        relActions.innerHTML = "";

        if (isSelf) {

            const edit = document.createElement("button");

            edit.className = "btn ghost";

            edit.textContent = "Edit profile";

            edit.addEventListener("click", openEdit);

            relActions.appendChild(edit);

            return;

        }

        /* follow / following toggle */

        const followBtn = document.createElement("button");

        followBtn.className = rel.iFollow ? "btn ghost" : "btn";

        followBtn.textContent = rel.iFollow

            ? (rel.isFriend ? "Following · Friends" : "Following")

            : (rel.followsMe ? "Follow back" : "Follow");

        followBtn.addEventListener("click", async () => {

            followBtn.disabled = true;

            try {

                if (rel.iFollow) {

                    await SocialAPI.unfollow(viewer.id, target.id);

                } else {

                    await SocialAPI.follow(viewer.id, target.id);

                }

                await load();     /* re-derive friend state, posts, badges */

            } catch (e) {

                console.error("follow toggle failed:", e);

                SToast.err("Couldn't update. Is the Social schema up to date?");

                followBtn.disabled = false;

            }

        });

        relActions.appendChild(followBtn);

        /* admin-only: verify / unverify this account */

        if (viewerIsAdmin) {

            const verifyBtn = document.createElement("button");

            verifyBtn.className = "btn ghost";

            verifyBtn.textContent = profile.is_verified ? "Unverify" : "Verify";

            verifyBtn.addEventListener("click", async () => {

                verifyBtn.disabled = true;

                try {

                    await window.sdb.from("social_profiles")

                        .update({ is_verified: !profile.is_verified })

                        .eq("user_id", target.id);

                    SToast.ok(profile.is_verified

                        ? "Verification removed." : "Account verified.");

                    await load();

                } catch (e) {

                    SToast.err("Could not change verification.");

                    verifyBtn.disabled = false;

                }

            });

            relActions.appendChild(verifyBtn);

        }

    }

    /* ----------------------------------------------------- */
    /* render: posts (grid, empty, or private-locked)        */
    /* ----------------------------------------------------- */

    async function renderPostsSection() {

        const canSee = isSelf || !profile.is_private || rel.isFriend;

        grid.innerHTML = "";

        noPosts.classList.add("hidden");

        lockedPosts.classList.add("hidden");

        if (!canSee) {

            lockedPosts.classList.remove("hidden");

            return;

        }

        let posts = [];

        try {

            posts = await SocialAPI.listByAuthor(target.id, viewer.id, 60);

        } catch (e) { /* schema maybe not set up */ }

        if (!posts.length) {

            document.getElementById("noPostsText").textContent =

                isSelf ? "You haven't posted yet." : "No posts yet.";

            noPosts.classList.remove("hidden");

            return;

        }

        posts.forEach(p => {

            const cell = document.createElement("button");

            cell.className = "gridCell";

            cell.type = "button";

            const img = document.createElement("img");

            img.src = p.image_url;

            img.alt = p.caption || "Photo";

            img.loading = "lazy";

            cell.appendChild(img);

            cell.addEventListener("click", () => openLightbox(p));

            grid.appendChild(cell);

        });

    }

    /* ----------------------------------------------------- */
    /* lightbox                                              */
    /* ----------------------------------------------------- */

    const lightbox = document.getElementById("postLightbox");

    const lightBody = document.getElementById("lightBody");

    function openLightbox(post) {

        lightBody.innerHTML = "";

        lightBody.appendChild(renderPostCard(post, viewer.id));

        lightbox.classList.remove("hidden");

    }

    function closeLightbox() {

        lightbox.classList.add("hidden");

        lightBody.innerHTML = "";

    }

    document.getElementById("lightClose")

        .addEventListener("click", closeLightbox);

    lightbox.addEventListener("click", (e) => {

        if (e.target === lightbox) closeLightbox();

    });

    /* ----------------------------------------------------- */
    /* EDIT (self only)                                      */
    /* ----------------------------------------------------- */

    const editName = document.getElementById("editName");

    const editBio = document.getElementById("editBio");

    const bioCount = document.getElementById("bioCount");

    const editPrivate = document.getElementById("editPrivate");

    function openEdit() {

        pendingAvatarBlob = null;

        editName.value = profile.display_name || target.username;

        editBio.value = profile.bio || "";

        bioCount.textContent = editBio.value.length;

        editPrivate.checked = !!profile.is_private;

        paintAvatar(

            document.getElementById("editAvatarPrev"),

            document.getElementById("editInitial"),

            profile.avatar_url, editName.value);

        /* badge visibility rows — show only the badges you have */

        const has = {

            officer: !!targetFacts.is_officer,

            admin: !!targetFacts.is_admin,

            verified: !!profile.is_verified

        };

        const anyBadge = has.officer || has.admin || has.verified;

        document.getElementById("badgeVisBlock")

            .classList.toggle("hidden", !anyBadge);

        setBadgeRow("officer", has.officer, profile.badge_officer_vis);

        setBadgeRow("admin", has.admin, profile.badge_admin_vis);

        setBadgeRow("verified", has.verified, profile.badge_verified_vis);

        viewMode.classList.add("hidden");

        editMode.classList.remove("hidden");

    }

    function setBadgeRow(badge, has, value) {

        const row = document.querySelector('.badgeVisRow[data-badge="' + badge + '"]');

        if (row) row.classList.toggle("hidden", !has);

        const sel = document.getElementById(

            "vis" + badge.charAt(0).toUpperCase() + badge.slice(1));

        if (sel) sel.value = value || "public";

    }

    function closeEdit() {

        editMode.classList.add("hidden");

        viewMode.classList.remove("hidden");

    }

    document.getElementById("cancelBtn").addEventListener("click", closeEdit);

    editBio.addEventListener("input", () => {

        bioCount.textContent = editBio.value.length;

    });

    /* avatar pick + preview */

    const avatarFile = document.getElementById("avatarFile");

    document.getElementById("pickAvatarBtn")

        .addEventListener("click", () => avatarFile.click());

    avatarFile.addEventListener("change", async () => {

        const file = avatarFile.files && avatarFile.files[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {

            SToast.err("Please choose an image file.");

            return;

        }

        pendingAvatarBlob = await compressImage(file, 512, 0.85);

        const prevUrl = URL.createObjectURL(pendingAvatarBlob);

        const host = document.getElementById("editAvatarPrev");

        host.innerHTML = "";

        const img = document.createElement("img");

        img.src = prevUrl;

        host.appendChild(img);

    });

    /* save */

    document.getElementById("saveBtn").addEventListener("click", async () => {

        const saveBtn = document.getElementById("saveBtn");

        const name = editName.value.trim();

        if (!name) {

            SToast.err("A display name can't be empty.");

            return;

        }

        saveBtn.disabled = true;

        saveBtn.textContent = "Saving…";

        const update = {

            display_name: name,

            bio: editBio.value.trim(),

            is_private: !!editPrivate.checked,

            badge_officer_vis: document.getElementById("visOfficer").value,

            badge_admin_vis: document.getElementById("visAdmin").value,

            badge_verified_vis: document.getElementById("visVerified").value

        };

        if (pendingAvatarBlob) {

            try {

                const { path, url } =

                    await uploadToCloud("avatars", viewer.id, pendingAvatarBlob);

                update.avatar_url = url;

                update.avatar_path = path;

            } catch (e) {

                console.error("avatar upload failed:", e);

                SToast.err("Couldn't upload the photo. Saved the rest.");

            }

        }

        let { error } = await window.sdb.from("social_profiles")

            .update(update).eq("user_id", viewer.id);

        if (error) {

            /* S3 columns may not exist yet — save the base fields so
               name/bio/avatar still work before the patch is run */

            const base = {

                display_name: update.display_name,

                bio: update.bio

            };

            if (update.avatar_url) base.avatar_url = update.avatar_url;

            if (update.avatar_path) base.avatar_path = update.avatar_path;

            const retry = await window.sdb.from("social_profiles")

                .update(base).eq("user_id", viewer.id);

            error = retry.error;

            if (!error) {

                SToast.info("Saved. Run the S3 patch to save privacy + badge settings.");

            }

        }

        if (error) {

            console.error("profile save failed:", error);

            SToast.err("Could not save your profile.");

            saveBtn.disabled = false;

            saveBtn.textContent = "Save changes";

            return;

        }

        profile = { ...profile, ...update };

        pendingAvatarBlob = null;

        /* keep the cached identity fresh for comment authorship */

        SocialSession.save({

            id: viewer.id,

            username: target.username,

            displayName: profile.display_name,

            avatarUrl: profile.avatar_url

        });

        renderView();

        closeEdit();

        SToast.ok("Profile updated.");

        saveBtn.disabled = false;

        saveBtn.textContent = "Save changes";

    });

    /* go */

    load();

});
