/* ==========================================================
   SHIBA PIMS
   Shared Page Layout (topbar + sidebar + footer)
   + the PIMS brand icon helpers (navy/gold designer handoff
   in lapd/assets/ — 44 UI icons + 33 file-type icons + badge)
========================================================== */

/* UI icon (currentColor — takes the CSS color of its parent).
   Names: dashboard officers cases reports search cloud analytics
   shifts scanner fingerprint evidence patrol location surveillance
   dispatch warrants add alerts access archive notifications settings
   export signout bookings bolo ballistics k9 custody forensics
   suspects incidents messages call email print history filter tags
   attach sync verified help delete */

window.pimsIcon = function (name, size = 18, cls = "") {

    return `<svg class="pIcon ${cls}" width="${size}" height="${size}"` +
        ` aria-hidden="true"><use href="assets/pims-sprite.svg#pims-` +
        `${name}"></use></svg>`;

};

/* multi-color file-type icon (Explorer browser) */

window.pimsFileIcon = function (name, size = 22) {

    return `<svg class="pFileIcon" width="${size}" height="${size}"` +
        ` aria-hidden="true"><use href="assets/pims-file-sprite.svg#pfile-` +
        `${name}"></use></svg>`;

};

const AppLayout = {

    NAV: [
        ["dashboard.html", "dashboard", "Dashboard"],
        ["officers.html", "officers", "Officers"],
        ["../cloud/", "cloud", "Cloud"],
        ["cases.html", "cases", "Cases"],
        ["#", "reports", "Reports"],
        ["#", "surveillance", "Bodycam"],
        ["#", "patrol", "Vehicles"],
        ["certificates.html", "verified", "Certificates"],
        ["scanner.html", "scanner", "Scanner"],
        ["applications.html", "bookings", "Applications"],
        ["shifts.html", "shifts", "Shifts"],
        ["#", "messages", "Messages"],
        ["settings.html", "settings", "Settings"]
    ],

    createTopbar() {

        const username = localStorage.getItem("username") || "Guest";

        const role = localStorage.getItem("role") || "";

        const links = this.NAV.map(([href, icon, label]) =>
            `<a href="${href}">${pimsIcon(icon, 19)}<span>${label}</span></a>`
        ).join("\n    ");

        return `

<header class="topbar">

    <div>

        <h2>SHIBA PIMS</h2>

        <span>Police Information Management System</span>

    </div>

    <div class="userInfo">

        <div id="welcomeUser">${username}<br>${role}</div>

        <button id="logoutButton" onclick="Auth.logout()">Logout</button>

    </div>

</header>

<nav class="sidebar">

    <div class="sideBrand">

        <img src="assets/pims-badge.svg" alt="SHIBA PIMS badge">

        <h3>SHIBA PIMS</h3>

    </div>

    ${links}

</nav>

`;

    },

    createFooter() {

        const v = window.SHIBA_VERSION
            ? ` &middot; <span class="appVersion">v${window.SHIBA_VERSION}</span>`
            : "";

        return `<footer>SHIBA PIMS © 2026${v}</footer>`;

    }

};

window.AppLayout = AppLayout;
