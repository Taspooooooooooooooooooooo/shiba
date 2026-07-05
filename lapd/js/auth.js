/* ============================================================
   SHIBA PIMS
   Authentication Manager
   Version 1.0.0
============================================================ */

/*
    Táto trieda bude neskôr komunikovať so Supabase.

    Teraz iba spravuje Session.

*/

class AuthManager{

    constructor(){

        this.user = null;

    }

    login(user){

        this.user = user;

        localStorage.setItem(
            "PIMS_USER",
            JSON.stringify(user)
        );

    }

    logout(){

        localStorage.clear();

        sessionStorage.clear();

        window.location.href="index.html";

    }

    getUser(){

        const data = localStorage.getItem("PIMS_USER");

        if(!data){

            return null;

        }

        return JSON.parse(data);

    }

    isLoggedIn(){

        return this.getUser()!=null;

    }

    hasPermission(permission){

        const user=this.getUser();

        if(!user){

            return false;

        }

        if(user.role=="Super Administrator"){

            return true;

        }

        return user.permissions?.includes(permission);

    }

}

const Auth=new AuthManager();
