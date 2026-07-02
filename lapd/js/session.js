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

    }

    resetTimer() {

        this.lastActivity = Date.now();

        clearTimeout(this.timer);

        this.timer = setTimeout(() => {

            this.logout();

        }, this.timeout);

    }

    checkSession() {

        const loggedIn = sessionStorage.getItem("loggedIn");

        if (!loggedIn) return;

        const diff = Date.now() - this.lastActivity;

        if (diff > this.timeout) {

            this.logout();

        }

    }

    logout() {

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
