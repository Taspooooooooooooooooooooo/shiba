/* ==========================================================
   SHIBA PIMS
   BodycamUI (Phase 8 · Sprint 8.3) — shared bodycam UI reused
   by the Shift File Bodycam tab and the Bodycam Dashboard:
     • the multi-step Upload Wizard (hash → upload → verify → done)
     • the integrity re-verify action (re-hash the stored file)
     • session status + integrity badges
========================================================== */

const BodycamUI = {

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    statusBadge(session) {
        const c = BodycamService.STATUS_COLORS[session.status] || "#6b7280";
        return `<span class="dotChip"><i style="background:${c}"></i>${
            this.esc(session.status)}</span>`;
    },

    integrityBadge(session) {
        const st = session.integrity_status || "Unverified";
        const c = BodycamService.INTEGRITY_COLORS[st] || "#9ca3af";
        return `<span class="dotChip"><i style="background:${c}"></i>${
            this.esc(st)}</span>`;
    },

    /* ----------------------------------------------------- */
    /* the Upload Wizard                                      */
    /* ----------------------------------------------------- */

    uploadWizard(shift, session, onComplete) {

        let running = false;

        const overlay = document.createElement("div");
        overlay.className = "uiModalBack";
        overlay.innerHTML =
            `<div class="uiModal">
                <div class="uiModalHead">Upload bodycam footage · ${
                    this.esc(session.session_id || "")}</div>
                <div class="uiModalBody" id="bcuBody"></div>
                <div class="uiModalFoot" id="bcuFoot"></div>
             </div>`;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("show"));

        const close = () => {
            overlay.classList.remove("show");
            setTimeout(() => overlay.remove(), 160);
        };

        overlay.onclick = e => {
            if (e.target === overlay && !running) close();
        };

        const body = overlay.querySelector("#bcuBody");
        const foot = overlay.querySelector("#bcuFoot");

        /* ---- step 1: choose the file ---- */

        const renderPick = () => {

            body.innerHTML =
                `<p class="uiModalMsg">Choose the footage for this clip. It's
                    hashed (SHA-256), uploaded through SHIBA Cloud, then
                    <b>verified against that hash</b> so any later tampering
                    is detectable.</p>`;

            const file = document.createElement("input");
            file.type = "file";
            file.className = "uiModalInput";
            file.accept = "video/*,audio/*,image/*";
            body.appendChild(file);

            foot.innerHTML = "";

            const cancel = document.createElement("button");
            cancel.className = "ghostBtn";
            cancel.textContent = "Cancel";
            cancel.onclick = () => close();

            const go = document.createElement("button");
            go.className = "primaryBtn";
            go.textContent = "Upload";
            go.onclick = () => {
                if (!file.files[0]) { UI.error("Choose a file first."); return; }
                run(file.files[0]);
            };

            foot.append(cancel, go);

        };

        /* ---- the pipeline view ---- */

        const STEPS = [
            ["Integrity hash", "computing SHA-256"],
            ["Upload", "sending to SHIBA Cloud"],
            ["Verify", "re-hashing the stored copy"],
            ["Completed", ""]
        ];

        const renderPipeline = (states, note) => {

            body.innerHTML =
                `<div class="bcuPipe">` +
                STEPS.map((s, i) => {
                    const st = states[i] || "pending";
                    const icon = st === "done" ? pimsIcon("verified", 16)
                        : st === "fail" ? pimsIcon("alerts", 16)
                        : st === "active" ? `<span class="bcuSpin"></span>`
                        : `<span class="bcuDotPend"></span>`;
                    return `<div class="bcuStep ${st}">
                        <span class="bcuStepIcon">${icon}</span>
                        <span class="bcuStepText"><b>${this.esc(s[0])}</b>
                        ${s[1] ? `<small>${this.esc(s[1])}</small>` : ""}</span>
                    </div>`;
                }).join("") +
                `</div>` +
                (note ? `<div class="bcuNote">${note}</div>` : "");

        };

        /* ---- run the pipeline ---- */

        const run = async (file) => {

            running = true;
            foot.innerHTML = "";

            const st = ["active", "pending", "pending", "pending"];
            renderPipeline(st);

            /* 1 — hash */
            let hash;
            try {
                hash = await BodycamService.sha256(file);
            } catch (e) {
                st[0] = "fail"; renderPipeline(st,
                    `<span style="color:#ef4444">Could not read the file.</span>`);
                running = false; return finish(false);
            }
            st[0] = "done"; st[1] = "active";
            renderPipeline(st,
                `<div class="bcuHash">SHA-256 · ${this.esc(hash)}</div>`);

            /* 2 — upload (reusing the hash) */
            const up = await BodycamService.uploadFootage(shift, session, file, hash);
            if (!up.ok) {
                st[1] = "fail"; renderPipeline(st,
                    `<span style="color:#ef4444">Upload failed.</span>`);
                running = false; return finish(false);
            }
            const fresh = up.session || session;
            st[1] = "done"; st[2] = "active";
            renderPipeline(st,
                `<div class="bcuHash">SHA-256 · ${this.esc(hash)}</div>`);

            /* 3 — verify (re-hash the stored file) */
            const ver = await BodycamService.verifyIntegrity(shift, fresh);
            if (!ver.ok) {
                /* uploaded fine, but couldn't fetch back to verify */
                st[2] = "fail"; st[3] = "done";
                renderPipeline(st,
                    `<div class="bcuNoteWarn">${pimsIcon("alerts", 13)}
                     Uploaded, but the stored copy couldn't be fetched to
                     verify right now. You can re-run Verify later.</div>`);
                running = false; return finish(true, fresh);
            }
            st[2] = "done"; st[3] = "done";
            renderPipeline(st, ver.match
                ? `<div class="bcuNoteOk">${pimsIcon("verified", 13)}
                   Verified — the stored footage matches its hash.</div>`
                : `<div class="bcuNoteWarn">${pimsIcon("alerts", 13)}
                   TAMPER ALERT — the stored file does not match its hash.
                   Supervisors have been notified.</div>`);

            running = false;
            finish(true, fresh);

        };

        const finish = (ok, fresh) => {
            foot.innerHTML = "";
            const done = document.createElement("button");
            done.className = "primaryBtn";
            done.textContent = "Done";
            done.onclick = () => { close(); if (onComplete) onComplete(fresh); };
            foot.appendChild(done);
        };

        renderPick();

    },

    /* ----------------------------------------------------- */
    /* re-verify an already-uploaded clip                     */
    /* ----------------------------------------------------- */

    async verify(shift, session, onDone) {

        const overlay = document.createElement("div");
        overlay.className = "uiModalBack show";
        overlay.innerHTML =
            `<div class="uiModal">
                <div class="uiModalHead">Verifying integrity</div>
                <div class="uiModalBody">
                    <div class="bcuStep active">
                        <span class="bcuStepIcon"><span class="bcuSpin"></span></span>
                        <span class="bcuStepText"><b>Re-hashing stored footage</b>
                        <small>${this.esc(session.session_id || "")}</small></span>
                    </div>
                </div>
             </div>`;

        document.body.appendChild(overlay);

        const res = await BodycamService.verifyIntegrity(shift, session);

        overlay.remove();

        if (onDone) onDone(res);

        return res;

    }

};

window.BodycamUI = BodycamUI;
