# 💰 Connecting Adsterra to SHIBA Cloud — step by step

Ads run **only in `/cloud`** (upload gate, download gate, and the page
banner). The main PIMS system stays **100% ad-free** — police data must
never sit next to third-party ad scripts.

Everything is already wired to `cloud/adzone.js`. You just create an
Adsterra account, grab your zone keys, and paste them in.

---

## 1. Create an Adsterra publisher account

1. Go to **https://adsterra.com** → **Publisher** → **Sign up**.
2. Verify your email and log in to the **Publisher dashboard**.
3. Add a website: enter **`shiba.is-a.dev`** and pick category
   *File Sharing / Tools*. Approval usually takes a few hours to a day.

## 2. Create the ad zones (what to pick)

In **Websites → your site → Add new ad unit**, create these two:

| Where it shows | Adsterra ad type | Why |
|---|---|---|
| **Page banner** (top of /cloud) | **Banner 728×90** (desktop) or **300×250** | Clean, always-visible, good revenue |
| **Ad-watch gate** (before up/download) | **Banner 300×250** *or* **Social Bar** | The 15–120s wait is the perfect ad moment |

Optional extras (higher revenue, more intrusive — your call):
- **Social Bar** — floating/sticky, high earning, works great on the gate.
- **Popunder** — opens a tab; most lucrative but most annoying. If you
  use it, put it **only** on the download gate, never the whole site.
- ⚠️ Avoid **Direct Link/Smartlink** on the main pages — it redirects.

Each unit gives you a **zone key** (looks like `a1b2c3d4e5...`).

## 3. Paste your keys

Open **`cloud/adzone.js`** and replace the placeholders:

```js
ZONES: {
  banner: "your-banner-zone-key",
  interstitial: "your-gate-zone-key"
}
```

## 4. Paste the ad code

Adsterra gives you a snippet per zone. In `adzone.js`, inside
`render(container)`, build it with real DOM nodes (scripts added via
`innerHTML` do **not** run). Example for a 300×250 banner:

```js
render(container){
  if(!this.configured()){ /* placeholder */ return; }
  container.innerHTML = "";
  const s1 = document.createElement("script");
  s1.text = "atOptions = { 'key':'" + this.ZONES.banner +
            "','format':'iframe','height':250,'width':300,'params':{} };";
  const s2 = document.createElement("script");
  s2.src = "//www.highperformanceformat.com/" + this.ZONES.banner +
           "/invoke.js";
  container.append(s1, s2);
}
```

(Use the exact snippet Adsterra shows for *your* zone — the domain can
differ.) Commit, push, hard-refresh `/cloud` — real ads appear.

## 5. Get paid

Adsterra pays via PayPal, crypto, wire, etc. once you hit the payout
minimum (often ~$5 for some methods). Set it under **Finance → Payment**.

---

## ⚠️ Honest note on "can't bypass the ads"

The current gate is **client-side**. Most visitors watch the ad, but a
technical person can still reach a file's public URL directly (the cloud
bucket is public). Disabling right-click only deters casual users.

**Real, unbypassable protection** = make the bucket **private** and hand
out **short-lived signed download URLs from a Supabase Edge Function**
that only runs *after* the ad gate. That's the planned next step; it also
means officer photos move to their own public path so they keep working.
Say the word and we build it.
