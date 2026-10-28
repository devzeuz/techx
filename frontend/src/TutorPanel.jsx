import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, X, Sparkles } from 'lucide-react';
import { apiFetch } from './Api';

/**
 * Phase 4 — AI Tutor drawer for the course player.
 * Answers are grounded in the lesson (cached Gemini notes + audio-description cues).
 * Timestamps like [04:12] in answers are rendered as buttons that seek the video.
 */
const QUICK_PROMPTS = [
  "What's on screen right now?",
  'Explain what was just taught',
  'Summarize this lesson',
  'Read the code shown aloud',
];
const POLL_MS = 8000;

const TS_RE = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;

function renderAnswer(text, onSeek) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(TS_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const secs = m[3] !== undefined
      ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
      : (+m[1]) * 60 + (+m[2]);
    out.push(
      <button
        key={`${m.index}-${secs}`}
        type="button"
        className="tutor-ts"
        onClick={() => onSeek(secs)}
        aria-label={`Jump to ${m[0].slice(1, -1)} in the video`}
      >
        {m[0].slice(1, -1)}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const TutorPanel = ({ open, onClose, courseId, video, getCurrentTime, onSeek }) => {
  const [status,   setStatus]   = useState('NONE');   // READY | PREPARING | FAILED | NONE
  const [messages, setMessages] = useState([]);       // {role:'user'|'tutor', text}
  const [input,    setInput]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);
  const listRef  = useRef(null);
  const inputRef = useRef(null);
  const videoId  = video?.YouTubeID;

  // Chat resets per lesson: CoursePlayer remounts this panel with key={videoId}.

  // Check readiness while open; poll while the tutor is studying the lesson
  useEffect(() => {
    if (!open || !videoId) return undefined;
    let cancelled = false;
    let timer;
    const check = async () => {
      const { ok, data } = await apiFetch(`/videos/${videoId}/tutor?courseId=${encodeURIComponent(courseId)}`);
      if (cancelled) return;
      const s = ok ? data?.status : 'FAILED';
      setStatus(s);
      if (s === 'PREPARING') timer = setTimeout(check, POLL_MS);
    };
    check();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, videoId, courseId]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const ask = async (question) => {
    const q = question.trim();
    if (!q || busy || status !== 'READY') return;
    setError(null);
    setInput('');
    const history = messages.slice(-6);
    setMessages(m => [...m, { role: 'user', text: q }]);
    setBusy(true);
    const { ok, status: code, data } = await apiFetch(`/videos/${videoId}/ask`, 'POST', {
      courseId, question: q, currentTime: getCurrentTime(), history,
    });
    setBusy(false);
    if (ok && data?.answer) {
      setMessages(m => [...m, { role: 'tutor', text: data.answer }]);
    } else if (code === 202) {
      setStatus('PREPARING');
      setError('The tutor is still studying this lesson — try again shortly.');
    } else {
      setError(data?.error || 'Something went wrong. Please try again.');
    }
  };

  if (!open) return null;

  const ready = status === 'READY';

  return (
    <aside className="tutor-panel" role="dialog" aria-modal="false" aria-labelledby="tutor-title">
      <header className="tutor-header">
        <div className="tutor-title" id="tutor-title"><Bot size={18} /> AI Tutor</div>
        <button type="button" className="tutor-close" onClick={onClose} aria-label="Close AI Tutor">
          <X size={18} />
        </button>
      </header>

      <div className="tutor-messages" ref={listRef} aria-live="polite" aria-relevant="additions">
        {!ready && (
          <div className="tutor-status" role="status">
            {status === 'FAILED'
              ? 'The tutor could not prepare this lesson. Please try again later.'
              : <><span className="tutor-pulse" /> Studying this lesson… the first time takes about 2 minutes.</>}
          </div>
        )}

        {ready && messages.length === 0 && (
          <div className="tutor-empty">
            <Sparkles size={20} />
            <p>Ask anything about <strong>{video?.VideoTitle}</strong>. I know what is said and shown on screen.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`tutor-msg tutor-msg-${m.role}`}>
            <span className="sr-only">{m.role === 'user' ? 'You said:' : 'Tutor said:'}</span>
            {m.role === 'tutor' ? renderAnswer(m.text, onSeek) : m.text}
          </div>
        ))}

        {busy && <div className="tutor-msg tutor-msg-tutor tutor-typing" role="status">Thinking…</div>}
        {error && <div className="tutor-error" role="alert">{error}</div>}
      </div>

      {ready && (
        <div className="tutor-quick">
          {QUICK_PROMPTS.map(p => (
            <button key={p} type="button" className="tutor-chip" disabled={busy} onClick={() => ask(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      <form className="tutor-input" onSubmit={e => { e.preventDefault(); ask(input); }}>
        <label htmlFor="tutor-question" className="sr-only">Ask the AI Tutor</label>
        <input
          id="tutor-question"
          ref={inputRef}
          value={input}
          maxLength={500}
          onChange={e => setInput(e.target.value)}
          placeholder={ready ? 'Ask about this lesson…' : 'Preparing…'}
          disabled={!ready || busy}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary" disabled={!ready || busy || !input.trim()} aria-label="Send question">
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
};

export default TutorPanel;
