/* ==========================================================
   SHIBA PIMS
   Login System
   Version 1.0.0
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

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

                sessionStorage.setItem("loggedIn", "true");

                sessionStorage.setItem("username", currentUser.username);

                sessionStorage.setItem("role", currentUser.role);

                window.location.href = "dashboard.html";

            }

        }, 700);

    }

});
