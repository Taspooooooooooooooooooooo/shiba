/* ==========================================================
   LAPD Internal Management System
   login.js
   Build v1.0.0
========================================================== */

const bootScreen = document.getElementById("bootScreen");
const loginContainer = document.getElementById("loginContainer");
const pinContainer = document.getElementById("pinContainer");
const loadingOverlay = document.getElementById("loadingOverlay");

const bootStatus = document.getElementById("bootStatus");
const loadingFill = document.getElementById("loadingFill");

const username = document.getElementById("username");
const password = document.getElementById("password");

const loginButton = document.getElementById("loginButton");

const pinInput = document.getElementById("pin");
const verifyButton = document.getElementById("verifyButton");

const toast = document.getElementById("toast");

/* ==========================================================
   SETTINGS
========================================================== */

const BUILD = "v1.0.0";

let currentUser = null;

/* ==========================================================
   TOAST SYSTEM
========================================================== */

function showToast(message, color = "#2f88ff") {

    toast.innerHTML = message;

    toast.style.background = color;

    toast.style.opacity = "1";

    setTimeout(() => {

        toast.style.opacity = "0";

    }, 3000);

}

/* ==========================================================
   BOOT SEQUENCE
========================================================== */

const bootSteps = [

"Initializing Internal System...",

"Checking Secure Database...",

"Loading Officer Registry...",

"Loading Authentication Module...",

"Checking Permissions...",

"Loading Evidence System...",

"Loading Reports Module...",

"Starting User Interface...",

"Ready."

];

let progress = 0;

let currentStep = 0;

const bootInterval = setInterval(() => {

    progress += 2;

    loadingFill.style.width = progress + "%";

    if(progress % 12 === 0){

        if(currentStep < bootSteps.length){

            bootStatus.innerHTML = bootSteps[currentStep];

            currentStep++;

        }

    }

    if(progress >= 100){

        clearInterval(bootInterval);

        setTimeout(() => {

            bootScreen.classList.add("hidden");

            loginContainer.classList.remove("hidden");

            username.focus();

        },600);

    }

},60);

/* ==========================================================
   LOGIN BUTTON
========================================================== */

loginButton.addEventListener("click", login);

password.addEventListener("keypress", e=>{

    if(e.key==="Enter"){

        login();

    }

});

function login(){

    const user = username.value.trim();

    const pass = password.value.trim();

    if(user===""){

        showToast("Please enter your username.","#d9534f");

        username.focus();

        return;

    }

    if(pass===""){

        showToast("Please enter your password.","#d9534f");

        password.focus();

        return;

    }

    loadingOverlay.classList.remove("hidden");

    setTimeout(()=>{

        loadingOverlay.classList.add("hidden");

        currentUser=user;

        loginContainer.classList.add("hidden");

        pinContainer.classList.remove("hidden");

        pinInput.focus();

    },1200);

}
