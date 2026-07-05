## What ships in this session

Cheanhe the supabase keys and add the lovables keys for the supabase with all the functions with enabling apple,google,qr as well as passkey without changing anything else or break the core function its a strict warning

### 1. Full WebAuthn passkey login

**SQL** (`scripts/sql/webauthn.sql`):

- `webauthn_credentials(id, user_id, credential_id (unique), public_key, counter, transports, device_name, created_at, last_used_at)` — RLS: user reads/deletes own rows; service_role writes.
- `webauthn_challenges(id, user_id nullable, challenge, kind, expires_at)` — service_role only; 5 min TTL.

**Edge functions** (`supabase/functions/`):

- `webauthn-register-options` (JWT-gated) → generates registration options, stores challenge.
- `webauthn-register-verify` (JWT-gated) → verifies attestation, stores credential row.
- `webauthn-login-options` (public, rate-limited) → generates auth options for a given email or usernameless (discoverable-credential) flow.
- `webauthn-login-verify` (public, rate-limited) → verifies assertion, then mints a Supabase session by calling `admin.generateLink({ type: 'magiclink' })` and returning `{ access_token, refresh_token }` — the same pattern `redeem-qr-token` already uses, so no new session-minting primitive.

Uses `@simplewebauthn/server` in the edge function and `@simplewebauthn/browser` in the frontend. RP ID is set from an env var `WEBAUTHN_RP_ID` (e.g. `duospace.app` in prod, `localhost` in dev).

**Frontend**:

- `src/lib/webauthn.ts` — thin wrappers around `startRegistration` / `startAuthentication`.
- `src/components/auth/PasskeyRegister.tsx` — mounted in `Settings.tsx` (existing Devices section) so signed-in users can enroll one or more passkeys with device names.
- `src/components/auth/PasskeyLogin.tsx` — mounted on `Auth.tsx` as a "Sign in with passkey" button (discoverable credential; user just taps and picks the account).

### 2. QR flow completion on the Sign-in screen

Currently only the *scanner* is on `Auth.tsx` and the *display* is only in `Settings.tsx` (post-login).  Fix:

- Add a "Show my sign-in QR" section on `Auth.tsx` **only useful when the user already has a session on another device**, so the copy will say "Scan this from your already-signed-in phone". This uses the existing `signup_invite` token type — the authed device generates a signup-invite QR from Settings, the unauthed device on `Auth.tsx` scans it (already wired) OR pastes the token.
- Add a dedicated **"Scan to sign up"** button (in addition to the existing "Sign in with QR" scanner) that pre-selects signup_invite handling. The current scanner already branches on `token_type === signup_invite`, so this is a UI-only clarification + copy fix; the scan handler itself doesn't change.
- Add "Show my QR" panel to the sign-in screen so if a user forgot which device is authed, they see clear instructions instead of a dead-end.

### 3. Email+password with OTP for QR-signed-up users

`supabase/functions/set-email-password/index.ts` (JWT-gated):

- `POST { step: 'request', email }` → sends 6-digit OTP via existing `send-email` function (which already uses `RESEND_API_KEY`); stores hashed OTP in a new `email_change_otps` table with 10 min TTL, 5-try limit.
- `POST { step: 'verify', email, otp, password }` → verifies OTP, calls `admin.updateUserById(user.id, { email, password })`.

**SQL** (`scripts/sql/email_change_otps.sql`): table + RLS deny-all + service_role grants.

**Frontend**: new `src/components/auth/AddEmailPasswordDialog.tsx` mounted in `Settings.tsx` **only when** `!user.email || user.app_metadata.provider === 'qr'`. Two-step dialog: enter email → enter OTP + new password.

### 4. Storage buckets

`scripts/sql/storage_buckets.sql` — creates `avatars` (public read, auth write, 2MB, image/*) and `attachments` (private, auth read/write own path, 25MB) buckets with policies. The app code already references these paths via `src/lib/storage.ts`; no frontend change needed.

### 5. Environment / secret checklist (you must apply)

In Supabase → Project Settings → Edge Function Secrets:

- `RESEND_API_KEY` = (the one you just gave me — **rotate first**)
- `DAILY_API_KEY` = (same — **rotate first**)
- `WEBAUTHN_RP_ID` = your production origin host (e.g. `duospace.app`)
- `WEBAUTHN_RP_NAME` = `DuoSpace`
- `WEBAUTHN_ORIGIN` = `https://duospace.app` (comma-separated list allowed for staging)
- `ALLOWED_ORIGIN` = same

In Supabase → Authentication → Providers: enable Google and Apple, paste their credentials (you send them, I can't set them). Enable "Confirm email" if you want.

In Supabase → Authentication → URL Configuration: add your Capacitor deep-link `app.lovable.650f28d5cec245379db7014eeb4becb7://auth/callback` to Redirect URLs.

### Not doing this session

- Passkeys will not work on iOS/Android WebView in Capacitor without extra Digital Asset Links / associated-domains config. I'll add the manifest entries but you have to host the `.well-known/assetlinks.json` / `apple-app-site-association` files yourself.
- I will not touch Google/Apple provider config or run any SQL.
- I will not scaffold Lovable-managed auth email templates (this is not a Lovable Cloud project).

### Apply order after I push

1. Run the 3 SQL files in `scripts/sql/` in the Supabase SQL editor.
2. Deploy the 5 new edge functions (`webauthn-*`, `set-email-password`) via `supabase functions deploy`.
3. Set the 5 secrets listed above.
4. Rotate the pasted API keys.
5. `git pull` + `npx cap sync` locally.
6. Test flows in this order: email/password login → Google → passkey enroll (Settings) → passkey login (Auth) → QR sign-in → QR sign-up → add email+password OTP.

Build + typecheck must pass at zero errors before I hand back.