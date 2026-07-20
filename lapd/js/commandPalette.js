/* ==========================================================
   SHIBA PIMS
   Command Palette
   Version 1.0.0 Alpha
========================================================== */

class CommandPalette {

    constructor() {

        this.commands = [

            /* --- navigation --- */
            { title: "Dashboard", icon: "dashboard",
              action: () => location.href = "dashboard.html" },

            { title: "Officers", icon: "officers",
              action: () => location.href = "officers.html" },

            { title: "Cases", icon: "cases",
              action: () => location.href = "cases.html" },

            { title: "Certificates", icon: "verified",
              action: () => location.href = "certificates.html" },

            { title: "Certificate Studio", icon: "verified",
              action: () => location.href = "cert-studio.html" },

            { title: "Scanner — verify a credential", icon: "scanner",
              action: () => location.href = "scanner.html" },

            { title: "Applications", icon: "bookings",
              action: () => location.href = "applications.html" },

            { title: "Permissions Reference", icon: "access",
              action: () => location.href = "permissions.html" },

            { title: "Cloud", icon: "cloud",
              action: () => location.href = "../cloud/" },

            { title: "Settings", icon: "settings",
              action: () => location.href = "settings.html" },

            /* --- quick actions --- */
            { title: "＋ Create Officer",
              action: () => location.href = "officers.html?create=1" },

            { title: "＋ Create Case",
              action: () => location.href = "cases.html" },

            { title: "Issue Certificate", icon: "verified",
              action: () => location.href = "cert-studio.html" },

            { title: "Search Officers", icon: "search",
              action: () => location.href = "officers.html" },

            /* --- account --- */
            { title: "Log out", icon: "signout",
              action: () => { if (window.Auth) Auth.logout();
                  else { localStorage.clear(); location.href = "index.html"; } } }

        ];

        this.create();

        this.registerEvents();

    }

    create() {

        if (!document.body) {

            document.addEventListener("DOMContentLoaded", () => this.create());

            return;

        }

        document.body.insertAdjacentHTML("beforeend", `

<div id="commandPalette" class="hidden">

    <div class="commandBox">

        <input
            id="commandSearch"
            placeholder="Search everything...">

        <div id="commandResults"></div>

    </div>

</div>

`);

        this.render(this.commands);

    }

    registerEvents() {

        document.addEventListener("keydown",(e)=>{

            if(e.ctrlKey && e.key.toLowerCase()=="k"){

                e.preventDefault();

                this.open();

            }

            if(e.key=="Escape"){

                this.close();

            }

        });

        document.addEventListener("input",(e)=>{

            if(e.target.id!="commandSearch") return;

            const value=e.target.value.toLowerCase();

            const filtered=this.commands.filter(c=>

                c.title.toLowerCase().includes(value)

            );

            this.render(filtered);

        });

    }

    render(list){

        const container=document.getElementById("commandResults");

        container.innerHTML="";

        list.forEach(command=>{

            const item=document.createElement("div");

            item.className="commandItem";

            item.innerHTML=(window.pimsIcon && command.icon ? pimsIcon(command.icon, 15) + " " : "") + command.title;

            item.onclick=()=>{

                this.close();

                command.action();

            }

            container.appendChild(item);

        });

    }

    open(){

        document
        .getElementById("commandPalette")
        .classList.remove("hidden");

        document
        .getElementById("commandSearch")
        .focus();

    }

    close(){

        const palette=document.getElementById("commandPalette");

        if(!palette) return;

        palette.classList.add("hidden");

    }

}

const Palette=new CommandPalette();
