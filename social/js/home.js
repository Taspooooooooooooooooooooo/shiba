/* ==========================================================
   SHIBA SOCIAL — home shell (S1)

   S1 keeps the home minimal: it guards the session, greets
   the user, wires the avatar menu, and points to the profile.
   The real photo feed arrives in S2.
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const user = await SocialSession.require();

    if (!user) return;               /* redirected to landing */

    /* opportunistic story cleanup (safe no-op if the RPC or
       table isn't there yet) */

    window.sdb.rpc("purge_expired_stories").then(() => {}, () => {});

    /* ----------------------------------------------------- */
    /* load the social profile for name + avatar             */
    /* ----------------------------------------------------- */

    let profile = null;

    try {

        const { data } = await window.sdb

            .from("social_profiles")

            .select("display_name, avatar_url, user_id")

            .eq("user_id", user.id)

            .maybeSingle();

        profile = data;

    } catch (e) { /* offline — fall back to metadata */ }

    const meta = user.user_metadata || {};

    const username = meta.username || SocialSession.cached()?.username || "you";

    const displayName =
        (profile && profile.display_name) || username;

    /* greeting */

    document.getElementById("greeting").textContent =
        "Hey, " + displayName + " 👋";

    /* topbar avatar + menu */

    const avatarBtn = document.getElementById("avatarBtn");

    const avatarInitial = document.getElementById("avatarInitial");

    if (profile && profile.avatar_url) {

        const img = document.createElement("img");

        img.src = profile.avatar_url;

        img.alt = displayName;

        avatarBtn.innerHTML = "";

        avatarBtn.appendChild(img);

    } else {

        avatarInitial.textContent =
            (displayName[0] || "?").toUpperCase();

    }

    document.getElementById("menuName").textContent = displayName;

    document.getElementById("menuHandle").textContent = "@" + username;

    /* ----------------------------------------------------- */
    /* menu toggle                                            */
    /* ----------------------------------------------------- */

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
    /* new post (S2) — friendly placeholder for now           */
    /* ----------------------------------------------------- */

    document.getElementById("newPostBtn")

        .addEventListener("click", () => {

            SToast.info("Photo posting arrives in the next update — soon!");

        });

});
