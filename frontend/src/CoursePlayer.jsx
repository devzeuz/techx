import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from './Api';
import YouTube from 'react-youtube';
import { CheckCircle, Play, Save, RotateCcw, Volume2, VolumeX, Bot } from 'lucide-react';
import SkeletonLoader from './components/SkeletonLoader';
import Spinner from './components/Spinner';
import TutorPanel from './TutorPanel';

const AD_STORAGE_KEY = 'techx_ad_enabled';
const AD_READY = 'DESCRIPTIONS_READY';
const CUE_WINDOW_S = 2.5; // poll is 1s; give a cue a little slack to be caught

const CoursePlayer = ({ user }) => {
  const { courseId } = useParams();
  const navigate     = useNavigate();

  // Amplify v6: .username is a UUID; .signInDetails.loginId is the email
  // used as the DynamoDB userId key — must match Dashboard and LandingPage.
  const userId = user?.signInDetails?.loginId ?? user?.username ?? '';

  const [course,       setCourse]       = useState(null);
  const [activeVideo,  setActiveVideo]  = useState(null);
  const [watched,      setWatched]      = useState(new Set());
  const [note,         setNote]         = useState('');
  const [savingNote,   setSavingNote]   = useState(false);

  // Player state
  const [player,       setPlayer]       = useState(null);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [showOverlay,  setShowOverlay]  = useState(false);
  const [overlayReason,setOverlayReason]= useState(null);
  const [nextVideo,    setNextVideo]    = useState(null);

  // Audio descriptions (enhancement)
  const [adEnabled,  setAdEnabled]  = useState(() => localStorage.getItem(AD_STORAGE_KEY) === 'true');
  const [adStatus,   setAdStatus]   = useState({});   // { [ytId]: {status, count} }
  const [cues,       setCues]       = useState([]);
  const [activeDesc, setActiveDesc] = useState(null); // text currently being narrated

  // AI Tutor (Phase 4)
  const [tutorOpen,  setTutorOpen]  = useState(false);

  const timerRef      = useRef(null);
  const cuesRef       = useRef([]);
  const playedRef     = useRef(new Set());
  const audioRef      = useRef(null);
  const adPlayingRef  = useRef(false);
  const adEnabledRef  = useRef(adEnabled);
  const lastTimeRef   = useRef(0);

  /* ── Load ─────────────────────────────────────────── */
  const markAsWatched = async (video) => {
    if (watched.has(video.YouTubeID)) return;
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
  useEffect(() => { loadCourse(); }, [courseId, user]);

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
    apiRequest(`/courses/${courseId}/descriptions`).then(d => setAdStatus(d?.videos ?? {}));
  }, [courseId]);

  // Cues for the active lesson
  useEffect(() => {
    if (!activeVideo) return;
    stopDescription(false);
    playedRef.current = new Set();
    lastTimeRef.current = 0;
    cuesRef.current = [];
    setCues([]);
    let cancelled = false;
    apiRequest(`/videos/${activeVideo.YouTubeID}/descriptions`).then(d => {
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
    const idx = course.videos.findIndex(v => v.YouTubeID === activeVideo.YouTubeID);
    setNextVideo(idx >= 0 && idx < course.videos.length - 1 ? course.videos[idx + 1] : null);
  }, [activeVideo, course]);

  useEffect(() => {
    if (isPlaying && player) {
      timerRef.current = setInterval(() => {
        try {
          const cur  = player.getCurrentTime();
          const dur  = player.getDuration();

          // Rewound? Let the learner hear descriptions after that point again.
          if (cur < lastTimeRef.current - 3) {
            for (const s of [...playedRef.current]) if (s > cur) playedRef.current.delete(s);
          }
          lastTimeRef.current = cur;

          if (adEnabledRef.current && !adPlayingRef.current) {
            const cue = cuesRef.current.find(c =>
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

  const loadCourse = async () => {
    const courseData = await apiRequest(`/courses/${courseId}`);
    const userData   = await apiRequest(`/user?userId=${userId}`);
    const watchedSet = new Set(
      Array.isArray(userData)
        ? userData.filter(i => i.SK.startsWith('WATCHED#')).map(i => i.VideoId)
        : [],
    );
    const metadata = courseData.find(i => i.Type === 'COURSE');
    const videos   = courseData.filter(i => i.Type === 'VIDEO').sort((a, b) => a.SK.localeCompare(b.SK));
    if (metadata) {
      setCourse({ ...metadata, videos });
      setWatched(watchedSet);
      if (videos.length > 0) setActiveVideo(videos[0]);
    }
  };

  const loadNote = async () => {
    setNote('');
    const userData = await apiRequest(`/user?userId=${userId}`);
    const item = Array.isArray(userData)
      ? userData.find(i => i.SK === `NOTE#${courseId}#${activeVideo.YouTubeID}`)
      : null;
    if (item) setNote(item.NoteText);
  };

  const saveNote = async () => {
    setSavingNote(true);
    await apiRequest('/user', 'POST', {
      userId, type: 'NOTE', courseId,
      videoId: activeVideo.YouTubeID, text: note,
    });
    setSavingNote(false);
  };

  /* ── Player handlers ──────────────────────────────── */
  const onReady = e => setPlayer(e.target);

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
    height: '100%', width: '100%',
    playerVars: { autoplay: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, controls: 1 },
  };

  const watchedCount = course.videos.filter(v => watched.has(v.YouTubeID)).length;
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
                    onClick={handleResume}
                    className="btn btn-primary"
                    style={{ padding: '14px 36px', fontSize: '1rem', borderRadius: '50px' }}
                  >
                    <Play size={18} fill="white" /> Resume
                  </button>
                </div>
              )}

              {overlayReason === 'END' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎉</div>
                  <h2 style={{ marginBottom: '8px', fontWeight: '800', fontSize: '1.6rem' }}>
                    Lesson Complete!
                  </h2>
                  {nextVideo ? (
                    <>
                      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
                        Up Next: <strong>{nextVideo.VideoTitle}</strong>
                      </p>
                      <button
                        onClick={() => setActiveVideo(nextVideo)}
                        className="btn btn-primary"
                        style={{ padding: '14px 28px', fontSize: '1rem' }}
                      >
                        <Play size={16} fill="white" /> Play Next
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => navigate('/dashboard')}
                      className="btn btn-success"
                      style={{ padding: '12px 24px' }}
                    >
                      <CheckCircle size={16} /> Back to Dashboard
                    </button>
                  )}
                  <div style={{ marginTop: '16px' }}>
                    <button
                      onClick={handleReplay}
                      style={{
                        background: 'transparent', border: 'none',
                        color: 'var(--color-text-secondary)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        margin: '0 auto', fontSize: '0.88rem',
                      }}
                    >
                      <RotateCcw size={14} /> Replay
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
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', gap: '16px', marginBottom: '20px',
            }}
          >
            <h1
              style={{
                fontSize: '1.5rem', fontWeight: '800', lineHeight: '1.2',
                letterSpacing: '-0.5px',
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
                {adEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
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
                <Bot size={16} /> Ask AI Tutor
              </button>
              <button
                onClick={() => markAsWatched(activeVideo)}
                className={`btn ${watched.has(activeVideo.YouTubeID) ? 'btn-success' : 'btn-ghost'}`}
                style={{ padding: '10px 16px' }}
              >
                <CheckCircle size={16} />
                {watched.has(activeVideo.YouTubeID) ? 'Watched' : 'Mark Complete'}
              </button>
            </div>
          </div>

          {/* Course progress mini-bar */}
          <div style={{ marginBottom: '4px' }}>
            <div
              style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: '0.78rem', color: 'var(--color-text-subtle)', marginBottom: '6px',
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

          {/* Notes */}
          <div className="player-notes-section">
            <h3
              style={{
                color: 'var(--color-text-soft)', fontSize: '1rem',
                fontWeight: '700', marginBottom: '12px',
              }}
            >
              📝 My Notes
            </h3>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              onFocus={loadNote}
              placeholder="Type your notes for this lesson..."
              className="textarea"
              style={{ minHeight: '110px', marginBottom: '10px' }}
            />
            <button
              onClick={saveNote}
              disabled={savingNote}
              className="btn btn-ghost"
              style={{ padding: '8px 16px' }}
            >
              {savingNote ? <><Spinner size="sm" /> Saving…</> : <><Save size={14} /> Save Note</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── SIDEBAR ─────────────────────────────────── */}
      <div className="player-sidebar">
        <h3
          style={{
            color: 'var(--color-text-primary)', fontWeight: '700', fontSize: '0.95rem',
            marginBottom: '16px', paddingBottom: '12px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          Course Content
          <span
            className="badge badge-blue"
            style={{ marginLeft: '8px', fontSize: '0.7rem' }}
          >
            {watchedCount}/{course.videos.length}
          </span>
        </h3>

        {course.videos.map((vid, i) => {
          const isActive  = activeVideo.YouTubeID === vid.YouTubeID;
          const isWatched = watched.has(vid.YouTubeID);

          return (
            <div
              key={vid.SK}
              className={`sidebar-item ${isActive ? 'is-active' : ''}`}
              onClick={() => setActiveVideo(vid)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setActiveVideo(vid)}
              aria-current={isActive ? 'true' : undefined}
            >
              <span className="sidebar-item-num">{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="sidebar-item-title"
                  style={{
                    fontWeight: isActive ? '700' : '400',
                    opacity: (!isActive && isWatched) ? 0.55 : 1,
                  }}
                >
                  {vid.VideoTitle}
                  {adStatus[vid.YouTubeID]?.status === AD_READY && (
                    <span className="badge badge-gold ad-badge" title="Audio descriptions available">
                      AD
                    </span>
                  )}
                </div>
                {isWatched && (
                  <span
                    style={{
                      fontSize: '0.72rem', color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--color-green)',
                      display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px',
                    }}
                  >
                    <CheckCircle size={10} /> Watched
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TutorPanel
        key={activeVideo.YouTubeID}
        open={tutorOpen}
        onClose={() => setTutorOpen(false)}
        courseId={courseId}
        video={activeVideo}
        getCurrentTime={() => { try { return player?.getCurrentTime() ?? 0; } catch { return 0; } }}
        onSeek={(s) => { if (player) { player.seekTo(s, true); player.playVideo(); } }}
      />
    </div>
  );
};

export default CoursePlayer;