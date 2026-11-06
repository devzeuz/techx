import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, apiRequest } from './Api';
import YouTube from 'react-youtube';
import {
  CheckCircle,
  Play,
  Save,
  RotateCcw,
  Volume2,
  VolumeX,
  MessageSquare,
  FileText,
  Clock,
  AlertCircle,
} from 'lucide-react';
import SkeletonLoader from './components/SkeletonLoader';
import Spinner from './components/Spinner';
import TutorPanel from './TutorPanel';

const AD_STORAGE_KEY = 'techx_ad_enabled';
const AD_READY = 'DESCRIPTIONS_READY';
const CUE_WINDOW_S = 2.5; // poll is 1s; give a cue a little slack to be caught
const NOTE_TS_RE = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;

function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `[${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
  }
  return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
}

function extractNoteTimestamps(text) {
  if (!text) return [];
  const seen = new Set();
  const out = [];
  for (const m of text.matchAll(NOTE_TS_RE)) {
    const label = m[0].slice(1, -1);
    if (seen.has(label)) continue;
    seen.add(label);
    const secs = m[3] !== undefined
      ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
      : (+m[1]) * 60 + (+m[2]);
    out.push({ label, secs });
  }
  return out;
}

const CoursePlayer = ({ user }) => {
  const { courseId } = useParams();
  const navigate     = useNavigate();

  // Amplify v6: .username is a UUID; .signInDetails.loginId is the email
  // used as the DynamoDB userId key — must match Dashboard and LandingPage.
  const userId = user?.signInDetails?.loginId ?? user?.username ?? '';

  const [course,        setCourse]        = useState(null);
  const [activeVideo,   setActiveVideo]   = useState(null);
  const [watched,       setWatched]       = useState(new Set());
  const [notesByVideo,  setNotesByVideo]  = useState({}); // { [ytId]: { text, updated } }
  const [draftByVideo,  setDraftByVideo]  = useState({}); // { [ytId]: string }
  const [savingNote,    setSavingNote]    = useState(false);
  const [noteStatus,    setNoteStatus]    = useState(null); // null | { type: 'saved' | 'error', message }

  // Player state
  const [player,        setPlayer]        = useState(null);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [showOverlay,   setShowOverlay]   = useState(false);
  const [overlayReason, setOverlayReason] = useState(null);
  const [nextVideo,     setNextVideo]     = useState(null);

  // Audio descriptions (enhancement)
  const [adEnabled,  setAdEnabled]  = useState(() => localStorage.getItem(AD_STORAGE_KEY) === 'true');
  const [adStatus,   setAdStatus]   = useState({});   // { [ytId]: {status, count} }
  const [cues,       setCues]       = useState([]);
  const [activeDesc, setActiveDesc] = useState(null); // text currently being narrated

  // Course Tutor (Phase 4)
  const [tutorOpen,  setTutorOpen]  = useState(false);

  const timerRef        = useRef(null);
  const cuesRef         = useRef([]);
  const playedRef       = useRef(new Set());
  const audioRef        = useRef(null);
  const adPlayingRef    = useRef(false);
  const adEnabledRef    = useRef(adEnabled);
  const lastTimeRef     = useRef(0);
  const noteTextareaRef = useRef(null);

  /* ── Load ─────────────────────────────────────────── */
  const markAsWatched = async (video) => {
    if (!video || watched.has(video.YouTubeID)) return;
    const next = new Set(watched);
    next.add(video.YouTubeID);
    setWatched(next);
    await apiRequest('/user', 'POST', {
      userId, type: 'WATCH', videoId: video.YouTubeID, courseId,
    });
  };

  const finishVideo = () => {
    if (player) player.pauseVideo();
    setOverlayReason('END');
    setShowOverlay(true);
    setIsPlaying(false);
    markAsWatched(activeVideo);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCourse(); }, [courseId, userId]);

  /* ── Audio descriptions ───────────────────────────── */
  const stopDescription = (resume) => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    const wasPlaying = adPlayingRef.current;
    adPlayingRef.current = false;
    setActiveDesc(null);
    if (resume && wasPlaying && player) player.playVideo();
  };

  const playCue = (cue) => {
    playedRef.current.add(cue.start);
    adPlayingRef.current = true;
    setActiveDesc(cue.text);
    player.pauseVideo();
    const audio = new Audio(cue.audioUrl);
    audioRef.current = audio;
    audio.onended = () => stopDescription(true);
    audio.onerror = () => stopDescription(true); // never leave the learner stuck
    audio.play().catch(() => stopDescription(true));
  };

  const toggleAd = () => {
    const next = !adEnabled;
    setAdEnabled(next);
    adEnabledRef.current = next;
    localStorage.setItem(AD_STORAGE_KEY, String(next));
    if (!next) stopDescription(true);
  };

  // Course-level AD status → sidebar badges
  useEffect(() => {
    apiRequest(`/courses/${courseId}/descriptions`).then((d) => setAdStatus(d?.videos ?? {}));
  }, [courseId]);

  // Cues for the active lesson
  useEffect(() => {
    if (!activeVideo) return undefined;
    stopDescription(false);
    playedRef.current = new Set();
    lastTimeRef.current = 0;
    cuesRef.current = [];
    setCues([]);
    setNoteStatus(null);
    let cancelled = false;
    apiRequest(`/videos/${activeVideo.YouTubeID}/descriptions`).then((d) => {
      if (cancelled || d?.status !== AD_READY) return;
      cuesRef.current = d.descriptions ?? [];
      setCues(cuesRef.current);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideo]);

  // Stop narration when leaving the page
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stopDescription(false), []);

  useEffect(() => {
    if (!activeVideo || !course) return;
    setShowOverlay(false);
    setOverlayReason(null);
    const idx = course.videos.findIndex((v) => v.YouTubeID === activeVideo.YouTubeID);
    setNextVideo(idx >= 0 && idx < course.videos.length - 1 ? course.videos[idx + 1] : null);
  }, [activeVideo, course]);

  useEffect(() => {
    if (isPlaying && player) {
      timerRef.current = setInterval(() => {
        try {
          const cur = player.getCurrentTime();
          const dur = player.getDuration();

          // Rewound? Let the learner hear descriptions after that point again.
          if (cur < lastTimeRef.current - 3) {
            for (const s of [...playedRef.current]) if (s > cur) playedRef.current.delete(s);
          }
          lastTimeRef.current = cur;

          if (adEnabledRef.current && !adPlayingRef.current) {
            const cue = cuesRef.current.find((c) =>
              !playedRef.current.has(c.start) && cur >= c.start && cur < c.start + CUE_WINDOW_S);
            if (cue) { playCue(cue); return; }
          }

          if (dur > 0 && (dur - cur) < 20) finishVideo();
        } catch { /* ignore buffering errors */ }
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, player]);

  const parseUserNotes = (userData) => {
    const notePrefix = `NOTE#${courseId}#`;
    const nextNotes = {};
    if (Array.isArray(userData)) {
      userData.forEach((item) => {
        if (item.SK?.startsWith(notePrefix)) {
          const vidId = item.SK.slice(notePrefix.length);
          nextNotes[vidId] = {
            text: item.NoteText ?? '',
            updated: item.Updated ?? null,
          };
        }
      });
    }
    return nextNotes;
  };

  const loadCourse = async () => {
    const [courseData, userData] = await Promise.all([
      apiRequest(`/courses/${courseId}`),
      apiRequest(`/user?userId=${encodeURIComponent(userId)}`),
    ]);

    if (Array.isArray(userData)) {
      const watchedSet = new Set(
        userData.filter((i) => i.SK?.startsWith('WATCHED#')).map((i) => i.VideoId),
      );
      setWatched(watchedSet);
      setNotesByVideo(parseUserNotes(userData));
    }

    if (Array.isArray(courseData)) {
      const metadata = courseData.find((i) => i.Type === 'COURSE');
      const videos   = courseData
        .filter((i) => i.Type === 'VIDEO')
        .sort((a, b) => a.SK.localeCompare(b.SK));
      if (metadata) {
        setCourse({ ...metadata, videos });
        setActiveVideo((prev) => prev ?? (videos.length > 0 ? videos[0] : null));
      }
    }
  };

  const activeVideoId = activeVideo?.YouTubeID ?? '';
  const savedEntry    = notesByVideo[activeVideoId];
  const savedNoteText = savedEntry?.text ?? '';
  const note          = draftByVideo[activeVideoId] !== undefined
    ? draftByVideo[activeVideoId]
    : savedNoteText;
  const isNoteDirty   = note !== savedNoteText;
  const noteTimestamps = extractNoteTimestamps(note);

  const handleNoteChange = (val) => {
    if (!activeVideoId) return;
    setDraftByVideo((prev) => ({ ...prev, [activeVideoId]: val }));
    if (noteStatus) setNoteStatus(null);
  };

  const saveNote = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!activeVideoId || savingNote) return;

    setSavingNote(true);
    setNoteStatus(null);

    const { ok } = await apiFetch('/user', 'POST', {
      userId,
      type: 'NOTE',
      courseId,
      videoId: activeVideoId,
      text: note,
    });

    setSavingNote(false);

    if (ok) {
      const nowIso = new Date().toISOString();
      setNotesByVideo((prev) => ({
        ...prev,
        [activeVideoId]: { text: note, updated: nowIso },
      }));
      setDraftByVideo((prev) => {
        const next = { ...prev };
        delete next[activeVideoId];
        return next;
      });
      setNoteStatus({ type: 'saved', message: 'Note saved' });
    } else {
      setNoteStatus({
        type: 'error',
        message: 'Could not save note. Check your connection and try again.',
      });
    }
  };

  const insertTimestamp = () => {
    if (!activeVideoId) return;
    let cur = 0;
    try { cur = player?.getCurrentTime() ?? 0; } catch { cur = 0; }
    const stamp = `${formatTimestamp(cur)} `;
    const el = noteTextareaRef.current;

    if (el && typeof el.selectionStart === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const prefix = start > 0 && note[start - 1] !== '\n' && note[start - 1] !== ' ' ? '\n' : '';
      const updated = `${note.slice(0, start)}${prefix}${stamp}${note.slice(end)}`;
      handleNoteChange(updated);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + prefix.length + stamp.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      const prefix = note && !note.endsWith('\n') && !note.endsWith(' ') ? '\n' : '';
      handleNoteChange(`${note}${prefix}${stamp}`);
      el?.focus();
    }
  };

  const handleNoteKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveNote();
    }
  };

  const seekToSeconds = (secs) => {
    if (!player) return;
    setOverlayReason(null);
    setShowOverlay(false);
    player.seekTo(secs, true);
    player.playVideo();
  };

  /* ── Player handlers ──────────────────────────────── */
  const onReady = (e) => setPlayer(e.target);

  const onPlayerStateChange = (e) => {
    const s = e.data;
    if (s === 1) {
      setIsPlaying(true);
      if (overlayReason === 'PAUSE') setShowOverlay(false);
    } else if (s === 2) {
      setIsPlaying(false);
      if (adPlayingRef.current) return; // paused by us for a description
      if (overlayReason !== 'END') { setOverlayReason('PAUSE'); setShowOverlay(true); }
    } else if (s === 0) {
      setIsPlaying(false);
      if (overlayReason !== 'END') finishVideo();
    }
  };

  const handleResume = () => {
    if (!player) return;
    setOverlayReason(null);
    setShowOverlay(false);
    player.playVideo();
  };

  // Pause the lesson while the learner talks to the tutor (avoids audio overlap for screen-reader users)
  const openTutor = () => {
    const next = !tutorOpen;
    setTutorOpen(next);
    if (next && player && isPlaying) {
      stopDescription(false);
      setOverlayReason(null);
      player.pauseVideo();
    }
  };

  const handleReplay = () => {
    if (!player) return;
    setOverlayReason(null);
    setShowOverlay(false);
    player.seekTo(0);
    player.playVideo();
  };

  /* ── Loading state ────────────────────────────────── */
  if (!course || !activeVideo) return <SkeletonLoader variant="player" />;

  const opts = {
    height: '100%',
    width: '100%',
    playerVars: { autoplay: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, controls: 1 },
  };

  const watchedCount = course.videos.filter((v) => watched.has(v.YouTubeID)).length;
  const progress     = course.videos.length > 0
    ? Math.round((watchedCount / course.videos.length) * 100)
    : 0;

  return (
    <div className="player-layout">
      {/* ── PLAYER MAIN ─────────────────────────────── */}
      <div className="player-main">
        {/* Video wrapper */}
        <div className="player-video-wrap">
          <div className="player-video-inner">
            <YouTube
              videoId={activeVideo.YouTubeID}
              opts={opts}
              onReady={onReady}
              onStateChange={onPlayerStateChange}
              style={{ height: '100%', width: '100%' }}
            />
          </div>

          {/* Audio description caption (visual) */}
          {activeDesc && (
            <div className="ad-caption" aria-hidden="true">
              <span className="ad-caption-tag"><Volume2 size={13} /> AD</span>
              <span>{activeDesc}</span>
              <button type="button" className="ad-caption-skip" onClick={() => stopDescription(true)}>
                Skip
              </button>
            </div>
          )}

          {/* Overlay */}
          {showOverlay && (
            <div className="player-overlay">
              {overlayReason === 'PAUSE' && (
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ marginBottom: '20px', fontSize: '1.5rem', fontWeight: '700' }}>
                    Paused
                  </h2>
                  <button
                    type="button"
                    onClick={handleResume}
                    className="btn btn-primary"
                    style={{ padding: '12px 32px', fontSize: '0.95rem' }}
                  >
                    <Play size={16} fill="currentColor" aria-hidden="true" /> Resume
                  </button>
                </div>
              )}

              {overlayReason === 'END' && (
                <div style={{ textAlign: 'center', maxWidth: '420px', padding: '0 20px' }}>
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '12px',
                      background: 'var(--color-green-bg)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '14px',
                    }}
                    aria-hidden="true"
                  >
                    <CheckCircle size={26} color="var(--color-green)" />
                  </div>
                  <h2 style={{ marginBottom: '8px', fontWeight: '800', fontSize: '1.5rem' }}>
                    Lesson Complete
                  </h2>
                  {nextVideo ? (
                    <>
                      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', fontSize: '0.92rem' }}>
                        Up Next: <strong>{nextVideo.VideoTitle}</strong>
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveVideo(nextVideo)}
                        className="btn btn-primary"
                        style={{ padding: '12px 26px', fontSize: '0.95rem' }}
                      >
                        <Play size={15} fill="currentColor" aria-hidden="true" /> Play Next Lesson
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="btn btn-success"
                      style={{ padding: '12px 24px' }}
                    >
                      <CheckCircle size={16} aria-hidden="true" /> Back to Dashboard
                    </button>
                  )}
                  <div style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      onClick={handleReplay}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.86rem',
                      }}
                    >
                      <RotateCcw size={14} aria-hidden="true" /> Replay lesson
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Controls & Notes ── */}
        <div className="player-meta">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '16px',
              marginBottom: '20px',
              flexWrap: 'wrap',
            }}
          >
            <h1
              style={{
                fontSize: '1.45rem',
                fontWeight: '800',
                lineHeight: '1.25',
                letterSpacing: '-0.4px',
                flex: '1 1 280px',
              }}
            >
              {activeVideo.VideoTitle}
            </h1>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                id="ad-toggle"
                type="button"
                onClick={toggleAd}
                aria-pressed={adEnabled}
                disabled={cues.length === 0}
                title={cues.length === 0 ? 'No audio descriptions for this lesson yet' : 'Toggle audio descriptions'}
                className={`btn ${adEnabled && cues.length > 0 ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '10px 16px' }}
              >
                {adEnabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
                Audio Descriptions: {adEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                id="tutor-toggle"
                type="button"
                onClick={openTutor}
                aria-expanded={tutorOpen}
                className={`btn ${tutorOpen ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '10px 16px' }}
              >
                <MessageSquare size={16} aria-hidden="true" /> Ask Tutor
              </button>
              <button
                type="button"
                onClick={() => markAsWatched(activeVideo)}
                className={`btn ${watched.has(activeVideo.YouTubeID) ? 'btn-success' : 'btn-ghost'}`}
                style={{ padding: '10px 16px' }}
              >
                <CheckCircle size={16} aria-hidden="true" />
                {watched.has(activeVideo.YouTubeID) ? 'Watched' : 'Mark Complete'}
              </button>
            </div>
          </div>

          {/* Course progress mini-bar */}
          <div style={{ marginBottom: '4px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
                color: 'var(--color-text-subtle)',
                marginBottom: '6px',
              }}
            >
              <span>Course progress</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${progress}%`,
                  background: progress === 100 ? 'var(--color-green)' : 'var(--color-accent)',
                }}
              />
            </div>
          </div>

          {/* Screen-reader announcement of the current description */}
          <div className="sr-only" aria-live="assertive" aria-atomic="true">
            {activeDesc ? `Audio description: ${activeDesc}` : ''}
          </div>

          {/* ── Lesson Notes Section ── */}
          <section className="player-notes-section" aria-labelledby="lesson-notes-heading">
            <div className="player-notes-header">
              <div className="player-notes-title-group">
                <h2 id="lesson-notes-heading" className="player-notes-heading">
                  <FileText size={16} color="var(--color-accent-light)" aria-hidden="true" />
                  Lesson Notes
                </h2>
                <span className="player-notes-meta" role="status" aria-live="polite">
                  {savingNote ? (
                    'Saving...'
                  ) : noteStatus?.type === 'error' ? (
                    <span className="player-notes-status--error">
                      <AlertCircle size={13} aria-hidden="true" /> {noteStatus.message}
                    </span>
                  ) : isNoteDirty ? (
                    <span className="player-notes-status--dirty">Unsaved changes</span>
                  ) : noteStatus?.type === 'saved' || savedEntry?.updated ? (
                    <span className="player-notes-status--saved">
                      <CheckCircle size={13} aria-hidden="true" /> Saved
                    </span>
                  ) : (
                    'Notes are saved per lesson'
                  )}
                </span>
              </div>

              <button
                type="button"
                onClick={insertTimestamp}
                className="btn btn-ghost player-notes-ts-btn"
                title="Insert current video timestamp into your note"
              >
                <Clock size={14} aria-hidden="true" />
                Insert Timestamp
              </button>
            </div>

            <form onSubmit={saveNote}>
              <label htmlFor="lesson-note-textarea" className="sr-only">
                Notes for {activeVideo.VideoTitle}
              </label>
              <textarea
                id="lesson-note-textarea"
                ref={noteTextareaRef}
                name="lessonNote"
                value={note}
                onChange={(e) => handleNoteChange(e.target.value)}
                onKeyDown={handleNoteKeyDown}
                placeholder={`Write your study notes for "${activeVideo.VideoTitle}"...`}
                className="textarea"
                style={{ minHeight: '130px', marginBottom: '12px' }}
              />

              {noteTimestamps.length > 0 && (
                <div className="player-notes-timestamps" aria-label="Timestamps in your note">
                  <span className="player-notes-timestamps-label">Jump to timestamp:</span>
                  {noteTimestamps.map(({ label, secs }) => (
                    <button
                      key={`${label}-${secs}`}
                      type="button"
                      className="tutor-ts"
                      onClick={() => seekToSeconds(secs)}
                      aria-label={`Jump to ${label} in the video`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="player-notes-actions">
                <button
                  id="save-note-btn"
                  type="submit"
                  disabled={savingNote}
                  className={`btn ${isNoteDirty ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '8px 18px' }}
                >
                  {savingNote ? (
                    <>
                      <Spinner size="sm" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save size={14} aria-hidden="true" /> Save Note
                    </>
                  )}
                </button>
                <span className="player-notes-hint">
                  Tip: Press Ctrl+S or Cmd+S to save quickly.
                </span>
              </div>
            </form>
          </section>
        </div>
      </div>

      {/* ── SIDEBAR ─────────────────────────────────── */}
      <aside className="player-sidebar" aria-label="Course lessons">
        <h2
          style={{
            color: 'var(--color-text-primary)',
            fontWeight: '700',
            fontSize: '0.95rem',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Course Content</span>
          <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
            {watchedCount}/{course.videos.length}
          </span>
        </h2>

        {course.videos.map((vid, i) => {
          const isActive  = activeVideo.YouTubeID === vid.YouTubeID;
          const isWatched = watched.has(vid.YouTubeID);
          const hasNote   = Boolean(
            (draftByVideo[vid.YouTubeID] ?? notesByVideo[vid.YouTubeID]?.text ?? '').trim(),
          );

          return (
            <button
              key={vid.SK}
              type="button"
              className={`sidebar-item ${isActive ? 'is-active' : ''}`}
              onClick={() => setActiveVideo(vid)}
              aria-current={isActive ? 'true' : undefined}
              style={{ width: '100%', textAlign: 'left', border: 'none', font: 'inherit' }}
            >
              <span className="sidebar-item-num">{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="sidebar-item-title"
                  style={{
                    fontWeight: isActive ? '700' : '400',
                    opacity: (!isActive && isWatched) ? 0.65 : 1,
                  }}
                >
                  {vid.VideoTitle}
                  {adStatus[vid.YouTubeID]?.status === AD_READY && (
                    <span className="badge badge-gold ad-badge" title="Audio descriptions available">
                      AD
                    </span>
                  )}
                </div>
                {(isWatched || hasNote) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginTop: '4px',
                      fontSize: '0.72rem',
                    }}
                  >
                    {isWatched && (
                      <span
                        style={{
                          color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--color-green)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <CheckCircle size={10} aria-hidden="true" /> Watched
                      </span>
                    )}
                    {hasNote && (
                      <span
                        style={{
                          color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--color-text-secondary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <FileText size={10} aria-hidden="true" /> Note
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </aside>

      <TutorPanel
        key={activeVideo.YouTubeID}
        open={tutorOpen}
        onClose={() => setTutorOpen(false)}
        courseId={courseId}
        video={activeVideo}
        getCurrentTime={() => { try { return player?.getCurrentTime() ?? 0; } catch { return 0; } }}
        onSeek={(s) => seekToSeconds(s)}
      />
    </div>
  );
};

export default CoursePlayer;
