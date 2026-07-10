/* ==========================================================
   SHIBA PIMS
   Scanner (Phase 5) — verifies SHIBA QR codes ONLY.
   A code is valid only if its secret token exists in our
   database (verify_qr_token RPC). Forged, foreign, or
   revoked codes fail. Every verification is audited.
========================================================== */

const Scanner = {

    stream: null,

    scanning: false,

    /* ----------------------------------------------------- */
    /* token extraction — accepts a raw token or our          */
    /* scanner link (…/scanner.html?t=<token>)                */
    /* ----------------------------------------------------- */

    extractToken(text) {

        const value = (text || "").trim();

        if (!value) return null;

        try {

            const url = new URL(value);

            const t = new URLSearchParams(url.search).get("t");

            if (t) return t.trim();

        } catch (e) { /* not a URL — treat as raw token */ }

        return value;

    },

    /* ----------------------------------------------------- */
    /* verify + render                                        */
    /* ----------------------------------------------------- */

    async verify(text, source) {

        const token = this.extractToken(text);

        if (!token) return;

        const result = await CertificateService.verifyToken(token);

        this.renderResult(result, token);

        AuditService.log({
            action: result.valid
                ? (result.revoked ? "QR_SCAN_REVOKED" : "QR_SCAN_VALID")
                : "QR_SCAN_INVALID",
            target: result.valid
                ? result.certificate_id + " — " + (result.officer_name || "")
                : "unknown token",
            details: "via " + (source || "scanner")
        });

    },

    renderResult(result, token) {

        const card = document.getElementById("resultCard");

        const box = document.getElementById("scanResult");

        card.classList.remove("hidden");

        if (!result.valid) {

            box.innerHTML = `
                <div class="scanBad">

                    <div class="scanIcon">❌</div>

                    <h2>NOT A VALID SHIBA DOCUMENT</h2>

                    <p class="muted">This code is not in our records. It was
                       not issued by SHIBA PIMS${result.setup
                           ? " — or the certificate system setup " +
                             "(RUN-ALL-PENDING.sql) has not been run yet"
                           : ""}. Treat it as forged.</p>

                </div>`;

            card.scrollIntoView({ behavior: "smooth" });

            return;

        }

        const revoked = result.revoked;

        const pending = result.status === "Pending";

        const rejected = result.status === "Rejected";

        const good = !revoked && !pending && !rejected;

        const headline = revoked ? "⚫ DOCUMENT REVOKED"
            : rejected ? "🔴 DOCUMENT REJECTED"
            : pending ? "🟡 GENUINE — AWAITING APPROVAL"
            : "✅ VERIFIED SHIBA DOCUMENT";

        const rows = [
            ["Certificate", result.certificate_id],
            ["Type", result.type + (result.title &&
                result.title !== result.type ? " — " + result.title : "")],
            ["Officer", (result.officer_name || "—") +
                (result.officer_public_id ? " (" + result.officer_public_id + ")" : "")],
            ["Status", CertificateService.statusChip(result.status, revoked)],
            ["New rank", result.new_rank || null],
            ["Effective", result.effective_date || null],
            ["Issued by", result.issued_by || null],
            ["Approved by", result.approved_by || null]
        ].filter(r => r[1]);

        box.innerHTML = `
            <div class="${good ? "scanGood" : "scanWarn"}">

                <div class="scanIcon">${headline.slice(0, 2)}</div>

                <h2>${headline.slice(2).trim()}</h2>

                <div class="fieldGrid" style="margin-top:14px">
                    ${rows.map(([k, v]) =>
                        `<div class="fieldItem"><small>${k}</small><div>${v}</div></div>`
                    ).join("")}
                </div>

            </div>`;

        card.scrollIntoView({ behavior: "smooth" });

    },

    /* ----------------------------------------------------- */
    /* camera                                                 */
    /* ----------------------------------------------------- */

    async start() {

        const overlay = document.getElementById("scanOverlay");

        try {

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });

        } catch (e) {

            overlay.innerHTML =
                "<p class='muted'>Camera unavailable — allow camera " +
                "access, or use the manual check.</p>";

            return;

        }

        const video = document.getElementById("scanVideo");

        video.srcObject = this.stream;

        await video.play();

        overlay.style.display = "none";

        document.getElementById("scanStart").classList.add("hidden");

        document.getElementById("scanStop").classList.remove("hidden");

        this.scanning = true;

        this.tick();

    },

    tick() {

        if (!this.scanning) return;

        const video = document.getElementById("scanVideo");

        const canvas = document.getElementById("scanCanvas");

        if (video.readyState === video.HAVE_ENOUGH_DATA) {

            canvas.width = video.videoWidth;

            canvas.height = video.videoHeight;

            const ctx = canvas.getContext("2d", { willReadFrequently: true });

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const image = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const code = window.jsQR
                ? jsQR(image.data, image.width, image.height)
                : null;

            if (code && code.data) {

                this.stop();

                this.verify(code.data, "camera");

                return;

            }

        }

        requestAnimationFrame(() => this.tick());

    },

    stop() {

        this.scanning = false;

        if (this.stream) {

            this.stream.getTracks().forEach(t => t.stop());

            this.stream = null;

        }

        document.getElementById("scanOverlay").style.display = "";

        document.getElementById("scanStart").classList.remove("hidden");

        document.getElementById("scanStop").classList.add("hidden");

    },

    /* ----------------------------------------------------- */
    /* init                                                   */
    /* ----------------------------------------------------- */

    init() {

        document.getElementById("scanStart").onclick = () => this.start();

        document.getElementById("scanStop").onclick = () => this.stop();

        document.getElementById("manualVerify").onclick = () =>
            this.verify(document.getElementById("manualToken").value, "manual");

        document.getElementById("manualToken").addEventListener(
            "keydown", (e) => {

                if (e.key === "Enter") {

                    this.verify(e.target.value, "manual");

                }

            });

        /* opened from a QR link: /lapd/scanner.html?t=<token> */

        const t = new URLSearchParams(location.search).get("t");

        if (t) this.verify(t, "link");

    }

};

document.addEventListener("DOMContentLoaded", () => Scanner.init());

window.Scanner = Scanner;
