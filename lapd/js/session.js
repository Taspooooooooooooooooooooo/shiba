/* ==========================================================
   SHIBA PIMS
   Session Manager
   Auto Logout + Security Layer
========================================================== */

class SessionManager {

    constructor() {

        this.timeout = 15 * 60 * 1000; // 15 min

        this.timer = null;

        this.lastActivity = Date.now();

        this.init();

    }

    init() {

        this.resetTimer();

        document.addEventListener("click", () => this.resetTimer());

        document.addEventListener("keypress", () => this.resetTimer());

        document.addEventListener("mousemove", () => this.resetTimer());

        setInterval(() => this.checkSession(), 5000);

        /* the localStorage flag alone is NOT proof of login —
           validate the real Supabase session too */

        if (document.readyState === "loading") {

            document.addEventListener("DOMContentLoaded",
                () => this.validateAuth());

        } else {

            this.validateAuth();

        }

    }

    /* ------------------------------------------------------
       Security layer: opening a page directly (e.g. a saved
       /officers.html link) used to LOOK logged-in whenever the
       old localStorage flag survived, even with no valid auth
       session behind it. Now every protected page checks the
       REAL Supabase session; if it's gone, the page kicks back
       to the login screen. Network hiccups do NOT log you out —
       only a definitively missing/invalid session does.
    ------------------------------------------------------ */

    async validateAuth() {

        if (localStorage.getItem("loggedIn") !== "true") return;

        if (!window.db) return;

        try {

            const { data } = await db.auth.getSession();

            if (!data?.session) { this.invalidate(); return; }

            /* server-side check — catches revoked/expired sessions */

            const { error } = await db.auth.getUser();

            if (error &&
                /session|jwt|token|invalid|expired|missing|revoked/i
                    .test(error.message || "")) {

                this.invalidate();

            }

        } catch (e) { /* offline — keep the session for now */ }

    }

    invalidate() {

        localStorage.removeItem("loggedIn");

        localStorage.removeItem("username");

        localStorage.removeItem("role");

        sessionStorage.clear();

        const onLogin = /index\.html$|\/lapd\/?$/
            .test(location.pathname);

        if (onLogin) return;

        if (typeof UI !== "undefined") {

            UI.warning("Your session is no longer valid — please sign in.");

        }

        setTimeout(() => {

            window.location.href = "index.html";

        }, 900);

    }

    resetTimer() {

        this.lastActivity = Date.now();

        clearTimeout(this.timer);

        this.timer = setTimeout(() => {

            this.logout();

        }, this.timeout);

    }

    checkSession() {

        const loggedIn = localStorage.getItem("loggedIn");

        if (!loggedIn) return;

        const diff = Date.now() - this.lastActivity;

        if (diff > this.timeout) {

            this.logout();

        }

    }

    logout() {

        localStorage.clear();

        sessionStorage.clear();

        if (typeof UI !== "undefined") {

            UI.warning("Session expired. Logging out...");

        }

        setTimeout(() => {

            window.location.href = "index.html";

        }, 1500);

    }

}

const Session = new SessionManager();
