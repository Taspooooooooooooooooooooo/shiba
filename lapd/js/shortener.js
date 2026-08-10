/* ==========================================================
   SHIBA PIMS
   SHIBA Links UI — create + manage short links tied to your
   account. The public redirect lives at /s/?<slug>.
========================================================== */

const Shortener = {

    mineOnly: true,

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    async init() {
        if (!window.db) return;
        this.renderForm();
        const mine = document.getElementById("shMine");
        mine.onchange = () => { this.mineOnly = mine.checked; this.load(); };
        await this.load();
    },

    renderForm() {

        const box = document.getElementById("shForm");
        box.innerHTML = "";

        const target = document.createElement("input");
        target.className = "uiModalInput shTarget";
        target.placeholder = "Long URL to shorten (https://…)";

        const slug = document.createElement("input");
        slug.className = "uiModalInput";
        slug.placeholder = "custom slug (optional)";
        slug.style.maxWidth = "190px";

        const title = document.createElement("input");
        title.className = "uiModalInput";
        title.placeholder = "label (optional)";
        title.style.maxWidth = "190px";

        const btn = document.createElement("button");
        btn.className = "primaryBtn";
        btn.innerHTML = pimsIcon("add", 15) + " Shorten";
        btn.onclick = async () => {
            btn.disabled = true;
            const r = await LinkService.create({
                targetUrl: target.value, slug: slug.value, title: title.value });
            btn.disabled = false;
            if (r.ok) {
                target.value = slug.value = title.value = "";
                this.mineOnly = true;
                document.getElementById("shMine").checked = true;
                this.load();
            }
        };

        box.append(target, slug, title, btn);

    },

    async load() {

        const out = document.getElementById("shList");

        const { rows, error } = await LinkService.list({ mine: this.mineOnly });

        if (error) {
            out.innerHTML = `<p class="muted">${this.esc(LinkService.SETUP_HINT)}</p>`;
            return;
        }

        if (!rows.length) {
            out.innerHTML = "<p class='muted'>No links yet — shorten one above.</p>";
            return;
        }

        out.innerHTML = "";

        const head = document.createElement("div");
        head.className = "shHead";
        head.innerHTML =
            "<span>Short link</span><span>Destination</span>" +
            "<span>Clicks</span><span>Status</span><span></span>";
        out.appendChild(head);

        rows.forEach(l => out.appendChild(this.row(l)));

    },

    row(l) {

        const short = LinkService.shortUrl(l.slug);

        const row = document.createElement("div");
        row.className = "shRow";

        row.innerHTML =
            `<span class="shSlug">
                <a href="${this.esc(short)}" target="_blank" rel="noopener">/s/?${
                    this.esc(l.slug)}</a>
                ${l.title ? `<small>${this.esc(l.title)}</small>` : ""}
             </span>
             <span class="shDest"><a href="${this.esc(l.target_url)}"
                target="_blank" rel="noopener">${this.esc(l.target_url)}</a>
                ${!this.mineOnly && l.created_by
                    ? `<small>by ${this.esc(l.created_by)}</small>` : ""}</span>
             <span class="shClicks">${l.clicks || 0}</span>
             <span>${l.active
                ? `<span class="dotChip"><i style="background:#22c55e"></i>Active</span>`
                : `<span class="dotChip"><i style="background:#6b7280"></i>Off</span>`}</span>
             <span class="shActions"></span>`;

        const acts = row.querySelector(".shActions");

        const copy = document.createElement("button");
        copy.className = "ghostBtn";
        copy.title = "Copy short link";
        copy.innerHTML = pimsIcon("attach", 14);
        copy.onclick = async () => {
            try { await navigator.clipboard.writeText(short); UI.success("Copied!"); }
            catch (e) { UI.error("Copy failed — select it manually."); }
        };

        const toggle = document.createElement("button");
        toggle.className = "ghostBtn";
        toggle.textContent = l.active ? "Disable" : "Enable";
        toggle.onclick = async () => {
            if (await LinkService.setActive(l, !l.active)) this.load();
        };

        const del = document.createElement("button");
        del.className = "ghostBtn";
        del.innerHTML = pimsIcon("delete", 14);
        del.title = "Delete";
        del.onclick = async () => {
            const ok = await UI.confirm({
                title: "Delete this short link?",
                message: "/s/?" + l.slug + " will stop working immediately.",
                confirmText: "Delete", danger: true });
            if (ok && await LinkService.remove(l)) this.load();
        };

        acts.append(copy, toggle, del);

        return row;

    }

};

document.addEventListener("DOMContentLoaded", () => Shortener.init());

window.Shortener = Shortener;
