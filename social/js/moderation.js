/* ==========================================================
   SHIBA SOCIAL — moderation (admin)

   Review queue for bot-flagged posts + the banned-words manager.
   Admins only (a linked officer holding 'socialmedia.admin').
   Every action goes through a SECURITY DEFINER RPC that re-checks
   admin rights server-side.
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const viewer = await SocialSession.require();

    if (!viewer) return;

    const me = SocialSession.cached()?.username ||

        viewer.user_metadata?.username || null;

    /* gate to admins */

    let isAdmin = false;

    try {

        const badges = await SocialAPI.getBadges([viewer.id]);

        isAdmin = !!(badges[viewer.id] && badges[viewer.id].is_admin);

    } catch (e) { /* RPC missing — treated as not admin */ }

    if (!isAdmin) {

        document.getElementById("notAdmin").classList.remove("hidden");

        return;

    }

    document.getElementById("modContent").classList.remove("hidden");

    /* ----------------------------------------------------- */
    /* review queue                                           */
    /* ----------------------------------------------------- */

    const flagList = document.getElementById("flagList");

    const noFlags = document.getElementById("noFlags");

    const queueCount = document.getElementById("queueCount");

    async function loadFlags() {

        let flags = [];

        try {

            flags = await SocialAPI.listPendingFlags();

        } catch (e) {

            SToast.err("Couldn't load the queue. Is the moderation schema set up?");

        }

        flagList.innerHTML = "";

        queueCount.textContent = flags.length ? "(" + flags.length + ")" : "";

        if (!flags.length) {

            noFlags.classList.remove("hidden");

            return;

        }

        noFlags.classList.add("hidden");

        /* author names */

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

        const cats = (f.category || "Flagged").split(",").map(c => c.trim());

        const chips = cats.map(c =>

            '<span class="flagChip">' + escapeHtml(c) + '</span>').join("");

        card.innerHTML =

            '<div class="flagHead">' +
              '<div class="flagReason">' + chips + '</div>' +
              '<div class="flagTime">' + timeAgo(f.created_at) + ' ago</div>' +
            '</div>' +

            (f.snapshot_image

                ? '<div class="flagImg"><img src="' +
                  escapeAttr(f.snapshot_image) + '" alt="" loading="lazy"></div>'

                : '') +

            (f.snapshot_title

                ? '<div class="postTitle">' + escapeHtml(f.snapshot_title) + '</div>'

                : '') +

            (f.snapshot_caption

                ? '<div class="postCaption">' + escapeHtml(f.snapshot_caption) + '</div>'

                : '') +

            '<div class="flagWhy"><b>Flagged for:</b> ' +
            escapeHtml(f.reason || f.matched || "matched a banned term") + '</div>' +

            '<div class="flagBy">by <a href="profile.html?id=' +
            escapeAttr(f.author_id || "") + '">' + escapeHtml(author) + '</a></div>';

        /* actions */

        const actions = document.createElement("div");

        actions.className = "flagActions";

        const confirmBtn = document.createElement("button");

        confirmBtn.className = "btn danger";

        confirmBtn.textContent = "Confirm (delete + ban)";

        let armed = false;

        confirmBtn.addEventListener("click", async () => {

            if (!armed) {

                armed = true;

                confirmBtn.textContent = "Tap again to ban";

                setTimeout(() => {

                    armed = false;

                    confirmBtn.textContent = "Confirm (delete + ban)";

                }, 3000);

                return;

            }

            await act(() => SocialAPI.confirmFlag(f.id, null),

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

                console.error(e);

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

    loadFlags();

    /* ----------------------------------------------------- */
    /* banned words                                           */
    /* ----------------------------------------------------- */

    const bwList = document.getElementById("bwList");

    async function loadTerms() {

        let terms = [];

        try { terms = await SocialAPI.listBannedTerms(); }

        catch (e) { bwList.innerHTML =

            '<p class="cLoading">Couldn\'t load terms.</p>'; return; }

        bwList.innerHTML = "";

        if (!terms.length) {

            bwList.innerHTML = '<p class="cLoading">No banned terms yet.</p>';

            return;

        }

        terms.forEach(t => {

            const row = document.createElement("div");

            row.className = "termRow";

            row.innerHTML =

                '<div><span class="termWord">' + escapeHtml(t.term) + '</span>' +
                '<span class="flagChip">' + escapeHtml(t.category || "") +
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

                ? "That term is already on the list." : "Couldn't add the term.");

        }

    });

    loadTerms();

    /* ----------------------------------------------------- */
    /* learned-safe list                                      */
    /* ----------------------------------------------------- */

    const allowList = document.getElementById("allowList");

    async function loadAllow() {

        let terms = [];

        try { terms = await SocialAPI.listAllowTerms(); } catch (e) { /* ignore */ }

        allowList.innerHTML = "";

        if (!terms.length) {

            allowList.innerHTML =

                '<p class="cLoading">Nothing here yet.</p>';

            return;

        }

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

    loadAllow();

});
