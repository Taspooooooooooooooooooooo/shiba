/* ==========================================================
   SHIBA SOCIAL — landing (sign in / sign up)

   Sign up creates a normal SHIBA account (a public.users row)
   with NO officer and NO mention of PIMS — the police side
   stays behind its own activation flow, which we never touch.

   Sign in accepts ANY SHIBA account (a social-made one OR an
   existing PIMS officer). Either way it is a Social-only
   session; it does not unlock PIMS.
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* already signed into Social? skip straight to the app. */

    SocialSession.user().then(user => {

        if (user) window.location.href = "home.html";

    });

    /* ----------------------------------------------------- */
    /* tab switching                                          */
    /* ----------------------------------------------------- */

    const tabSignIn = document.getElementById("tabSignIn");

    const tabSignUp = document.getElementById("tabSignUp");

    const signInForm = document.getElementById("signInForm");

    const signUpForm = document.getElementById("signUpForm");

    function show(mode) {

        const signIn = mode === "in";

        tabSignIn.classList.toggle("active", signIn);

        tabSignUp.classList.toggle("active", !signIn);

        signInForm.classList.toggle("hidden", !signIn);

        signUpForm.classList.toggle("hidden", signIn);

    }

    tabSignIn.addEventListener("click", () => show("in"));

    tabSignUp.addEventListener("click", () => show("up"));

    /* ----------------------------------------------------- */
    /* SIGN IN                                                */
    /* ----------------------------------------------------- */

    signInForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const btn = signInForm.querySelector("button[type=submit]");

        const uname = document.getElementById("siUser").value.trim().toLowerCase();

        const pass = document.getElementById("siPass").value;

        if (!uname || !pass) {

            SToast.err("Enter your username and password.");

            return;

        }

        btn.disabled = true;

        btn.textContent = "Signing in…";

        const { data, error } = await window.sdb.auth.signInWithPassword({

            email: usernameToEmail(uname),

            password: pass

        });

        if (error || !data?.user) {

            SToast.err("Wrong username or password.");

            btn.disabled = false;

            btn.textContent = "Sign in";

            return;

        }

        /* make sure this account has a social profile — a PIMS
           officer signing in for the first time won't yet. This
           RPC is idempotent: it never overwrites the users row
           (on conflict do nothing) and just ensures the profile. */

        const meta = data.user.user_metadata || {};

        try {

            await window.sdb.rpc("social_register", {

                p_user: data.user.id,

                p_username: meta.username || uname,

                p_display_name: null

            });

        } catch (e) { /* profile may already exist — fine */ }

        SocialSession.save({

            id: data.user.id,

            username: meta.username || uname

        });

        /* police officers (accounts with a PIN) get the extra PIN
           step before entering Social; everyone else goes straight in */

        if (SocialSession.needsPin(data.user) &&

            !SocialSession.pinCleared(data.user.id)) {

            window.location.href = SocialSession.startPinGate(data.user.id);

            return;

        }

        window.location.href = "home.html";

    });

    /* ----------------------------------------------------- */
    /* SIGN UP                                                */
    /* ----------------------------------------------------- */

    signUpForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const btn = signUpForm.querySelector("button[type=submit]");

        const displayName = document.getElementById("suName").value.trim();

        const uname = document.getElementById("suUser").value.trim().toLowerCase();

        const dob = document.getElementById("suDob").value;   /* yyyy-mm-dd */

        const email = document.getElementById("suEmail").value.trim();

        const phone = document.getElementById("suPhone").value.trim();

        const pass = document.getElementById("suPass").value;

        const pass2 = document.getElementById("suPass2").value;

        if (!isValidUsername(uname)) {

            SToast.err("Username: 3–24 chars, only a–z 0–9 . _ -");

            return;

        }

        if (!dob) {

            SToast.err("Please enter your date of birth.");

            return;

        }

        const dobDate = new Date(dob + "T00:00:00");

        if (isNaN(dobDate.getTime()) ||
            dobDate > new Date() ||
            dobDate.getFullYear() < 1900) {

            SToast.err("Please enter a valid date of birth.");

            return;

        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {

            SToast.err("Please enter a valid email address.");

            return;

        }

        if (phone.replace(/\D/g, "").length < 6) {

            SToast.err("Please enter a valid phone number.");

            return;

        }

        if (pass.length < 8) {

            SToast.err("Password must be at least 8 characters.");

            return;

        }

        if (pass !== pass2) {

            SToast.err("Passwords do not match.");

            return;

        }

        btn.disabled = true;

        btn.textContent = "Creating…";

        /* ban enforcement — refuse a banned email / phone / device */

        const ip = await getClientIp();

        if (await SocialAPI.checkBanned(email, phone, ip)) {

            SToast.err("This email, phone number, or device is banned " +
                "from SHIBA Social.");

            btn.disabled = false;

            btn.textContent = "Create account";

            return;

        }

        /* 1) make the Supabase Auth account */

        const { data, error } = await window.sdb.auth.signUp({

            email: usernameToEmail(uname),

            password: pass,

            options: {

                data: {

                    username: uname,

                    role: "Member"

                }

            }

        });

        if (error) {

            SToast.err(

                /already|registered|exists/i.test(error.message)

                    ? "That username is already taken."

                    : "Could not create the account: " + error.message);

            btn.disabled = false;

            btn.textContent = "Create account";

            return;

        }

        if (!data?.session) {

            /* email confirmation is still ON in Supabase */

            SToast.err(

                "Almost there — account confirmation is enabled on the " +
                "server. Ask the admin to turn it off, then try again.");

            btn.disabled = false;

            btn.textContent = "Create account";

            return;

        }

        /* 2) create the shared users row + social profile */

        const { data: reg, error: regErr } = await window.sdb

            .rpc("social_register", {

                p_user: data.user.id,

                p_username: uname,

                p_display_name: displayName || null,

                p_dob: dob,

                p_email: email,

                p_phone: phone

            });

        if (regErr || !reg?.ok) {

            console.error("social_register failed:", regErr || reg);

            SToast.err("Account made, but profile setup failed. Try signing in.");

            btn.disabled = false;

            btn.textContent = "Create account";

            return;

        }

        /* record the signup IP for moderation / ban enforcement */

        if (ip) {

            try {

                await window.sdb.from("social_profiles")

                    .update({ signup_ip: ip }).eq("user_id", data.user.id);

            } catch (e) { /* column missing pre-patch — ignore */ }

        }

        SocialSession.save({

            id: data.user.id,

            username: uname,

            displayName: displayName || uname

        });

        SToast.ok("Welcome to SHIBA Social!");

        setTimeout(() => window.location.href = "home.html", 500);

    });

});
