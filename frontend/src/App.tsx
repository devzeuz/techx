import { useState, useEffect, useRef } from 'react'
import './index.css'

const API_BASE = 'https://c54htww8j8.execute-api.us-east-1.amazonaws.com'

interface Description {
  SK: string
  timestamp_s: string
  frame_type: string
  dominant_topic: string
  description: string
  audio_key: string
  audio_url: string
}

interface Video {
  PK: string
  SK: string
  title: string
  channel: string
  publishedAt: string
  thumbnail: string
  video_url?: string
  pipeline_status?: string
  total_pauses?: number
  frames_extracted?: number
  descriptions_generated?: number
}

interface VideoDetail {
  video: Video
  descriptions: Description[]
}

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error'
type View = 'library' | 'player'

function statusBadgeClass(status?: string): string {
  switch (status) {
    case 'TRANSCRIBING':      return 'badge-transcribing'
    case 'EXTRACTING_FRAMES': return 'badge-processing'
    case 'DESCRIBING':        return 'badge-processing'
    case 'FRAMES_READY':      return 'badge-transcribing'
    case 'DESCRIPTIONS_READY': return 'badge-frames-ready'
    default:                  return 'badge-ingested'
  }
}

function statusLabel(status?: string): string {
  switch (status) {
    case 'TRANSCRIBING':       return '🎙 Transcribing'
    case 'EXTRACTING_FRAMES':  return '🎞 Extracting frames'
    case 'FRAMES_READY':       return '🤖 Gemini analyzing...'
    case 'DESCRIBING':         return '🤖 Generating descriptions'
    case 'DESCRIPTIONS_READY': return '✅ Descriptions Ready'
    default:                   return '📥 Ingested'
  }
}

function SkeletonGrid() {
  return (
    <div className="skeleton-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-thumb" />
          <div className="skeleton-body">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Audio Description Player ──────────────────────────────────────────────
function DescriptionPlayer({ detail, onClose }: { detail: VideoDetail; onClose: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const { video, descriptions } = detail

  const playDescription = (index: number) => {
    if (!descriptions[index]) return
    setCurrentIndex(index)
    setPlaying(true)
    const audio = audioRef.current
    if (audio) {
      audio.src = descriptions[index].audio_url
      audio.play().catch(console.error)
    }
  }

  const handleAudioEnd = () => {
    // Auto-advance to next description
    const next = currentIndex + 1
    if (next < descriptions.length) {
      setTimeout(() => playDescription(next), 800)
    } else {
      setPlaying(false)
      setCurrentIndex(-1)
    }
  }

  const active = descriptions[currentIndex]
  const vid = video.PK.replace('VIDEO#', '')

  return (
    <div className="player-overlay">
      <div className="player-panel">
        {/* Header */}
        <div className="player-header">
          <div>
            <h2 className="player-title">{video.title}</h2>
            <p className="player-channel">{video.channel}</p>
          </div>
          <button id="close-player-btn" className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Audio element */}
        <audio ref={audioRef} onEnded={handleAudioEnd} />

        {/* Current description display */}
        <div className="description-display">
          {active ? (
            <>
              <div className="desc-frame-type">{active.frame_type.replace('_', ' ')}</div>
              <p className="desc-text">{active.description}</p>
              <p className="desc-topic">📍 {active.dominant_topic}</p>
            </>
          ) : (
            <div className="desc-empty">
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔊</div>
              <p>Select a description below or press Play All to hear them sequentially.</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="player-controls">
          <a
            id={`open-youtube-${vid}`}
            href={video.video_url ?? `https://youtube.com/watch?v=${vid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            ▶ Open on YouTube
          </a>
          <button
            id="play-all-descriptions-btn"
            className="btn-primary"
            onClick={() => playing ? (audioRef.current?.pause(), setPlaying(false)) : playDescription(0)}
          >
            {playing ? '⏸ Pause' : '▶ Play All Descriptions'}
          </button>
        </div>

        {/* Description list */}
        <div className="desc-list">
          <p className="desc-list-header">
            {descriptions.length} AI-generated descriptions
            <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
              (Gemini Vision + Amazon Polly)
            </span>
          </p>
          {descriptions.map((desc, i) => {
            const ts = parseFloat(desc.timestamp_s)
            const mins = Math.floor(ts / 60)
            const secs = (ts % 60).toFixed(1)
            const isActive = i === currentIndex

            return (
              <div
                key={desc.SK}
                id={`desc-item-${i}`}
                className={`desc-item ${isActive ? 'desc-item-active' : ''}`}
                onClick={() => playDescription(i)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && playDescription(i)}
              >
                <div className="desc-item-left">
                  <span className="desc-timestamp">{mins}:{secs.padStart(4, '0')}</span>
                  <span className="desc-type-pill">{desc.frame_type.replace('_', ' ')}</span>
                </div>
                <p className="desc-item-text">{desc.description}</p>
                {isActive && <span className="desc-playing-indicator">▶ Playing</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [videos, setVideos]             = useState<Video[]>([])
  const [loading, setLoading]           = useState(true)
  const [videoUrl, setVideoUrl]         = useState('')
  const [videoId, setVideoId]           = useState('')
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')
  const [submitMsg, setSubmitMsg]       = useState('')
  const [playerDetail, setPlayerDetail] = useState<VideoDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/videos`)
      .then(r => r.json())
      .then(data => setVideos(Array.isArray(data) ? data : data.items ?? []))
      .catch(() => setVideos([]))
      .finally(() => setLoading(false))
  }, [])

  function extractVideoId(url: string): string {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    return match?.[1] ?? ''
  }

  function handleUrlChange(val: string) {
    setVideoUrl(val)
    setVideoId(extractVideoId(val))
    setSubmitStatus('idle')
  }

  async function handleSubmit() {
    if (!videoId || !videoUrl) {
      setSubmitStatus('error')
      setSubmitMsg('Please paste a valid YouTube video URL.')
      return
    }
    setSubmitStatus('loading')
    setSubmitMsg('Submitting video for AI processing...')
    try {
      const res = await fetch(`${API_BASE}/videos/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: videoUrl, video_id: videoId }),
      })
      if (res.status === 202) {
        setSubmitStatus('success')
        setSubmitMsg('🎙 Pipeline started! Audio → Transcribe → Frame Extraction → Gemini → Polly.')
        setVideoUrl('')
        setVideoId('')
      } else {
        const err = await res.json()
        throw new Error(err.error ?? 'Unknown error')
      }
    } catch (e: unknown) {
      setSubmitStatus('error')
      setSubmitMsg(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  async function openPlayer(vid: string) {
    setLoadingDetail(vid)
    try {
      const res = await fetch(`${API_BASE}/videos/${vid}`)
      const data = await res.json()
      setPlayerDetail(data)
    } catch {
      alert('Could not load video details.')
    } finally {
      setLoadingDetail(null)
    }
  }

  return (
    <div className="app">
      {/* ── Nav ── */}
      <nav className="nav">
        <a className="nav-brand" href="/">
          <span className="nav-logo">tx</span>
          <span className="nav-tagline">AI Audio Descriptions</span>
        </a>
        <div className="nav-pill">
          <span className="pulse-dot" />
          Pipeline Live
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-badge">🎙 Powered by Gemini Vision + Amazon Polly</div>
        <h1>
          Learn Without <span className="gradient-text">Limits</span>
        </h1>
        <p>
          AI-generated audio descriptions inserted at natural pauses — making
          tech tutorials fully accessible for visually impaired learners.
        </p>
        <div className="process-bar">
          {['YouTube Video','Speech Detection','Frame Extraction','Gemini Vision','Amazon Polly','Audio Description'].map((step, i) => (
            <>
              {i > 0 && <span key={`a${i}`} className="process-arrow">→</span>}
              <div key={step} className="process-step">
                <span className="step-num">{i + 1}</span>
                {step}
              </div>
            </>
          ))}
        </div>
      </section>

      {/* ── Submit Form ── */}
      <div className="submit-section">
        <div className="submit-card">
          <h2>Process a New Video</h2>
          <p>Paste a YouTube URL to start the AI audio description pipeline.</p>
          <div className="input-group">
            <input
              id="video-url-input"
              className="url-input"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={videoUrl}
              onChange={e => handleUrlChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
            <button
              id="submit-video-btn"
              className="btn-primary"
              onClick={handleSubmit}
              disabled={submitStatus === 'loading' || !videoId}
            >
              {submitStatus === 'loading' ? '⏳' : '🚀'} Process
            </button>
          </div>
          {submitStatus !== 'idle' && (
            <div className={`status-msg ${submitStatus}`}>{submitMsg}</div>
          )}
        </div>
      </div>

      {/* ── Video Library ── */}
      <main className="section">
        <div className="section-header">
          <h2 className="section-title">Video Library</h2>
          {!loading && <span className="count-badge">{videos.length} videos</span>}
        </div>

        {loading ? (
          <SkeletonGrid />
        ) : videos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎬</div>
            <p>No videos yet. Submit a YouTube URL above to begin.</p>
          </div>
        ) : (
          <div className="video-grid">
            {videos.map(v => {
              const vid = v.PK.replace('VIDEO#', '')
              const isReady = v.pipeline_status === 'DESCRIPTIONS_READY'
              const isLoading = loadingDetail === vid
              return (
                <article
                  key={v.PK}
                  className="video-card"
                  onClick={() => !isReady && window.open(v.video_url ?? `https://youtube.com/watch?v=${vid}`, '_blank')}
                  role="button"
                  tabIndex={0}
                  aria-label={`Video: ${v.title}`}
                >
                  <div className="thumbnail-wrap">
                    <img src={v.thumbnail} alt={v.title} loading="lazy" />
                    <span className={`status-badge ${statusBadgeClass(v.pipeline_status)}`}>
                      {statusLabel(v.pipeline_status)}
                    </span>
                  </div>
                  <div className="card-body">
                    <p className="card-title">{v.title}</p>
                    <div className="card-meta">
                      <span className="card-channel">{v.channel}</span>
                      <span>·</span>
                      <span>{new Date(v.publishedAt).getFullYear()}</span>
                      {v.descriptions_generated != null && (
                        <>
                          <span>·</span>
                          <span>{v.descriptions_generated} descriptions</span>
                        </>
                      )}
                    </div>
                    {isReady && (
                      <button
                        id={`play-descriptions-${vid}`}
                        className="card-action"
                        onClick={e => { e.stopPropagation(); openPlayer(vid) }}
                        disabled={isLoading}
                      >
                        {isLoading ? '⏳ Loading...' : '🔊 Play with Audio Descriptions'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Audio Description Player ── */}
      {playerDetail && (
        <DescriptionPlayer
          detail={playerDetail}
          onClose={() => setPlayerDetail(null)}
        />
      )}

      {/* ── Footer ── */}
      <footer className="footer">
        <p>Built with <span>Gemini Vision</span> · <span>Amazon Polly</span> · <span>AWS Lambda</span> · <span>React</span></p>
      </footer>
    </div>
  )
}
