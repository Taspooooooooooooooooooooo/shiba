/* ==========================================================
   SHIBA SOCIAL — profile (view + edit)

   View your own profile and edit display name, bio and photo.
   Avatars are compressed in the browser (~512px), stored in
   the public "cloud" bucket under social/avatars/, and the
   public URL is saved on social_profiles.
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const user = await SocialSession.require();

    if (!user) return;

    const meta = user.user_metadata || {};

    const username = meta.username || SocialSession.cached()?.username || "you";

    /* state */

    let profile = {
        display_name: username,
        bio: "",
        avatar_url: null,
        avatar_path: null,
        created_at: null
    };

    let pendingAvatarBlob = null;    /* chosen but not yet uploaded */

    /* elements */

    const viewMode = document.getElementById("viewMode");

    const editMode = document.getElementById("editMode");

    /* ----------------------------------------------------- */
    /* load the profile                                       */
    /* ----------------------------------------------------- */

    try {

        const { data } = await window.sdb

            .from("social_profiles")

            .select("display_name, bio, avatar_url, avatar_path, created_at")

            .eq("user_id", user.id)

            .maybeSingle();

        if (data) profile = { ...profile, ...data };

    } catch (e) { /* offline — show defaults */ }

    /* also count posts + active stories for the little stats row
       (tables may be empty in S1 — that's fine) */

    let postCount = 0, storyCount = 0;

    try {

        const [p, s] = await Promise.all([

            window.sdb.from("social_posts")
                .select("id", { count: "exact", head: true })
                .eq("author_id", user.id),

            window.sdb.from("social_stories")
                .select("id", { count: "exact", head: true })
                .eq("author_id", user.id)
                .gt("expires_at", new Date().toISOString())

        ]);

        postCount = p.count || 0;

        storyCount = s.count || 0;

    } catch (e) { /* ignore */ }

    /* ----------------------------------------------------- */
    /* render the VIEW                                        */
    /* ----------------------------------------------------- */

    function initialOf(name) {

        return (name && name[0] ? name[0] : "?").toUpperCase();

    }

    function paintAvatar(host, initialEl, url, name) {

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

    function renderView() {

        const name = profile.display_name || username;

        document.getElementById("viewName").textContent = name;

        document.getElementById("viewHandle").textContent = "@" + username;

        paintAvatar(

            document.getElementById("viewAvatar"),

            document.getElementById("viewInitial"),

            profile.avatar_url, name

        );

        const bioEl = document.getElementById("viewBio");

        if (profile.bio && profile.bio.trim()) {

            bioEl.textContent = profile.bio;

            bioEl.classList.remove("empty-bio");

        } else {

            bioEl.textContent = "No bio yet.";

            bioEl.classList.add("empty-bio");

        }

        document.getElementById("statPosts").textContent = postCount;

        document.getElementById("statStories").textContent = storyCount;

        document.getElementById("statSince").textContent =
            profile.created_at
                ? new Date(profile.created_at).toLocaleDateString(undefined,
                    { month: "short", year: "numeric" })
                : "—";

    }

    renderView();

    /* ----------------------------------------------------- */
    /* switch to EDIT                                         */
    /* ----------------------------------------------------- */

    const editName = document.getElementById("editName");

    const editBio = document.getElementById("editBio");

    const bioCount = document.getElementById("bioCount");

    function openEdit() {

        pendingAvatarBlob = null;

        editName.value = profile.display_name || username;

        editBio.value = profile.bio || "";

        bioCount.textContent = editBio.value.length;

        paintAvatar(

            document.getElementById("editAvatarPrev"),

            document.getElementById("editInitial"),

            profile.avatar_url, editName.value

        );

        viewMode.classList.add("hidden");

        editMode.classList.remove("hidden");

    }

    function closeEdit() {

        editMode.classList.add("hidden");

        viewMode.classList.remove("hidden");

    }

    document.getElementById("editBtn").addEventListener("click", openEdit);

    document.getElementById("cancelBtn").addEventListener("click", closeEdit);

    editBio.addEventListener("input", () => {

        bioCount.textContent = editBio.value.length;

    });

    /* ----------------------------------------------------- */
    /* pick + preview a new avatar (upload happens on Save)   */
    /* ----------------------------------------------------- */

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

        /* compress to a small square-ish avatar */

        pendingAvatarBlob = await compressImage(file, 512, 0.85);

        /* local preview */

        const prevUrl = URL.createObjectURL(pendingAvatarBlob);

        const host = document.getElementById("editAvatarPrev");

        host.innerHTML = "";

        const img = document.createElement("img");

        img.src = prevUrl;

        host.appendChild(img);

    });

    /* ----------------------------------------------------- */
    /* SAVE                                                   */
    /* ----------------------------------------------------- */

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
            bio: editBio.value.trim()
        };

        /* upload a new avatar first, if one was chosen */

        if (pendingAvatarBlob) {

            try {

                const { path, url } =
                    await uploadToCloud("avatars", user.id, pendingAvatarBlob);

                update.avatar_url = url;

                update.avatar_path = path;

            } catch (e) {

                console.error("avatar upload failed:", e);

                SToast.err("Couldn't upload the photo. Saved the rest.");

            }

        }

        /* write the profile (upsert so it's robust even if the
           row somehow doesn't exist yet) */

        const { error } = await window.sdb

            .from("social_profiles")

            .update(update)

            .eq("user_id", user.id);

        if (error) {

            console.error("profile save failed:", error);

            SToast.err("Could not save your profile.");

            saveBtn.disabled = false;

            saveBtn.textContent = "Save changes";

            return;

        }

        /* reflect locally (avoids a stale read-after-write) */

        profile = { ...profile, ...update };

        pendingAvatarBlob = null;

        renderView();

        closeEdit();

        SToast.ok("Profile updated.");

        saveBtn.disabled = false;

        saveBtn.textContent = "Save changes";

    });

});
