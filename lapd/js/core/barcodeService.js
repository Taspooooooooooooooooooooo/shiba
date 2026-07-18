/* ==========================================================
   SHIBA PIMS — Core Service
   BarcodeService — every scannable credential in the system
   is a PDF417 stack (the symbology on real driver's licences
   and police credentials). QR codes are retired.

   The payload NEVER carries a link — only a branded record
   whose last segment is a SECRET token:

     SHIBA|CERT|<certificate_id>|<officer_id>|<token>
     SHIBA|OFCR|<officer_id>|<badge>|<token>
     SHIBA|EVID|<evidence_id>|<case_id>|<token>

   The token is the only authority: the scanner's
   verify_scan_token() RPC checks it against OUR database, so
   a hand-crafted barcode with an invented token fails.

   Requires the bwip-js CDN script on any page that renders.
========================================================== */

const BarcodeService = {

    PREFIX: "SHIBA",

    /* ----------------------------------------------------- */
    /* payload builders                                       */
    /* ----------------------------------------------------- */

    certificate(cert) {

        if (!cert) return "";

        return [
            this.PREFIX, "CERT",
            cert.certificate_id || "",
            cert.officers?.officer_id || cert.officer_public_id || "",
            cert.qr_token || ""
        ].join("|");

    },

    officer(officer) {

        if (!officer || !officer.scan_token) return "";

        return [
            this.PREFIX, "OFCR",
            officer.officer_id || "",
            officer.badge_number || officer.badge || "",
            officer.scan_token
        ].join("|");

    },

    evidence(ev, casePublicId) {

        if (!ev || !ev.scan_token) return "";

        return [
            this.PREFIX, "EVID",
            ev.evidence_id || "",
            casePublicId || "",
            ev.scan_token
        ].join("|");

    },

    /* parse a scanned payload → { kind, token } (kind null for
       raw tokens or scanner links) */

    parse(text) {

        const value = (text || "").trim();

        if (!value) return null;

        if (value.startsWith(this.PREFIX + "|")) {

            const parts = value.split("|");

            const token = parts[parts.length - 1].trim();

            if (!token) return null;

            return { kind: parts[1] || null, token: token };

        }

        try {

            const url = new URL(value);

            const t = new URLSearchParams(url.search).get("t");

            if (t) return { kind: null, token: t.trim() };

        } catch (e) { /* not a URL — raw token */ }

        return { kind: null, token: value };

    },

    /* ----------------------------------------------------- */
    /* rendering — crisp SVG, sized to scan easily from a     */
    /* phone screen or a print                                */
    /* ----------------------------------------------------- */

    renderPdf417(container, payload, opts = {}) {

        if (!container) return false;

        container.innerHTML = "";

        if (!window.bwipjs || !payload) {

            container.innerHTML =
                "<small class='muted'>Barcode unavailable</small>";

            return false;

        }

        try {

            const svg = bwipjs.toSVG({
                bcid: "pdf417",
                text: payload,
                scale: opts.scale || 4,
                height: opts.height || 15,
                columns: opts.columns || 5,
                padding: 2,
                backgroundcolor: "FFFFFF"
            });

            container.innerHTML = svg;

            return true;

        } catch (e) {

            console.warn("PDF417 render failed:", e);

            container.innerHTML =
                "<small class='muted'>Barcode unavailable</small>";

            return false;

        }

    }

};

window.BarcodeService = BarcodeService;
