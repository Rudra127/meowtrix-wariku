# Authentication (Clerk)

Clerk owns identity; our backend trusts Clerk session tokens and keeps a local `User` record per Clerk user.
Code: `mobile/app/(auth)/*`, `mobile/app/_layout.tsx`, `backend/middlewares/protect.js`,
`backend/api/webhooks.js`.

## Flow

```
Sign up / sign in (mobile)                Backend
──────────────────────────                ───────
useSignUp / useSignIn / useSSO ──▶ Clerk
      │ finalize()/setActive() → session active → Stack.Protected shows (tabs)
      ▼
(tabs)/_layout → useCurrentUser() → GET /api/v1/auth/me  (Bearer <session token>)
                                     clerkMiddleware verifies token
                                     protect: find User by clerkId, else fetch from Clerk + create
                                   ◀ { success: true, data: { user } }
Later: every API call → useApi() gets a fresh token from Clerk (auto-refreshed, ~60s lifetime)
Sign out: useClerk().signOut() → guard shows (auth) → React Query cache cleared
Delete account: DELETE /api/v1/users/me → Clerk user + Mongo user deleted → app signs out
```

Supported methods in the app today: **email + password** (with email-code verification on sign-up),
**email-code check on new devices** (Clerk "client trust"), **forgot password** (email code), **Google**.

## One-time Clerk Dashboard setup

Do this in one Clerk application, **Development** instance first (https://dashboard.clerk.com).

1. **Create the application.** Enable **Email** and **Google** as sign-in options.
2. **User & authentication**
   - Email: on, *Require* for sign-up, *Verify at sign-up* with **email verification code**.
   - Password: on.
   - Name: turn on **First and last name** (optional fields) — the sign-up form sends first name.
   - Leave **Username** and **Phone** off (the app doesn't collect them; if you turn them on as *required*,
     sign-up will stop at "sign-up still needs: …").
3. **Native applications** (Configure → Native applications)
   - Make sure the **Native API** is enabled.
   - Under the mobile SSO redirect allowlist, add:
     - `wariku://sso-callback` (dev builds and production)
     - For Expo Go: the URL printed by `AuthSession.makeRedirectUri({ path: 'sso-callback' })`, which looks
       like `exp://192.168.x.x:8081/--/sso-callback` (it changes with your LAN IP).
4. **SSO connections → Google.** Development instances can use Clerk's shared Google credentials. Production
   needs your own Google OAuth client (Clerk walks you through it).
5. **API keys** (Configure → API keys):
   - Publishable key `pk_test_…` → `mobile/.env` as `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` **and**
     `backend/.env.dev` as `CLERK_PUBLISHABLE_KEY`.
   - Secret key `sk_test_…` → `backend/.env.dev` as `CLERK_SECRET_KEY` only. **Never** in the mobile app.
6. **Webhook** (recommended for production, optional in dev):
   Webhooks → Add endpoint → `https://<backend-domain>/api/v1/webhooks/clerk`, events `user.created`,
   `user.updated`, `user.deleted` → copy the signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`.
   For local testing use a tunnel (e.g. `ngrok http 5947`).
7. **Admins:** Users → pick a user → Metadata → Public → `{ "role": "admin" }`. Takes effect on next sync
   (webhook, first login, or `POST /api/v1/auth/sync`).

## Verify it works

1. Start the backend (`npm run dev`) and the app (`npm start`).
2. Sign up with a real email → enter the 6-digit code → you land on the Learn tab.
3. Profile tab → **Backend connection: "Connected and authenticated"** with a user ID. That proves the
   session token reached the backend, was verified, and a Mongo user was created
   (`mongosh wariku --eval 'db.users.find()'`).
4. Kill and reopen the app → still signed in (secure token cache).
5. Sign out → back on sign-in. Sign in again (you may be asked for an email code on a new device).
6. Try "Continue with Google" and "Forgot password?".

## Going to production

- Create the Clerk **Production** instance (needs a domain), redo steps 2–6 there, and use `pk_live_…` /
  `sk_live_…` in production env (`backend/.env.prod`, EAS environment variables for the app).
- Set `EXPO_PUBLIC_API_URL` to the HTTPS backend URL for production builds.
- App Store guideline 4.8: an iOS app offering third-party sign-in (Google) must also offer an equivalent
  privacy-focused login option — **Sign in with Apple** is the usual answer. Add it before App Store
  submission (`useSignInWithApple` from `@clerk/expo`; needs a dev build).
- Account deletion (required by both stores) already exists: Profile → Delete account.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| App shows "Clerk key missing" | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` not set in `mobile/.env`; restart with `npm run start:clear`. |
| Spinner forever on launch | Invalid publishable key, or no network to Clerk. Check the Metro logs. |
| Profile: "Can't reach the server (http://…:5947/api/v1)" | Backend not running, phone not on the same Wi-Fi, a firewall blocking port 5947, or you're using `--tunnel` (then set `EXPO_PUBLIC_API_URL`). |
| Profile: "Auth is not configured" (503) | `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` missing in `backend/.env.dev`. |
| Profile: "Authentication required" (401) with a signed-in app | Backend and app use keys from **different** Clerk applications/instances, or the server clock is badly off. |
| Google: browser opens then returns with nothing | Redirect URL not allow-listed (step 3), or the user cancelled. |
| Sign-up error about CAPTCHA / bot protection | Clerk's bot protection is browser-based; turn it off for native (Configure → Attack protection) or check Clerk's Expo docs for current guidance. |
| "sign-up still needs: username/phone_number" | Those fields are *required* in the Dashboard; make them optional/off or add inputs to `sign-up.tsx`. |
| "This account requires a verification method the app does not support yet" | User has TOTP/SMS MFA; extend `sign-in.tsx` with `signIn.mfa.verifyTOTP` / `verifyPhoneCode`. |
