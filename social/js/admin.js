/* ==========================================================
   SHIBA SOCIAL — admin panel

   Three tabs:
     Users        — look up any account (private profiles + all
                    posts visible to admins), issue ban / timeout /
                    mute / warn, and lift sanctions.
     Queue        — the bot/user flag review queue.
     Banned words — manage the bot's term list + learned-safe list.

   Admins only (a linked police officer holding socialmedia.admin).
   Every enforcing action goes through a SECURITY DEFINER RPC that
   re-checks admin rights server-side.
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const viewer = await SocialSession.require();

    if (!viewer) return;

    const me = SocialSession.cached()?.username ||

        viewer.user_metadata?.username || null;

    let isAdmin = false;

    try {

        const badges = await SocialAPI.getBadges([viewer.id]);

        isAdmin = !!(badges[viewer.id] && badges[viewer.id].is_admin);

    } catch (e) { /* not admin */ }

    if (!isAdmin) {

        document.getElementById("notAdmin").classList.remove("hidden");

        return;

    }

    SocialViewer.id = viewer.id;

    SocialViewer.isAdmin = true;

    document.getElementById("adminContent").classList.remove("hidden");

    /* ----------------------------------------------------- */
    /* tabs                                                   */
    /* ----------------------------------------------------- */

    const tabs = document.querySelectorAll(".adminTabs button");

    function showTab(name) {

        tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === name));

        ["users", "queue", "words"].forEach(t =>

            document.getElementById("tab-" + t)

                .classList.toggle("hidden", t !== name));

        if (name === "queue") loadFlags();

        if (name === "words") { loadTerms(); loadAllow(); }

    }

    tabs.forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

    /* ===================================================== */
    /* USERS                                                  */
    /* ===================================================== */

    const userResult = document.getElementById("userResult");

    const searchInput = document.getElementById("uSearch");

    async function lookup(query) {

        userResult.innerHTML = '<div class="card"><div class="empty">' +

            '<p>Looking up…</p></div></div>';

        let user = null;

        try { user = await SocialAPI.adminGetUser(query); }

        catch (e) { /* ignore */ }

        if (!user) {

            userResult.innerHTML = '<div class="card"><div class="empty">' +

                '<p>No account found.</p></div></div>';

            return;

        }

        renderUser(user);

    }

    document.getElementById("uSearchBtn").addEventListener("click",

        () => lookup(searchInput.value));

    searchInput.addEventListener("keydown", e => {

        if (e.key === "Enter") lookup(searchInput.value);

    });

    async function renderUser(user) {

        const p = user.profile || {};

        const name = p.display_name || user.username;

        userResult.innerHTML = "";

        /* profile card */

        const card = document.createElement("div");

        card.className = "card";

        card.innerHTML =

            '<div class="profileHead">' +
              '<div class="profileAvatar">' +
              (p.avatar_url

                  ? '<img src="' + escapeAttr(p.avatar_url) + '" alt="">'

                  : '<span>' + initialOf(name) + '</span>') +
              '</div>' +
              '<div class="profileMeta">' +
                '<div class="name">' + escapeHtml(name) +
                (p.banned ? ' <span class="flagChip">Banned</span>' : '') + '</div>' +
                '<div class="handle">@' + escapeHtml(user.username) + '</div>' +
              '</div>' +
            '</div>' +

            '<div class="adminGrid">' +
              adminField("Email", p.email) +
              adminField("Phone", p.phone) +
              adminField("Date of birth", p.date_of_birth) +
              adminField("Signup IP", p.signup_ip) +
              adminField("Account", p.is_private ? "Private" : "Public") +
              adminField("Verified", p.is_verified ? "Yes" : "No") +
              adminField("Joined", p.created_at

                  ? new Date(p.created_at).toLocaleDateString() : "—") +
            '</div>' +

            '<a class="btn ghost" href="profile.html?id=' + escapeAttr(user.id) +
            '" style="margin-top:14px;display:inline-block;width:auto;' +
            'padding:10px 16px">Open public profile</a>';

        userResult.appendChild(card);

        /* sanction bar */

        const sanCard = document.createElement("div");

        sanCard.className = "card";

        sanCard.innerHTML = '<h2 style="font-size:15px;margin-bottom:12px">' +

            'Take action</h2>';

        const reason = document.createElement("input");

        reason.className = "apInput";

        reason.placeholder = "Reason (optional)";

        const mins = document.createElement("input");

        mins.className = "apInput";

        mins.type = "number";

        mins.placeholder = "Minutes (for mute / timeout; blank = permanent)";

        const btns = document.createElement("div");

        btns.className = "sanBtns";

        [["Warn", "warn"], ["Mute", "mute"],

         ["Timeout", "timeout"], ["Ban", "ban"]].forEach(([label, kind]) => {

            const b = document.createElement("button");

            b.className = "btn" + (kind === "ban" ? " danger" : " ghost");

            b.textContent = label;

            b.addEventListener("click", async () => {

                b.disabled = true;

                const m = parseInt(mins.value, 10);

                const minutes = (kind === "timeout" || kind === "mute") &&

                    m > 0 ? m : null;

                try {

                    const res = await SocialAPI.sanction(

                        user.id, kind, reason.value.trim() || null, minutes);

                    if (res && res.ok === false) {

                        SToast.err(res.reason === "not authorized"

                            ? "Not authorized." : "Action failed.");

                    } else {

                        SToast.ok(label + " applied.");

                        renderUser(await SocialAPI.adminGetUser(user.id));

                        return;

                    }

                } catch (e) { SToast.err("Action failed."); }

                b.disabled = false;

            });

            btns.appendChild(b);

        });

        sanCard.appendChild(reason);

        sanCard.appendChild(mins);

        sanCard.appendChild(btns);

        userResult.appendChild(sanCard);

        /* sanction history */

        const sanctions = await SocialAPI.adminSanctions(user.id);

        const histCard = document.createElement("div");

        histCard.className = "card";

        histCard.innerHTML = '<h2 style="font-size:15px;margin-bottom:12px">' +

            'Sanctions</h2>';

        if (!sanctions.length) {

            histCard.innerHTML += '<p class="cLoading">No sanctions on record.</p>';

        } else {

            const now = Date.now();

            sanctions.forEach(s => {

                const active = s.active &&

                    (!s.expires_at || new Date(s.expires_at).getTime() > now);

                const row = document.createElement("div");

                row.className = "termRow";

                row.innerHTML =

                    '<div><span class="termWord">' +
                    escapeHtml((s.kind || "ban").toUpperCase()) + '</span>' +
                    '<span class="flagChip">' +
                    (active ? "Active" : "Inactive") + '</span>' +
                    '<div style="font-size:12px;color:var(--faint);margin-top:4px">' +
                    (s.reason ? escapeHtml(s.reason) + " · " : "") +
                    (s.expires_at

                        ? "until " + escapeHtml(new Date(s.expires_at).toLocaleString())

                        : "permanent") +
                    (s.issued_by ? " · by " + escapeHtml(s.issued_by) : "") +
                    '</div></div>';

                if (active) {

                    const lift = document.createElement("button");

                    lift.className = "termRemove";

                    lift.textContent = "Lift";

                    lift.addEventListener("click", async () => {

                        lift.disabled = true;

                        try {

                            await SocialAPI.liftSanction(user.id, s.kind);

                            SToast.ok("Lifted.");

                            renderUser(await SocialAPI.adminGetUser(user.id));

                        } catch (e) { SToast.err("Couldn't lift."); lift.disabled = false; }

                    });

                    row.appendChild(lift);

                }

                histCard.appendChild(row);

            });

        }

        userResult.appendChild(histCard);

        /* their posts */

        const postsCard = document.createElement("div");

        postsCard.className = "card";

        postsCard.innerHTML = '<h2 style="font-size:15px;margin-bottom:12px">' +

            'Posts</h2>';

        const grid = document.createElement("div");

        grid.className = "postGrid";

        postsCard.appendChild(grid);

        userResult.appendChild(postsCard);

        let posts = [];

        try { posts = await SocialAPI.adminListPosts(user.id, viewer.id); }

        catch (e) { /* ignore */ }

        if (!posts.length) {

            grid.innerHTML = '<p class="cLoading">No posts.</p>';

        } else {

            posts.forEach(post => {

                const cell = document.createElement("button");

                cell.className = "gridCell";

                cell.type = "button";

                const img = document.createElement("img");

                img.src = post.image_url;

                img.alt = post.caption || "Photo";

                img.loading = "lazy";

                cell.appendChild(img);

                cell.addEventListener("click", () => openLightbox(post));

                grid.appendChild(cell);

            });

        }

    }

    function adminField(label, value) {

        return '<div class="adminField"><span class="afLabel">' +

            escapeHtml(label) + '</span><span class="afValue">' +

            escapeHtml(value || "—") + '</span></div>';

    }

    /* lightbox */

    const lightbox = document.getElementById("postLightbox");

    const lightBody = document.getElementById("lightBody");

    function openLightbox(post) {

        lightBody.innerHTML = "";

        lightBody.appendChild(renderPostCard(post, viewer.id));

        lightbox.classList.remove("hidden");

    }

    document.getElementById("lightClose")

        .addEventListener("click", () => lightbox.classList.add("hidden"));

    lightbox.addEventListener("click", e => {

        if (e.target === lightbox) lightbox.classList.add("hidden");

    });

    /* deep link: admin.html?user=<id|username> */

    const qUser = new URLSearchParams(location.search).get("user");

    if (qUser) { searchInput.value = qUser; lookup(qUser); }

    /* ===================================================== */
    /* QUEUE  (flag review)                                   */
    /* ===================================================== */

    const flagList = document.getElementById("flagList");

    const noFlags = document.getElementById("noFlags");

    const queueCount = document.getElementById("queueCount");

    async function loadFlags() {

        let flags = [];

        try { flags = await SocialAPI.listPendingFlags(); }

        catch (e) { SToast.err("Couldn't load the queue."); }

        flagList.innerHTML = "";

        queueCount.textContent = flags.length ? "(" + flags.length + ")" : "";

        if (!flags.length) { noFlags.classList.remove("hidden"); return; }

        noFlags.classList.add("hidden");

        const authorIds = [...new Set(flags.map(f => f.author_id).filter(Boolean))];

        const nameMap = {};

        if (authorIds.length) {

            try {

                const { data } = await window.sdb.from("social_profiles")

                    .select("user_id, display_name").in("user_id", authorIds);

                (data || []).forEach(p => { nameMap[p.user_id] = p.display_name; });

            } catch (e) { /* ignore */ }

        }

        flags.forEach(f => flagList.appendChild(flagCard(f, nameMap)));

    }

    function flagCard(f, nameMap) {

        const card = document.createElement("div");

        card.className = "card flagCard";

        const author = nameMap[f.author_id] || "Unknown";

        const chips = (f.category || "Flagged").split(",").map(c =>

            '<span class="flagChip">' + escapeHtml(c.trim()) + '</span>').join("");

        card.innerHTML =

            '<div class="flagHead"><div class="flagReason">' + chips + '</div>' +
            '<div class="flagTime">' + timeAgo(f.created_at) + ' ago</div></div>' +

            (f.snapshot_image ? '<div class="flagImg"><img src="' +
                escapeAttr(f.snapshot_image) + '" alt="" loading="lazy"></div>' : '') +

            (f.snapshot_title ? '<div class="postTitle">' +
                escapeHtml(f.snapshot_title) + '</div>' : '') +

            (f.snapshot_caption ? '<div class="postCaption">' +
                escapeHtml(f.snapshot_caption) + '</div>' : '') +

            '<div class="flagWhy"><b>Flagged for:</b> ' +
            escapeHtml(f.reason || f.matched || "matched a banned term") + '</div>' +

            '<div class="flagBy">by <a href="admin.html?user=' +
            escapeAttr(f.author_id || "") + '">' + escapeHtml(author) + '</a></div>';

        const actions = document.createElement("div");

        actions.className = "flagActions";

        const confirmBtn = document.createElement("button");

        confirmBtn.className = "btn danger";

        confirmBtn.textContent = "Confirm (delete + ban)";

        let armed = false;

        confirmBtn.addEventListener("click", () => {

            if (!armed) {

                armed = true;

                confirmBtn.textContent = "Tap again to ban";

                setTimeout(() => { armed = false;

                    confirmBtn.textContent = "Confirm (delete + ban)"; }, 3000);

                return;

            }

            act(() => SocialAPI.confirmFlag(f.id, null),

                "Post removed and user banned.");

        });

        const cancelBtn = document.createElement("button");

        cancelBtn.className = "btn ghost";

        cancelBtn.textContent = "Cancel";

        cancelBtn.addEventListener("click", () =>

            act(() => SocialAPI.cancelFlag(f.id), "Flag dismissed."));

        const falseBtn = document.createElement("button");

        falseBtn.className = "btn ghost";

        falseBtn.textContent = "False (teach bot)";

        falseBtn.addEventListener("click", () =>

            act(() => SocialAPI.falseFlag(f.id),

                "Marked false — the bot learned these terms are safe."));

        async function act(fn, okMsg) {

            [confirmBtn, cancelBtn, falseBtn].forEach(b => b.disabled = true);

            try {

                const res = await fn();

                if (res && res.ok === false) {

                    SToast.err(res.reason === "not authorized"

                        ? "Not authorized." : "Action failed.");

                    [confirmBtn, cancelBtn, falseBtn].forEach(b => b.disabled = false);

                    return;

                }

                SToast.ok(okMsg);

                card.remove();

                loadFlags();

            } catch (e) {

                SToast.err("Action failed.");

                [confirmBtn, cancelBtn, falseBtn].forEach(b => b.disabled = false);

            }

        }

        actions.appendChild(confirmBtn);

        actions.appendChild(cancelBtn);

        actions.appendChild(falseBtn);

        card.appendChild(actions);

        return card;

    }

    /* ===================================================== */
    /* WORDS                                                  */
    /* ===================================================== */

    const bwList = document.getElementById("bwList");

    const allowList = document.getElementById("allowList");

    async function loadTerms() {

        let terms = [];

        try { terms = await SocialAPI.listBannedTerms(); }

        catch (e) { bwList.innerHTML =

            '<p class="cLoading">Couldn\'t load terms.</p>'; return; }

        bwList.innerHTML = terms.length ? "" :

            '<p class="cLoading">No banned terms yet.</p>';

        terms.forEach(t => {

            const row = document.createElement("div");

            row.className = "termRow";

            row.innerHTML = '<div><span class="termWord">' + escapeHtml(t.term) +

                '</span><span class="flagChip">' + escapeHtml(t.category || "") +

                '</span></div>';

            const rm = document.createElement("button");

            rm.className = "termRemove";

            rm.textContent = "Remove";

            rm.addEventListener("click", async () => {

                rm.disabled = true;

                try { await SocialAPI.removeBannedTerm(t.id); row.remove(); }

                catch (e) { SToast.err("Couldn't remove."); rm.disabled = false; }

            });

            row.appendChild(rm);

            bwList.appendChild(row);

        });

    }

    document.getElementById("bwAddBtn").addEventListener("click", async () => {

        const term = document.getElementById("bwTerm").value.trim();

        const cat = document.getElementById("bwCat").value;

        if (!term) { SToast.err("Enter a term."); return; }

        try {

            await SocialAPI.addBannedTerm(term, cat, me);

            document.getElementById("bwTerm").value = "";

            SToast.ok("Term added.");

            loadTerms();

        } catch (e) {

            SToast.err(/duplicate|unique/i.test(e.message || "")

                ? "That term is already listed." : "Couldn't add the term.");

        }

    });

    async function loadAllow() {

        let terms = [];

        try { terms = await SocialAPI.listAllowTerms(); } catch (e) { /* ignore */ }

        allowList.innerHTML = terms.length ? "" :

            '<p class="cLoading">Nothing here yet.</p>';

        terms.forEach(t => {

            const row = document.createElement("div");

            row.className = "termRow";

            row.innerHTML = '<span class="termWord">' + escapeHtml(t.term) + '</span>';

            const rm = document.createElement("button");

            rm.className = "termRemove";

            rm.textContent = "Remove";

            rm.addEventListener("click", async () => {

                rm.disabled = true;

                try { await SocialAPI.removeAllowTerm(t.id); row.remove(); }

                catch (e) { rm.disabled = false; }

            });

            row.appendChild(rm);

            allowList.appendChild(row);

        });

    }

});
