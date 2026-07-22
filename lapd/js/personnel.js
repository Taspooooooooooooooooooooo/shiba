/* ==========================================================
   SHIBA PIMS
   Personnel File (Phase 2)
   One page per officer: profile header + tabs for General,
   Timeline, Audit, Cases, Certificates. Every opening of a
   file is itself audit-logged.
========================================================== */

const Personnel = {

    officer: null,

    loaded: {
        timeline: false, audit: false, cases: false,
        career: false, stats: false, inbox: false, notes: false,
        perms: false, certs: false, apps: false, shifts: false
    },

    /* ----------------------------------------------------- */
    /* header + general tab                                   */
    /* ----------------------------------------------------- */

    async renderHeader() {

        const o = this.officer;

        document.getElementById("pfName").textContent = o.name;

        document.getElementById("pfSubtitle").textContent =
            o.rank + (o.division !== "—" ? " · " + o.division : "");

        document.getElementById("pfIds").textContent =
            o.officerId + " · " + o.badge;

        const status = document.getElementById("pfStatus");

        status.innerHTML = Officers.getStatus(o.status);

        status.classList.toggle("onduty", o.status === "On Duty");

        const photo = document.getElementById("pfPhoto");

        photo.src = (await resolveCloudPhoto(o.photo)) ||
            "https://via.placeholder.com/110";

    },

    async renderGeneral() {

        const o = this.officer;

        let account = "not activated";

        if (o.userId && window.db) {

            const { data } = await db
                .from("users")
                .select("username")
                .eq("id", o.userId)
                .maybeSingle();

            if (data?.username) account = "@" + data.username;

        }

        const raw = this.raw || {};

        const fields = [
            ["Officer ID", o.officerId],
            ["Badge", o.badge],
            ["Rank", o.rank],
            ["Division", o.division],
            ["Status", o.status],
            ["Phone", o.phone || "—"],
            ["Email", o.email || "—"],
            ["Account", account],
            ["Notes", o.notes || "—"],
            ["Joined", raw.hire_date || (raw.created_at
                ? new Date(raw.created_at).toLocaleDateString() : "—")],
            ["Last update", raw.updated_at
                ? new Date(raw.updated_at).toLocaleString() : "—"],
            ["UUID", o.id]
        ];

        const grid = document.getElementById("pfGeneral");

        grid.innerHTML = "";

        fields.forEach(([label, value]) => {

            const item = document.createElement("div");

            item.className = "fieldItem";

            const l = document.createElement("small");

            l.textContent = label;

            const v = document.createElement("div");

            v.textContent = value || "—";

            item.append(l, v);

            grid.appendChild(item);

        });

    },

    /* ----------------------------------------------------- */
    /* lazy tabs                                              */
    /* ----------------------------------------------------- */

    feedRow(container, time, action, detail, id) {

        const item = document.createElement("div");

        item.className = "feedItem";

        const t = document.createElement("span");

        t.className = "feedTime";

        t.textContent = time;

        const a = document.createElement("strong");

        a.textContent = action;

        const d = document.createElement("span");

        d.className = "feedTarget";

        d.textContent = detail || "";

        const i = document.createElement("small");

        i.textContent = id || "";

        item.append(t, a, d, i);

        container.appendChild(item);

    },

    async renderTimeline() {

        if (this.loaded.timeline) return;

        this.loaded.timeline = true;

        const box = document.getElementById("pfTimeline");

        const entries = await TimelineService.list(this.officer.id, 100);

        box.innerHTML = "";

        if (!entries.length) {

            box.innerHTML = "<p class='muted'>No career events yet.</p>";

            return;

        }

        entries.forEach(e => this.feedRow(box,
            new Date(e.created_at).toLocaleString(),
            e.action, e.details, ""));

    },

    async renderAudit() {

        if (this.loaded.audit) return;

        this.loaded.audit = true;

        const box = document.getElementById("pfAudit");

        const entries = await AuditService.list(50, this.officer.id);

        box.innerHTML = "";

        if (!entries.length) {

            box.innerHTML = "<p class='muted'>No audit entries yet.</p>";

            return;

        }

        const pretty = a => (a || "").toLowerCase().split("_")
            .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

        entries.forEach(e => this.feedRow(box,
            new Date(e.created_at).toLocaleString(),
            pretty(e.action),
            e.target, e.action_id));

    },

    async renderCases() {

        if (this.loaded.cases) return;

        this.loaded.cases = true;

        const box = document.getElementById("pfCases");

        /* every case this officer is on — lead or assigned — via
           case_assignments (the lead is stored there too). */

        const { data, error } = await db
            .from("case_assignments")
            .select("role, assigned_at, " +
                "cases(id, case_id, title, status, updated_at)")
            .eq("officer_id", this.officer.id)
            .order("assigned_at", { ascending: false });

        box.innerHTML = "";

        if (error) {

            box.innerHTML =
                "<p class='muted'>Cases need a one-time setup — run " +
                "lapd/SETUP-PATCH-11.sql (or RUN-ALL-PENDING.sql) in the " +
                "Supabase SQL Editor.</p>";

            return;

        }

        const rows = (data || []).filter(r => r.cases);

        if (!rows.length) {

            box.innerHTML =
                "<p class='muted'>Not assigned to any cases yet.</p>";

            return;

        }

        const chip = s =>
            window.CaseService ? CaseService.statusChip(s) : (s || "—");

        rows.forEach(r => {

            const c = r.cases;

            const item = document.createElement("a");

            item.className = "feedItem pfCaseLink";

            item.href = "case.html?id=" + encodeURIComponent(c.id);

            const time = document.createElement("span");
            time.className = "feedTime";
            time.textContent =
                new Date(c.updated_at || r.assigned_at).toLocaleDateString();

            const id = document.createElement("strong");
            id.textContent = c.case_id;

            const detail = document.createElement("span");
            detail.className = "feedTarget";
            detail.textContent = (c.title || "") + " · ";
            detail.insertAdjacentHTML("beforeend", chip(c.status));

            const role = document.createElement("small");
            role.textContent = r.role;

            item.append(time, id, detail, role);

            box.appendChild(item);

        });

    },

    /* ----------------------------------------------------- */
    /* career (rank changes from the timeline)                */
    /* ----------------------------------------------------- */

    async renderCareer() {

        if (this.loaded.career) return;

        this.loaded.career = true;

        const box = document.getElementById("pfCareer");

        const events = await TimelineService.list(this.officer.id, 200);

        /* joined + every promotion, oldest first */

        const steps = events
            .filter(e => /promot|created|rank/i.test(e.action))
            .reverse();

        box.innerHTML =
            `<p class="muted" style="margin-bottom:14px">Current rank: ` +
            `<b style="color:var(--text)">${this.officer.rank}</b></p>`;

        if (!steps.length) {

            box.innerHTML += "<p class='muted'>No career events yet.</p>";

            return;

        }

        const ladder = document.createElement("div");

        ladder.className = "career";

        steps.forEach((e, i) => {

            const node = document.createElement("div");

            node.className = "careerStep";

            const date = new Date(e.created_at);

            const next = steps[i + 1]
                ? new Date(steps[i + 1].created_at)
                : new Date();

            const days = Math.max(0,
                Math.round((next - date) / 86400000));

            node.innerHTML = `
                <span class="dot"></span>
                <div>
                    <strong>${e.action}</strong>
                    <small>${date.toLocaleDateString()} · ${days} day${days === 1 ? "" : "s"} at this stage</small>
                    ${e.details ? "<span class='muted'>" + e.details + "</span>" : ""}
                </div>
            `;

            ladder.appendChild(node);

        });

        box.appendChild(ladder);

    },

    /* ----------------------------------------------------- */
    /* statistics                                             */
    /* ----------------------------------------------------- */

    async renderStats() {

        if (this.loaded.stats) return;

        this.loaded.stats = true;

        const box = document.getElementById("pfStats");

        const id = this.officer.id;

        const countEq = async (table, col, value) => {

            const { count, error } = await db
                .from(table)
                .select("*", { count: "exact", head: true })
                .eq(col, value);

            return error ? "—" : (count || 0);

        };

        const timeline = await TimelineService.list(id, 500);

        const promotions = timeline
            .filter(e => /promot/i.test(e.action)).length;

        const stats = [
            ["Cases", await countEq("case_assignments", "officer_id", id)],
            ["Reports", await countEq("reports", "officer_id", id)],
            ["Promotions", promotions],
            ["Timeline Events", timeline.length],
            ["Audit Events", (await AuditService.list(500, id)).length],
            ["Certificates", "—"]
        ];

        box.innerHTML = "";

        stats.forEach(([label, value]) => {

            const card = document.createElement("div");

            card.className = "card";

            card.innerHTML = `<h3>${label}</h3><h1>${value}</h1>`;

            box.appendChild(card);

        });

    },

    /* ----------------------------------------------------- */
    /* inbox (this officer's notifications)                   */
    /* ----------------------------------------------------- */

    async renderInbox() {

        if (this.loaded.inbox) return;

        this.loaded.inbox = true;

        const box = document.getElementById("pfInbox");

        if (!this.officer.userId) {

            box.innerHTML =
                "<p class='muted'>This officer has not activated an " +
                "account yet, so they have no inbox.</p>";

            return;

        }

        const items = await NotificationService.list(this.officer.userId, 50);

        box.innerHTML = "";

        if (!items.length) {

            box.innerHTML = "<p class='muted'>No messages.</p>";

            return;

        }

        items.forEach(n => {

            const row = document.createElement("div");

            row.className = "inboxItem" + (n.is_read ? "" : " unread");

            row.innerHTML = `
                <div class="inboxHead">
                    <strong>${n.title || "Notification"}</strong>
                    <small>${new Date(n.created_at).toLocaleString()}</small>
                </div>
                <p>${n.message || ""}</p>
                <small class="muted">${n.notification_id || ""}</small>
            `;

            if (!n.is_read) {

                row.onclick = async () => {

                    await NotificationService.markRead(n.id);

                    row.classList.remove("unread");

                };

            }

            box.appendChild(row);

        });

    },

    /* ----------------------------------------------------- */
    /* leadership notes                                       */
    /* ----------------------------------------------------- */

    async renderNotes() {

        if (this.loaded.notes) return;

        this.loaded.notes = true;

        const box = document.getElementById("pfNotes");

        const canWrite = await PermissionService.can("notes.write");

        const compose = document.getElementById("pfNotesCompose");

        if (canWrite && compose) {

            compose.classList.remove("step-hidden");

            document.getElementById("pfNoteAdd").onclick = () =>
                this.addNote();

        }

        const { data, error } = await db
            .from("leadership_notes")
            .select("*")
            .eq("officer_id", this.officer.id)
            .order("created_at", { ascending: false });

        if (error) {

            box.innerHTML =
                "<p class='muted'>Leadership notes need a one-time setup " +
                "— run lapd/SETUP-PATCH-4.sql in the Supabase SQL Editor.</p>";

            return;

        }

        box.innerHTML = "";

        if (!data.length) {

            box.innerHTML = "<p class='muted'>No leadership notes yet.</p>";

            return;

        }

        data.forEach(n => {

            const row = document.createElement("div");

            row.className = "noteItem";

            row.innerHTML = `
                <p>${n.note}</p>
                <small class="muted">— ${n.author_name || "Leadership"}` +
                `${n.author_role ? " (" + n.author_role + ")" : ""} · ` +
                `${new Date(n.created_at).toLocaleString()}</small>
            `;

            box.appendChild(row);

        });

    },

    async addNote() {

        const input = document.getElementById("pfNoteInput");

        const text = input.value.trim();

        if (!text) return;

        const author = localStorage.getItem("username") || "Leadership";

        const role = localStorage.getItem("role") || "";

        const { error } = await db
            .from("leadership_notes")
            .insert([{
                officer_id: this.officer.id,
                author_name: author,
                author_role: role,
                note: text
            }]);

        if (error) {

            UI?.error("Could not save note (run SETUP-PATCH-4.sql).");

            return;

        }

        AuditService.log({
            action: "LEADERSHIP_NOTE_ADDED",
            target: this.officer.officerId + " " + this.officer.name,
            officerId: this.officer.id
        });

        TimelineService.add(this.officer.id, "Leadership note added");

        input.value = "";

        this.loaded.notes = false;

        this.renderNotes();

        UI?.success("Note added");

    },

    /* ----------------------------------------------------- */
    /* permissions (what this rank grants)                    */
    /* ----------------------------------------------------- */

    async renderPerms() {

        if (this.loaded.perms) return;

        this.loaded.perms = true;

        const box = document.getElementById("pfPerms");

        const tier = PermissionService.tierForRank(this.officer.rank);

        const granted = PermissionService.permsForRole(tier);

        const has = (action) =>
            granted.some(g => PermissionService.matches(g, action));

        box.innerHTML =
            `<p class="muted" style="margin-bottom:14px">Rank ` +
            `<b style="color:var(--text)">${this.officer.rank}</b> ` +
            `(permission tier: ${tier})</p>`;

        /* full catalogue, grouped by module, with ✓ / ✕ */

        Object.entries(PermissionService.CATALOG).forEach(([group, perms]) => {

            const heading = document.createElement("h4");

            heading.textContent = group;

            heading.style.margin = "14px 0 8px";

            box.appendChild(heading);

            const list = document.createElement("div");

            list.className = "permGrid";

            perms.forEach(([action, label]) => {

                const ok = has(action);

                const item = document.createElement("div");

                item.className = "permItem" + (ok ? "" : " denied");

                item.textContent = (ok ? "✓ " : "✕ ") + label;

                list.appendChild(item);

            });

            box.appendChild(list);

        });

        /* -------- Permission Groups (Part 2) -------- */

        const groupsWrap = document.createElement("div");

        groupsWrap.style.marginTop = "22px";

        const gh = document.createElement("h4");

        gh.textContent = "Permission Groups";

        gh.style.marginBottom = "8px";

        groupsWrap.appendChild(gh);

        const assigned = this.officer.groups || [];

        const canManage = await PermissionService.can("permissions.grant");

        const gList = document.createElement("div");

        gList.className = "permGrid";

        Object.entries(PermissionService.GROUPS).forEach(([key, group]) => {

            const on = assigned.includes(key);

            const item = document.createElement("label");

            item.className = "groupItem" + (on ? " on" : "");

            const perms = group.permissions.join(", ");

            item.innerHTML =
                (canManage
                    ? `<input type="checkbox" data-group="${key}" ${on ? "checked" : ""}> `
                    : (on ? "✓ " : "✕ ")) +
                `<b>${group.label}</b><br><small>${group.description}</small>` +
                `<small class="muted">${perms}</small>`;

            gList.appendChild(item);

        });

        groupsWrap.appendChild(gList);

        if (canManage) {

            const saveBtn = document.createElement("button");

            saveBtn.className = "primaryBtn";

            saveBtn.style.marginTop = "12px";

            saveBtn.textContent = "Save groups";

            saveBtn.onclick = () => this.saveGroups();

            groupsWrap.appendChild(saveBtn);

        }

        box.appendChild(groupsWrap);

        /* -------- Temporary Permissions (Part 3) -------- */

        const tempWrap = document.createElement("div");

        tempWrap.id = "pfTempPerms";

        tempWrap.style.marginTop = "22px";

        box.appendChild(tempWrap);

        await this.renderTempPerms(canManage);

        const note = document.createElement("p");

        note.className = "muted";

        note.style.marginTop = "14px";

        note.textContent =
            "Division, resource, and ownership rules are enforced by the " +
            "Policy Engine and apply automatically where relevant.";

        box.appendChild(note);

    },

    /* ----------------------------------------------------- */
    /* certificates (Phase 5)                                 */
    /* ----------------------------------------------------- */

    async renderCerts() {

        if (this.loaded.certs) return;

        this.loaded.certs = true;

        const box = document.getElementById("pfCerts");

        const { rows, error } =
            await CertificateService.forOfficer(this.officer.id);

        if (error) {

            box.innerHTML =
                `<p class="muted">${CertificateService.SETUP_HINT}</p>`;

            return;

        }

        box.innerHTML = "";

        if (await PermissionService.can("certificates.issue")) {

            const issueBtn = document.createElement("button");

            issueBtn.className = "primaryBtn";

            issueBtn.style.marginBottom = "14px";

            issueBtn.textContent = "Issue certificate for " +
                this.officer.name;

            issueBtn.onclick = () =>
                location.href = "cert-studio.html?officer=" +
                    this.officer.id;

            box.appendChild(issueBtn);

        }

        if (!rows.length) {

            const p = document.createElement("p");

            p.className = "muted";

            p.textContent = "No certificates yet.";

            box.appendChild(p);

            return;

        }

        rows.forEach(c => {

            const row = document.createElement("div");

            row.className = "certItem";

            row.innerHTML =
                `<div class="certInfo">` +
                `<strong>${c.certificate_id || "—"}</strong> ` +
                `<span class="grantKind">${c.type}</span>` +
                `<span class="certStatus">` +
                CertificateService.statusChip(c.status, c.revoked_at) +
                `</span>` +
                `<small>${c.new_rank_name ? "→ " + c.new_rank_name + " · " : ""}` +
                `${c.reason ? c.reason + " · " : ""}` +
                `${new Date(c.created_at).toLocaleDateString()}` +
                `${c.approved_by ? " · approved by " + c.approved_by : ""}</small>` +
                `</div>`;

            const view = document.createElement("button");

            view.textContent = "View";

            view.className = "primaryBtn";

            view.style.cssText = "padding:8px 13px;font-size:13px;flex-shrink:0";

            view.onclick = () =>
                location.href = "certificates.html?view=" + c.id;

            row.appendChild(view);

            box.appendChild(row);

        });

    },

    /* ----------------------------------------------------- */
    /* applications (Phase 5)                                 */
    /* ----------------------------------------------------- */

    async renderApps() {

        if (this.loaded.apps) return;

        this.loaded.apps = true;

        const box = document.getElementById("pfApps");

        const { rows, error } =
            await ApplicationService.forOfficer(this.officer.id);

        if (error) {

            box.innerHTML =
                `<p class="muted">${ApplicationService.SETUP_HINT}</p>`;

            return;

        }

        box.innerHTML = "";

        const applyBtn = document.createElement("button");

        applyBtn.className = "primaryBtn";

        applyBtn.style.marginBottom = "14px";

        applyBtn.textContent = "New application for " + this.officer.name;

        applyBtn.onclick = () =>
            location.href = "applications.html?officer=" + this.officer.id;

        box.appendChild(applyBtn);

        if (!rows.length) {

            const p = document.createElement("p");

            p.className = "muted";

            p.textContent = "No applications yet.";

            box.appendChild(p);

            return;

        }

        rows.forEach(a => {

            const row = document.createElement("div");

            row.className = "certItem";

            row.innerHTML =
                `<div class="certInfo">` +
                `<strong>${a.application_id || "—"}</strong> ` +
                `<span class="grantKind">${a.type}</span>` +
                `<span class="certStatus">` +
                ApplicationService.statusChip(a.status) + `</span>` +
                `<small>${new Date(a.created_at).toLocaleDateString()}` +
                `${a.reviewed_by ? " · by " + a.reviewed_by : ""}` +
                `${a.decision_reason ? " · " + a.decision_reason : ""}</small>` +
                `</div>`;

            box.appendChild(row);

        });

    },

    /* ----------------------------------------------------- */
    /* shifts tab (Phase 7.1b) — this officer's duty history  */
    /* ----------------------------------------------------- */

    esc(s) {
        return (s == null ? "" : String(s)).replace(/[&<>"]/g,
            c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                    '"': "&quot;" }[c]));
    },

    async renderShifts() {

        if (this.loaded.shifts) return;

        this.loaded.shifts = true;

        const box = document.getElementById("pfShifts");

        if (!window.ShiftService) {

            box.innerHTML = "<p class='muted'>Shift module not loaded.</p>";

            return;

        }

        const { rows, error } =
            await ShiftService.forOfficer(this.officer.id);

        if (error) {

            box.innerHTML =
                `<p class="muted">${ShiftService.SETUP_HINT}</p>`;

            return;

        }

        box.innerHTML = "";

        if (!rows.length) {

            box.innerHTML = "<p class='muted'>No shifts on record yet.</p>";

            return;

        }

        const head = document.createElement("div");
        head.className = "exHeader exCols3";
        head.innerHTML =
            "<span>Shift</span><span>Duration</span><span>When</span>";
        box.appendChild(head);

        rows.forEach(sh => {

            const sum = ShiftService.summary(sh);

            const open = !sh.ended_at;

            const row = document.createElement("div");
            row.className = "exRow exCols3";

            const dotColor = open ? "#22c55e" : (sh.overtime ? "#e08a5a" : "#6b7280");

            row.innerHTML =
                `<span class="exName">
                    <span class="exIcon">${pimsIcon("shifts", 18)}</span>
                    <span class="exNameText">
                        <b>${this.esc(sh.shift_id || "—")}</b>
                        <small>${this.esc(sh.vehicle_unit || "no vehicle")}` +
                        `${sh.callsign ? " · " + this.esc(sh.callsign) : ""}</small>
                    </span>
                </span>` +
                `<span><span class="dotChip"><i style="background:${dotColor}"></i>` +
                    `${ShiftService.hm(sum.durationSec)}` +
                    `${open ? " (open)" : ""}${sh.overtime ? " · OT" : ""}</span></span>` +
                `<span>${new Date(sh.started_at).toLocaleDateString()}</span>`;

            row.onclick = () =>
                location.href = "shift.html?id=" + encodeURIComponent(sh.id);

            box.appendChild(row);

        });

    },

    /* ----------------------------------------------------- */
    /* save permission groups (admins)                        */
    /* ----------------------------------------------------- */

    async saveGroups() {

        const keys = [...document.querySelectorAll("#pfPerms input[data-group]")]
            .filter(cb => cb.checked)
            .map(cb => cb.dataset.group);

        const { error } = await db
            .from("officers")
            .update({ permission_groups: keys })
            .eq("id", this.officer.id);

        if (error) {

            UI?.error("Could not save groups (run SETUP-PATCH-6.sql).");

            return;

        }

        AuditService.log({
            action: "PERMISSION_GROUPS_UPDATED",
            target: this.officer.officerId + " " + this.officer.name,
            details: keys.length ? keys.join(", ") : "none",
            officerId: this.officer.id
        });

        TimelineService.add(this.officer.id,
            "Permission groups updated",
            keys.length ? keys.join(", ") : "none");

        this.officer.groups = keys;

        this.loaded.perms = false;

        this.renderPerms();

        UI?.success("Permission groups saved");

    },

    /* ----------------------------------------------------- */
    /* temporary permissions (grant / revoke / history)       */
    /* ----------------------------------------------------- */

    async renderTempPerms(canManage) {

        const wrap = document.getElementById("pfTempPerms");

        if (!wrap) return;

        wrap.innerHTML =
            "<h4 style='margin-bottom:8px'>Temporary Permissions</h4>";

        /* grant form (admins) */

        if (canManage) {

            const actions = PermissionService.allActions();

            const options = actions
                .map(a => `<option value="${a}">${a}</option>`).join("");

            const form = document.createElement("div");

            form.className = "grantForm";

            form.innerHTML = `
                <select id="tgPerm">${options}</select>
                <select id="tgKind">
                    <option>Temporary</option>
                    <option>Delegation</option>
                    <option>Emergency</option>
                </select>
                <select id="tgDur">
                    <option value="2">2 hours</option>
                    <option value="24">1 day</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                </select>
                <input id="tgReason" placeholder="Reason">
                <button id="tgGrant" class="primaryBtn">Grant</button>
            `;

            wrap.appendChild(form);

            /* Emergency defaults to 2 hours */

            document.getElementById("tgKind").onchange = (e) => {

                if (e.target.value === "Emergency") {

                    document.getElementById("tgDur").value = "2";

                }

            };

            document.getElementById("tgGrant").onclick = () =>
                this.grantTempPermission();

        }

        /* current + past grants */

        const listBox = document.createElement("div");

        listBox.id = "tgList";

        wrap.appendChild(listBox);

        const { data, error } = await db
            .from("permission_grants")
            .select("*")
            .eq("officer_id", this.officer.id)
            .order("created_at", { ascending: false });

        if (error) {

            listBox.innerHTML =
                "<p class='muted'>Temporary permissions need a one-time " +
                "setup — run lapd/SETUP-PATCH-7.sql in the Supabase SQL " +
                "Editor.</p>";

            return;

        }

        if (!data.length) {

            listBox.innerHTML =
                "<p class='muted'>No temporary permissions granted.</p>";

            return;

        }

        const now = Date.now();

        data.forEach(g => {

            const expired = new Date(g.expires_at).getTime() < now;

            const revoked = !!g.revoked_at;

            const active = !expired && !revoked;

            const row = document.createElement("div");

            row.className = "grantItem" + (active ? " active" : "");

            const status = revoked ? "Revoked"
                : expired ? "Expired"
                : "Active until " + new Date(g.expires_at).toLocaleString();

            row.innerHTML = `
                <div>
                    <strong>${g.permission}</strong>
                    <span class="grantKind">${g.kind}</span>
                    <small>${status}${g.reason ? " · " + g.reason : ""}` +
                    `${g.granted_by ? " · by " + g.granted_by : ""}</small>
                </div>
            `;

            if (active && canManage) {

                const btn = document.createElement("button");

                btn.textContent = "Revoke";

                btn.className = "dangerBtn";

                btn.onclick = () => this.revokeGrant(g.id);

                row.appendChild(btn);

            }

            listBox.appendChild(row);

        });

    },

    async grantTempPermission() {

        const permission = document.getElementById("tgPerm").value;

        const kind = document.getElementById("tgKind").value;

        const hours = parseInt(document.getElementById("tgDur").value, 10);

        const reason = document.getElementById("tgReason").value.trim();

        const expires = new Date(Date.now() + hours * 3600000).toISOString();

        const grantedBy = localStorage.getItem("username") || "admin";

        const { error } = await db
            .from("permission_grants")
            .insert([{
                officer_id: this.officer.id,
                permission: permission,
                kind: kind,
                reason: reason || null,
                granted_by: grantedBy,
                expires_at: expires
            }]);

        if (error) {

            UI?.error("Could not grant (run SETUP-PATCH-7.sql).");

            return;

        }

        AuditService.log({
            action: "PERMISSION_GRANTED",
            target: this.officer.officerId + " " + this.officer.name,
            details: kind + ": " + permission + " until " +
                new Date(expires).toLocaleString(),
            officerId: this.officer.id
        });

        TimelineService.add(this.officer.id,
            "Temporary permission granted",
            kind + ": " + permission);

        if (this.officer.userId) {

            NotificationService.send({
                to: this.officer.userId,
                title: "Permission Granted",
                message: "You were granted '" + permission + "' (" + kind +
                    ") until " + new Date(expires).toLocaleString() + "."
            });

        }

        UI?.success("Permission granted");

        this.renderTempPerms(true);

    },

    async revokeGrant(id) {

        const { error } = await db
            .from("permission_grants")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", id);

        if (error) {

            UI?.error("Could not revoke.");

            return;

        }

        AuditService.log({
            action: "PERMISSION_REVOKED",
            target: this.officer.officerId + " " + this.officer.name,
            officerId: this.officer.id
        });

        TimelineService.add(this.officer.id, "Temporary permission revoked");

        UI?.success("Permission revoked");

        this.renderTempPerms(true);

    },

    /* ----------------------------------------------------- */
    /* identity card                                          */
    /* ----------------------------------------------------- */

    async openIdCard() {

        const o = this.officer;

        document.getElementById("idCardName").textContent = o.name;

        document.getElementById("idCardRank").textContent =
            o.rank + (o.division !== "—" ? " · " + o.division : "");

        document.getElementById("idCardOfficer").textContent = o.officerId;

        document.getElementById("idCardBadge").textContent = o.badge;

        document.getElementById("idCardDivision").textContent = o.division;

        document.getElementById("idCardStatus").textContent = o.status;

        const photo = document.getElementById("idCardPhoto");

        photo.src = (await resolveCloudPhoto(o.photo)) ||
            "https://via.placeholder.com/120";

        document.getElementById("idCardIssued").textContent =
            "Issued " + new Date().toLocaleDateString();

        /* PDF417 credential strip — carries the officer's SECRET
           scan token (no links); the Scanner validates it against
           our database. Token column arrives with PATCH-13. */

        const strip = document.getElementById("idCardPdf417");

        if (this.raw?.scan_token) {

            BarcodeService.renderPdf417(strip,
                BarcodeService.officer({
                    officer_id: o.officerId,
                    badge_number: o.badge,
                    scan_token: this.raw.scan_token
                }));

        } else {

            strip.innerHTML =
                "<small class='muted'>Barcode needs PATCH-13 — run " +
                "lapd/SETUP-PATCH-13.sql once.</small>";

        }

        document.getElementById("idCardModal").classList.remove("hidden");

        AuditService.log({
            action: "IDENTITY_CARD_VIEWED",
            target: o.officerId + " " + o.name,
            officerId: o.id
        });

    },

    /* ----------------------------------------------------- */
    /* init                                                   */
    /* ----------------------------------------------------- */

    async init() {

        const id = new URLSearchParams(location.search).get("id");

        if (!id || !window.db) {

            document.getElementById("pfName").textContent =
                "No officer selected";

            return;

        }

        await Officers.initPerms();

        await Officers.loadLookups();

        await Officers.load();

        this.officer = Officers.officers.find(o => o.id === id);

        if (!this.officer) {

            document.getElementById("pfName").textContent =
                "Officer not found";

            document.getElementById("pfSubtitle").textContent =
                "This personnel file does not exist (or was deleted).";

            return;

        }

        /* raw row for dates + assigned permission groups
           (select * so a missing permission_groups column can't
           break the query before PATCH-6 is run) */

        const { data: raw } = await db
            .from("officers")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        this.raw = raw;

        this.officer.groups = raw?.permission_groups || [];

        await this.renderHeader();

        await this.renderGeneral();

        /* opening a personnel file is a sensitive action — log it */

        AuditService.log({
            action: "PERSONNEL_FILE_OPENED",
            target: this.officer.officerId + " " + this.officer.name,
            officerId: id
        });

        /* header actions (permission-gated) */

        const promoteBtn = document.getElementById("pfPromoteBtn");

        const resetBtn = document.getElementById("pfResetBtn");

        const editBtn = document.getElementById("pfEditBtn");

        /* promotions & awards now flow through certificates */

        if (!(await PermissionService.can("certificates.issue"))) {

            promoteBtn.style.display = "none";

        }

        if (!Officers.perms.reset) resetBtn.style.display = "none";

        if (!Officers.perms.edit) editBtn.style.display = "none";

        /* EDIT EVERYTHING — every change is audited field by field */

        const editModal = document.getElementById("pfEditModal");

        const rankSelect = document.getElementById("peRank");

        rankSelect.innerHTML = "";

        Officers.ranks.forEach(r => {

            const option = document.createElement("option");

            option.textContent = r.name;

            rankSelect.appendChild(option);

        });

        const divList = document.getElementById("peDivList");

        Officers.divisions.forEach(d => {

            const option = document.createElement("option");

            option.value = d.name;

            divList.appendChild(option);

        });

        const openEditor = () => {

            const o = this.officer;

            document.getElementById("peName").value = o.name;

            document.getElementById("pePhone").value = o.phone || "";

            document.getElementById("peEmail").value = o.email || "";

            document.getElementById("peDivision").value =
                o.division === "—" ? "" : o.division;

            if ([...rankSelect.options].some(x => x.value === o.rank)) {

                rankSelect.value = o.rank;

            }

            document.getElementById("peStatus").value = o.status;

            document.getElementById("pePhoto").value = o.photo || "";

            document.getElementById("peNotes").value = o.notes || "";

            editModal.classList.remove("hidden");

        };

        editBtn.onclick = openEditor;

        document.getElementById("peCancel").onclick = () =>
            editModal.classList.add("hidden");

        document.getElementById("peSave").onclick = async () => {

            const saveBtn = document.getElementById("peSave");

            saveBtn.disabled = true;

            saveBtn.innerText = "Saving...";

            const ok = await Officers.updateOfficerData(id, {
                name: document.getElementById("peName").value,
                phone: document.getElementById("pePhone").value,
                email: document.getElementById("peEmail").value,
                division: document.getElementById("peDivision").value,
                rank: document.getElementById("peRank").value,
                status: document.getElementById("peStatus").value,
                photo: document.getElementById("pePhoto").value,
                notes: document.getElementById("peNotes").value
            });

            saveBtn.disabled = false;

            saveBtn.innerText = "Save";

            if (ok) {

                editModal.classList.add("hidden");

                setTimeout(() => location.reload(), 700);

            }

        };

        /* arrived via an Edit button? open the editor now */

        if (new URLSearchParams(location.search).get("edit") === "1"
            && Officers.perms.edit) {

            openEditor();

        }

        promoteBtn.onclick = () => {

            location.href = "cert-studio.html?officer=" + id;

        };

        resetBtn.onclick = () => Officers.resetAccess(id);

        /* IDENTITY CARD */

        document.getElementById("pfIdCardBtn").onclick = () =>
            this.openIdCard();

        document.getElementById("idCardClose").onclick = () =>
            document.getElementById("idCardModal").classList.add("hidden");

        document.getElementById("idCardPrint").onclick = () => window.print();

        /* tabs */

        document.querySelectorAll("#pfTabs button").forEach(btn => {

            btn.onclick = () => {

                document.querySelectorAll("#pfTabs button")
                    .forEach(b => b.classList.remove("active"));

                btn.classList.add("active");

                document.querySelectorAll(".tabPanel")
                    .forEach(p => p.classList.remove("active"));

                document.getElementById(btn.dataset.tab)
                    .classList.add("active");

                if (btn.dataset.tab === "tabTimeline") this.renderTimeline();

                if (btn.dataset.tab === "tabAudit") this.renderAudit();

                if (btn.dataset.tab === "tabCases") this.renderCases();

                if (btn.dataset.tab === "tabCareer") this.renderCareer();

                if (btn.dataset.tab === "tabStats") this.renderStats();

                if (btn.dataset.tab === "tabInbox") this.renderInbox();

                if (btn.dataset.tab === "tabNotes") this.renderNotes();

                if (btn.dataset.tab === "tabPerms") this.renderPerms();

                if (btn.dataset.tab === "tabCerts") this.renderCerts();

                if (btn.dataset.tab === "tabApps") this.renderApps();

                if (btn.dataset.tab === "tabShifts") this.renderShifts();

            };

        });

    }

};

document.addEventListener("DOMContentLoaded", () => Personnel.init());

window.Personnel = Personnel;
