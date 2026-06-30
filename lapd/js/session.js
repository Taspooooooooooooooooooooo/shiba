/* ==========================================================
   LAPD Internal Management System
   session.js
   Build v1.0.0
========================================================== */

/*
    Session Storage Keys
*/

const SESSION_KEY = "lapd_session";

/*
    Save Session
*/

function saveSession(user){

    const session = {

        username: user.username,

        fullname: user.fullname,

        role: user.role,

        badge: user.badge,

        loginTime: new Date().toISOString(),

        build: BUILD

    };

    sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify(session)
    );

}

/*
    Load Session
*/

function loadSession(){

    const data = sessionStorage.getItem(SESSION_KEY);

    if(!data){

        return null;

    }

    try{

        return JSON.parse(data);

    }catch{

        clearSession();

        return null;

    }

}

/*
    Clear Session
*/

function clearSession(){

    sessionStorage.removeItem(SESSION_KEY);

}

/*
    Is Logged
*/

function isLoggedIn(){

    return loadSession() !== null;

}

/*
    Logout
*/

function logout(){

    clearSession();

    location.href="index.html";

}

/*
    Auto Login
*/

window.addEventListener("DOMContentLoaded",()=>{

    const session = loadSession();

    if(!session){

        return;

    }

    console.log("Session Found");

    console.log(session);

    /*
        Dashboard ešte neexistuje.
        Keď ho vytvoríme,
        stačí odkomentovať riadok nižšie.
    */

    // window.location.href="dashboard.html";

});

/*
    Auto Timeout
*/

let inactivityTimer;

function resetInactivityTimer(){

    clearTimeout(inactivityTimer);

    inactivityTimer=setTimeout(()=>{

        alert("You have been logged out due to inactivity.");

        logout();

    },15*60*1000);

}

[
"mousemove",
"keydown",
"click",
"touchstart"
].forEach(event=>{

    document.addEventListener(event,resetInactivityTimer);

});

resetInactivityTimer();

/*
==========================================================

Future Features

✔ Remember Me

✔ Refresh Token

✔ Session Validation

✔ Database Check

✔ Multiple Devices

✔ Login History

==========================================================
*/
