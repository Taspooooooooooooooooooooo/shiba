# 🔒 Frozen Contract — Account Activation & Reset

**The user is happy with this behavior and has asked that it be
preserved no matter what.** Treat everything below as a contract.
After changing any file in the "Files involved" list, **re-verify both
flows end-to-end** before shipping.

## Activation (new officer gets into the system)

1. An admin **creates an officer**. The system auto-issues an
   **activation code** (`ACT-YYYY-NNNNNN`, valid **48 hours**,
   single-use) shown on the wizard **success screen** with a Copy
   button. The admin **never sets or sees a password.**
2. The officer opens **Activate Account** (`activate.html`).
3. The officer enters **only the activation code** by default. The
   Officer ID is an *optional* double-check under **Advanced settings**.
4. The code is validated server-side (`check_activation_code`).
5. The officer chooses their **own username, password, and PIN**.
6. The account is created in **Supabase Auth**
   (`<username>@shiba.is-a.dev`); the PIN is stored as a **SHA-256
   hash** in the account metadata (never plain text).
7. `complete_activation` marks the code **used**, creates the profile
   row, and links `officers.user_id`.
8. A loading screen runs, then the officer lands on the dashboard,
   already signed in.

## Reset Access (officer lost their password)

1. A **Lieutenant+** (permission `officers.reset_access`) clicks
   **Reset Access** on the officer (drawer or Personnel File).
2. A **fresh activation code** (`purpose = "reset"`) is issued the same
   way and shown to the admin to hand over.
3. The officer also gets an **inbox notification** about the reset.
4. The officer redeems the code on **Activate Account** and sets a new
   password. **No new officer is ever created** for a reset.

## Invariants (must always hold)

- The admin **never** sets, sees, or transmits an officer's password.
- Activation codes are **single-use** and **expire in 48 hours**.
- The officer **always** sets their own username / password / PIN.
- PINs are **hashed** (SHA-256), never stored in plain text.
- Activating is **audited** (`ACCOUNT_ACTIVATED`); resets are audited
  (`ACCESS_RESET_CODE_ISSUED`).
- The activation code entry is **code-only by default**; the Officer ID
  stays optional under Advanced settings.

## Files involved

`lapd/activate.html`, `lapd/js/activate.js`, `lapd/js/officers.js`
(create / issueActivationCode / resetAccess), `lapd/js/login.js`,
`lapd/js/utils.js` (usernameToEmail / sha256Hex),
`lapd/SETUP-AUTH.sql` + `SETUP-PATCH-2.sql` (the RPCs).

## How to re-verify (quick)

1. Create a throwaway officer → confirm the success screen shows a code.
2. On `activate.html`, enter just that code → set username/password/PIN
   → confirm you land on the dashboard and can log in again.
3. Confirm the code is now **used** (a second try is rejected).
4. Reset Access on an officer → confirm a new code + inbox message.
5. Clean up the throwaway officer.
