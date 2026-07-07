/* ==========================================================
   SHIBA PIMS
   Account Settings (Phase 3)
   The login ACCOUNT (Supabase Auth) and the officer PROFILE
   are two separate things. Change password / PIN, and manage
   sessions here.
========================================================== */

const Settings = {

    user: null,

    officer: null,

    /* ----------------------------------------------------- */

    field(container, label, value) {

        const item = document.createElement("div");

        item.className = "fieldItem";

        const l = document.createElement("small");

        l.textContent = label;

        const v = document.createElement("div");

        v.textContent = value || "—";

        item.append(l, v);

        container.appendChild(item);

    },

    describeDevice() {

        const ua = navigator.userAgent;

        let os = "Unknown OS";

        if (/Windows/i.test(ua)) os = "Windows";
        else if (/Mac/i.test(ua)) os = "macOS";
        else if (/Android/i.test(ua)) os = "Android";
        else if (/iPhone|iPad/i.test(ua)) os = "iOS";
        else if (/Linux/i.test(ua)) os = "Linux";

        let browser = "Browser";

        if (/Edg/i.test(ua)) browser = "Edge";
        else if (/Chrome/i.test(ua)) browser = "Chrome";
        else if (/Firefox/i.test(ua)) browser = "Firefox";
        else if (/Safari/i.test(ua)) browser = "Safari";

        return browser + " on " + os;

    },

    /* ----------------------------------------------------- */

    async load() {

        if (!window.db) return;

        const { data } = await db.auth.getUser();

        this.user = data?.user || null;

        const meta = this.user?.user_metadata || {};

        /* USER ACCOUNT */

        const acc = document.getElementById("setAccount");

        acc.innerHTML = "";

        this.field(acc, "Username",
            meta.username || localStorage.getItem("username"));

        this.field(acc, "Role",
            meta.role || localStorage.getItem("role"));

        this.field(acc, "Login email", this.user?.email || "—");

        this.field(acc, "Last sign in", this.user?.last_sign_in_at
            ? new Date(this.user.last_sign_in_at).toLocaleString() : "—");

        this.field(acc, "Account created", this.user?.created_at
            ? new Date(this.user.created_at).toLocaleDateString() : "—");

        this.field(acc, "Security PIN",
            meta.pin_hash ? "•••• (set)" : "not set");

        /* OFFICER PROFILE (linked by user_id) */

        const off = document.getElementById("setOfficer");

        off.innerHTML = "";

        if (this.user) {

            const { data: officer } = await db
                .from("officers")
                .select("*, ranks(name), divisions(name)")
                .eq("user_id", this.user.id)
                .maybeSingle();

            this.officer = officer;

            if (officer) {

                this.field(off, "Officer ID", officer.officer_id);
                this.field(off, "Badge", officer.badge_number);
                this.field(off, "Name",
                    (officer.first_name + " " + officer.last_name).trim());
                this.field(off, "Rank", officer.ranks?.name || "—");
                this.field(off, "Division", officer.divisions?.name || "—");
                this.field(off, "Status", officer.status || "—");

                document.getElementById("setOfficerLink").innerHTML =
                    `<a class="offLink" href="personnel.html?id=${officer.id}">Open my Personnel File →</a>`;

            } else {

                off.innerHTML =
                    "<p class='muted'>This account is not linked to an " +
                    "officer profile.</p>";

            }

        }

        /* SESSION */

        const ses = document.getElementById("setSession");

        ses.innerHTML = "";

        this.field(ses, "Device", this.describeDevice());

        this.field(ses, "Signed in as",
            meta.username || localStorage.getItem("username"));

        this.field(ses, "Session status", this.user ? "Active" : "Local only");

    },

    /* ----------------------------------------------------- */

    async changePassword() {

        const p1 = document.getElementById("newPassword").value;

        const p2 = document.getElementById("newPassword2").value;

        if (p1.length < 8) {
            UI.error("Password must be at least 8 characters.");
            return;
        }

        if (p1 !== p2) {
            UI.error("Passwords do not match.");
            return;
        }

        if (!this.user) {
            UI.error("You must be signed in to change your password.");
            return;
        }

        const { error } = await db.auth.updateUser({ password: p1 });

        if (error) {
            console.error("PASSWORD CHANGE ERROR:", error);
            UI.error("Could not change password: " + error.message);
            return;
        }

        AuditService.log({
            action: "PASSWORD_CHANGED",
            target: this.user.user_metadata?.username || this.user.email,
            officerId: this.officer?.id || null
        });

        document.getElementById("newPassword").value = "";
        document.getElementById("newPassword2").value = "";

        UI.success("Password updated.");

    },

    async changePin() {

        const pin = document.getElementById("newPin").value;

        if (!/^\d{4}$/.test(pin)) {
            UI.error("PIN must be exactly 4 digits.");
            return;
        }

        if (!this.user) {
            UI.error("You must be signed in to change your PIN.");
            return;
        }

        const pinHash = await sha256Hex(pin);

        const { error } = await db.auth.updateUser({
            data: { pin_hash: pinHash }
        });

        if (error) {
            console.error("PIN CHANGE ERROR:", error);
            UI.error("Could not change PIN: " + error.message);
            return;
        }

        AuditService.log({
            action: "PIN_CHANGED",
            target: this.user.user_metadata?.username || this.user.email,
            officerId: this.officer?.id || null
        });

        document.getElementById("newPin").value = "";

        UI.success("Security PIN updated.");

    },

    async signOut(scope) {

        if (!this.user) {
            UI.error("No active session to sign out.");
            return;
        }

        AuditService.log({
            action: scope === "global"
                ? "SIGNED_OUT_ALL_DEVICES"
                : "SIGNED_OUT_OTHER_DEVICES",
            target: this.user.user_metadata?.username || this.user.email,
            officerId: this.officer?.id || null
        });

        await db.auth.signOut({ scope: scope });

        if (scope === "global") {

            localStorage.clear();

            sessionStorage.clear();

            window.location.href = "index.html";

        } else {

            UI.success("Other devices have been signed out.");

        }

    }

};

document.addEventListener("DOMContentLoaded", () => {

    Settings.load();

    document.getElementById("changePasswordBtn").onclick =
        () => Settings.changePassword();

    document.getElementById("changePinBtn").onclick =
        () => Settings.changePin();

    document.getElementById("signOutOthersBtn").onclick =
        () => Settings.signOut("others");

    document.getElementById("signOutAllBtn").onclick =
        () => Settings.signOut("global");

});

window.Settings = Settings;
