/* ==========================================================
   SHIBA SOCIAL — home (S2)

   Guards the session, loads the viewer's profile for the
   topbar, renders the global photo feed, and drives the
   compose modal (pick → compress → upload → post).
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const user = await SocialSession.require();

    if (!user) return;               /* redirected to landing */

    const viewerId = user.id;

    /* opportunistic story cleanup (safe no-op if not set up) */

    window.sdb.rpc("purge_expired_stories").then(() => {}, () => {});

    /* ----------------------------------------------------- */
    /* load viewer profile (avatar + name)                    */
    /* ----------------------------------------------------- */

    const meta = user.user_metadata || {};

    const username = meta.username || SocialSession.cached()?.username || "you";

    let profile = null;

    try {

        const { data } = await window.sdb

            .from("social_profiles")

            .select("display_name, avatar_url")

            .eq("user_id", viewerId)

            .maybeSingle();

        profile = data;

    } catch (e) { /* offline */ }

    const displayName = (profile && profile.display_name) || username;

    const avatarUrl = (profile && profile.avatar_url) || null;

    /* enrich the cache so comment authorship shows a real name */

    SocialSession.save({

        id: viewerId,

        username,

        displayName,

        avatarUrl

    });

    /* topbar avatar */

    paintCircle(

        document.getElementById("avatarBtn"),

        document.getElementById("avatarInitial"),

        avatarUrl, displayName

    );

    /* composer teaser avatar */

    paintCircle(

        document.getElementById("teaserAvatar"),

        document.getElementById("teaserInitial"),

        avatarUrl, displayName

    );

    document.getElementById("menuName").textContent = displayName;

    document.getElementById("menuHandle").textContent = "@" + username;

    /* ----------------------------------------------------- */
    /* avatar menu + logout                                   */
    /* ----------------------------------------------------- */

    const avatarBtn = document.getElementById("avatarBtn");

    const menu = document.getElementById("userMenu");

    avatarBtn.addEventListener("click", (e) => {

        e.stopPropagation();

        menu.classList.toggle("hidden");

    });

    document.addEventListener("click", (e) => {

        if (!menu.contains(e.target) && e.target !== avatarBtn) {

            menu.classList.add("hidden");

        }

    });

    document.getElementById("logoutBtn")

        .addEventListener("click", () => SocialSession.logout());

    /* ----------------------------------------------------- */
    /* feed                                                   */
    /* ----------------------------------------------------- */

    const feed = document.getElementById("feed");

    const feedLoading = document.getElementById("feedLoading");

    const feedEmpty = document.getElementById("feedEmpty");

    async function loadFeed() {

        try {

            const posts = await SocialAPI.listFeed(viewerId, 30);

            feedLoading.classList.add("hidden");

            feed.innerHTML = "";

            if (!posts.length) {

                feedEmpty.classList.remove("hidden");

                return;

            }

            feedEmpty.classList.add("hidden");

            posts.forEach(p => feed.appendChild(renderPostCard(p, viewerId)));

        } catch (e) {

            console.error("feed load failed:", e);

            feedLoading.classList.add("hidden");

            /* most likely the schema patch isn't run yet */

            feedEmpty.classList.remove("hidden");

            SToast.err("Couldn't load the feed. Is the Social schema set up?");

        }

    }

    loadFeed();

    /* ----------------------------------------------------- */
    /* compose modal                                          */
    /* ----------------------------------------------------- */

    const modal = document.getElementById("composeModal");

    const postFile = document.getElementById("postFile");

    const pickArea = document.getElementById("pickArea");

    const pickPrompt = document.getElementById("pickPrompt");

    const preview = document.getElementById("composePreview");

    const captionEl = document.getElementById("postCaption");

    const postBtn = document.getElementById("postBtn");

    let chosenFile = null;

    function openCompose() {

        chosenFile = null;

        captionEl.value = "";

        preview.classList.add("hidden");

        preview.removeAttribute("src");

        pickPrompt.classList.remove("hidden");

        modal.classList.remove("hidden");

        menu.classList.add("hidden");

    }

    function closeCompose() {

        modal.classList.add("hidden");

    }

    document.getElementById("newPostBtn").addEventListener("click", openCompose);

    document.getElementById("composerTeaser").addEventListener("click", openCompose);

    document.getElementById("emptyPostBtn").addEventListener("click", openCompose);

    document.getElementById("composeClose").addEventListener("click", closeCompose);

    document.getElementById("composeCancel").addEventListener("click", closeCompose);

    modal.addEventListener("click", (e) => {

        if (e.target === modal) closeCompose();

    });

    pickArea.addEventListener("click", () => postFile.click());

    postFile.addEventListener("change", () => {

        const file = postFile.files && postFile.files[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {

            SToast.err("Please choose an image file.");

            return;

        }

        chosenFile = file;

        const url = URL.createObjectURL(file);

        preview.src = url;

        preview.classList.remove("hidden");

        pickPrompt.classList.add("hidden");

    });

    postBtn.addEventListener("click", async () => {

        if (!chosenFile) {

            SToast.err("Choose a photo first.");

            return;

        }

        postBtn.disabled = true;

        postBtn.textContent = "Posting…";

        try {

            const created = await SocialAPI.createPost(

                viewerId, chosenFile, captionEl.value);

            /* hydrate the single new post with the viewer as author
               so it renders instantly at the top of the feed */

            const fresh = {

                ...created,

                author: { display_name: displayName, avatar_url: avatarUrl },

                likeCount: 0,

                likedByMe: false,

                commentCount: 0

            };

            feedEmpty.classList.add("hidden");

            feed.insertBefore(renderPostCard(fresh, viewerId), feed.firstChild);

            closeCompose();

            SToast.ok("Posted!");

        } catch (e) {

            console.error("post failed:", e);

            SToast.err("Could not share your photo. Try again.");

        }

        postBtn.disabled = false;

        postBtn.textContent = "Post";

    });

});

/* ---------------------------------------------------------- */
/* paint an avatar circle (image, or initial fallback)        */
/* ---------------------------------------------------------- */

function paintCircle(host, initialEl, url, name) {

    if (url) {

        host.innerHTML = "";

        const img = document.createElement("img");

        img.src = url;

        img.alt = name;

        host.appendChild(img);

    } else if (initialEl) {

        initialEl.textContent = initialOf(name);

    }

}
