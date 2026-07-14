/* ==========================================================
   SHIBA CLOUD — Ad Zone + Ad-Watch Gate
   ONLY loaded on the /cloud pages. NEVER in the main PIMS
   system (police data must stay ad-free).

   ── HOW ADS PLUG IN ──────────────────────────────────────
   Paste your real Adsterra ad code where marked ADSTERRA
   below (see cloud/ADSTERRA-GUIDE.md for the step-by-step).
   Until then a clearly-labelled placeholder shows instead.

   ── HONEST LIMITATION ────────────────────────────────────
   This gate runs in the browser. Most visitors will watch
   the ad, but a technical user CAN bypass it because cloud
   files have public URLs. TRUE enforcement needs a private
   bucket + a signed-URL edge function (planned next).
========================================================== */

window.AdZone = {

    /* your Adsterra publisher zone(s) — fill these in */

    ZONES: {
        banner: "REPLACE_WITH_YOUR_ADSTERRA_BANNER_ZONE",
        interstitial: "REPLACE_WITH_YOUR_ADSTERRA_SOCIAL_BAR_OR_INTERSTITIAL"
    },

    configured() {

        return this.ZONES.banner &&
            !this.ZONES.banner.startsWith("REPLACE_");

    },

    /* render an ad into a container (or a labelled placeholder) */

    render(container) {

        if (!container) return;

        if (this.configured()) {

            /* ───── ADSTERRA: put your ad container/script here ─────
               Example (Banner 300x250):
               container.innerHTML =
                 '<script type="text/javascript"> atOptions = {' +
                 " 'key':'" + this.ZONES.banner + "', 'format':'iframe'," +
                 " 'height':250, 'width':300, 'params':{} }; <\/script>" +
                 '<script src="//www.highperformanceformat.com/' +
                 this.ZONES.banner + '/invoke.js"><\/script>';
               (scripts injected via innerHTML don't execute — use the
               DOM-append method shown in ADSTERRA-GUIDE.md)
            ─────────────────────────────────────────────────────── */

            container.innerHTML =
                "<div class='adReal'>Advertisement</div>";

        } else {

            container.innerHTML =
                "<div class='adPlaceholder'>" +
                "<b>Ad Space</b><br><small>SHIBA Cloud is funded by ads. " +
                "Connect Adsterra in cloud/adzone.js to show real ads " +
                "here.</small></div>";

        }

    },

    /* seconds a visitor must wait, scaled by file size (15–120) */

    watchSeconds(bytes) {

        const mb = (bytes || 0) / (1024 * 1024);

        return Math.min(120, Math.max(15, Math.round(15 + mb * 6)));

    },

    /* show the full-screen ad-watch gate; resolves when the
       countdown finishes (or the user skips, if allowed). */

    gate({ title, seconds }) {

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
