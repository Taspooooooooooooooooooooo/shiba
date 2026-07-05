/* ==========================================================
   SHIBA PIMS
   Utilities
========================================================== */

/* Accounts live in Supabase Auth under internal addresses:
   <username>@shiba.is-a.dev — nobody ever receives mail there,
   it is just how usernames map to auth accounts. */

const SHIBA_AUTH_DOMAIN = "@shiba.is-a.dev";

function usernameToEmail(username) {

    return username.trim().toLowerCase() + SHIBA_AUTH_DOMAIN;

}

/* SHA-256 hex digest — used for the PIN second step */

async function sha256Hex(text) {

    const bytes = new TextEncoder().encode(text);

    const hash = await crypto.subtle.digest("SHA-256", bytes);

    return [...new Uint8Array(hash)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

}

/* username rules: 3-24 chars, lowercase letters, digits, . _ - */

function isValidUsername(username) {

    return /^[a-z0-9._-]{3,24}$/.test(username);

}
