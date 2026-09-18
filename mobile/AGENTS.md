# Mobile — Agent Guide

Read the root [`AGENTS.md`](../AGENTS.md) first for product context and repo-wide conventions.

> **Expo HAS CHANGED.** This is Expo **SDK 57** (React Native 0.86, React 19.2). APIs differ from older
> tutorials and from your training data. Check the versioned docs at
> https://docs.expo.dev/versions/v57.0.0/ — or the installed package's `.d.ts` files — before using an API.
> Known differences already hit in this repo:
> - `Tabs` is imported from **`expo-router/js-tabs`** (the `expo-router` export is deprecated).
> - Tab bar icon `color` is a `ColorValue`, not `string`.
> - Use `npx expo install <pkg>` (not `npm install`) so native package versions match the SDK.

## Commands

```bash
npm start            # Metro; scan the QR with Expo Go, or press i (iOS sim) / a (Android emulator)
npm run start:clear  # same, clearing Metro cache — do this after editing .env
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint
npm run doctor       # expo-doctor
```

Expo Go is enough for everything in the app today. A dev build (`npx expo run:ios|android` or EAS) is only
needed for native-only features (Apple Sign-In, passkeys, Clerk's prebuilt native UI, biometrics).

## Layout

```
mobile/
├── app/                        expo-router routes — keep these THIN (compose features, no business logic)
│   ├── _layout.tsx             Providers (Clerk, React Query) + Stack.Protected auth guard
│   ├── sso-callback.tsx        OAuth deep-link landing route
│   ├── (auth)/                 Signed-out only: sign-in, sign-up, forgot-password
│   └── (tabs)/                 Signed-in only: index (Learn), money, ask (Ask AI), profile
├── src/
│   ├── api/
│   │   ├── client.ts           fetch wrapper: base URL, JSON, Bearer token, envelope unwrap, ApiError, 401 retry
│   │   ├── useApi.ts           useApi() → client bound to Clerk's getToken — use this in components/hooks
│   │   ├── endpoints.ts        One typed function per backend endpoint (authApi, usersApi, aiApi, …)
│   │   ├── types.ts            Backend response types (mirror backend models)
│   │   └── queryClient.ts      TanStack Query client + queryKeys
│   ├── config/env.ts           ALL env access (EXPO_PUBLIC_*) + API URL resolution
│   ├── hooks/useCurrentUser.ts Backend user (GET /auth/me) via React Query
│   ├── features/
│   │   ├── auth/               AuthHeader, GoogleSignInButton
│   │   └── chat/               useChat + ChatScreen (Ask AI tab)
│   ├── components/ui/          Button, TextField, Screen, Card, FormError — reuse before creating new ones
│   ├── components/ComingSoon.tsx  Placeholder used by Learn/Money tabs
│   ├── lib/errors.ts           getErrorMessage / getBannerMessage (Clerk + API errors → text)
│   └── theme/index.ts          colors, spacing, radius, typography tokens
└── app.json                    name, scheme `wariku`, bundle id `com.wariku.app`, plugins
```

Import from `src` with the `@/` alias (`import { Button } from '@/components/ui'`).

## Auth (Clerk `@clerk/expo` v4 — "Core 3")

- `app/_layout.tsx` wraps everything in `<ClerkProvider publishableKey tokenCache>`; `tokenCache` is
  `expo-secure-store`, so sessions survive restarts.
- Navigation is decided **only** by `Stack.Protected` guards on `isSignedIn`. Auth screens never call
  `router.replace('/')` after success — they call `finalize()` / `setActive()` and the guard swaps the stack.
  Signing out anywhere (`useClerk().signOut()`) returns to sign-in automatically.
- Hooks are the **Core 3** API. Pattern:
  ```ts
  const { signIn, errors, fetchStatus } = useSignIn();
  const { error } = await signIn.password({ emailAddress, password });
  if (error) return setFormError(getBannerMessage(error, ['identifier', 'password']));
  if (signIn.status === 'complete') await signIn.finalize();
  ```
  Every method returns `{ error }` (it doesn't throw). `errors.fields.<name>` holds per-field errors for
  inline display; `getBannerMessage` returns whatever *isn't* shown inline (Clerk drops unknown-field errors
  otherwise). Don't import from `@clerk/expo/legacy`.
- Sign-in handles `needs_client_trust` / `needs_second_factor` with an **email code** (Clerk asks for this
  when a user signs in from a new device). Other second factors show an explanatory error.
- Google uses `useSSO()` from `@clerk/expo` (browser-based OAuth, works in Expo Go).
- Dashboard setup and troubleshooting: [`docs/AUTH.md`](../docs/AUTH.md).

## Calling the backend

```ts
// 1. Add the endpoint to src/api/endpoints.ts
export const learnApi = {
  path: (api: ApiClient) => api.get<{ units: Unit[] }>('/learn/path'),
};

// 2. Wrap it in a React Query hook inside the feature
export function useLearningPath() {
  const api = useApi();
  return useQuery({ queryKey: ['learn', 'path'], queryFn: () => learnApi.path(api) });
}
```

- `useApi()` attaches a fresh Clerk session token to every request and retries once on 401.
- Errors are `ApiError { status, code, message }`; `status === 0` means network error/timeout. Show them with
  `getErrorMessage(error)`.
- The query cache is cleared whenever the signed-in user changes (root layout) — no cross-account leaks.
- API URL: `EXPO_PUBLIC_API_URL` if set, else (dev) `http://<Metro host LAN IP>:5947/api/v1`. Production
  builds **must** set `EXPO_PUBLIC_API_URL` (https).

## Building a tab (e.g. Learn)

1. Create `src/features/learn/` with `LearnScreen.tsx`, hooks, and components.
2. Replace the `<ComingSoon/>` in `app/(tabs)/index.tsx` with
   `export { LearnScreen as default } from '@/features/learn/LearnScreen';` (see `ask.tsx`).
3. Nested screens (e.g. a lesson player) go in `app/(tabs)/…` folders or a new top-level stack inside the
   `Stack.Protected guard={isSignedIn}` block in `app/_layout.tsx`.
4. Use theme tokens and `components/ui` — no hard-coded colours.
5. Run `npm run typecheck && npm run lint`.

## Env

| Var | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Without it the app shows a "Clerk key missing" screen. |
| `EXPO_PUBLIC_API_URL` | prod | Optional in dev. |

`EXPO_PUBLIC_*` values are compiled into the app bundle and are visible to anyone — **never** put secrets
(DeepSeek key, Clerk secret key) here. Restart Metro with `--clear` after changing `.env`.
