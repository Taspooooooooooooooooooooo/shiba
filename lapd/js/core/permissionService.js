/* ==========================================================
   SHIBA PIMS — Core Service
   PermissionService — the single place that decides
   "can this user do this action?". Every module asks
   PermissionService.can("case.assign") instead of checking
   ranks by hand.

   Phase 4 Part 1: comprehensive rank matrix + catalogue +
   require() guard + Permission Simulator (Preview As).
   Later parts: DB-driven rules, groups/templates, temporary
   + division + resource permissions, delegation, policy
   engine, and RLS server enforcement.
========================================================== */

const PermissionService = {

    /* -----------------------------------------------------
       Permission catalogue — every action the system knows,
       grouped by module (used by the permission viewer).
    ----------------------------------------------------- */

    CATALOG: {

        "Officers": [
            ["officers.view", "View officers"],
            ["officers.create", "Create officers"],
            ["officers.edit", "Edit officers"],
            ["officers.promote", "Promote officers"],
            ["officers.reset_access", "Reset officer access"],
            ["officers.archive", "Archive officers"]
        ],

        "Cases": [
            ["cases.view", "View cases"],
            ["cases.create", "Create cases"],
            ["cases.assign", "Assign cases"],
            ["cases.close", "Close cases"]
        ],

        "Certificates & Promotions": [
            ["certificates.issue", "Issue certificates"],
            ["certificates.approve", "Approve certificates"],
            ["promotion.approve", "Approve promotions"]
        ],

        "Bodycam": [
            ["bodycam.view", "View bodycam"],
            ["bodycam.upload", "Upload bodycam"],
            ["bodycam.download", "Download bodycam"],
            ["bodycam.delete", "Delete bodycam"]
        ],

        "Reports": [
            ["reports.create", "Create reports"],
            ["reports.approve", "Approve reports"]
        ],

        "Leadership & Admin": [
            ["notes.write", "Write leadership notes"],
            ["applications.review", "Review applications"],
            ["division.all", "See all divisions"],
            ["permissions.grant", "Grant permissions"],
            ["admin.panel", "Access admin panel"]
        ]

    },

    /* flat list of every concrete action (from the catalogue) */

    allActions() {

        return Object.values(this.CATALOG)
            .flat()
            .map(entry => entry[0]);

    },

    /* -----------------------------------------------------
       Permission GROUPS — named bundles that can be granted
       to an officer on top of their rank (Part 2). Assigning
       "Training Officer" gives all of its permissions at once.
    ----------------------------------------------------- */

    GROUPS: {

        "training-officer": {
            label: "🎓 Training Officer",
            description: "Runs training and can approve reports.",
            permissions: ["reports.approve", "notes.write", "cases.view"]
        },

        "fleet-manager": {
            label: "🚔 Fleet Manager",
            description: "Manages vehicles and bodycam footage.",
            permissions: ["bodycam.view", "bodycam.download", "bodycam.delete"]
        },

        "evidence-custodian": {
            label: "📦 Evidence Custodian",
            description: "Handles case evidence and bodycam.",
            permissions: ["cases.view", "cases.assign", "bodycam.view",
                          "bodycam.download"]
        },

        "recruiter": {
            label: "🧑‍✈️ Recruiter",
            description: "Creates and activates new officers.",
            permissions: ["officers.create", "officers.reset_access",
                          "applications.review"]
        },

        "dispatcher": {
            label: "📻 Dispatcher",
            description: "Assigns cases and sees the roster.",
            permissions: ["officers.view", "cases.view", "cases.assign"]
        }

    },

    groupPermissions(key) {

        return this.GROUPS[key]?.permissions || [];

    },

    permissionsForGroups(keys) {

        const set = new Set();

        (keys || []).forEach(k =>
            this.groupPermissions(k).forEach(p => set.add(p)));

        return [...set];

    },

    /* -----------------------------------------------------
       Rank matrix — which role is granted what.
       "*" = everything; "officers.*" = the whole module.
       (existing action names preserved so nothing breaks)
    ----------------------------------------------------- */

    MATRIX: {

        "Cadet": [
            "profile.view",
            "officers.view"
        ],

        "Officer": [
            "profile.view",
            "officers.view",
            "cases.view",
            "cases.create",
            "cases.edit.own",
            "bodycam.view",
            "bodycam.upload",
            "reports.create",
            "cloud.upload"
        ],

        "Senior Officer": [
            "profile.view",
            "officers.view",
            "cases.view",
            "cases.create",
            "cases.edit.own",
            "bodycam.view",
            "bodycam.upload",
            "bodycam.download",
            "reports.create",
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
            "bodycam.view",
            "bodycam.upload",
            "bodycam.download",
            "certificates.issue",
            "reports.create",
            "cloud.upload"
        ],

        "Lieutenant": [
            "profile.view",
            "officers.*",
            "cases.*",
            "certificates.issue",
            "certificates.approve",
            "promotion.approve",
            "bodycam.view",
            "bodycam.upload",
            "bodycam.download",
            "bodycam.delete",
            "reports.*",
            "notes.write",
            "applications.review",
            "division.all",
            "cloud.upload"
        ],

        "Captain": [
            "profile.view",
            "officers.*",
            "cases.*",
            "certificates.*",
            "promotion.approve",
            "bodycam.*",
            "reports.*",
            "notes.write",
            "applications.review",
            "division.all",
            "cloud.upload"
        ],

        "Commander": [ "*" ],

        "Chief": [ "*" ],

        "Super Administrator": [ "*" ]

    },

    /* granular officer ranks map to a permission tier */

    RANK_TIER: {
        "Cadet": "Cadet",
        "Officer": "Officer",
        "Officer II": "Officer",
        "Officer III": "Officer",
        "Senior Officer": "Senior Officer",
        "Corporal": "Officer",
        "Sergeant I": "Sergeant",
        "Sergeant II": "Sergeant",
        "Lieutenant": "Lieutenant",
        "Captain": "Captain",
        "Commander": "Commander",
        "Deputy Chief": "Chief",
        "Chief of Police": "Chief",
        "Chief": "Chief"
    },

    tierForRank(rank) {

        return this.RANK_TIER[rank] || "Officer";

    },

    permsForRole(role) {

        return this.MATRIX[role] || [];

    },

    /* is this role an admin-level (full access) role? */

    isAdminRole(role) {

        return (this.MATRIX[role] || []).includes("*");

    },

    /* -----------------------------------------------------
       Current role
    ----------------------------------------------------- */

    _role: null,

    _realRole: null,

    _myOfficer: undefined,

    _myGrants: null,

    /* the current user's linked officer record (id +
       permission_groups). Loaded once; null if not signed in
       or not linked. select("*") so a missing column can't
       break the query before its patch is run. */

    async myOfficer() {

        if (this._myOfficer !== undefined) return this._myOfficer;

        this._myOfficer = null;

        if (window.db) {

            try {

                const { data } = await db.auth.getUser();

                if (data?.user) {

                    const { data: officer } = await db
                        .from("officers")
                        .select("*, divisions(name)")
                        .eq("user_id", data.user.id)
                        .maybeSingle();

                    this._myOfficer = officer || null;

                }

            } catch (e) { /* no officer link */ }

        }

        return this._myOfficer;

    },

    /* the current user's assigned permission groups */

    async myGroups() {

        const officer = await this.myOfficer();

        return officer?.permission_groups || [];

    },

    /* active (non-expired, non-revoked) temporary permission
       grants for the current user — returns the granted
       action strings. [] if the table doesn't exist yet. */

    async myGrants() {

        if (this._myGrants) return this._myGrants;

        this._myGrants = [];

        const officer = await this.myOfficer();

        if (officer && window.db) {

            try {

                const nowIso = new Date().toISOString();

                const { data, error } = await db
                    .from("permission_grants")
                    .select("permission, expires_at, revoked_at")
                    .eq("officer_id", officer.id)
                    .is("revoked_at", null)
                    .gt("expires_at", nowIso);

                if (!error && data) {

                    this._myGrants = data.map(g => g.permission);

                }

            } catch (e) { /* table missing — no grants */ }

        }

        return this._myGrants;

    },

    /* the account's true role (auth metadata, then localStorage) */

    async realRole() {

        if (this._realRole) return this._realRole;

        if (window.db) {

            try {

                const { data } = await db.auth.getUser();

                if (data?.user?.user_metadata?.role) {

                    this._realRole = data.user.user_metadata.role;

                    return this._realRole;

                }

            } catch (e) { /* fall through */ }

        }

        this._realRole = localStorage.getItem("role") || "Officer";

        return this._realRole;

    },

    /* the effective role — a Permission Simulator preview
       overrides it, but ONLY when the real account is admin */

    async role() {

        const sim = sessionStorage.getItem("pims_sim_role");

        if (sim) {

            const real = await this.realRole();

            if (this.isAdminRole(real)) return sim;

        }

        return this.realRole();

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

        if (granted.some(g => this.matches(g, action))) return true;

        /* assigned permission groups + active temporary grants add
           rights on top of the rank — but not while previewing
           another role in the Simulator */

        if (!this.isSimulating()) {

            const extra = this.permissionsForGroups(await this.myGroups());

            if (extra.some(g => this.matches(g, action))) return true;

            const grants = await this.myGrants();

            if (grants.some(g => this.matches(g, action))) return true;

        }

        return false;

    },

    /* -----------------------------------------------------
       Division permissions (Part 4)
       An officer is scoped to their own division unless they
       hold "division.all" (Lieutenant+ / admin).
    ----------------------------------------------------- */

    async myOfficerId() {

        const officer = await this.myOfficer();

        return officer?.id || null;

    },

    async myDivision() {

        const officer = await this.myOfficer();

        return officer?.divisions?.name || null;

    },

    async seesAllDivisions() {

        return await this.can("division.all");

    },

    /* can the current user act within this division? */

    async canForDivision(divisionName) {

        if (await this.seesAllDivisions()) return true;

        const mine = await this.myDivision();

        /* no division on file → don't restrict (avoid lock-out) */

        if (!mine) return true;

        return mine === divisionName;

    },

    /* -----------------------------------------------------
       Ownership / resource permissions (Part 4)
       Library for future modules (Cases, Reports): the creator
       owns the record and may edit it until it is locked (e.g.
       approved); after that only an elevated permission may
       change it.
    ----------------------------------------------------- */

    async owns(resource, ownerField = "created_by") {

        if (!resource) return false;

        const mine = await this.myOfficerId();

        return !!mine && resource[ownerField] === mine;

    },

    /* canModifyResource(caseRow, {
           ownerField: "created_by",
           lockedField: "locked",     // truthy = locked
           elevated: "cases.assign"   // who can edit anyway
       }) */

    async canModifyResource(resource, opts = {}) {

        const ownerField = opts.ownerField || "created_by";

        const elevated = opts.elevated || null;

        const locked = opts.lockedField
            ? !!resource?.[opts.lockedField] : false;

        if (elevated && await this.can(elevated)) return true;

        if (!locked && await this.owns(resource, ownerField)) return true;

        return false;

    },

    /* -----------------------------------------------------
       Policy Engine (Part 5) — the capstone.
       Some rules are more than "has permission X": they
       combine a permission with conditions (rank + ownership
       + time + division). Every such rule lives here, once,
       so a policy change never means editing many files.

         const r = await PermissionService.checkPolicy(
             "bodycam.delete", { recordedAt: row.created_at });
         if (!r.allowed) { UI.error(r.reason); return; }
    ----------------------------------------------------- */

    POLICIES: {

        "officer.archive": {
            label: "Archive an officer",
            description: "Only Lieutenant and above may archive officers.",
            async check() {
                return (await PermissionService.can("officers.archive"))
                    ? { allowed: true }
                    : { allowed: false, reason: "Requires Lieutenant or above." };
            }
        },

        "promotion.approve": {
            label: "Approve a promotion",
            description: "Only Lieutenant and above may approve promotions.",
            async check() {
                return (await PermissionService.can("promotion.approve"))
                    ? { allowed: true }
                    : { allowed: false, reason: "Requires Lieutenant or above." };
            }
        },

        "bodycam.delete": {
            label: "Delete bodycam footage",
            description: "Only Captain and above, and only within 30 days " +
                "of recording.",
            async check(ctx) {
                if (!(await PermissionService.can("bodycam.delete")))
                    return { allowed: false, reason: "Requires Captain or above." };
                if (ctx && ctx.recordedAt) {
                    const days = (Date.now() - new Date(ctx.recordedAt))
                        / 86400000;
                    if (days > 30)
                        return { allowed: false,
                            reason: "Footage is older than 30 days." };
                }
                return { allowed: true };
            }
        },

        "case.close": {
            label: "Close a case",
            description: "Only the assigned officer, or a Sergeant and above.",
            async check(ctx) {
                if (await PermissionService.can("cases.assign"))
                    return { allowed: true };
                if (ctx && ctx.caseRow &&
                    await PermissionService.owns(ctx.caseRow, "assigned_to"))
                    return { allowed: true };
                return { allowed: false,
                    reason: "Only the assigned officer or Sergeant+ may close it." };
            }
        }

    },

    /* run a policy → { allowed, reason } */

    async checkPolicy(name, ctx) {

        const policy = this.POLICIES[name];

        if (!policy) return { allowed: false, reason: "Unknown policy: " + name };

        try {

            return await policy.check(ctx || {});

        } catch (e) {

            console.error("POLICY ERROR:", e);

            return { allowed: false, reason: "Policy could not be evaluated." };

        }

    },

    /* guard an action: returns true if allowed, otherwise
       shows a "no permission" toast and audits the attempt.
         if (!(await PermissionService.require("bodycam.delete"))) return; */

    async require(action) {

        if (await this.can(action)) return true;

        if (typeof UI !== "undefined") {

            UI.error("You don't have permission to do that.");

        }

        try {

            window.AuditService?.log?.({
                action: "PERMISSION_DENIED",
                target: action,
                details: "role " + (await this.role())
            });

        } catch (e) { /* auditing is best-effort */ }

        return false;

    },

    /* hide an element the current role may not use */

    async gate(action, element) {

        if (!element) return;

        if (!(await this.can(action))) {

            element.style.display = "none";

        }

    },

    /* -----------------------------------------------------
       Permission Simulator — "Preview As"
       An admin can view the whole app as another role to
       check exactly what that role sees. Client-side only:
       it changes what the UI shows, never the real account.
    ----------------------------------------------------- */

    isSimulating() {

        return !!sessionStorage.getItem("pims_sim_role");

    },

    async startSimulation(role) {

        const real = await this.realRole();

        if (!this.isAdminRole(real)) {

            if (typeof UI !== "undefined") {

                UI.error("Only administrators can preview as another role.");

            }

            return false;

        }

        sessionStorage.setItem("pims_sim_role", role);

        location.reload();

        return true;

    },

    stopSimulation() {

        sessionStorage.removeItem("pims_sim_role");

        location.reload();

    },

    /* floating banner shown on every page while previewing */

    renderSimBanner() {

        if (!this.isSimulating()) return;

        if (document.getElementById("simBanner")) return;

        const role = sessionStorage.getItem("pims_sim_role");

        const bar = document.createElement("div");

        bar.id = "simBanner";

        bar.innerHTML =
            "👁 Previewing as <b>" + role + "</b> — you are seeing what " +
            "this role sees. <button id='simExit'>Exit preview</button>";

        document.body.appendChild(bar);

        document.getElementById("simExit").onclick = () =>
            this.stopSimulation();

    }

};

/* show the preview banner automatically wherever this loads */

document.addEventListener("DOMContentLoaded", () => {

    PermissionService.renderSimBanner();

});

window.PermissionService = PermissionService;
