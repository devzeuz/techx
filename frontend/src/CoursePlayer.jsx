import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from './Api';
import YouTube from 'react-youtube';
import { CheckCircle, Play, Save, RotateCcw } from 'lucide-react';
import SkeletonLoader from './components/SkeletonLoader';
import Spinner from './components/Spinner';

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

  const timerRef = useRef(null);

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
            <button
              onClick={() => markAsWatched(activeVideo)}
              className={`btn ${watched.has(activeVideo.YouTubeID) ? 'btn-success' : 'btn-ghost'}`}
              style={{ padding: '10px 16px', flexShrink: 0 }}
            >
              <CheckCircle size={16} />
              {watched.has(activeVideo.YouTubeID) ? 'Watched' : 'Mark Complete'}
            </button>
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

    </div>
  );
};

export default CoursePlayer;