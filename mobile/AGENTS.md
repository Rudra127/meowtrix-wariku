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
│   ├── broker-callback.tsx     Deep-link landing after a broker connect (safety net; usually handled inline)
│   ├── (auth)/                 Signed-out only: sign-in, sign-up, forgot-password
│   ├── (onboarding)/           Signed-in, not yet onboarded: level + goal questionnaire
│   └── (tabs)/                 Signed-in + onboarded: index (Learn), money, ask (Ask AI), profile
├── src/
│   ├── api/                    client.ts (fetch + Bearer + postForm upload), useApi.ts, endpoints.ts, types.ts, queryClient.ts
│   ├── config/env.ts           ALL env access (EXPO_PUBLIC_*) + API URL resolution
│   ├── hooks/                  useCurrentUser (GET /auth/me), useKeyboardVisible
│   ├── features/
│   │   ├── auth/               AuthLayout (green hero + form sheet), BrandMark, GoogleSignInButton
│   │   ├── learn/              LearnScreen (path, level, achievements), LessonNode, LessonPlayerScreen,
│   │   │                       player/ (ExerciseInput, FeedbackPanel, ResultsView, ComboChip), useLearn.ts (API hooks),
│   │   │                       gamification.ts (levels, achievements, praise copy) — real data from /learn/*
│   │   ├── finance/            MoneyScreen + live data (useFinance hooks), voice capture
│   │   │                       (useVoiceCapture, VoiceCaptureSheet, DraftRow), budgets/goals sheets,
│   │   │                       categories.ts (shared category map — mirrors backend)
│   │   ├── integrations/       BrokerageCard + useBrokerage(provider) — Upstox/Zerodha via expo-web-browser
│   │   ├── chat/               ChatScreen, useChat (+ describeTools), MessageContent, AiOrb, TypingDots
│   │   ├── onboarding/         OnboardingScreen (sends device timezone), OptionCard, options.ts, usePersonalization
│   │   └── profile/            ProfileScreen, SettingsRow (edit goal/level/currency), Connected accounts
│   ├── components/
│   │   ├── ui/                 Design system — ALWAYS reuse these (see below)
│   │   ├── fx/                 Confetti, CountUp (celebration effects)
│   │   ├── motion/             Reveal, Skeleton, Toast (see Motion below)
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

**No placeholder data left.** Learn reads `/api/v1/learn/*` (run `npm run seed:learn` in backend/ to load the
lessons) and Money reads `/api/v1/finance/*` via `features/finance/useFinance.ts`.

**Money conventions on the client:** amounts are integer **minor units** everywhere; `Transaction.amount` is
positive and `type` carries the direction — use `signedAmount()` from `features/finance/categories.ts` to
display. Category presentation (icon/colour/label) also lives in `categories.ts`; its ids must match
`backend/database/models/categories.js`.

**Voice capture:** `useVoiceCapture` records with `expo-audio`, uploads to `/finance/voice`, and returns
**drafts** — nothing is saved until the user confirms in `VoiceCaptureSheet`. When the server has no speech
provider (`voice.capabilities.speechToText === false`) the mic is hidden and the typed `/finance/parse` path
is offered instead. Mic permission strings live in `app.json` (`expo-audio` plugin + iOS/Android entries).

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

## Motion (keep it subtle, Apple-like)

Tokens live in `src/theme/motion.ts` — never hand-tune springs in a screen.

| Need | Use |
|---|---|
| Section settles in on mount | `<Reveal index={n}>` (`src/components/motion`) — fade + 14dp rise, staggered by `index` |
| Loading placeholder | `<Skeleton>` shaped like the real content (not a spinner) |
| Confirmation ("Transaction added") | `<Toast message={…}>` — springs up, fades out, success haptic |
| Money that changes | `<Amount animate …>` counts to the new value |
| Tappable anything | `PressableScale` (press spring + haptic) — `Button`/`IconButton` already use it |
| Bottom sheet | `Sheet` — springs up, backdrop fades, drag the handle/header down to close |

Rules: springs from `motion.spring.ui` (no wobble) for UI, `motion.spring.pop` only for celebrations;
always `useNativeDriver: true` unless animating layout/text; respect `useReducedMotion()` (Reveal, Sheet,
Skeleton and Amount already do); never block interaction on an animation.

## Learn game loop

- Player (`app/lesson/[slug].tsx` → `LessonPlayerScreen`): pick → **Check** (`POST /learn/lessons/:slug/check`,
  instant green/red feedback + explanation, answer locks, haptics, shake on wrong) → Continue. Correct answers
  in a row build a combo (🔥 chip). **Finish** submits all answers; the server re-grades and that result is
  the source of truth for XP/progress/streak.
- Results: confetti on pass, count-up score/XP, level progress (level-up callout), newly unlocked achievements,
  answer review, Try again.
- Levels and achievements are derived client-side from `LearnerStats` in `features/learn/gamification.ts`
  (the backend `badges` counter isn't awarded yet). Keep achievement ids stable if this moves server-side.

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
2. Swap `sampleData.ts` for real API hooks (add endpoints to `src/api/endpoints.ts`) — see the Learn
   feature for the shape: `learnApi` + `useLearningPath` / `useLessonDetail` / `useSubmitLesson` in
   `features/learn/useLearn.ts`, invalidating `queryKeys.learn.all` on mutation success.
3. Nested screens (e.g. the lesson player at `app/lesson/[slug].tsx`) live outside `(tabs)` as top-level
   stack screens inside the `Stack.Protected guard={isSignedIn && !needsOnboarding}` block in
   `app/_layout.tsx`; that hides the tab bar so the screen is truly full-screen.
4. Use theme tokens and `components/ui` — no hard-coded colours.
5. Run `npm run typecheck && npm run lint`.

## Env

| Var | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Without it the app shows a "Clerk key missing" screen. |
| `EXPO_PUBLIC_API_URL` | prod | Optional in dev. |

`EXPO_PUBLIC_*` values are compiled into the app bundle and are visible to anyone — **never** put secrets
(DeepSeek key, Clerk secret key) here. Restart Metro with `--clear` after changing `.env`.
