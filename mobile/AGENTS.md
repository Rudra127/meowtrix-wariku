# Mobile — Agent Guide

Read the root [`AGENTS.md`](../AGENTS.md) first for product context and repo-wide conventions.

> **Expo HAS CHANGED.** This is Expo **SDK 57** (React Native 0.86, React 19.2). APIs differ from older
> tutorials and from your training data. Check the versioned docs at
> https://docs.expo.dev/versions/v57.0.0/ — or the installed package's `.d.ts` files — before using an API.
> Known differences already hit in this repo:
> - `Tabs` is imported from **`expo-router/js-tabs`** (the `expo-router` export is deprecated).
> - Tab bar icon `color` is a `ColorValue`, not `string`.
> - Use `npx expo install <pkg>` (not `npm install`) so native package versions match the SDK.
> - **Every route group needs its own `_layout.tsx`.** `<Stack.Screen name="(onboarding)">` in the root layout only
>   matches if `app/(onboarding)/_layout.tsx` exists; otherwise the route is registered as `(onboarding)/<file>`,
>   the guard has nothing to show, and the screen is blank (warning: "No route named … exists").
> - Use `boxShadow` (theme `shadow.*`) and `style.pointerEvents` — `shadow*` props and the `pointerEvents` prop are deprecated.

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
├── app/                        expo-router routes — keep these THIN (re-export a feature screen)
│   ├── _layout.tsx             Fonts (Manrope), providers (Clerk, React Query), Stack.Protected auth guard
│   ├── sso-callback.tsx        OAuth deep-link landing route
│   ├── (auth)/                 Signed-out only: sign-in, sign-up, forgot-password
│   ├── (onboarding)/           Signed-in, not yet onboarded: level + goal questionnaire
│   └── (tabs)/                 Signed-in + onboarded: index (Learn), money, ask (Ask AI), profile
├── src/
│   ├── api/                    client.ts (fetch + Bearer token), useApi.ts, endpoints.ts, types.ts, queryClient.ts
│   ├── config/env.ts           ALL env access (EXPO_PUBLIC_*) + API URL resolution
│   ├── hooks/                  useCurrentUser (GET /auth/me), useKeyboardVisible
│   ├── features/
│   │   ├── auth/               AuthLayout (green hero + form sheet), BrandMark, GoogleSignInButton
│   │   ├── learn/              LearnScreen, LessonNode, sampleData.ts  ← placeholder content
│   │   ├── finance/            MoneyScreen, BalanceCard, SpendingChart, AddTransactionSheet, sampleData.ts ← placeholder
│   │   ├── chat/               ChatScreen, useChat, MessageContent (mini markdown), AiOrb, TypingDots
│   │   ├── onboarding/         OnboardingScreen, OptionCard, options.ts (questions + per-goal plans), usePersonalization
│   │   └── profile/            ProfileScreen, SettingsRow (edit goal/level/currency)
│   ├── components/
│   │   ├── ui/                 Design system — ALWAYS reuse these (see below)
│   │   └── navigation/         FloatingTabBar (custom pill tab bar)
│   ├── lib/                    errors.ts (Clerk/API → text), format.ts (money in minor units, greeting)
│   └── theme/index.ts          colors, spacing, radius, fonts, typography, shadow, TAB_BAR_CLEARANCE
└── app.json                    name, scheme `wariku`, bundle id `com.wariku.app`, plugins
```

## Design system (`src/components/ui`)

Look: warm off-white canvas, white rounded cards, **deep forest green** hero surfaces, **lime** accent,
black pill CTAs, big numbers with muted decimals, floating pill tab bar, Manrope font.

| Component | Use for |
|---|---|
| `AppText variant=…` | **All text** (`display`, `title`, `heading`, `subheading`, `body`, `bodyStrong`, `caption`, `label`). Never use raw `<Text>` or `fontWeight` — Manrope weights are separate families. |
| `Button variant=primary\|brand\|accent\|secondary\|ghost\|danger` | Pill buttons; `accent` on green surfaces |
| `IconButton tone=surface\|muted\|dark\|glass\|accent` | Round icon buttons; `glass` on green surfaces |
| `PressableScale` | Any custom tappable (spring + haptic) |
| `Card tone elevated`, `SectionHeader`, `Badge`, `Avatar` | Layout pieces |
| `Amount minor currency` | Money numbers (minor units, muted decimals, `hidden` mask) |
| `TextField`, `CodeInput`, `SegmentedControl`, `ProgressBar`, `Sheet`, `FormError` | Inputs, bottom sheets, feedback |
| `Screen tabBarSpace` | Screen container; pass `tabBarSpace` on tab screens so content clears the floating tab bar |

Animated values: create with `useState(() => new Animated.Value(0))` — the React Compiler lint rule
rejects `useRef(...).current` during render.

**Placeholder data:** `features/learn/sampleData.ts` and `features/finance/sampleData.ts` drive the Learn and
Money UIs until their backend endpoints exist (docs/ROADMAP.md). Screens show a "Preview · sample data" badge.
Replace the imports with React Query hooks when wiring real data; keep the component props the same.

Import from `src` with the `@/` alias (`import { Button } from '@/components/ui'`).

## Auth (Clerk `@clerk/expo` v4 — "Core 3")

- `app/_layout.tsx` wraps everything in `<ClerkProvider publishableKey tokenCache>`; `tokenCache` is
  `expo-secure-store`, so sessions survive restarts.
- Navigation is decided **only** by `Stack.Protected` guards (`isSignedIn`, then `isOnboarded`). Auth screens never call
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

## Onboarding & personalisation

- After sign-in the root layout loads the backend user (`GET /auth/me`). `isOnboarded === false` → the
  `(onboarding)` group; otherwise `(tabs)`. If the backend is unreachable, users go to the tabs (not blocked).
- Questions: **level** (beginner / intermediate / advanced) and **main goal** (budgeting / saving / debt /
  investing / learning). Saved with `PUT /users/me/onboarding`; editable later in Profile (`PATCH /users/me`).
- `usePersonalization()` → `{ level, plan }`. `plan` (from `features/onboarding/options.ts`) decides:
  Learn → recommended unit first (`learnUnitId`), Money → focus card (`moneyFocus`), Ask AI → starter prompts
  (`aiSuggestions`). The backend also tunes the AI's tone/focus from `level`/`goal` (`services/ai-service.js`).
- To add a goal: add it to `GOALS` in `backend/database/models/user.js`, `Goal` in `src/api/types.ts`, and a
  `GoalPlan` entry in `options.ts` (+ a `FocusCard` case and `GOAL_FOCUS` text in the AI service).

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

1. The screen lives in `src/features/<feature>/`; the route file only re-exports it
   (`export { LearnScreen as default } from '@/features/learn/LearnScreen';`).
2. Swap `sampleData.ts` for real API hooks (add endpoints to `src/api/endpoints.ts`).
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
