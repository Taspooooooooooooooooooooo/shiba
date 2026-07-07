/* ==========================================================
   SHIBA PIMS
   Shared Page Layout (topbar + sidebar + footer)
========================================================== */

const AppLayout = {

    createTopbar() {

        const username = localStorage.getItem("username") || "Guest";

        const role = localStorage.getItem("role") || "";

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

    <h3>Navigation</h3>

    <a href="dashboard.html">🏠 Dashboard</a>

    <a href="officers.html">👮 Officers</a>

    <a href="../cloud/">☁️ Cloud</a>

    <a href="#">📂 Cases</a>

    <a href="#">📄 Reports</a>

    <a href="#">📷 Bodycam</a>

    <a href="#">🚔 Vehicles</a>

    <a href="#">🏆 Certificates</a>

    <a href="#">📅 Shifts</a>

    <a href="#">💬 Messages</a>

    <a href="settings.html">⚙ Settings</a>

</nav>

`;

    },

    createFooter() {

        return `<footer>SHIBA PIMS © 2026</footer>`;

    }

};

window.AppLayout = AppLayout;
