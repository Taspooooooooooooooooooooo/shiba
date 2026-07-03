/* ==========================================================
   SHIBA PIMS
   Command Palette
   Version 1.0.0 Alpha
========================================================== */

class CommandPalette {

    constructor() {

        this.commands = [

            {
                title: "Dashboard",
                action: () => location.href = "dashboard.html"
            },

            {
                title: "Officer Management",
                action: () => location.href = "officers.html"
            },

            {
                title: "Cases",
                action: () => alert("Coming Soon")
            },

            {
                title: "Reports",
                action: () => alert("Coming Soon")
            },

            {
                title: "Certificates",
                action: () => alert("Coming Soon")
            },

            {
                title: "Vehicles",
                action: () => alert("Coming Soon")
            }

        ];

        this.create();

        this.registerEvents();

    }

    create() {

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

            item.innerText=command.title;

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
