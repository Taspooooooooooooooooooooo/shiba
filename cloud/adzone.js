/* ==========================================================
   SHIBA CLOUD — Ad Zone + Ad-Watch Gate
   ONLY loaded on the /cloud pages. NEVER in the main PIMS
   system (police data must stay ad-free).

   ── CONNECTED: Adsterra (6 units, live) ──────────────────
   Social Bar     30274390  → floating, injected once/page
   Native Banner  30274891  → right rail
   Banner 728x90  30274392  → top banner (desktop)
   Banner 300x250 30274393  → the ad-watch gate
   Banner 160x600 30274394  → left rail (skyscraper)
   Banner 320x50  30274395  → top banner (mobile)

   ── WHY EACH BANNER GETS ITS OWN IFRAME ──────────────────
   Adsterra's banner format reads a GLOBAL `atOptions` object
   when its invoke.js runs. Two different sizes on one page
   would overwrite each other's config and render the wrong
   size (or nothing). Rendering each banner inside its own
   srcdoc iframe gives every unit a private window/global, so
   any number of sizes can coexist. Each unit is used ONCE
   per page (Adsterra fills duplicates poorly).

   ── HONEST LIMITATION ────────────────────────────────────
   This gate runs in the browser. Most visitors will watch
   the ad, but a technical user CAN bypass it because cloud
   files have public URLs. TRUE enforcement needs a private
   bucket + a signed-URL edge function (planned next).
========================================================== */

window.AdZone = {

    /* real Adsterra zones */

    ZONES: {

        socialBar:
            "https://pl30374889.effectivecpmnetwork.com/e7/7c/95/" +
            "e77c95a1cb5e3947bbd401bdc5c4ee2b.js",

        native: {
            src: "https://pl30374890.effectivecpmnetwork.com/" +
                 "34c6792c7028d8f2ab355ef5544c6f66/invoke.js",
            container: "container-34c6792c7028d8f2ab355ef5544c6f66"
        },

        leaderboard: { key: "f6c2cc4002c0c19047e060aba0dfdbab", w: 728, h: 90 },

        rectangle:   { key: "f7a965d7fbb4b1125b92be8118d27c36", w: 300, h: 250 },

        skyscraper:  { key: "91179e011e47f5611047e3ead39e4eb9", w: 160, h: 600 },

        mobile:      { key: "45a7deec36fb10e97d6adb554dbf1242", w: 320, h: 50 }

    },

    configured() {

        return !!this.ZONES.leaderboard.key;

    },

    /* ------------------------------------------------------ */
    /* ADMIN MODE — management browses the cloud ad-free       */
    /*                                                         */
    /* Same roles the cloud already trusts to see every file.  */
    /* Admins get NO banners, NO social bar and NO ad-watch    */
    /* wait, plus a badge (only they can see) to flip ads back */
    /* on and preview what a visitor gets.                     */
    /*                                                         */
    /* HONEST: this reads localStorage, so it's client-side —  */
    /* anyone could set role="Chief" and skip the ads. Same    */
    /* caveat as the rest of the gate; the real fix is the     */
    /* private bucket + signed-URL edge function.              */
    /* ------------------------------------------------------ */

    ADMIN_ROLES: ["Super Administrator", "Chief", "Commander"],

    isAdmin() {

        try {

            return this.ADMIN_ROLES.includes(localStorage.getItem("role"));

        } catch (e) { return false; }

    },

    /* visitors always get ads; admins default to ads OFF */

    adsOn() {

        if (!this.isAdmin()) return true;

        return localStorage.getItem("shiba_admin_ads") === "on";

    },

    setAdsOn(on) {

        localStorage.setItem("shiba_admin_ads", on ? "on" : "off");

        /* ad scripts can't be cleanly unloaded — reload instead */

        location.reload();

    },

    /* collapse the slots so admins don't see empty holes */

    hideSlots() {

        document.querySelectorAll(".adRail")
            .forEach(r => r.style.display = "none");

        const b = document.getElementById("adBanner");

        if (b) (b.closest(".adBannerCard") || b).style.display = "none";

    },

    adminBadge() {

        if (document.getElementById("adAdminBadge")) return;

        const on = this.adsOn();

        const bar = document.createElement("div");

        bar.id = "adAdminBadge";

        bar.style.cssText =
            "position:fixed;left:14px;bottom:14px;z-index:100000;" +
            "display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;" +
            "border-radius:999px;background:#0f2036ee;color:#b8c5d6;" +
            "border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(4px);" +
            "font:13px/1 system-ui,-apple-system,sans-serif;" +
            "box-shadow:0 8px 24px rgba(0,0,0,.45)";

        const label = document.createElement("span");

        label.textContent = "Admin · Ads " + (on ? "ON" : "OFF");

        const btn = document.createElement("button");

        btn.textContent = on ? "Turn ads off" : "Preview ads";

        btn.style.cssText =
            "padding:6px 12px;border-radius:999px;cursor:pointer;" +
            "border:1px solid rgba(255,255,255,.16);background:#2e8bff22;" +
            "color:#8fb4ff;font:12px/1 inherit";

        btn.onclick = () => this.setAdsOn(!on);

        bar.append(label, btn);

        document.body.appendChild(bar);

    },

    /* ------------------------------------------------------ */
    /* one banner = one isolated iframe (own `atOptions`)      */
    /* ------------------------------------------------------ */

    renderBanner(container, zone) {

        if (!container || !zone) return;

        container.innerHTML = "";

        const frame = document.createElement("iframe");

        frame.width = zone.w;

        frame.height = zone.h;

        frame.scrolling = "no";

        frame.setAttribute("frameborder", "0");

        frame.setAttribute("title", "Advertisement");

        frame.setAttribute("loading", "lazy");

        frame.style.cssText =
            "border:0;display:block;margin:0 auto;max-width:100%";

        frame.srcdoc =
            '<!doctype html><html><head><meta charset="utf-8">' +
            "<style>html,body{margin:0;padding:0;overflow:hidden;" +
            "background:transparent}</style></head><body>" +
            "<script>atOptions=" + JSON.stringify({
                key: zone.key,
                format: "iframe",
                height: zone.h,
                width: zone.w,
                params: {}
            }) + ";<\/script>" +
            '<script src="https://www.highperformanceformat.com/' +
            zone.key + '/invoke.js"><\/script>' +
            "</body></html>";

        container.appendChild(frame);

    },

    /* top banner: leaderboard on desktop, 320x50 on phones */

    renderTop(container) {

        if (!container) return;

        const narrow = window.matchMedia("(max-width:820px)").matches;

        this.renderBanner(container,
            narrow ? this.ZONES.mobile : this.ZONES.leaderboard);

    },

    /* left rail — 160x600 skyscraper */

    renderSkyscraper(container) {

        this.renderBanner(container, this.ZONES.skyscraper);

    },

    /* right rail — native banner (its own container + async script;
       no atOptions, so it lives directly in the page) */

    renderNative(container) {

        if (!container || this._nativeDone) return;

        this._nativeDone = true;

        container.innerHTML = "";

        const box = document.createElement("div");

        box.id = this.ZONES.native.container;

        container.appendChild(box);

        const s = document.createElement("script");

        s.async = true;

        s.setAttribute("data-cfasync", "false");

        s.src = this.ZONES.native.src;

        container.appendChild(s);

    },

    /* floating Social Bar — once per page */

    socialBar() {

        if (this._socialDone) return;

        this._socialDone = true;

        const s = document.createElement("script");

        s.src = this.ZONES.socialBar;

        document.body.appendChild(s);

    },

    /* generic (used by the gate) — 300x250 */

    render(container) {

        this.renderBanner(container, this.ZONES.rectangle);

    },

    /* wire every slot a cloud page has, in one call */

    mount() {

        /* admin-only badge (visitors never see it) */

        if (this.isAdmin()) this.adminBadge();

        /* admin mode: no ads at all */

        if (!this.adsOn()) { this.hideSlots(); return; }

        this.renderTop(document.getElementById("adBanner"));

        this.renderSkyscraper(document.getElementById("adLeft"));

        this.renderNative(document.getElementById("adRight"));

        this.socialBar();

    },

    /* seconds a visitor must wait, scaled by file size (15–120) */

    watchSeconds(bytes) {

        const mb = (bytes || 0) / (1024 * 1024);

        return Math.min(120, Math.max(15, Math.round(15 + mb * 6)));

    },

    /* show the full-screen ad-watch gate; resolves when the
       countdown finishes (or the user skips, if allowed). */

    gate({ title, seconds }) {

        /* admin mode: no ad, no waiting — hand the file straight over */

        if (!this.adsOn()) return Promise.resolve(true);

        return new Promise((resolve) => {

            const overlay = document.createElement("div");

            overlay.className = "adGate";

            overlay.innerHTML = `
                <div class="adGateBox">
                    <h2>${title || "Please support SHIBA Cloud"}</h2>
                    <p class="adGateSub">Your file is being prepared — thanks
                       for supporting free cloud storage.</p>
                    <div class="adGateAd" id="adGateAd"></div>
                    <div class="adGateTimer"><span id="adGateCount">${seconds}</span>s</div>
                    <button id="adGateGo" class="adGateGo" disabled>Please wait…</button>
                </div>`;

            document.body.appendChild(overlay);

            this.render(document.getElementById("adGateAd"));

            let left = seconds;

            const countEl = document.getElementById("adGateCount");

            const goBtn = document.getElementById("adGateGo");

            const timer = setInterval(() => {

                left--;

                if (countEl) countEl.textContent = Math.max(0, left);

                if (left <= 0) {

                    clearInterval(timer);

                    goBtn.disabled = false;

                    goBtn.textContent = "Continue →";

                    goBtn.onclick = () => {

                        overlay.remove();

                        resolve(true);

                    };

                }

            }, 1000);

        });

    }

};
