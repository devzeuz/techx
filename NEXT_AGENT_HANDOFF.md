# TechX — Next Agent Handoff Lead

> **Quick Context for Incoming Agent:**
> TechX is a tech learning platform curating YouTube content.
> Read `note.local` before doing anything:
> 1. TechX is essentially a tech learning platform that curates YouTube videos — new features enhance it, never replace it.
> 2. Manual curation must NOT be removed.
> 3. Only Admins can curate (manual and AI). AI drafts must be reviewed by Admin before publishing.
> 4. Keep existing data intact.

---

## 1. Current Branch & Workspace State

* **Active Git Branch:** `restructure/core-platform`
* **Python Test Suite:** All 20 tests pass:
  ```bash
  PYTHONDONTWRITEBYTECODE=1 /Users/barb/.gemini/antigravity-ide/brain/04b7cf06-a037-4dbc-87ca-e3d7906a8ed2/scratch/venv/bin/pytest module/platform/tests -q -p no:cacheprovider
  ```
* **Git Status:**
  * **Modified files (Phase 2 backend completed):**
    * `main.tf` — added descriptions Lambda variables & API routes (`GET /courses/{id}/descriptions`, `GET /videos/{id}/descriptions`, `POST /admin/descriptions`).
    * `module/lambda/main.tf` — added ffmpeg layer to `audio_downloader`, retry configs (0 retries on 15m Lambdas).
    * `module/lambda/src/audio_downloader.py` — runs `python -m yt_dlp`, uses `/opt/bin/ffmpeg` for MP3 extraction, handles async direct invocation, writes `AUDIO_FAILED` to DynamoDB on error.
    * `module/lambda/src/pause_map_builder.py` — added `select_windows()` to pick top 30 pauses spaced $\ge$ 20s apart (WCAG & cost control).
    * `module/lambda/src/frame_extractor.py` — caps yt-dlp to 720p, converts floats to `Decimal` before DynamoDB write, writes index before status change.
    * `module/lambda/src/gemini_describer.py` — upgraded to `gemini-2.5-flash`, saves `pause_start_s`, avoids re-raising errors to prevent DynamoDB stream blocking.
    * `module/platform/main.tf` — defined `techx-descriptions` role & Lambda.
    * `module/platform/variable.tf` & `output.tf` — exposed `media_bucket_name`, `media_bucket_arn`, `audio_downloader_arn`, and `descriptions` Lambda.
  * **Untracked files:**
    * `module/platform/src/descriptions.py` — HTTP API handler for AD status, cues with fresh presigned URLs, and admin queueing.
    * `module/platform/tests/test_descriptions.py` — 6 tests covering all AD endpoints & pause selection.

---

## 2. Immediate Next Steps (Phase 2 Frontend)

### Step 1: Update `frontend/src/CoursePlayer.jsx`
1. **Audio Descriptions (AD) Toggle:**
   * Add a state `adEnabled` initialized from `localStorage.getItem('techx_ad_enabled') === 'true'`.
   * Add a toggle switch / button in the player control bar: `"Audio Descriptions: ON / OFF"`.
2. **Fetch Descriptions for Active Video:**
   * When `activeVideo` changes, call `GET /videos/${activeVideo.YouTubeID}/descriptions` via `apiFetch`.
   * If `status === 'DESCRIPTIONS_READY'`, store `descriptions` (array of `{ start, text, audioUrl, frameType, topic }`).
3. **Playback Synchronization (Extended Audio Description — WCAG 1.2.7):**
   * Keep a reference to the active `Audio` object and a `Set` of played cue timestamps for the current video session.
   * Inside the 1-second interval (`timerRef`):
     * Check `player.getCurrentTime()`.
     * Find unplayed cue where `currentTime >= cue.start && currentTime < cue.start + 2.5`.
     * If found and `adEnabled` is true:
       1. Mark cue as played in the session set.
       2. Pause YouTube player: `player.pauseVideo()`.
       3. Show active description text in an ARIA live region / banner.
       4. Play audio clip: `const audio = new Audio(cue.audioUrl); audio.play();`.
       5. On `audio.onended = () => { setActiveDesc(null); player.playVideo(); }`.
       6. On `audio.onerror = () => { setActiveDesc(null); player.playVideo(); }`.
4. **Sidebar "AD" Badge:**
   * Fetch course-level AD status via `GET /courses/${courseId}/descriptions`.
   * For lessons where `videos[ytId]?.status === 'DESCRIPTIONS_READY'`, render an `<span className="badge badge-gold">AD</span>` tag next to the title.

### Step 2: Update `frontend/src/Admin.jsx`
1. Add an **"Audio Descriptions"** section or tabs (Tab 1: "Manual Import", Tab 2: "Audio Descriptions").
2. In the AD section:
   * Fetch existing courses via `GET /courses`.
   * Dropdown to select a course.
   * Shows table of videos with their AD status (`DESCRIPTIONS_READY`, `QUEUED`, `TRANSCRIBING`, `NONE`, or `ERROR`).
   * Button **"Generate Audio Descriptions"** (calls `POST /admin/descriptions` with `{ courseId }`).
   * Displays modal / alert confirming how many videos will be queued (max 10 per request).

### Step 3: Infra Validation & Deployment
1. Run `terraform validate` and `terraform plan`.
2. Apply changes (`terraform apply -auto-approve`).
3. Build frontend:
   ```bash
   cd frontend && npm run build
   ```
4. Sync build output to S3:
   ```bash
   aws s3 sync dist/ s3://techx-hosting-bucket --delete
   ```

---

## 3. Subsequent Phase (Phase 3: AI Curator)

* **Architecture:**
  * Create `module/platform/src/curator.py` Lambda.
  * Connect to Gemini 2.5 Flash with function calling (`search_youtube`, `get_video_details`, `get_playlist_items`).
  * Admin inputs a prompt $\rightarrow$ agent drafts a course $\rightarrow$ writes to `CURATION#<id>` in DynamoDB as `DRAFT`.
  * Admin UI in `Admin.jsx` (Tab 3: "AI Curator"):
    * Input prompt + optional constraints.
    * Review draft: reorder, remove, or edit lessons.
    * Click "Publish" $\rightarrow$ uses shared [`course_writer.py`](file:///Users/barb/Documents/My%20Projects/techx/module/platform/src/course_writer.py) to write standard `COURSE#` and `VIDEO#` records.

---

## 4. Key Endpoints Reference

| Route | Method | Auth | Description |
|---|---|---|---|
| `/courses` | GET | Cognito JWT | Catalog scan (Type=COURSE) |
| `/courses/{id}` | GET | Cognito JWT | Course details + lessons |
| `/courses/{id}/descriptions` | GET | Cognito JWT | Per-video AD status map |
| `/videos/{id}/descriptions` | GET | Cognito JWT | Cues + fresh presigned Polly URLs |
| `/admin/ingest` | POST | Admin JWT | Manual playlist import |
| `/admin/descriptions` | POST | Admin JWT | Queue AD pipeline for course |
| `/user` | GET / POST | Cognito JWT | Enrollment, progress, bookmarks, notes |
