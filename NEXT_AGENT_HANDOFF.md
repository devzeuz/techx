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
* **Test Suite:** All 26 tests passing (`pytest module/platform/tests`)

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
    * Curation history list to resume or manage drafts.

---

## 3. API Reference

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/courses` | GET | Learner | Catalog listing (optional `?search=`) |
| `/courses/{id}` | GET | Learner | Course details and ordered lesson list |
| `/user` | GET / POST | Learner | Enrollments, progress, bookmarks, and notes |
| `/courses/{id}/descriptions` | GET | Learner | Per-lesson audio description availability map |
| `/videos/{id}/descriptions` | GET | Learner | Cue timestamps and fresh presigned audio URLs |
| `/admin/ingest` | POST | Admin | Manual YouTube playlist ingestion |
| `/admin/descriptions` | POST | Admin | Batch queue audio description generation |
| `/admin/curations` | POST | Admin | Start new AI Curator agent job |
| `/admin/curations` | GET | Admin | List active and past curation drafts |
| `/admin/curations/{id}` | GET | Admin | Get specific draft details and lesson list |
| `/admin/curations/{id}` | DELETE | Admin | Delete a curation draft |
| `/admin/curations/{id}/publish` | POST | Admin | Review, approve, and publish draft to course catalog |

---

## 7. Model Version & AI Services
- **Gemini Model:** `gemini-3.8-flash` (Upgraded from `gemini-2.5-flash` following Google deprecation).
- **Environment Variables:** `GEMINI_MODEL = "gemini-3.8-flash"` configured across `techx-curator` and `techx-gemini-describer`.
- **SSM Parameters:**
  - `gemini_api_key` (Google AI Studio Key)
  - `youtube_api_key` (YouTube Data API v3 Key)
