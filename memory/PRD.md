# Still Alive — Creator + Brand Intelligence (PRD)

## Original Problem Statement
Multi-agent AI system that analyses, simulates and optimises creator AND brand-campaign content for YouTube / Instagram / X. 7 agents grounded in real channel data. Real Indian Kanoon legal cross-verification. Mode-tuned outputs (SAFE / CONTROVERSIAL / AGGRESSIVE) that read distinctly different. Brand-fit discovery (real brands, CPMs, placements) — not generic celebrity placements.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). 7-agent pipeline using `google-generativeai` SDK (Gemini 2.5 Flash). Real Indian Kanoon API cross-verify. Channel scraping via yt-dlp / instaloader / nitter. Pipeline runs in dedicated daemon thread (event-loop safe).
- **Frontend**: React 19 + Tailwind + Shadcn UI. Swiss Brutalist "Signal Room" design (Cabinet Grotesk + IBM Plex Mono).
- **Auth**: JWT email/password with bcrypt. Cookie + Bearer. 7-day TTL. NO Emergent dependency.

## Phase A — DONE (2026-05)
- ✅ Removed all Emergent integrations (LLM key + Auth)
- ✅ Custom JWT email/password auth (register / login / me / logout / profile update)
- ✅ Profile page with 8 social links; **gate**: Instagram OR YouTube required to run analyses
- ✅ Real Gemini API direct (`gemini-2.5-flash`) — own API key
- ✅ Real Indian Kanoon API integration: every legal flag is cross-verified against indiankanoon.org with clickable case citations
- ✅ Real channel scraping (yt-dlp + instaloader + nitter) — recent posts feed agents 3, 4, 5, 6, 7 as ground truth
- ✅ Mode-specific system prompts: SAFE / CONTROVERSIAL / AGGRESSIVE produce truly different outputs (verified: 3 distinct script versions, agent3 backlash% scales with mode, agent5 includes `primary_recommended` and `what_changed`)
- ✅ Content Breakdown rewrite: people_named / entities / claims / numbers_stats / quotes / references / hook_strength / audience_relevance — concrete, factual, no vibes
- ✅ Edit & Re-Run on existing analysis (POST /api/analyses/{id}/rerun) — overrides metadata + replays 7 agents
- ✅ Brand mode (subject_type=brand) with brand_name + campaign_goal fields; agent prompts adapt
- ✅ Hidden brand-fit DISCOVERY (Agent 7): 5-7 real brand fits with category, placement_idea, match_reason, est_cpm_inr — explores D2C/fintech/edtech/etc., NOT just celebrity placements
- ✅ Audience predicted_outcome: WILL LIKELY GO LIVE WELL / MIXED / UNDERPERFORM with reasoning
- ✅ Rebranded "Creator.Intel" → "Still Alive"
- ✅ Pipeline: thread-isolated, sequential agent steps, retry-on-transient (3x), partial failures surfaced

## Phase B — TODO
- Razorpay subscription (3 tiers × monthly/6-month/yearly toggle) with feature gating
- Real YouTube Data API v3 ingestion (placeholder env var ready)
- Comprehensive pytest test suite for real-world scenarios (creator, brand, edge cases)
- Forgot-password (deferred per user)
- Background re-fetch of channel data with caching

## Personas
- Indian YouTubers / IG reels creators (finance, education, comedy, tech)
- Brand managers running campaigns on social
- Audiences: students, traders, gamers, founders, professionals, homemakers

## Backend integrations summary
| Service | Method | Key var |
|---|---|---|
| Gemini 2.5 Flash | google-generativeai SDK | `GEMINI_API_KEY` |
| Indian Kanoon | direct REST POST `/search/` | `INDIAN_KANOON_TOKEN` |
| YouTube scrape | yt-dlp (no key) | — |
| Instagram scrape | instaloader | — |
| X/Twitter scrape | nitter mirrors | — |
| Razorpay (Phase B) | razorpay-python | `RAZORPAY_KEY_ID/SECRET` |

## Recent dates
- 2026-04-25: v1.0 MVP shipped (Emergent stack)
- 2026-05-08: v2.0 — full migration to Gemini + JWT + real Indian Kanoon + channel scraping + Brand mode + Edit/re-run + Still Alive rebrand
