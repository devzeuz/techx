# TechX × Gemini Xprize — Compliance Gap Analysis

> **Competition:** Build with Gemini XPRIZE (concluded Sept 2026)
> **Category:** Education & Human Potential
> **Prize Pool:** $2,000,000 + $50K Agentic Economy bonus (Circle)

---

## ✅ What TechX Already Has (Strengths)

| Requirement | Status | Evidence |
|---|---|---|
| Gemini API integration (core mandated) | ✅ Planned (Phase 2) | `gemini_api_key` in SSM, IAM policy grants |
| Google Cloud native product | ✅ Architecture ready | Gemini Vision API wired into IAM + Lambda |
| Education & Human Potential category fit | ✅ Strong | Audio descriptions for visually impaired learners — textbook fit |
| Functional working product | ✅ Live | API GW, 4 Lambdas, DynamoDB, S3 deployed |
| AI-driven core workflow | ✅ Partially | Phase 1 pipeline (yt-dlp → Transcribe → frames) is live |
| Source code repository | ✅ Exists | `/Users/barb/Documents/My Projects/techx` |
| Infrastructure-as-Code | ✅ Strong | Full Terraform with tagging, state, modules |

---

## 🔴 Critical Gaps (Must Fix)

### 1. Gemini is Not Yet Called — Phase 2 is Incomplete
**Requirement:** Core business workflow must natively use Gemini API.
**Gap:** Right now, the pipeline stops at frame extraction. Gemini Vision is SSM-configured but never invoked.
**Fix:** Complete Phase 2 — `techx-gemini-describer` Lambda that calls `gemini-3.8-flash` with each frame image and generates a scene description.

---

### 2. No Real Users / No Revenue Evidence
**Requirement:** Proof of real production users + revenue (billing logs, P&L).
**Gap:** No users, no monetization layer exists.
**Fix (minimum viable):**
- Add a **freemium model** — free tier (5 videos/month), paid tier ($9.99/mo for unlimited + Q&A)
- Integrate **Stripe** for payment processing
- Capture at least **10–20 real beta users** with email capture on the frontend
- Export billing dashboard from AWS Cost Explorer as evidence

---

### 3. AI Agents Are Not Orchestrated — It's a Pipeline, Not an Agent System
**Requirement:** "Core business workflow operated by AI agents."
**Gap:** The system is a chain of Lambda functions with event triggers. Judges look for agents making *decisions*, not just running steps.
**Fix:** Wrap Phase 2 with an **orchestration agent** using the Gemini API's function-calling capability:
- Agent decides whether a frame is "description-worthy" (filters low-info frames)
- Agent decides the *type* of description to generate (code screen vs. diagram vs. slide vs. UI demo)
- Agent responds to user Q&A about video content (the RAG feature from your brainstorm)

---

### 4. No 3-Minute Video Pitch
**Requirement:** 3-minute technical video showing AI agents making decisions live in production.
**Gap:** Not created.
**Fix:** Record a Loom/OBS video showing:
1. Paste a YouTube URL → pipeline fires
2. Frames appear in S3
3. Gemini agent analyzes frames → descriptions generated
4. Frontend plays video + audio descriptions seamlessly
5. User asks a question → Gemini RAG answers

---

### 5. No Written Narrative (500–1000 words)
**Requirement:** Case study covering: operational workflow, human vs. AI tasks, future economic potential.
**Gap:** Not written.
**Fix:** Write it now — easy given the architecture clarity.

---

### 6. No Q&A / RAG Feature (Brainstorm Item)
**Requirement:** Category impact — judges want *depth* of AI use.
**Gap:** The brainstorm mentions "users can ask AI questions based on descriptions made" — this is not built.
**Fix (Phase 3):** Add a `/ask` API endpoint:
- Stores all Gemini-generated descriptions per video in DynamoDB
- User submits a question about the video
- Gemini answers using those stored descriptions as context (simple RAG)
- This is a strong differentiator and demonstrates true "AI-Native" operation

---

### 7. Frontend Shows 0 Videos to New Visitors
**Requirement:** Judges must be able to test the product directly.
**Gap:** Without pre-seeded data, judges see an empty library.
**Fix:** Pre-seed DynamoDB with 5–10 fully processed videos (Frames Ready + descriptions generated) so judges immediately see value.

---

## 🟡 Recommended Enhancements (Score Boosters)

| Enhancement | Xprize Pillar | Effort |
|---|---|---|
| Stripe subscription ($9.99/mo) | Business Viability | Medium |
| User auth (Cognito or simple email) | Business Viability | Medium |
| Q&A chatbot using stored descriptions (RAG) | AI-Native + Category Impact | Medium |
| Amazon Polly TTS to actually *play* descriptions in-player | Category Impact | Low |
| Accessibility audit (a11y — WCAG 2.1 AA) | Category Impact | Low |
| Usage analytics dashboard (CloudWatch or Posthog) | Business Viability | Low |
| $50K Agentic Economy bonus — AI pays for API calls via Circle | Bonus Prize | Low-Medium |

---

## 📋 Priority Build Order (Xprize-Optimized Roadmap)

```
Phase 2  ──▶  Gemini Vision describer Lambda        [CRITICAL — unlocks Gemini mandate]
Phase 3  ──▶  Polly TTS audio synthesis + player     [CRITICAL — completes the user experience]
Phase 4  ──▶  Gemini RAG Q&A (/ask endpoint)         [HIGH — "AI agent" narrative]
Phase 5  ──▶  Stripe + email signup (monetization)   [HIGH — business viability proof]
Phase 6  ──▶  Pre-seed library + live demo video      [MEDIUM — judge experience]
Phase 7  ──▶  Written narrative + submission package  [REQUIRED — documentation]
```

---

## 🏆 Competitive Positioning

TechX sits perfectly in **Education & Human Potential**. The specific niche of
**AI audio descriptions for visually impaired tech learners** is:

1. **Underserved** — no major platform does this for tech tutorials
2. **Gemini-native** — Vision API is the core value-add, not a wrapper
3. **Measurable impact** — can cite % of tech tutorials currently inaccessible (>95%)
4. **Expansion story** — Phase 2 is YouTube; Phase 3 is Coursera/Udemy API; Phase 4 is live coding streams

The main risk is **business viability proof** — judges will want to see real revenue or at least committed beta users. Even 10 paying users at $9.99/mo ($100 MRR) with a billing screenshot is enough to satisfy this criterion.

---

> **Bottom line:** Complete Phase 2 + 3, add Stripe, record the pitch video, and write the narrative.
> That is a **fully compliant submission** with a strong shot at the Education category prize.
