/* ==========================================================
   SHIBA — police PIN gate (hosted under /lapd/pin/)

   The casual Social login (username + password) redirects a
   linked police officer here with a one-time token. This page
   verifies their PIMS PIN against the account they just signed
   into (the same Social auth session, shared same-origin), then
   marks the PIN cleared for this browser session and continues
   into SHIBA Social. The PIN is checked the same way PIMS itself
   checks it: SHA-256 of the entry vs. the stored pin_hash.
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const HOME = "../../social/home.html";

    const SIGNIN = "../../social/index.html";

    function showError(title, text) {

        document.getElementById("pinState").classList.add("hidden");

        document.getElementById("errState").classList.remove("hidden");

        if (title) document.getElementById("errTitle").textContent = title;

        if (text) document.getElementById("errText").textContent = text;

    }

    const token = location.search.replace(/^\?/, "");

    let pending = null;

    try { pending = JSON.parse(localStorage.getItem("shibaPinPending") || "null"); }

    catch (e) { pending = null; }

    /* the signed-in account (same origin → same Social session) */

    let user = null;

    try {

        const { data } = await window.sdb.auth.getSession();

        user = data && data.session ? data.session.user : null;

    } catch (e) { user = null; }

    if (!user) {

        showError("Not signed in", "Please sign in again to continue.");

        return;

    }

    /* the token must match the pending login for THIS account */

    if (!token || !pending || pending.token !== token ||

        pending.userId !== user.id) {

        showError("This link is no longer valid",

            "For your security, please sign in again.");

        return;

    }

    const pinHash = user.user_metadata && user.user_metadata.pin_hash;

    /* no PIN on file — nothing to verify, just continue */

    if (!pinHash) {

        SocialSession.setPinCleared(user.id);

        localStorage.removeItem("shibaPinPending");

        window.location.href = HOME;

        return;

    }

    /* ----------------------------------------------------- */
    /* verify                                                 */
    /* ----------------------------------------------------- */

    const pinInput = document.getElementById("pin");

    const verifyBtn = document.getElementById("verifyBtn");

    let attempts = 0;

    setTimeout(() => pinInput.focus(), 60);

    async function verify() {

        const entered = pinInput.value;

        if (!/^\d{4}$/.test(entered)) {

            SToast.err("Your PIN is 4 digits.");

            return;

        }

        verifyBtn.disabled = true;

        const hash = await sha256Hex(entered);

        if (hash === pinHash) {

            SocialSession.setPinCleared(user.id);

            localStorage.removeItem("shibaPinPending");

            window.location.href = HOME;

            return;

        }

        attempts++;

        pinInput.value = "";

        verifyBtn.disabled = false;

        if (attempts >= 5) {

            SToast.err("Too many attempts. Signing out.");

            try { await window.sdb.auth.signOut(); } catch (e) {}

            localStorage.removeItem("shibaPinPending");

            localStorage.removeItem("shibaSocialUser");

            try { sessionStorage.removeItem("shibaPinCleared"); } catch (e) {}

            setTimeout(() => window.location.href = SIGNIN, 1300);

        } else {

            SToast.err("Incorrect PIN. " + (5 - attempts) + " attempts left.");

            pinInput.focus();

        }

    }

    verifyBtn.addEventListener("click", verify);

    pinInput.addEventListener("keydown", e => {

        if (e.key === "Enter") verify();

    });

    document.getElementById("cancelBtn").addEventListener("click", async () => {

        try { await window.sdb.auth.signOut(); } catch (e) {}

        localStorage.removeItem("shibaPinPending");

        localStorage.removeItem("shibaSocialUser");

        try { sessionStorage.removeItem("shibaPinCleared"); } catch (e) {}

        window.location.href = SIGNIN;

    });

});
