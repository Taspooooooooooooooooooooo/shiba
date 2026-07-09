/* ==========================================================
   SHIBA PIMS
   Permissions Reference (Phase 4 Part 2) — admin view of the
   rank templates and the assignable permission groups.
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const realRole = await PermissionService.realRole();

    if (!PermissionService.isAdminRole(realRole)) {

        document.getElementById("notAllowed").style.display = "";

        return;

    }

    document.getElementById("permContent").style.display = "";

    /* ---- Rank templates ---- */

    const templates = document.getElementById("templates");

    const ranks = ["Cadet", "Officer", "Senior Officer", "Sergeant",
        "Lieutenant", "Captain", "Commander", "Chief"];

    const label = {};

    Object.values(PermissionService.CATALOG).flat()
        .forEach(([a, l]) => label[a] = l);

    ranks.forEach(rank => {

        const perms = PermissionService.permsForRole(rank);

        const row = document.createElement("div");

        row.className = "templateRow";

        const full = perms.includes("*");

        const readable = full
            ? "Full system access (every permission)"
            : perms.map(p =>
                p.endsWith(".*") ? p.replace(".*", " (all)")
                    : (label[p] || p)).join(" · ");

        row.innerHTML =
            `<b>${rank}</b><span>${readable}</span>`;

        templates.appendChild(row);

    });

    /* ---- Permission groups ---- */

    const groups = document.getElementById("groups");

    const catLabel = {};

    Object.values(PermissionService.CATALOG).flat()
        .forEach(([a, l]) => catLabel[a] = l);

    Object.values(PermissionService.GROUPS).forEach(group => {

        const card = document.createElement("div");

        card.className = "card";

        const perms = group.permissions
            .map(p => catLabel[p] || p)
            .map(p => `<span class="permItem">✓ ${p}</span>`)
            .join("");

        card.innerHTML =
            `<h3>${group.label}</h3>` +
            `<p class="muted" style="margin:4px 0 10px">${group.description}</p>` +
            `<div class="permGrid">${perms}</div>`;

        groups.appendChild(card);

    });

    /* ---- Policies ---- */

    const policies = document.getElementById("policies");

    Object.values(PermissionService.POLICIES).forEach(policy => {

        const row = document.createElement("div");

        row.className = "templateRow";

        row.innerHTML =
            `<b>${policy.label}</b><span>${policy.description}</span>`;

        policies.appendChild(row);

    });

});
