# Wariku

Finance education app: **Learn** (Duolingo-style lessons), **Money** (personal finance management) and
**Ask AI** (a DeepSeek-powered finance assistant).

| Folder | What |
|---|---|
| [`mobile/`](mobile) | Expo (React Native) app — Clerk auth, expo-router, React Query |
| [`backend/`](backend) | Express + MongoDB API — Clerk session verification, DeepSeek |
| [`docs/`](docs) | [Auth setup](docs/AUTH.md) · [Roadmap & feature specs](docs/ROADMAP.md) |

**Start here:** [`AGENTS.md`](AGENTS.md) — architecture, local setup, conventions (written for humans and AI
coding agents alike).

```bash
cd backend && npm install && cp .env.example .env.dev && npm run dev   # fill in keys first
cd mobile  && npm install && cp .env.example .env && npm start
```
