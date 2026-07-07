/* ==========================================================
   SHIBA PIMS
   Login System
   Version 1.0.0
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* ----------------------------------------------------- */
    /* SSO popup mode                                         */
    /* /lapd/?=from<sessionId> — another SHIBA service        */
    /* opened this page as a login popup. After login we      */
    /* message the opener tab and close, like OAuth.          */
    /* ----------------------------------------------------- */

    const ssoToken =
        new URLSearchParams(location.search).get("") || "";

    const isSSO = ssoToken.startsWith("from");

    function finishSSO() {

        if (window.opener) {

            window.opener.postMessage({

                type: "shiba-sso",

                sid: ssoToken,

                username: localStorage.getItem("username"),

                role: localStorage.getItem("role")

            }, location.origin);

            window.close();

            return;

        }

        /* opened without a popup — fall back to the app */

        window.location.href = "dashboard.html";

    }

    /* already logged in somewhere else? finish instantly */

    if (isSSO && localStorage.getItem("loggedIn") === "true") {

        finishSSO();

        return;

    }

    if (isSSO) {

        const sub = document.querySelector(".logo span");

        if (sub) {

            sub.innerText = "Sign in to continue to SHIBA CLOUD";

        }

    }

    /* ----------------------------------------------------- */
    /* Elements                                               */
    /* ----------------------------------------------------- */

    const loginForm = document.getElementById("loginForm");

    const username = document.getElementById("username");

    const password = document.getElementById("password");

    const pinModal = document.getElementById("pinModal");

    const pinInput = document.getElementById("pin");

    const verifyPin = document.getElementById("verifyPin");

    const loadingOverlay = document.getElementById("loadingOverlay");

    const loadingText = document.getElementById("loadingText");

    const showPassword = document.getElementById("showPassword");

    const bootScreen = document.getElementById("bootScreen");

    const loginPage = document.getElementById("loginPage");

    const progressBar = document.getElementById("progressBar");

    const bootStatus = document.getElementById("bootStatus");

    /* ----------------------------------------------------- */
    /* LEGACY fallback login — DISABLED 2026-07-05            */
    /* The real Supabase Auth admin account is active.        */
    /* If you ever get locked out: run the last line of       */
    /* lapd/SETUP-AUTH.sql for a fresh admin activation code. */
    /* ----------------------------------------------------- */

    const ALLOW_LEGACY_LOGIN = false;

    const legacyUsers = [];

    /* ----------------------------------------------------- */
    /* Boot Screen                                            */
    /* ----------------------------------------------------- */

    const bootSteps = [

        "Loading Core...",
        "Loading Database...",
        "Loading Authentication...",
        "Loading Storage...",
        "Loading Realtime...",
        "Loading Notifications...",
        "Loading Permissions...",
        "Loading UI...",
        "System Ready."

    ];

    let progress = 0;

    let step = 0;

    const bootInterval = setInterval(() => {

        progress += 12;

        progressBar.style.width = progress + "%";

        bootStatus.innerText = bootSteps[step];

        step++;

        if (step >= bootSteps.length) {

            clearInterval(bootInterval);

            setTimeout(() => {

                bootScreen.style.display = "none";

                loginPage.classList.remove("hidden");

            }, 600);

        }

    }, 350);

    /* ----------------------------------------------------- */
    /* Show Password                                          */
    /* ----------------------------------------------------- */

    showPassword.addEventListener("click", () => {

        if (password.type === "password") {

            password.type = "text";

            showPassword.innerText = "Hide";

        } else {

            password.type = "password";

            showPassword.innerText = "Show";

        }

    });

    /* ----------------------------------------------------- */
    /* Login                                                  */
    /* ----------------------------------------------------- */

    let currentUser = null;

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        currentUser = null;

        const uname = username.value.trim();

        /* account lock — refuse locked accounts before trying
           the password (needs SETUP-PATCH-5; ignored if absent) */

        if (window.db) {

            try {

                const { data: lock } = await db
                    .rpc("account_lock_status", { p_username: uname });

                if (lock?.locked) {

                    UI.error("Account locked. Try again in " +
                        lock.minutes + " minute" +
                        (lock.minutes === 1 ? "" : "s") + ".");

                    return;

                }

            } catch (e) { /* patch not run — skip lock */ }

        }

        /* real login — Supabase Auth checks the password
           on the server, nothing is verified in the browser */

        if (window.db) {

            const { data, error } = await db.auth.signInWithPassword({

                email: usernameToEmail(username.value),

                password: password.value

            });

            if (!error && data?.user) {

                const meta = data.user.user_metadata || {};

                currentUser = {

                    username: meta.username || uname.toLowerCase(),

                    role: meta.role || "Officer",

                    pinHash: meta.pin_hash || null,

                    userId: data.user.id

                };

                /* good login — clear any failed-attempt counter */

                try {
                    await db.rpc("reset_failed_logins", {
                        p_user: data.user.id
                    });
                } catch (e) { /* ignore */ }

            } else if (error) {

                /* wrong password — count it; lock at 5 */

                try {

                    const { data: fail } = await db
                        .rpc("register_failed_login", { p_username: uname });

                    if (fail?.locked) {

                        AuditService?.log?.({
                            action: "ACCOUNT_LOCKED",
                            target: uname,
                            details: "5 failed login attempts"
                        });

                        NotificationService?.send?.({
                            title: "Account Locked",
                            message: "Account " + uname + " was locked after " +
                                "5 failed login attempts."
                        });

                        UI.error("Account locked for 15 minutes after too " +
                            "many failed attempts.");

                        return;

                    } else if (fail?.exists && fail.remaining <= 2) {

                        UI.error("Invalid password. " + fail.remaining +
                            " attempt" + (fail.remaining === 1 ? "" : "s") +
                            " left before lock.");

                        return;

                    }

                } catch (e) { /* patch not run — skip */ }

            }

        }

        /* legacy fallback (see note at the top) */

        if (!currentUser && ALLOW_LEGACY_LOGIN) {

            const user = legacyUsers.find(u =>

                u.username === username.value.trim() &&
                u.password === password.value

            );

            if (user) {

                console.warn(
                    "Legacy login used — activate the real admin account, " +
                    "then disable ALLOW_LEGACY_LOGIN in login.js.");

                currentUser = user;

            }

        }

        if (!currentUser) {

            UI.error("Invalid username or password.");

            return;

        }

        pinModal.classList.remove("hidden");

        pinInput.focus();

    });

    /* ----------------------------------------------------- */
    /* PIN Verification                                       */
    /* ----------------------------------------------------- */

    verifyPin.addEventListener("click", async () => {

        if (!currentUser) return;

        let pinOk;

        if (currentUser.pinHash) {

            /* real accounts store only the SHA-256 of the PIN */

            pinOk = (await sha256Hex(pinInput.value)) === currentUser.pinHash;

        } else {

            pinOk = pinInput.value === currentUser.pin;

        }

        if (!pinOk) {

            UI.error("Invalid PIN.");

            pinInput.value = "";

            pinInput.focus();

            return;

        }

        pinModal.classList.add("hidden");

        loadingOverlay.classList.remove("hidden");

        authenticate();
       UI.success("Authentication successful.");
    });

    /* ----------------------------------------------------- */
    /* Fake Authentication                                    */
    /* ----------------------------------------------------- */

    function authenticate() {

        const messages = [

            "Verifying user...",
            "Checking permissions...",
            "Loading profile...",
            "Loading notifications...",
            "Connecting database...",
            "Authentication successful..."

        ];

        let i = 0;

        const loading = setInterval(() => {

            loadingText.innerText = messages[i];

            i++;

            if (i >= messages.length) {

                clearInterval(loading);

                /* localStorage so the login is shared by every
                   SHIBA service (PIMS + CLOUD) and survives tabs */

                localStorage.setItem("loggedIn", "true");

                localStorage.setItem("username", currentUser.username);

                localStorage.setItem("role", currentUser.role);

                if (isSSO) {

                    finishSSO();

                } else {

                    window.location.href = "dashboard.html";

                }

            }

        }, 700);

    }

});
