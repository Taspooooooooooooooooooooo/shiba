/* ==========================================================
   SHIBA PIMS — Version
   SINGLE SOURCE OF TRUTH for the app version.
   On every release bump BOTH:
     - SHIBA_VERSION below
     - lapd/version.json  (must match)
   The page shows this version everywhere, and checks
   version.json (fetched fresh, never cached) so if your
   browser is running an old cached build you get a
   "newer version available" prompt.
========================================================== */

window.SHIBA_VERSION = "0.26.0";
window.SHIBA_CHANNEL = "Alpha";

(function () {

    const buildLabel =
        "Build v" + window.SHIBA_VERSION + " " + window.SHIBA_CHANNEL;

    /* fill version labels wherever they appear */

    function paint() {

        document.querySelectorAll(".build").forEach(el => {
            el.textContent = buildLabel;
        });

        document.querySelectorAll(".appVersion").forEach(el => {
            el.textContent = "v" + window.SHIBA_VERSION;
        });

    }

    /* compare the loaded build against the newest deployed one */

    async function checkForUpdate() {

        try {

            const res = await fetch(
                "/lapd/version.json?t=" + Date.now(),
                { cache: "no-store" });

            if (!res.ok) return;

            const data = await res.json();

            if (data.version && data.version !== window.SHIBA_VERSION) {

                showUpdateBanner(data.version);

            }

        } catch (e) { /* offline, or version.json not deployed yet */ }

    }

    function showUpdateBanner(newVersion) {

        if (document.getElementById("updateBanner")) return;

        const bar = document.createElement("div");

        bar.id = "updateBanner";

        bar.style.cssText =
            "position:fixed;bottom:0;left:0;right:0;z-index:1000001;" +
            "background:linear-gradient(90deg,#0a6b2f,#17a34a);color:#fff;" +
            "padding:12px 20px;text-align:center;font-size:14px;" +
            "box-shadow:0 -6px 20px rgba(0,0,0,.4)";

        bar.innerHTML =
            "🔄 A newer version (v" + newVersion + ") is available — " +
            "you're on v" + window.SHIBA_VERSION + ". " +
            "<button id='updateReload' style='margin-left:12px;padding:7px 14px;" +
            "border:none;border-radius:8px;background:rgba(0,0,0,.35);color:#fff;" +
            "cursor:pointer'>Refresh now</button>";

        document.body.appendChild(bar);

        document.getElementById("updateReload").onclick = () =>
            location.reload();

    }

    if (document.readyState === "loading") {

        document.addEventListener("DOMContentLoaded", () => {
            paint();
            checkForUpdate();
        });

    } else {

        paint();
        checkForUpdate();

    }

})();
