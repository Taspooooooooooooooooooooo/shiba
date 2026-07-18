/* ==========================================================
   SHIBA PIMS
   Scanner — verifies SHIBA PDF417 credentials ONLY.
   Certificates, officer ID cards and evidence labels all
   carry a SECRET token (never a link); a code is valid only
   if its token exists in our database (verify_scan_token
   RPC). Forged, foreign, or revoked codes fail. Every
   verification is audited. QR codes are retired.
========================================================== */

const Scanner = {

    stream: null,

    scanning: false,

    _frame: 0,

    _pdfReader: null,

    /* ----------------------------------------------------- */
    /* PDF417 decoding (ZXing)                                */
    /* ----------------------------------------------------- */

    pdfReader() {

        if (this._pdfReader) return this._pdfReader;

        if (!window.ZXing) return null;

        const hints = new Map();

        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,
            [ZXing.BarcodeFormat.PDF_417]);

        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

        this._pdfReader = new ZXing.MultiFormatReader();

        this._pdfReader.setHints(hints);

        return this._pdfReader;

    },

    decodePdf417(canvas) {

        const reader = this.pdfReader();

        if (!reader) return null;

        try {

            const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);

            const bitmap = new ZXing.BinaryBitmap(
                new ZXing.HybridBinarizer(source));

            const result = reader.decode(bitmap);

            return result ? result.getText() : null;

        } catch (e) {

            /* NotFoundException every frame without a barcode — normal */

            return null;

        }

    },

    /* ----------------------------------------------------- */
    /* verify — ONE call recognises certificate / officer /   */
    /* evidence tokens. Falls back to the certificate-only    */
    /* RPC until PATCH-13 is run.                             */
    /* ----------------------------------------------------- */

    async verifyToken(token) {

        if (!window.db) return { valid: false };

        try {

            const { data, error } = await db
                .rpc("verify_scan_token", { p_token: (token || "").trim() });

            if (!error && data) return data;

            /* RPC missing → PATCH-13 not run yet; certificates
               still verify through the old cert-only RPC */

            if (error && /find the function|does not exist|PGRST202/i
                    .test(error.message || "")) {

                const cert = await CertificateService.verifyToken(token);

                if (cert?.valid) cert.kind = "certificate";

                return cert || { valid: false };

            }

            return { valid: false };

        } catch (e) { return { valid: false }; }

    },

    async verify(text, source) {

        const parsed = BarcodeService.parse(text);

        if (!parsed) return;

        const result = await this.verifyToken(parsed.token);

        this.renderResult(result);

        const label =
            result.kind === "officer" ? result.officer_public_id + " — " +
                (result.officer_name || "")
            : result.kind === "evidence" ? result.evidence_id + " (" +
                (result.case_public_id || "no case") + ")"
            : result.valid ? result.certificate_id + " — " +
                (result.officer_name || "")
            : "unknown token";

        AuditService.log({
            action: result.valid
                ? (result.revoked ? "SCAN_REVOKED" : "SCAN_VALID")
                : "SCAN_INVALID",
            target: label,
            details: "PDF417 via " + (source || "scanner") +
                (result.kind ? " · " + result.kind : "")
        });

    },

    /* ----------------------------------------------------- */
    /* result rendering — per credential kind                 */
    /* ----------------------------------------------------- */

    fieldGrid(rows) {

        return `<div class="fieldGrid" style="margin-top:14px">` +
            rows.filter(r => r[1]).map(([k, v]) =>
                `<div class="fieldItem"><small>${k}</small><div>${v}</div></div>`
            ).join("") + `</div>`;

    },

    renderResult(result) {

        const card = document.getElementById("resultCard");

        const box = document.getElementById("scanResult");

        card.classList.remove("hidden");

        if (!result.valid) {

            box.innerHTML = `
                <div class="scanBad">

                    <div class="scanIcon">❌</div>

                    <h2>NOT A VALID SHIBA CREDENTIAL</h2>

                    <p class="muted">This code is not in our records. It was
                       not issued by SHIBA PIMS${result.setup
                           ? " — or the system setup " +
                             "(RUN-ALL-PENDING.sql) has not been run yet"
                           : ""}. Treat it as forged.</p>

                </div>`;

            card.scrollIntoView({ behavior: "smooth" });

            return;

        }

        let html = "";

        if (result.kind === "officer") {

            const bad = ["Suspended", "Terminated", "Retired"]
                .includes(result.status);

            html = `
                <div class="${bad ? "scanWarn" : "scanGood"}">

                    <div class="scanIcon">${bad ? "⚠️" : "👮"}</div>

                    <h2>${bad
                        ? "GENUINE ID — OFFICER " +
                          (result.status || "").toUpperCase()
                        : "VERIFIED SHIBA OFFICER"}</h2>

                    ${this.fieldGrid([
                        ["Officer", result.officer_name],
                        ["Officer ID", result.officer_public_id],
                        ["Badge", result.badge],
                        ["Rank", result.rank],
                        ["Division", result.division],
                        ["Status", result.status]
                    ])}

                </div>`;

        } else if (result.kind === "evidence") {

            html = `
                <div class="scanGood">

                    <div class="scanIcon">🧰</div>

                    <h2>VERIFIED EVIDENCE ITEM</h2>

                    ${this.fieldGrid([
                        ["Evidence", result.evidence_id],
                        ["Case", result.case_public_id],
                        ["Type", result.type],
                        ["Description", result.description],
                        ["File", result.file_name],
                        ["SHA-256", result.hash
                            ? result.hash.slice(0, 16) + "…" : null],
                        ["Logged by", result.uploaded_by],
                        ["Logged", result.created_at
                            ? new Date(result.created_at).toLocaleString()
                            : null]
                    ])}

                </div>`;

        } else {

            /* certificate (default kind) */

            const revoked = result.revoked;

            const pending = result.status === "Pending";

            const rejected = result.status === "Rejected";

            const good = !revoked && !pending && !rejected;

            const headline = revoked ? "⚫ DOCUMENT REVOKED"
                : rejected ? "🔴 DOCUMENT REJECTED"
                : pending ? "🟡 GENUINE — AWAITING APPROVAL"
                : "✅ VERIFIED SHIBA DOCUMENT";

            html = `
                <div class="${good ? "scanGood" : "scanWarn"}">

                    <div class="scanIcon">${headline.slice(0, 2)}</div>

                    <h2>${headline.slice(2).trim()}</h2>

                    ${this.fieldGrid([
                        ["Certificate", result.certificate_id],
                        ["Type", result.type + (result.title &&
                            result.title !== result.type
                                ? " — " + result.title : "")],
                        ["Officer", (result.officer_name || "—") +
                            (result.officer_public_id
                                ? " (" + result.officer_public_id + ")" : "")],
                        ["Status", CertificateService.statusChip(
                            result.status, revoked)],
                        ["New rank", result.new_rank || null],
                        ["Effective", result.effective_date || null],
                        ["Issued by", result.issued_by || null],
                        ["Approved by", result.approved_by || null]
                    ])}

                </div>`;

        }

        box.innerHTML = html;

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

            /* PDF417 decode is heavy — every 3rd frame keeps the
               preview smooth on phones */

            if (++this._frame % 3 === 0) {

                const strip = this.decodePdf417(canvas);

                if (strip) {

                    this.stop();

                    this.verify(strip, "camera");

                    return;

                }

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

        /* opened from a legacy link: /lapd/scanner.html?t=<token> */

        const t = new URLSearchParams(location.search).get("t");

        if (t) this.verify(t, "link");

    }

};

document.addEventListener("DOMContentLoaded", () => Scanner.init());

window.Scanner = Scanner;
