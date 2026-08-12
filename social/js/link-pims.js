/* ==========================================================
   SHIBA SOCIAL — link a police account (S4 bridge)

   Lets a logged-in Social user attach a PIMS officer to their
   EXISTING account using an activation code, without creating a
   second account. It calls the UNCHANGED activation contract:
     - check_activation_code  (verify)
     - complete_activation    (mark used + link officer)
   plus auth.updateUser to set the PIMS PIN + role on their own
   account. Nothing in the frozen activation flow is modified.
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const viewer = await SocialSession.require();

    if (!viewer) return;

    const username = viewer.user_metadata?.username ||

        SocialSession.cached()?.username || "";

    /* if already an officer, show the shortcut instead */

    try {

        const badges = await SocialAPI.getBadges([viewer.id]);

        if (badges[viewer.id] && badges[viewer.id].is_officer) {

            document.getElementById("codeCard").classList.add("hidden");

            document.getElementById("alreadyCard").classList.remove("hidden");

        }

    } catch (e) { /* badges RPC not available — continue anyway */ }

    /* ----------------------------------------------------- */
    /* step 1 — verify the activation code                    */
    /* ----------------------------------------------------- */

    let verified = null;   /* { code, role, officer_name } */

    const verifyBtn = document.getElementById("lpVerify");

    verifyBtn.addEventListener("click", async () => {

        const officerId = document.getElementById("lpOfficerId").value.trim();

        const code = document.getElementById("lpCode").value.trim();

        if (!code) {

            SToast.err("Enter your activation code.");

            return;

        }

        verifyBtn.disabled = true;

        verifyBtn.textContent = "Checking…";

        try {

            const { data, error } = await window.sdb.rpc("check_activation_code", {

                p_officer_public: officerId || null,

                p_code: code

            });

            if (error) {

                SToast.err("The activation system isn't reachable right now.");

            } else if (!data || !data.valid) {

                SToast.err("Invalid or expired activation code.");

            } else {

                verified = {

                    code,

                    role: data.role,

                    officer_name: data.officer_name

                };

                document.getElementById("lpHello").textContent =

                    data.officer_name + " · " + data.role +

                    (data.purpose === "reset" ? " · access reset" : "");

                document.getElementById("codeCard").classList.add("hidden");

                document.getElementById("pinCard").classList.remove("hidden");

                document.getElementById("lpPin").focus();

            }

        } catch (e) {

            SToast.err("Could not check the code.");

        }

        verifyBtn.disabled = false;

        verifyBtn.textContent = "Verify code";

    });

    /* ----------------------------------------------------- */
    /* step 2 — set a PIN + link the officer                  */
    /* ----------------------------------------------------- */

    document.getElementById("lpBack").addEventListener("click", () => {

        document.getElementById("pinCard").classList.add("hidden");

        document.getElementById("codeCard").classList.remove("hidden");

    });

    const linkBtn = document.getElementById("lpLink");

    linkBtn.addEventListener("click", async () => {

        if (!verified) return;

        const pin = document.getElementById("lpPin").value;

        const pin2 = document.getElementById("lpPin2").value;

        if (!/^\d{4}$/.test(pin)) {

            SToast.err("PIN must be exactly 4 digits.");

            return;

        }

        if (pin !== pin2) {

            SToast.err("PINs do not match.");

            return;

        }

        linkBtn.disabled = true;

        linkBtn.textContent = "Linking…";

        try {

            const pinHash = await sha256Hex(pin);

            /* set the PIMS PIN + role on our OWN auth account */

            const { error: upErr } = await window.sdb.auth.updateUser({

                data: {

                    username: username,

                    role: verified.role,

                    pin_hash: pinHash

                }

            });

            if (upErr) {

                SToast.err("Could not set your PIN. Try again.");

                linkBtn.disabled = false;

                linkBtn.textContent = "Link account";

                return;

            }

            /* redeem the code + link the officer (unchanged RPC) */

            const { data: done, error: doneErr } = await window.sdb

                .rpc("complete_activation", {

                    p_code: verified.code,

                    p_user: viewer.id,

                    p_username: username

                });

            if (doneErr || !done || !done.ok) {

                console.error("complete_activation:", doneErr || done);

                SToast.err("The code could not be redeemed.");

                linkBtn.disabled = false;

                linkBtn.textContent = "Link account";

                return;

            }

            document.getElementById("pinCard").classList.add("hidden");

            document.getElementById("doneText").textContent =

                "You can now sign into SHIBA PIMS as " + username +

                " with your password and this PIN.";

            document.getElementById("doneCard").classList.remove("hidden");

            SToast.ok("Police account linked!");

        } catch (e) {

            console.error("link failed:", e);

            SToast.err("Something went wrong while linking.");

            linkBtn.disabled = false;

            linkBtn.textContent = "Link account";

        }

    });

});
