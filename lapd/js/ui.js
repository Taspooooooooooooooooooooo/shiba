/* ==========================================================
   SHIBA PIMS
   UI Manager
========================================================== */

class UIManager {

    constructor() {

        this.toastContainer = document.getElementById("toastContainer");

    }

    toast(message, type = "info") {

        const toast = document.createElement("div");

        toast.className = "toast " + type;

        toast.innerHTML = `
            <strong>${type.toUpperCase()}</strong><br>
            ${message}
        `;

        this.toastContainer.appendChild(toast);

        setTimeout(() => {

            toast.classList.add("show");

        }, 100);

        setTimeout(() => {

            toast.classList.remove("show");

            setTimeout(() => {

                toast.remove();

            }, 400);

        }, 3500);

    }

    success(message){

        this.toast(message,"success");

    }

    error(message){

        this.toast(message,"error");

    }

    warning(message){

        this.toast(message,"warning");

    }

    info(message){

        this.toast(message,"info");

    }

    loading(text="Loading..."){

        const overlay=document.getElementById("loadingOverlay");

        const label=document.getElementById("loadingText");

        if(label){

            label.innerText=text;

        }

        overlay.classList.remove("hidden");

    }

    hideLoading(){

        document
        .getElementById("loadingOverlay")
        .classList.add("hidden");

    }

}

const UI=new UIManager();
