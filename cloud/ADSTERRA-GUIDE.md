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

## 3. ✅ CONNECTED — where each unit lives

All 6 units are wired in `cloud/adzone.js` (`AdZone.ZONES`) and mounted
by one call, `AdZone.mount()`, on `/cloud/` and `/cloud/downloads/`:

| Unit | Zone | Where it shows |
|---|---|---|
| Social Bar | 30274390 | floating, once per cloud page |
| Native Banner | 30274891 | right rail |
| Banner 728×90 | 30274392 | top banner (desktop ≥820px) |
| Banner 300×250 | 30274393 | the ad-watch gate |
| Banner 160×600 | 30274394 | left rail (skyscraper) |
| Banner 320×50 | 30274395 | top banner (mobile <820px) |

Each unit is used **once per page** — Adsterra fills duplicates poorly.

## 4. Why each banner sits in its own iframe

Adsterra's banner format reads a **global `atOptions`** object when its
`invoke.js` runs. Two different sizes on one page would overwrite each
other's config and render the wrong size (or nothing at all). So
`renderBanner()` builds a `srcdoc` iframe per unit, giving each its own
window/global:

```js
frame.srcdoc =
  "<script>atOptions=" + JSON.stringify({key, format:"iframe",
     height, width, params:{}}) + ";<\/script>" +
  '<script src="https://www.highperformanceformat.com/' +
  key + '/invoke.js"><\/script>';
```

The Native Banner doesn't use `atOptions` (it targets its own container
id), so it's injected directly into the page. Note scripts added via
`innerHTML` never execute — always build real `<script>` nodes.

**Heads-up:** the Social Bar rewrites the browser tab title (e.g.
*"(1) New Message!"*) as an attention grab. Turn it off in Adsterra →
your Social Bar unit → settings, if you'd rather keep your title.

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
