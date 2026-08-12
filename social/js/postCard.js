/* ==========================================================
   SHIBA SOCIAL — post card (shared renderer)

   Builds one interactive post: author, photo, caption, a like
   toggle and a comment thread (lazy-loaded on demand). Used by
   both the home feed and the profile grid's lightbox.

   Icons are inline SVG — the whole app is emoji-free.
========================================================== */

const SVG_HEART =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
    '<path fill="currentColor" d="M12 21s-7.5-4.6-10-9.2C.6 9 1.6 5.5 4.7 4.6' +
    'c2-.6 3.9.3 5 1.9 1.1-1.6 3-2.5 5-1.9 3.1.9 4.1 4.4 2.7 7.2' +
    'C19.5 16.4 12 21 12 21z" class="hStroke"/></svg>';

const SVG_COMMENT =
    '<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.9" ' +
    'stroke-linecap="round" stroke-linejoin="round" ' +
    'd="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/></svg>';

const SVG_EYE =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" ' +
    'd="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>' +
    '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8"/></svg>';

/* count each post as viewed at most once per page load */

const _viewedPosts = new Set();

/* build + return an <article class="post"> element */

function renderPostCard(post, viewerId) {

    const el = document.createElement("article");

    el.className = "post";

    /* header ------------------------------------------------ */

    const head = document.createElement("a");

    head.className = "postHead pLink";

    if (post.author.user_id) {

        head.href = "profile.html?id=" + encodeURIComponent(post.author.user_id);

    }

    head.innerHTML =
        '<div class="pAvatar">' +
        (post.author.avatar_url
            ? '<img src="' + escapeAttr(post.author.avatar_url) + '" alt="">'
            : '<span>' + initialOf(post.author.display_name) + '</span>') +
        '</div>' +
        '<div class="pWho">' +
        '<div class="pName">' +
        escapeHtml(post.author.display_name || "Someone") +
        badgeChipsHtml(post.author.badges) + '</div>' +
        '<div class="pMeta">' + timeAgo(post.created_at) + ' ago</div>' +
        '</div>';

    el.appendChild(head);

    /* photo ------------------------------------------------- */

    const imgWrap = document.createElement("div");

    imgWrap.className = "postImg";

    const img = document.createElement("img");

    img.src = post.image_url;

    img.alt = post.caption || "Photo";

    img.loading = "lazy";

    imgWrap.appendChild(img);

    el.appendChild(imgWrap);

    /* body -------------------------------------------------- */

    const body = document.createElement("div");

    body.className = "postBody";

    /* actions */

    const actions = document.createElement("div");

    actions.className = "postActions";

    const likeBtn = document.createElement("button");

    likeBtn.type = "button";

    likeBtn.className = "iAction likeBtn" + (post.likedByMe ? " liked" : "");

    likeBtn.innerHTML = SVG_HEART + '<span class="cnt">' + post.likeCount + '</span>';

    const cmtBtn = document.createElement("button");

    cmtBtn.type = "button";

    cmtBtn.className = "iAction";

    cmtBtn.innerHTML = SVG_COMMENT + '<span class="cnt">' + post.commentCount + '</span>';

    actions.appendChild(likeBtn);

    actions.appendChild(cmtBtn);

    /* views (display only) */

    const views = document.createElement("span");

    views.className = "iAction views";

    views.innerHTML = SVG_EYE +
        '<span class="cnt">' + (post.view_count || 0) + '</span>';

    actions.appendChild(views);

    body.appendChild(actions);

    /* title (optional name for the photo) */

    if (post.title) {

        const t = document.createElement("div");

        t.className = "postTitle";

        t.textContent = post.title;

        body.appendChild(t);

    }

    /* caption */

    if (post.caption) {

        const cap = document.createElement("div");

        cap.className = "postCaption";

        cap.innerHTML =
            '<b>' + escapeHtml(post.author.display_name || "") + '</b> ' +
            escapeHtml(post.caption);

        body.appendChild(cap);

    }

    /* comments (hidden until opened) */

    const cwrap = document.createElement("div");

    cwrap.className = "commentsWrap hidden";

    body.appendChild(cwrap);

    const addForm = document.createElement("form");

    addForm.className = "addComment hidden";

    addForm.innerHTML =
        '<input type="text" placeholder="Add a comment…" maxlength="300">' +
        '<button type="submit">Post</button>';

    body.appendChild(addForm);

    el.appendChild(body);

    /* like handler (optimistic, reverts on failure) --------- */

    let liked = post.likedByMe;

    let count = post.likeCount;

    let likeBusy = false;

    likeBtn.addEventListener("click", async () => {

        if (likeBusy || !viewerId) return;

        likeBusy = true;

        const prevLiked = liked, prevCount = count;

        liked = !liked;

        count += liked ? 1 : -1;

        likeBtn.classList.toggle("liked", liked);

        likeBtn.querySelector(".cnt").textContent = count;

        try {

            await SocialAPI.toggleLike(post.id, viewerId, prevLiked);

        } catch (e) {

            liked = prevLiked; count = prevCount;

            likeBtn.classList.toggle("liked", liked);

            likeBtn.querySelector(".cnt").textContent = count;

            SToast.err("Could not update your like.");

        }

        likeBusy = false;

    });

    /* comments toggle (lazy load once) ---------------------- */

    let loaded = false;

    cmtBtn.addEventListener("click", async () => {

        const show = cwrap.classList.contains("hidden");

        cwrap.classList.toggle("hidden", !show);

        addForm.classList.toggle("hidden", !show);

        if (show && !loaded) {

            loaded = true;

            cwrap.innerHTML = '<div class="cLoading">Loading…</div>';

            try {

                const comments = await SocialAPI.listComments(post.id);

                renderComments(cwrap, comments);

            } catch (e) {

                cwrap.innerHTML =
                    '<div class="cLoading">Couldn\'t load comments.</div>';

            }

        }

    });

    /* add a comment ---------------------------------------- */

    addForm.addEventListener("submit", async (e) => {

        e.preventDefault();

        const input = addForm.querySelector("input");

        const text = input.value.trim();

        if (!text || !viewerId) return;

        input.disabled = true;

        try {

            const saved = await SocialAPI.addComment(post.id, viewerId, text);

            const me = SocialSession.cached() || {};

            appendComment(cwrap, {

                ...saved,

                author: {

                    display_name: me.displayName || me.username || "You",

                    avatar_url: me.avatarUrl || null

                }

            });

            input.value = "";

            const cntEl = cmtBtn.querySelector(".cnt");

            cntEl.textContent = (parseInt(cntEl.textContent, 10) || 0) + 1;

        } catch (err) {

            SToast.err("Could not post your comment.");

        }

        input.disabled = false;

        input.focus();

    });

    /* count a view (once per post per page load) and reflect the
       returned total in the counter */

    if (!_viewedPosts.has(post.id)) {

        _viewedPosts.add(post.id);

        SocialAPI.incrementViews(post.id).then(n => {

            if (typeof n === "number") {

                views.querySelector(".cnt").textContent = n;

            }

        });

    }

    return el;

}

/* ---------------------------------------------------------- */
/* comment rendering                                           */
/* ---------------------------------------------------------- */

function renderComments(host, comments) {

    host.innerHTML = "";

    if (!comments.length) {

        host.innerHTML =
            '<div class="cEmpty">No comments yet. Be the first.</div>';

        return;

    }

    comments.forEach(c => appendComment(host, c));

}

function appendComment(host, c) {

    const empty = host.querySelector(".cEmpty");

    if (empty) empty.remove();

    const row = document.createElement("div");

    row.className = "comment";

    row.innerHTML =
        '<div class="cAvatar">' +
        (c.author.avatar_url
            ? '<img src="' + escapeAttr(c.author.avatar_url) + '" alt="">'
            : '<span>' + initialOf(c.author.display_name) + '</span>') +
        '</div>' +
        '<div class="cBody"><b>' +
        escapeHtml(c.author.display_name || "Someone") + '</b> ' +
        escapeHtml(c.body) + '</div>';

    host.appendChild(row);

}
