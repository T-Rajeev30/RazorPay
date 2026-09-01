# PayGuard

**Zero-Trust Authorization for AI-Initiated Payments**

> AI proposes. PayGuard authorizes. Razorpay executes.

Built for the Razorpay AI Buildathon — Track 01: AI Growth & Agentic Commerce.

---

## The problem

AI agents are moving from *recommending* purchases to *executing*
them. An agent that can reason about money should not automatically
have unrestricted authority over money. PayGuard is a hard trust
boundary between an AI buyer and payment execution: the LLM can
reason, search, and propose — but it can never independently
authorize a financial transaction. A separate, deterministic policy
engine independently re-verifies every proposal against authoritative
state, both when the proposal is made and again immediately before
payment executes.

```
User → AI Buyer (LLM, untrusted) → Purchase Proposal
     → PayGuard Policy Engine (deterministic, trusted) → ALLOW / DENY / ESCALATE
     → Signed Authorization → Razorpay Test Mode → Append-Only Audit Trail
```

A full architecture write-up is in [`docs/architecture.md`](docs/architecture.md).

---

## What's actually proven, not just claimed

This project underwent a self-directed hostile security audit before
submission — see [`docs/security-model.md`](docs/security-model.md)
for the full findings. Two real gaps were found and fixed, both
verified live against the running system:

- **Execution-time re-verification.** The flagship demo (a merchant
  changing price, caught on re-authorization) only covered one attack
  path. A separate gap allowed a *stale but still-valid* authorization
  to pay out at an old price if the catalog changed after
  authorization but before payment. Fixed: `/api/pay` now
  independently re-fetches and re-verifies price, merchant, currency,
  and stock quantity immediately before touching Razorpay.
- **Non-atomic authorization consumption.** The original
  authorize-then-pay flow had a real (not theoretical) race condition
  where two concurrent payment requests could both pass a
  read-then-write check and reach Razorpay twice. Fixed: consumption
  is now a single atomic database operation.

Claims in this README use precise language deliberately: "append-only
audit events enforced at the application layer" rather than
"immutable audit trail" (it isn't cryptographically immutable); "0
observed false allows across 145 evaluated scenarios" rather than "0%
false allow rate" (a modest sample, not a statistical guarantee);
"Razorpay test-mode order creation" rather than "real payment
execution."

---

## Architecture

```
                 UNTRUSTED
┌──────────────────────────────┐
│ User → AI Buyer (LLM)        │
│ Reasoning, search, proposal  │
└──────────────┬───────────────┘
               │ Proposal only
               ▼
════════════ TRUST BOUNDARY ════════════
               ▼
┌──────────────────────────────┐
│ PayGuard Policy Engine        │
│ Agent identity · Merchant     │
│ Product · Quantity · Currency │
│ Price integrity · Budget      │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Authorization Service         │
│ Signed (HMAC-SHA256)          │
│ TTL · Replay-protected        │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Execution Boundary (/api/pay) │
│ Re-verifies price/merchant/   │
│ currency/quantity, then       │
│ atomically consumes           │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Razorpay Test Mode             │
└──────────────────────────────┘
               │
               ▼
        Audit Trail (append-only)
```

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express, plain JavaScript |
| Database | MongoDB (Atlas) |
| AI Agent | Python + FastAPI, Groq (`openai/gpt-oss-120b`) |
| Frontend | React + Vite, plain JavaScript, Tailwind CSS |
| Payments | Razorpay test-mode APIs |
| Testing | Jest (backend), pytest (agent) |

---

## Repository structure

```
payguard/
├── backend/          Express API — policy engine, authorization,
│                      audit, Razorpay integration
├── agent/             Python FastAPI — AI buyer (Groq LLM)
├── frontend/          React dashboard — 6 screens, all wired to
│                      real backend data
├── evaluation/        Synthetic scenario runner against the live
│                      backend (not hardcoded results)
└── docs/              Architecture, threat model, security model
```

---

## Prerequisites

- Node.js 18+
- Python 3.11+
- A MongoDB Atlas account (free tier is sufficient)
- A Razorpay account with test-mode API keys ([console.razorpay.com](https://dashboard.razorpay.com), free, no KYC needed for test mode)
- A Groq API key ([console.groq.com](https://console.groq.com), free tier)

---

## Environment variables

**`backend/.env`** (copy from `backend/.env.example`):
```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/payguard
AUTHORIZATION_SIGNING_SECRET=replace-with-a-long-random-string
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
PORT=4000
```

**`agent/.env`** (copy from `agent/.env.example`):
```
GROQ_API_KEY=gsk_your_key_here
PAYGUARD_BACKEND_URL=http://localhost:4000/api
AGENT_ID=shopping-agent-01
MERCHANT_ID=merchant_123
PORT=8001
```

---

## Local setup

Three terminals, run in order:

**1. Backend**
```bash
cd backend
npm install
npm start
```
Wait for `[mongo] connected` and `PayGuard backend listening on port 4000`.

**2. Seed the database** (once, before first use — in a new terminal)
```bash
cd backend
node src/seed.js
```
This creates a demo merchant catalog (a cheap product and an
expensive one, used for the budget-escalation demo) and a demo
`AgentPolicy` record.

**3. AI Agent**
```bash
cd agent
python -m venv venv
# Windows:
.\venv\Scripts\Activate.ps1
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

**4. Frontend**
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

---

## Running the tests

**Backend (Jest):**
```bash
cd backend
npm test
```
40/40 tests passing across `policyEngine`, `authorizationService`,
`auditService`, and `razorpayService`.

**Agent (pytest):**
```bash
cd agent
python -m pytest
```
9/9 tests passing, including a dedicated test proving the agent layer
carries no authority of its own — even a proposal generated from a
prompt-injection attempt is just a proposal, never an approval.

---

## Running the evaluation

```bash
node evaluation/runEvaluation.js
```

Requires the backend running and seeded. Executes ~145 real HTTP
requests against the live backend (a mix of legitimate purchases and
6 attack types) and reports actual False Allow Rate, False Block
Rate, per-attack-type detection rate, and average policy evaluation
latency. Results are written to `evaluation/results/latest.json` and
viewable in the frontend's Evaluation screen.

**Last run:** 145/145 scenarios, 0 observed false allows, 0 observed
false blocks, ~308ms average policy latency. See
[`docs/security-model.md`](docs/security-model.md) for how to
interpret this honestly — 145 scenarios is evidence at the scale that
was feasible, not a statistical guarantee of a 0% rate in general.

---

## Demo scenarios (walk through the frontend)

1. **AI Buyer** (`/ai-buyer`) — type a natural-language purchase
   request, or use the built-in presets. Try the "prompt injection
   attempt" preset to see the AI comply with a malicious instruction
   while the policy engine ignores that compliance entirely.
2. **Attack Simulator** (`/attack-simulator`) — 6 of 8 attacks wired
   to real backend logic: Price Manipulation, Quantity Manipulation,
   Budget Escalation, Merchant Substitution, Currency Manipulation,
   Replay Attack. Each shows a real step-by-step trace, not a scripted
   animation.
3. **Human Approvals** (`/human-approvals`) — approve or reject
   pending escalated transactions; both actions call the real backend
   and write real audit events.
4. **Audit Log** (`/audit-log`) — every event from the above, live,
   filterable by type and decision.
5. **Dashboard** (`/`) — real-time stats and activity feed.
6. **Evaluation** (`/evaluation`) — the real 145-scenario results.

---

## Known limitations

- **Stale Authorization and Duplicate Payment** attack-simulator
  buttons are marked "manual only" rather than wired to a one-click
  demo — they require either waiting out the real 30-second TTL or an
  already-consumed authorization, both awkward to trigger cleanly from
  a single click without faking the result.
- **Evaluation sample size** is ~145 scenarios, not the 1000+ envisioned
  in early planning — judged not worth the added time risk given the
  live Attack Simulator already demonstrates correctness more
  convincingly to a human reviewer than a larger synthetic suite would.
- **No live deployment** — not required by the Buildathon's actual
  deliverables (public repo, 5-minute video, architecture explanation).
  Everything above runs locally.
- Execution-time re-verification does not currently re-check agent
  identity/capability drift (e.g., an agent's policy being revoked
  mid-flight) — price, merchant, currency, and stock are covered; this
  would be the next thing to harden with more time.

---

## License

Built for the Razorpay AI Buildathon. Not licensed for production use as-is.
