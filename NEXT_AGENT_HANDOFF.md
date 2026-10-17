# TechX — Project Status & Lead for Next Phase (Phase 3)

> **Quick Context & Core Principles (`note.local`):**
> 1. TechX is essentially a tech learning platform curating YouTube content — new features enhance it, never replace it.
> 2. Manual curation must NOT be removed.
> 3. Only Admins can curate (both manual and AI).
> 4. AI drafts must be reviewed by Admin before publishing.
> 5. Keep existing data intact.

---

## 1. Current Deployed State

* **Active Git Branch:** `restructure/core-platform` (clean, all committed).
* **Live Endpoints:**
  * **Frontend:** `http://techx-hosting-bucket.s3-website-us-east-1.amazonaws.com`
  * **API Gateway:** `https://c54htww8j8.execute-api.us-east-1.amazonaws.com`
  * **Cognito User Pool ID:** `us-east-1_Ei6OwcKPR`
  * **Cognito Client ID:** `67tnfepeir9j7b63qpvrj7sv8b`
* **Python Test Suite:** All 20 tests pass:
  ```bash
  PYTHONDONTWRITEBYTECODE=1 /Users/barb/.gemini/antigravity-ide/brain/04b7cf06-a037-4dbc-87ca-e3d7906a8ed2/scratch/venv/bin/pytest module/platform/tests -q -p no:cacheprovider
  ```

---

## 2. Completed Phases

### Phase 1 — Core Platform Restored & Modularized ✅
* Restored catalog (`GET /courses`), course detail (`GET /courses/{id}`), and learner interactions (`GET|POST /user`: enroll, progress, bookmarks, notes).
* Admin manual curation (`POST /admin/ingest`) imports playlists into the catalog.
* Cognito JWT authorizer protects platform and admin routes; identity is extracted server-side from claims.

### Phase 2 — Audio Descriptions Enhancement ✅
* **Backend Pipeline:**
  * `audio_downloader`: yt-dlp audio download + ffmpeg MP3 conversion + AWS Transcribe start.
  * `pause_map_builder`: parses Transcribe JSON, selects top 30 pauses spaced $\ge 20$s apart.
  * `frame_extractor`: downloads 720p video, extracts JPEG frames at pauses with ffmpeg.
  * `gemini_describer`: Gemini 2.5 Flash classifies frames, filters low-info screens, generates descriptions, and synthesizes audio with Amazon Polly Neural TTS.
* **Descriptions API Bridge (`techx-descriptions` Lambda):**
  * `POST /admin/descriptions`: Admin queues course videos (capped at 10 per batch, skips ready/in-progress).
  * `GET /courses/{id}/descriptions`: Returns per-video status map for sidebar badges.
  * `GET /videos/{id}/descriptions`: Returns cues with fresh presigned Polly audio URLs (re-signed on read).
* **Frontend:**
  * `CoursePlayer.jsx`: Audio Descriptions ON/OFF toggle, auto-pause video $\rightarrow$ play Polly narration $\rightarrow$ resume video upon reaching timestamps, visual caption overlay with "Skip", screen-reader announcement (`aria-live`), and "AD" badges in the course content sidebar.
  * `Admin.jsx`: Tabbed navigation (Tab 1: "Manual Import", Tab 2: "Audio Descriptions" via `AdminDescriptions.jsx` for viewing processing states and queuing batches).
* **Infrastructure:**
  * All Terraform applied and frontend synced to S3 hosting bucket.

---

## 3. Next Phase: Phase 3 — AI Curator

### Goal
Allow admins to provide a natural language prompt/brief (e.g., *"Modern TypeScript and React patterns for senior developers"*), and have an AI agent search YouTube, curate the best video sequence, explain its choices, and present a structured draft in the Admin panel for review, reordering, and publishing.

### Key Requirements
1. **Admin Only:** Only users in the Cognito `Admin` group can trigger the AI Curator or view/publish drafts.
2. **Review Before Publish:** AI creates a `DRAFT` in DynamoDB (`CURATION#<id>`). It is NEVER auto-published directly into the course catalog.
3. **Shared Publishing Engine:** When the Admin approves/edits the draft and clicks "Publish", it calls the shared `course_writer.py` to create standard `COURSE#` and `VIDEO#` records identical to manual curation, setting `Source: "AI_CURATOR"`.
4. **Agent Tools:**
   * Gemini 2.5 Flash function calling with tools:
     * `search_youtube(query, max_results)`
     * `get_video_details(video_ids)` (duration, view count, channel, publish date, captions)
     * `get_playlist_items(playlist_id)` (option to adopt/curate an existing high-quality playlist)

### Step-by-Step Implementation Roadmap for Phase 3

1. **Curator Agent Lambda (`module/platform/src/curator.py`):**
   * Expose routes:
     * `POST /admin/curations`: starts job (async or step), returns `{ curationId }`.
     * `GET /admin/curations`: list curation drafts.
     * `GET /admin/curations/{id}`: get draft details, lessons, and agent reasoning.
     * `POST /admin/curations/{id}/publish`: takes edited/reordered lessons and writes to catalog via `course_writer.py`.
2. **Terraform Integration:**
   * Wire the curation routes in `module/platform/main.tf` and `main.tf`.
   * Add permissions for DynamoDB and SSM (YouTube API key & Gemini API key).
3. **Admin UI (`frontend/src/AdminCurator.jsx` & Tab 3 in `Admin.jsx`):**
   * Prompt form: Topic brief, difficulty level, target duration, max lessons.
   * Draft review board: Video cards showing thumbnail, title, duration, agent reasoning, delete button, drag/move order.
   * Edit course title/description before publishing.
   * "Publish to Catalog" action with confirmation.
