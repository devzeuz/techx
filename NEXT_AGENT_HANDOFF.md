# TechX — Platform Status & Architecture Summary

> **Core Architecture & Philosophy (`note.local`):**
> 1. TechX is essentially a tech learning platform curating YouTube content — new features enhance it, never replace it.
> 2. Manual curation is preserved and works seamlessly alongside AI curation.
> 3. Only Admins can curate content (both manual playlist import and AI Curator).
> 4. All AI drafts must be reviewed and approved by an Admin before publishing.
> 5. Existing courses, videos, and user progress remain intact.

---

## 1. Live Deployed Architecture

* **Git Branch:** `restructure/core-platform` (Clean, commit `58f83c3`)
* **Live S3 Website:** `http://techx-hosting-bucket.s3-website-us-east-1.amazonaws.com`
* **HTTP API Gateway:** `https://c54htww8j8.execute-api.us-east-1.amazonaws.com`
* **Cognito User Pool ID:** `us-east-1_Ei6OwcKPR`
* **Cognito Client ID:** `67tnfepeir9j7b63qpvrj7sv8b`
* **DynamoDB Main Table:** `techx-tf-main-table`
* **Test Suite:** All 35 tests passing (`pytest module/platform/tests`)

---

## 2. Completed Milestones

### Phase 1 — Core TechX Platform Restored ✅
* Modularized architecture: `module/platform` replaces monolithic Lambdas.
* Imported existing Cognito User Pool & preserved all user data.
* Catalog browsing (`GET /courses`), course detail (`GET /courses/{id}`), and learner APIs (`GET|POST /user` for enrollment, watched lessons, bookmarks, notes).
* Admin manual curation (`POST /admin/ingest`) imports YouTube playlists into the course catalog.

### Phase 2 — AI Audio Descriptions Enhancement ✅
* Cloud pipeline: yt-dlp audio download $\rightarrow$ AWS Transcribe silence detection $\rightarrow$ ffmpeg 720p frame extraction $\rightarrow$ Gemini 2.5 Flash frame analysis $\rightarrow$ Amazon Polly Neural TTS narration.
* API Bridge (`techx-descriptions` Lambda):
  * `POST /admin/descriptions`: Queue videos for description generation with per-request safety caps.
  * `GET /courses/{id}/descriptions`: Course status map for sidebar AD badges.
  * `GET /videos/{id}/descriptions`: Playback cues with real-time presigned S3 audio URLs.
* Learner UI (`CoursePlayer.jsx`):
  * Audio Descriptions ON/OFF toggle.
  * Synchronized extended audio description: auto-pauses YouTube video at timestamp, plays Polly clip, resumes video on completion.
  * Captions display with "Skip" control and screen-reader accessibility (`aria-live`).
  * "AD" badges in course lesson sidebar.
* Admin UI (`AdminDescriptions.jsx`): Course lesson pipeline status tracker and batch generation controls.

### Phase 3 — AI Curator (Agentic Course Creation) ✅
* **Autonomous Agent (`curator.py`):**
  * Powered by **Gemini 2.5 Flash** with function calling.
  * Integrated YouTube tools: `search_youtube`, `get_video_details`, `get_playlist_videos`, `submit_curated_course`.
  * Multi-turn reasoning loop inspects video durations, filters clickbait/Shorts, and structures an ordered pedagogical curriculum.
* **Review-Before-Publish Guarantee:**
  * AI creates a `DRAFT` in DynamoDB (`CURATION#<id>`). It is **NEVER** auto-published to learners.
  * Admin UI (`AdminCurator.jsx`):
    * Natural language prompt input + experience level + max lessons + target duration.
    * Real-time polling with animated status while the agent searches YouTube.
    * Interactive review board: edit course title/description, reorder lessons, remove lessons, add custom YouTube videos, inspect agent reasoning.
    * "Publish to Catalog" action calls the shared `course_writer.py` to write standard `COURSE#` and `VIDEO#` records with `Source: AI_CURATOR`.
    * Duplicate title conflict detection with overwrite confirmation.
### Phase 4 — AI Interactive Tutor / RAG Q&A ✅
* **Grounded Q&A Engine (`tutor.py`):**
  * Two-tier architecture: One-time background pass extracts structured, timestamped lesson notes and on-screen code into DynamoDB (`VIDEO#<ytId> | TUTOR_CONTEXT`).
  * Live questions answer in ~2–4 seconds by prompting over cached notes plus nearby Phase 2 audio-description cues (`DESCRIPTION#<ts>`).
  * Multi-model resilience: Primary `gemini-3.8-flash` with automatic failover to `gemini-3-flash-preview` if Google returns 503/429.
  * Course security guard: Only allows questions for videos that belong to the specified enrolled course.
* **Learner UI (`CoursePlayer.jsx` & `TutorPanel.jsx`):**
  * "Ask AI Tutor" button in player control bar; automatically pauses video on open to prevent audio conflict.
  * Quick prompt chips (*"What's on screen right now?"*, *"Explain what was just taught"*, *"Summarize this lesson"*, *"Read the code shown aloud"*).
  * Timestamps like `[04:12]` in answers render as clickable seek buttons.
  * Accessibility: Screen reader announcements (`aria-live="polite"`), mobile bottom sheet, theme-aware CSS.

---

## 3. API Reference

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/courses` | GET | Learner | Catalog listing (optional `?search=`) |
| `/courses/{id}` | GET | Learner | Course details and ordered lesson list |
| `/user` | GET / POST | Learner | Enrollments, progress, bookmarks, and notes |
| `/courses/{id}/descriptions` | GET | Learner | Per-lesson audio description availability map |
| `/videos/{id}/descriptions` | GET | Learner | Cue timestamps and fresh presigned audio URLs |
| `/videos/{id}/tutor` | GET | Learner | AI Tutor lesson preparation status (`READY`, `PREPARING`, `FAILED`) |
| `/videos/{id}/ask` | POST | Learner | Grounded AI Tutor Q&A with conversational history and timestamp context |
| `/admin/ingest` | POST | Admin | Manual YouTube playlist ingestion |
| `/admin/descriptions` | POST | Admin | Batch queue audio description generation |
| `/admin/curations` | POST | Admin | Start new AI Curator agent job |
| `/admin/curations` | GET | Admin | List active and past curation drafts |
| `/admin/curations/{id}` | GET | Admin | Get specific draft details and lesson list |
| `/admin/curations/{id}` | DELETE | Admin | Delete a curation draft |
| `/admin/curations/{id}/publish` | POST | Admin | Review, approve, and publish draft to course catalog |

---

## 4. Model Version & AI Services
- **Gemini Primary:** `gemini-3.8-flash`
- **Gemini Fallback:** `gemini-3-flash-preview` (automatic failover for traffic spikes / 503)
- **Environment Variables:**
  - `GEMINI_MODEL = "gemini-3.8-flash"`
  - `GEMINI_FALLBACK_MODELS = "gemini-3-flash-preview"`
- **SSM Parameters:**
  - `gemini_api_key` (Google AI Studio Key)
  - `youtube_api_key` (YouTube Data API v3 Key)

