import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiRequest } from './Api';
import { AlertCircle, CheckCircle, RefreshCw, Volume2 } from 'lucide-react';
import Spinner from './components/Spinner';

const IN_PROGRESS = ['QUEUED', 'DOWNLOADING', 'TRANSCRIBING', 'EXTRACTING_FRAMES', 'FRAMES_READY', 'DESCRIBING'];
const MAX_PER_REQUEST = 10;
const POLL_MS = 15000;

const FAILURE_LABELS = {
  AUDIO_FAILED: 'Audio download failed',
  PAUSE_MAP_FAILED: 'Pause detection failed',
  FRAME_EXTRACTION_FAILED: 'Frame extraction failed',
  FRAME_FAILED: 'Frame extraction failed',
  DESCRIPTION_FAILED: 'AI vision failed',
};

const statusView = (s = 'NONE') => {
  if (s === 'DESCRIPTIONS_READY') return { label: 'Ready', cls: 'badge-green' };
  if (IN_PROGRESS.includes(s))   return { label: s.replace(/_/g, ' ').toLowerCase(), cls: 'badge-blue' };
  if (s.endsWith('FAILED'))      return { label: FAILURE_LABELS[s] ?? 'Failed', cls: 'badge-gold', failed: true };
  return { label: 'Not generated', cls: '' };
};

/** Admin-only: generate audio descriptions for an existing course's lessons. */
const AdminDescriptions = () => {
  const [courses,  setCourses]  = useState([]);
  const [courseId, setCourseId] = useState('');
  const [videos,   setVideos]   = useState([]);  // ordered course lessons
  const [statuses, setStatuses] = useState({});  // { ytId: {status, count, error} }
  const [loading,  setLoading]  = useState(false);
  const [confirm,  setConfirm]  = useState(null); // { force, count }
  const [result,   setResult]   = useState(null); // { type, message }

  useEffect(() => {
    apiRequest('/courses').then(d =>
      setCourses((d ?? []).sort((a, b) => (a.Title ?? '').localeCompare(b.Title ?? ''))));
  }, []);

  const loadStatus = async (id = courseId) => {
    if (!id) return;
    const d = await apiRequest(`/courses/${id}/descriptions`);
    setStatuses(d?.videos ?? {});
  };

  useEffect(() => {
    setVideos([]); setStatuses({}); setResult(null); setConfirm(null);
    if (!courseId) return;
    setLoading(true);
    Promise.all([apiRequest(`/courses/${courseId}`), loadStatus(courseId)]).then(([items]) => {
      setVideos((items ?? []).filter(i => i.Type === 'VIDEO').sort((a, b) => a.SK.localeCompare(b.SK)));
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const counts = useMemo(() => {
    const c = { ready: 0, running: 0, todo: 0 };
    videos.forEach(v => {
      const s = statuses[v.YouTubeID]?.status ?? 'NONE';
      if (s === 'DESCRIPTIONS_READY') c.ready++;
      else if (IN_PROGRESS.includes(s)) c.running++;
      else c.todo++;
    });
    return c;
  }, [videos, statuses]);

  // Auto-refresh while the pipeline is working
  useEffect(() => {
    if (!counts.running) return;
    const t = setInterval(() => loadStatus(), POLL_MS);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts.running, courseId]);

  const askConfirm = (force) => {
    const eligible = force ? counts.todo + counts.ready : counts.todo;
    setResult(null);
    setConfirm({ force, count: Math.min(eligible, MAX_PER_REQUEST), eligible });
  };

  const queue = async () => {
    const { force } = confirm;
    setConfirm(null);
    setResult({ type: 'loading', message: 'Queuing videos…' });
    const { ok, data } = await apiFetch('/admin/descriptions', 'POST', { courseId, force });
    if (ok) {
      setResult({ type: 'success', message: data.message + (data.skipped?.some(s => s.status === 'LIMIT')
        ? ` Run again to queue the rest (limit ${data.limit} per request).` : '') });
      loadStatus();
    } else {
      setResult({ type: 'error', message: data?.error ?? 'Could not queue videos. Are you an Admin?' });
    }
  };

  const retryVideo = async (ytId) => {
    setResult({ type: 'loading', message: 'Re-queuing video…' });
    const { ok, data } = await apiFetch('/admin/descriptions', 'POST', { courseId, videoIds: [ytId], force: true });
    setResult(ok ? { type: 'success', message: data?.message ?? 'Video re-queued.' }
                 : { type: 'error', message: data?.error ?? 'Could not re-queue video.' });
    if (ok) loadStatus();
  };

  return (
    <div className="card" style={{ padding: '32px', cursor: 'default' }}>
      <h2 style={{ fontWeight: 700, marginBottom: 8, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Volume2 size={18} color="var(--color-gold)" /> Audio Descriptions
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', marginBottom: 24, lineHeight: 1.65 }}>
        Generate AI narration of on-screen content (code, slides, diagrams) for visually impaired learners.
        Each video takes a few minutes and uses Transcribe, Gemini and Polly. Videos shared across courses are processed once.
      </p>

      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label" htmlFor="ad-course">Course</label>
        <select id="ad-course" className="input" value={courseId} onChange={e => setCourseId(e.target.value)}>
          <option value="">Select a course…</option>
          {courses.map(c => {
            const id = c.PK?.replace('COURSE#', '');
            return <option key={id} value={id}>{c.Title}</option>;
          })}
        </select>
      </div>

      {loading && <div className="alert alert-info"><Spinner size="sm" /><span>Loading lessons…</span></div>}

      {!loading && courseId && videos.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            <span className="badge badge-green">{counts.ready} ready</span>
            <span className="badge badge-blue">{counts.running} processing</span>
            <span className="badge">{counts.todo} to generate</span>
            <button id="ad-refresh" type="button" className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '6px 12px' }}
              onClick={() => loadStatus()} aria-label="Refresh status">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', maxHeight: 320, overflowY: 'auto',
                       border: '1px solid var(--color-border)', borderRadius: 10 }}>
            {videos.map((v, i) => {
              const st = statuses[v.YouTubeID] ?? {};
              const view = statusView(st.status);
              return (
                <li key={v.SK} style={{ padding: '10px 14px', borderTop: i ? '1px solid var(--color-border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'var(--color-text-subtle)', fontSize: '0.8rem', width: 22 }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: '0.88rem', minWidth: 0 }}>{v.VideoTitle}</span>
                    <span className={`badge ad-status ${view.cls}`}>
                      {view.label}{st.status === 'DESCRIPTIONS_READY' && st.count ? ` · ${st.count}` : ''}
                    </span>
                    {view.failed && (
                      <button id={`ad-retry-${v.YouTubeID}`} type="button" className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        disabled={result?.type === 'loading'} onClick={() => retryVideo(v.YouTubeID)}>
                        <RefreshCw size={12} /> Retry
                      </button>
                    )}
                  </div>
                  {view.failed && st.error && (
                    <p style={{ margin: '6px 0 0 34px', fontSize: '0.78rem', color: 'var(--color-text-secondary)',
                                wordBreak: 'break-word' }}>
                      {st.error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button id="ad-generate" type="button" className="btn btn-primary"
              disabled={!counts.todo || result?.type === 'loading'} onClick={() => askConfirm(false)}>
              Generate audio descriptions
            </button>
            <button id="ad-regenerate" type="button" className="btn btn-ghost"
              disabled={!counts.ready || result?.type === 'loading'} onClick={() => askConfirm(true)}>
              Regenerate all
            </button>
          </div>
        </>
      )}

      {!loading && courseId && videos.length === 0 && (
        <div className="alert alert-error"><AlertCircle size={17} /><span>This course has no lessons.</span></div>
      )}

      {confirm && (
        <div className="alert alert-info" role="alertdialog" aria-labelledby="ad-confirm-text"
             style={{ marginTop: 20, flexWrap: 'wrap' }}>
          <AlertCircle size={17} style={{ flexShrink: 0 }} />
          <span id="ad-confirm-text" style={{ flex: 1 }}>
            {confirm.force ? 'Regenerate' : 'Generate'} descriptions for <strong>{confirm.count}</strong> video(s)?
            {confirm.eligible > confirm.count && ` (${confirm.eligible - confirm.count} more will need another run.)`}
            {confirm.force && ' Existing descriptions will be replaced.'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button id="ad-confirm" type="button" className="btn btn-primary" onClick={queue}>Confirm</button>
            <button id="ad-cancel" type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <div className={`alert ${result.type === 'error' ? 'alert-error' : result.type === 'success' ? 'alert-success' : 'alert-info'}`}
             style={{ marginTop: 20 }} role="status">
          {result.type === 'loading' ? <Spinner size="sm" />
            : result.type === 'success' ? <CheckCircle size={17} /> : <AlertCircle size={17} />}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
};

export default AdminDescriptions;
