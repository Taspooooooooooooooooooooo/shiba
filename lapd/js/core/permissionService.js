/* ==========================================================
   SHIBA PIMS — Core Service
   PermissionService — every action in the app asks
   "can(user, action)?" instead of checking ranks by hand.

   Phase 0: role matrix below (client-side gating / UX).
   Phase 3: database-driven + temporary + division
   permissions + RLS server enforcement.
========================================================== */

const PermissionService = {

    /* action naming: "<module>.<action>"                    */
    /* "*" = everything, "officers.*" = whole module         */

    MATRIX: {

        "Cadet": [
            "profile.view",
            "officers.view"
        ],

        "Officer": [
            "profile.view",
            "officers.view",
            "cases.create",
            "cases.edit.own",
            "cloud.upload"
        ],

        "Sergeant": [
            "profile.view",
            "officers.view",
            "officers.create",
            "officers.edit",
            "officers.promote",
            "officers.reset_access",
            "cases.*",
            "cloud.upload"
        ],

        "Lieutenant": [
            "profile.view",
            "officers.*",
            "cases.*",
            "promotion.approve",
            "bodycam.delete",
            "cloud.upload"
        ],

        "Captain": [
            "profile.view",
            "officers.*",
            "cases.*",
            "promotion.approve",
            "bodycam.*",
            "cloud.upload"
        ],

        "Commander": [ "*" ],

        "Chief": [ "*" ],

        "Super Administrator": [ "*" ]

    },

    _role: null,

    /* current user's role — auth metadata first,
       localStorage mirror as fallback */

    async role() {

        if (this._role) return this._role;

        if (window.db) {

            try {

                const { data } = await db.auth.getUser();

                if (data?.user?.user_metadata?.role) {

                    this._role = data.user.user_metadata.role;

                    return this._role;

                }

            } catch (e) { /* fall through */ }

        }

        this._role = localStorage.getItem("role") || "Officer";

        return this._role;

    },

    matches(granted, action) {

        if (granted === "*") return true;

        if (granted === action) return true;

        if (granted.endsWith(".*")) {

            return action.startsWith(granted.slice(0, -1));

        }

        return false;

    },

    /* await PermissionService.can("officers.create") */

    async can(action) {

        const role = await this.role();

        const granted = this.MATRIX[role] || [];

        return granted.some(g => this.matches(g, action));

    },

    /* gate an element: hides it if the action is not allowed
       PermissionService.gate("officers.delete", button)     */

    async gate(action, element) {

        if (!element) return;

        if (!(await this.can(action))) {

            element.style.display = "none";

        }

    }

};

window.PermissionService = PermissionService;
