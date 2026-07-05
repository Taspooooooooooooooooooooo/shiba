/* ==========================================================
   SHIBA PIMS
   Account Activation
   Officer enters Officer ID + activation code, then sets
   their OWN username / password / PIN. The password goes
   straight into Supabase Auth — no admin ever sees it.
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    const codeForm = document.getElementById("codeForm");

    const credsForm = document.getElementById("credsForm");

    let checkedCode = null;

    let checkedInfo = null;

    /* ----------------------------------------------------- */
    /* STEP 1 — verify the code                               */
    /* ----------------------------------------------------- */

    codeForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        if (!window.db) {

            UI.error("No database connection");

            return;

        }

        const officerId =
            document.getElementById("actOfficerId").value.trim();

        const code =
            document.getElementById("actCode").value.trim();

        const { data, error } = await db.rpc("check_activation_code", {
            p_officer_public: officerId || null,
            p_code: code
        });

        if (error) {

            console.error("CHECK CODE ERROR:", error);

            UI.error("Activation system is not set up yet.");

            return;

        }

        if (!data?.valid) {

            UI.error("Invalid or expired activation code.");

            return;

        }

        checkedCode = code;

        checkedInfo = data;

        document.getElementById("officerHello").innerText =
            "👮 " + data.officer_name + " · " + data.role +
            (data.purpose === "reset" ? " · access reset" : "");

        codeForm.classList.add("step-hidden");

        credsForm.classList.remove("step-hidden");

        document.getElementById("actUsername").focus();

    });

    /* ----------------------------------------------------- */
    /* STEP 2 — create the account                            */
    /* ----------------------------------------------------- */

    credsForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const username =
            document.getElementById("actUsername").value.trim().toLowerCase();

        const password = document.getElementById("actPassword").value;

        const password2 = document.getElementById("actPassword2").value;

        const pin = document.getElementById("actPin").value;

        if (!isValidUsername(username)) {

            UI.error("Username: 3-24 characters, only a-z 0-9 . _ -");

            return;

        }

        if (password.length < 8) {

            UI.error("Password must be at least 8 characters.");

            return;

        }

        if (password !== password2) {

            UI.error("Passwords do not match.");

            return;

        }

        if (!/^\d{4}$/.test(pin)) {

            UI.error("PIN must be exactly 4 digits.");

            return;

        }

        const pinHash = await sha256Hex(pin);

        const { data, error } = await db.auth.signUp({

            email: usernameToEmail(username),

            password: password,

            options: {

                data: {

                    username: username,

                    role: checkedInfo.role,

                    officer_public_id:
                        document.getElementById("actOfficerId").value.trim() || null,

                    pin_hash: pinHash

                }

            }

        });

        if (error) {

            console.error("SIGNUP ERROR:", error);

            UI.error(
                /already|registered|exists/i.test(error.message)
                    ? "That username is already taken."
                    : "Could not create the account: " + error.message);

            return;

        }

        if (!data?.session) {

            UI.error(
                "Account created but email confirmation is still ON in " +
                "Supabase. Ask the administrator to disable it " +
                "(Authentication → Sign In / Providers → Email).");

            return;

        }

        const { data: done, error: doneError } = await db
            .rpc("complete_activation", {
                p_code: checkedCode,
                p_user: data.user.id,
                p_username: username
            });

        if (doneError || !done?.ok) {

            console.error("COMPLETE ACTIVATION ERROR:", doneError || done);

            UI.error("Account created, but the code could not be redeemed.");

            return;

        }

        /* logged in — mirror the session for all SHIBA pages */

        localStorage.setItem("loggedIn", "true");

        localStorage.setItem("username", username);

        localStorage.setItem("role", checkedInfo.role);

        UI.success("Account activated. Welcome, " + username + "!");

        setTimeout(() => {

            window.location.href = "dashboard.html";

        }, 1200);

    });

});
