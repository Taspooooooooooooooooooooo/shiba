/* ==========================================================
   SHIBA PIMS
   UI Manager
========================================================== */

class UIManager {

    constructor() {

        this.toastContainer = document.getElementById("toastContainer");

    }

    getContainer() {

        if (!this.toastContainer) {

            this.toastContainer = document.getElementById("toastContainer");

        }

        if (!this.toastContainer && document.body) {

            this.toastContainer = document.createElement("div");

            this.toastContainer.id = "toastContainer";

            document.body.appendChild(this.toastContainer);

        }

        return this.toastContainer;

    }

    toast(message, type = "info") {

        const container = this.getContainer();

        if (!container) return;

        const toast = document.createElement("div");

        toast.className = "toast " + type;

        toast.innerHTML = `
            <strong>${type.toUpperCase()}</strong><br>
            ${message}
        `;

        container.appendChild(toast);

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

    /* ---------------------------------------------------------
       In-app modal system — replaces the browser's native
       alert / confirm / prompt so every dialog lives inside
       the app and matches the theme.
    --------------------------------------------------------- */

    /* low-level: open a modal with custom body + buttons.
       `render(close)` builds the body; `buttons` is an array of
       { label, kind, value, autofocus }. Returns a Promise that
       resolves with the chosen button's `value` (or null if the
       backdrop / Esc closes it). */

    modal({ title = "", render, buttons = [], dismissable = true } = {}) {

        return new Promise(resolve => {

            const back = document.createElement("div");

            back.className = "uiModalBack";

            const card = document.createElement("div");

            card.className = "uiModal";

            let settled = false;

            const close = value => {

                if (settled) return;

                settled = true;

                back.classList.remove("show");

                setTimeout(() => back.remove(), 160);

                document.removeEventListener("keydown", onKey);

                resolve(value);

            };

            const onKey = e => {

                if (e.key === "Escape" && dismissable) close(null);

                if (e.key === "Enter" && e.ctrlKey) {

                    const primary = buttons.find(b => b.kind === "primary");

                    if (primary) close(primary.value);

                }

            };

            /* header */

            if (title) {

                const h = document.createElement("div");

                h.className = "uiModalHead";

                h.textContent = title;

                card.appendChild(h);

            }

            /* body */

            const body = document.createElement("div");

            body.className = "uiModalBody";

            if (typeof render === "function") {

                const out = render(close);

                if (out instanceof Node) body.appendChild(out);

                else if (typeof out === "string") body.innerHTML = out;

            }

            card.appendChild(body);

            /* footer buttons */

            if (buttons.length) {

                const foot = document.createElement("div");

                foot.className = "uiModalFoot";

                buttons.forEach(b => {

                    const btn = document.createElement("button");

                    btn.className =
                        b.kind === "danger" ? "dangerBtn"
                        : b.kind === "primary" ? "primaryBtn"
                        : "ghostBtn";

                    btn.textContent = b.label;

                    btn.onclick = () => close(b.value);

                    if (b.autofocus) setTimeout(() => btn.focus(), 30);

                    foot.appendChild(btn);

                });

                card.appendChild(foot);

            }

            back.appendChild(card);

            back.onclick = e => {

                if (e.target === back && dismissable) close(null);

            };

            document.addEventListener("keydown", onKey);

            document.body.appendChild(back);

            requestAnimationFrame(() => back.classList.add("show"));

        });

    }

    /* yes/no confirm → Promise<boolean> */

    confirm({ title = "Are you sure?", message = "",
              confirmText = "Confirm", cancelText = "Cancel",
              danger = false } = {}) {

        return this.modal({
            title,
            render: () => {
                const p = document.createElement("p");
                p.className = "uiModalMsg";
                p.textContent = message;
                return p;
            },
            buttons: [
                { label: cancelText, kind: "ghost", value: false },
                { label: confirmText, kind: danger ? "danger" : "primary",
                  value: true, autofocus: true }
            ]
        }).then(v => v === true);

    }

    /* single text field → Promise<string|null>. `multiline`
       renders a textarea; `required` blocks empty confirms. */

    promptText({ title = "", message = "", label = "", placeholder = "",
                 value = "", multiline = false, required = false,
                 confirmText = "Save", cancelText = "Cancel" } = {}) {

        let field;

        return this.modal({
            title,
            render: () => {

                const wrap = document.createElement("div");

                if (message) {
                    const m = document.createElement("p");
                    m.className = "uiModalMsg";
                    m.textContent = message;
                    wrap.appendChild(m);
                }

                if (label) {
                    const l = document.createElement("label");
                    l.className = "wizLabel";
                    l.textContent = label;
                    wrap.appendChild(l);
                }

                field = document.createElement(multiline ? "textarea" : "input");
                field.className = "uiModalInput";
                field.placeholder = placeholder;
                field.value = value;
                if (multiline) field.rows = 4;
                setTimeout(() => field.focus(), 30);
                wrap.appendChild(field);

                return wrap;
            },
            buttons: [
                { label: cancelText, kind: "ghost", value: "\0cancel" },
                { label: confirmText, kind: "primary", value: "\0ok" }
            ]
        }).then(choice => {

            if (choice !== "\0ok") return null;

            const text = (field?.value || "").trim();

            if (required && !text) {
                this.warning("Please write something first.");
                return this.promptText({ title, message, label, placeholder,
                    value: field?.value || "", multiline, required,
                    confirmText, cancelText });
            }

            return text;

        });

    }

}

const UI=new UIManager();
