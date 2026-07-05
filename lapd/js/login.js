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
    /* Temporary Local Users                                 */
    /* Later -> Supabase                                     */
    /* ----------------------------------------------------- */

    const users = [

        {

            username: "vladko",

            password: "vladinko",

            pin: "5080",

            role: "Super Administrator"

        }

    ];

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

    loginForm.addEventListener("submit", (event) => {

        event.preventDefault();

        const user = users.find(u =>

            u.username === username.value.trim() &&
            u.password === password.value

        );

        if (!user) {

            UI.error("Invalid username or password.");

            return;

        }

        currentUser = user;

        pinModal.classList.remove("hidden");

        pinInput.focus();

    });

    /* ----------------------------------------------------- */
    /* PIN Verification                                       */
    /* ----------------------------------------------------- */

    verifyPin.addEventListener("click", () => {

        if (!currentUser) return;

        if (pinInput.value !== currentUser.pin) {

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
