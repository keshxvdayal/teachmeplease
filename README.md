# TeachMePlease

Practice real-life professional conversations with AI before they happen. Users pick a scenario, talk (voice or text) with an AI client who has their own goals, and get a scorecard with specific, actionable feedback.

**MVP track:** Client Communication, 9 scenarios:

| Beginner | Intermediate | Advanced |
|---|---|---|
| First Call with a New Lead | Pricing Negotiation | Difficult Client |
| Rush Request | Scope Creep | Delivering Bad News (missed deadline) |
| | Overdue Payment | Unhappy with the Work |
| | Raising Your Rates | |

Languages: English, Hindi, Hinglish.

**Conversation features**
- **Client memory and mood.** Each reply returns a mood (frustrated → skeptical → neutral → warming → cooperative) and private notes: offers, numbers, what's been revealed. These are fed back on the next turn. Mood moves at most one step per turn, and the notes are never sent to the browser.
- **Hands-free voice calls.** The client's reply is spoken, then the mic opens automatically. A 1.5-second pause ends your turn, and you get 2 seconds to edit before it sends. Push-to-talk and typing are always available.
- **Character voices.** A browser voice is picked to match each persona's gender, with per-character rate and pitch. Speech is split into sentences, because Chrome cuts off long single utterances.
- **Coach hints.** Up to 2 per session. The coach only sees the user's goal, never the client's hidden information.

---

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS 4, lucide icons, Inter |
| Database | PostgreSQL via Prisma 6 |
| AI | Google Gemini (`gemini-2.5-flash`) via REST, behind a provider interface |
| Voice | Pipecat SmallWebRTC speech service: Whisper STT + Kokoro TTS, push-to-talk |
| Auth | Email + password (scrypt), httpOnly cookie sessions; signed anonymous-visitor cookie |
| Tests | Vitest (unit + integration against a real Postgres test DB) |

## Quick start

Requirements: Node 20.9+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env            # then fill in the values below
createdb teachmeplease
npx prisma migrate dev          # creates tables
npm run dev                     # http://localhost:3000
```

Get a Gemini key at https://aistudio.google.com/apikey and put it in `GEMINI_API_KEY`. Without a key the app still runs. Sessions start, but AI replies return a friendly "not configured" error and the user's message is kept for retry.

### Voice agent

Voice calls run through a small speech service in `voice-agent/` (Pipecat). It only listens
and speaks: Whisper turns the learner's speech into text, the text goes through the same
`/api/sessions/:id/messages` endpoint as typed replies (so mood, patience, the end of the
call and the scorecard work identically), and Kokoro speaks the client's reply. It needs no
API key.

Calls are push-to-talk: hold the mic button (or Space) while speaking and let go to send.
The agent only hears audio while the button is held, so it never mistakes the client's voice
for the learner's, and pressing the button interrupts the client mid-sentence.

Run it locally with [uv](https://docs.astral.sh/uv/) and Python 3.12:

```bash
cd voice-agent
uv venv --python 3.12
uv sync
cp .env.example .env
uv run python server.py         # wait for "Speech models loaded"
```

On startup the service downloads and loads the Whisper and Kokoro models (about 0.8 GB on
the first run). On Apple Silicon Whisper runs on the GPU through MLX; elsewhere it runs on the
CPU with faster-whisper. Set `NEXT_PUBLIC_PIPECAT_URL` only when the service is not at
`http://127.0.0.1:7860/api/offer`.

### Patience and the end of a call

Each scenario has a `patience` level (defaults: beginner 6, intermediate 5, advanced 4).
After every reply the client's model rates the learner's message: vague, evasive or pushy
replies cost one point, rude or nonsensical ones cost two, and a clearly strong move wins one
back. At zero the client hangs up. The call also ends when the client wraps it up (an
agreement or next step is settled) or the turns run out. Once a call has ended the session
accepts no more messages and the feedback opens automatically.

#### Deploying the voice agent (Oracle Cloud Always Free)

The app on Vercel can't host the voice agent: it needs a long-running process, about
1.5 GB of RAM and UDP ports for WebRTC. An Oracle Cloud Always Free ARM VM (up to
4 cores and 24 GB RAM) runs it at no cost. Without a GPU, expect about 2-4 calls at once.

1. **Create the VM:** shape `VM.Standard.A1.Flex` (ARM, 2-4 OCPUs, 8+ GB RAM), Ubuntu 24.04.
2. **Open ports** in the VCN security list: TCP 80 and 443, and UDP 1024-65535 for call
   audio. Oracle's Ubuntu images also block them in the VM's own firewall:
   ```bash
   sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
   sudo iptables -I INPUT -p udp --dport 1024:65535 -j ACCEPT
   sudo netfilter-persistent save
   ```
3. **Install Docker and start the agent.** `DOMAIN` can be a free hostname made from the
   VM's public IP, e.g. `203-0-113-7.sslip.io`; Caddy gets an HTTPS certificate for it.
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   git clone <this repo> && cd teachmeplease/voice-agent
   cp .env.example .env
   # in .env: HOST="127.0.0.1", ALLOWED_ORIGINS="https://your-app.vercel.app"
   sudo DOMAIN=203-0-113-7.sslip.io docker compose up -d --build
   curl https://203-0-113-7.sslip.io/health
   ```
4. **Point the app at it:** in Vercel set
   `NEXT_PUBLIC_PIPECAT_URL=https://203-0-113-7.sslip.io/api/offer` and redeploy.
5. **Add a TURN server** before real users. STUN alone fails on some mobile and corporate
   networks; a TURN relay fixes that. Several providers have free tiers. Put its details in
   `ICE_SERVERS` (see `voice-agent/.env.example`); the browser picks them up automatically.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `GEMINI_API_KEY` | yes | Server-side only. Never prefix with `NEXT_PUBLIC_` |
| `SESSION_SECRET` | yes (prod) | 32+ random chars; signs cookies, hashes IPs. `openssl rand -base64 32` |
| `GEMINI_MODEL` | no | Default `gemini-2.5-flash` |
| `GEMINI_FALLBACK_MODEL` | no | Comma-separated models tried in order when the previous one is rate limited, unavailable or too slow, e.g. `gemini-2.5-flash,gemini-3.5-flash-lite`. Each model has its own free-tier quota, and a rate-limited model is skipped until it cools down |
| `ADMIN_TOKEN` | no | Bearer token for `/api/admin/*` |
| `APP_URL` | no | Public URL used in metadata |
| `CONTACT_EMAIL` | no | Shown in footer, privacy policy, terms |
| `LIMIT_*` | no | Usage limits, see `src/lib/config/limits.ts` |
| `RETENTION_ANON_DAYS` / `RETENTION_USER_DAYS` | no | Data retention (default 30 / 365) |

### Scripts

```bash
npm run dev                  # dev server
npm run build && npm start   # production
npm test                     # unit + integration tests (uses the <db>_test database)
npm run typecheck
npm run scenarios:validate   # validate all scenario JSON files
npm run eval:ai              # run scripted conversations against real Gemini; writes eval-output/
npm run db:cleanup           # delete data past retention (schedule daily)
```

Integration tests need a test database: `createdb teachmeplease_test` (or set `TEST_DATABASE_URL`). Migrations are applied automatically.

---

## Adding a scenario (no code changes)

1. Copy `content/scenarios/pricing-negotiation.json` to `content/scenarios/<your-id>.json`.
2. Edit the fields:
   - **Shown to users:** `title`, `description`, `difficulty`, `estimated_duration`, `skills`, `user_role`, `user_goal`, `persona_description`, `personality_traits`
   - **Hidden (server only):** `scenario_context`, `ai_goal`, `ai_constraints`, `behavior_rules`, `success_conditions`, `failure_conditions`, `scoring_criteria`, `dimension_guidance`
   - **Languages:** `language_modes`, `default_language`, and a `localizations.<lang>` entry (persona name/role, opening line) for each non-English mode
   - **Session:** `max_turns`, `min_turns_for_scorecard`, `is_active`, `order`
3. Run `npm run scenarios:validate`. It reports the file and field of any error.
4. Run `npm run eval:ai` (add a case in `scripts/eval-ai.ts`) and read the transcripts before launching.

To retire a scenario, set `"is_active": false`. Past sessions keep rendering. Bump `version` when you change behaviour materially; each session records the version it used.

**Adding a track:** add an entry to `content/tracks.json` (`status: "coming_soon"` puts it on the waitlist; `"active"` makes it practicable), then add scenarios with that `track_id`.

**Adding a language:** add an entry to `src/lib/config/languages.ts` (prompt instruction, speech locales, TTS locale) and to the `languageId` enum in `src/lib/scenarios/schema.ts`.

---

## Architecture

```
content/                      Scenario + track data (JSON)
src/lib/
  scenarios/                  Schema validation, loader, public projection (hides secrets)
  ai/                         Provider interface + Gemini implementation (only file that knows the vendor)
  roleplay/                   Persona system prompt, output validation, leak/role-break checks
  scoring/                    Rubric prompt, JSON schema, validation, overall score in code
  sessions/service.ts         Session lifecycle: create, send (locked, idempotent), score (once), history
  usage/                      Daily limits per visitor/user/IP, global AI cap, token + cost tracking
  auth/                       Password hashing, cookies, access control
  waitlist/  analytics.ts  retention.ts
src/app/                      Pages + thin API route handlers
```

**Request flow for one turn:** browser → `POST /api/sessions/:id/messages` → ownership check → per-session DB lock → limit checks → user message saved → roleplay engine → Gemini → output validated → AI message saved → lock released.

**Reliability:**
- Each message has a client-generated id, so duplicate submits are no-ops.
- If the AI fails, the user's message is kept and the UI offers Retry (with a countdown on rate limits).
- Scoring uses an atomic status transition, so double-clicks never create two scorecards.
- Invalid model JSON is retried once. After that the session is marked `scoring_failed` and keeps its transcript, with up to 3 attempts.

**Security:**
- API keys and prompts stay on the server, and hidden scenario fields are never sent to the browser.
- Sessions are only visible to their owner. Anyone else gets a 404, so session IDs can't be probed.
- Mutating requests from other origins are rejected.
- All limits are enforced on the server, and anonymous limits are also capped per hashed IP.
- No audio is ever stored.

### Database

`User`, `AuthSession`, `AnonymousVisitor`, `PracticeSession` (status, turns, scorecard JSON, scoring version, model), `Message` (speaker, text, turn, clientMessageId), `WaitlistEntry` (unique email+track), `UsageEvent` (tokens, latency, est. cost, errors), `AnalyticsEvent` (allow-listed names). All timestamps are UTC `timestamptz` and are shown in the viewer's local time.

### Pricing readiness

`src/lib/config/plans.ts` defines Free / Plus / Pro with ISO currency codes, minor-unit prices and entitlements. Every user is `free`. No checkout is shown. Payments are out of scope.

---

## Admin

```bash
# Waitlist CSV export
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/api/admin/waitlist -o waitlist.csv
# AI usage, cost, errors, sessions by scenario/status, events (last 7 days; ?days=30)
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/api/admin/usage
# Retention cleanup (alternative to npm run db:cleanup)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/api/admin/cleanup
```

## Deploying to Azure

**Option A: Azure Container Apps / App Service for Containers (recommended).** The included `Dockerfile` builds a standalone image that runs `prisma migrate deploy` on start.

```bash
az acr build -r <registry> -t teachmeplease:latest .
# Create the app from the image, set env vars (DATABASE_URL, GEMINI_API_KEY, SESSION_SECRET, ADMIN_TOKEN, APP_URL), port 8080.
```

**Option B: App Service (Node 22, Linux).** Build with `npm ci && npm run build`, deploy, run `npx prisma migrate deploy`, and use the startup command `node .next/standalone/server.js`. Copy `.next/static` and `content/` next to it, as the Dockerfile does.

**Database:** Azure Database for PostgreSQL Flexible Server (Burstable B1ms is enough for the pilot). Use `?sslmode=require` in `DATABASE_URL`.

**Daily cleanup:** schedule `POST /api/admin/cleanup` (Logic App or GitHub Action cron).

### Vercel

Vercel uses the `vercel-build` script to run `prisma migrate deploy` before building the application. Configure `DATABASE_URL`, `GEMINI_API_KEY`, and `SESSION_SECRET` in the Vercel project for the relevant environment, then redeploy after adding or changing an environment variable. Vercel environment-variable changes do not update an existing deployment.

Store secrets in App Settings or Key Vault, never in the repo.

## Cost estimate

One 7-turn session is about 9 Gemini calls: roughly 17k input tokens and 2k output tokens, including scoring with a small thinking budget.

- **Free tier:** $0, but small. As of October 2026, `gemini-2.5-flash` allows **20 requests per day per project**, about 2 sessions, plus a few requests per minute. Set `GEMINI_FALLBACK_MODEL` to spread load across models' separate quotas. Check https://ai.dev/rate-limit for current values. `LIMIT_GLOBAL_AI_REQUESTS_PER_DAY` (default 240) is an app-wide safety cap.
- **Paid tier** at 2.5 Flash list prices ($0.30/M input, $2.50/M output): about **$0.01 per session**, or about $10 per 1,000 sessions.
- **Hosting:** about $15–40/month (small container + B1ms Postgres).

## Known limitations and next steps

- **Gemini free-tier data use:** on the unpaid tier Google may use prompts and responses to improve its products. Move to a paid tier before real users and confirm the current terms. The privacy policy already discloses AI processing.
- **The free-tier quota is too small for real users** (see the cost estimate above). Enable billing before a pilot.
- **Fallback model quality:** `gemini-3.5-flash-lite` stays in character and scores sensibly in our evals, but is lighter than 2.5 Flash. Spot-check it with `npm run eval:ai`.
- **Voice** requires the separate Pipecat service (`voice-agent/`), hosted outside Vercel. Text mode works without it. Kokoro's voice follows the scenario's gender; override it with `KOKORO_VOICE` in `voice-agent/.env`.
- **Hinglish** speech recognition is imperfect (users can edit before sending). Validate Hindi and Hinglish roleplay quality with native speakers before marketing it.
- **Auth** is email + password only. Google sign-in, password reset and email verification are not built yet. Password reset needs an email provider.
- **Interface language** is English only. The conversation language is separate and selectable.
- **Legal pages** are good-faith drafts. Have them reviewed before launch, and fill in your company details.
- **In-memory rate limiting** on sign-in/sign-up/waitlist is per instance. The authoritative usage limits are in the database.
- **No end-to-end browser tests** yet. Playwright would be the next addition.
