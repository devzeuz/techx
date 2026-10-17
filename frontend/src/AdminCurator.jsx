import React, { useState, useEffect, useRef } from 'react';
import { apiFetch, apiRequest } from './Api';
import {
  Sparkles,
  Bot,
  MoveUp,
  MoveDown,
  Trash2,
  ExternalLink,
  Plus,
  Layers,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  BookOpen,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import Spinner from './components/Spinner';

const POLL_INTERVAL_MS = 4000;

const AdminCurator = () => {
  // Views: 'create' | 'curations_list' | 'review'
  const [view, setView] = useState('create');

  // New Curation Form State
  const [prompt, setPrompt] = useState('');
  const [level, setLevel] = useState('All Levels');
  const [maxVideos, setMaxVideos] = useState(6);
  const [targetDuration, setTargetDuration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Active / Selected Curation State
  const [activeCurationId, setActiveCurationId] = useState(null);
  const [curationData, setCurationData] = useState(null);
  const [curationLoading, setCurationLoading] = useState(false);

  // Past curations list
  const [pastCurations, setPastCurations] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  // Edit / Review Draft State
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftLevel, setDraftLevel] = useState('All Levels');
  const [draftLessons, setDraftLessons] = useState([]);
  const [newVideoUrl, setNewVideoUrl] = useState('');

  // Publishing State
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState(null); // null | { type, message }

  const pollTimerRef = useRef(null);

  /* ── Load Past Curations ────────────────────────── */
  const loadPastCurations = async () => {
    setListLoading(true);
    const data = await apiRequest('/admin/curations');
    setPastCurations(Array.isArray(data) ? data : []);
    setListLoading(false);
  };

  useEffect(() => {
    let isMounted = true;
    apiRequest('/admin/curations').then((data) => {
      if (isMounted) {
        setPastCurations(Array.isArray(data) ? data : []);
        setListLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  /* ── Fetch Curation Detail & Setup Review ───────── */
  const loadCurationDetail = async (id, isPolling = false) => {
    if (!isPolling) setCurationLoading(true);
    const data = await apiRequest(`/admin/curations/${id}`);
    if (data) {
      setCurationData(data);
      if (data.Draft && (!draftTitle || !isPolling)) {
        setDraftTitle(data.Draft.title || '');
        setDraftDesc(data.Draft.description || '');
        setDraftLevel(data.Draft.level || 'All Levels');
        setDraftLessons(data.Draft.lessons || []);
      }
    }
    if (!isPolling) setCurationLoading(false);
    return data;
  };

  /* ── Polling for Running Status ─────────────────── */
  useEffect(() => {
    if (activeCurationId && curationData?.Status === 'RUNNING') {
      pollTimerRef.current = setInterval(async () => {
        const updated = await loadCurationDetail(activeCurationId, true);
        if (updated && updated.Status !== 'RUNNING') {
          clearInterval(pollTimerRef.current);
          loadPastCurations();
        }
      }, POLL_INTERVAL_MS);
    } else {
      clearInterval(pollTimerRef.current);
    }
    return () => clearInterval(pollTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCurationId, curationData?.Status]);

  /* ── Submit New Curation Job ────────────────────── */
  const handleStartCuration = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!prompt.trim()) {
      setFormError('Please enter a description or topic brief for the course.');
      return;
    }

    setSubmitting(true);
    const payload = {
      prompt: prompt.trim(),
      level,
      maxVideos: parseInt(maxVideos, 10),
      targetDurationMinutes: targetDuration ? parseInt(targetDuration, 10) : undefined,
    };

    const { ok, data } = await apiFetch('/admin/curations', 'POST', payload);
    setSubmitting(false);

    if (ok && data?.curationId) {
      setActiveCurationId(data.curationId);
      setDraftTitle('');
      setDraftDesc('');
      setDraftLessons([]);
      setPublishStatus(null);
      setView('review');
      loadCurationDetail(data.curationId);
      loadPastCurations();
    } else {
      setFormError(data?.error || 'Failed to start AI Curator. Please verify Admin access.');
    }
  };

  /* ── Select a Curation from List ────────────────── */
  const handleSelectCuration = (item) => {
    const curId = item.CurationId || item.PK.replace('CURATION#', '');
    setActiveCurationId(curId);
    setPublishStatus(null);
    setView('review');
    loadCurationDetail(curId);
  };

  /* ── Delete a Curation ──────────────────────────── */
  const handleDeleteCuration = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this curation draft?')) return;
    await apiFetch(`/admin/curations/${id}`, 'DELETE');
    if (activeCurationId === id) {
      setActiveCurationId(null);
      setCurationData(null);
      setView('create');
    }
    loadPastCurations();
  };

  /* ── Lesson Reordering & Editing ────────────────── */
  const moveLesson = (index, direction) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= draftLessons.length) return;
    const updated = [...draftLessons];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIdx, 0, moved);
    setDraftLessons(updated);
  };

  const removeLesson = (index) => {
    setDraftLessons(draftLessons.filter((_, i) => i !== index));
  };

  const updateLessonTitle = (index, newTitle) => {
    const updated = [...draftLessons];
    updated[index] = { ...updated[index], title: newTitle };
    setDraftLessons(updated);
  };

  const handleAddCustomVideo = (e) => {
    e.preventDefault();
    if (!newVideoUrl.trim()) return;
    const url = newVideoUrl.trim();
    let videoId = url;
    const match = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/v\/)([A-Za-z0-9_-]{11})/);
    if (match) videoId = match[1];

    const newLesson = {
      id: videoId,
      title: `Lesson ${draftLessons.length + 1} (Custom)`,
      duration_s: 600,
      duration_formatted: '10m 00s',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      reason: 'Manually added by Admin',
    };
    setDraftLessons([...draftLessons, newLesson]);
    setNewVideoUrl('');
  };

  /* ── Publish Course to Catalog ──────────────────── */
  const handlePublish = async (overwrite = false) => {
    if (!draftTitle.trim()) {
      setPublishStatus({ type: 'error', message: 'Course title is required.' });
      return;
    }
    if (draftLessons.length === 0) {
      setPublishStatus({ type: 'error', message: 'At least one lesson is required.' });
      return;
    }

    setPublishing(true);
    setPublishStatus({ type: 'loading', message: 'Publishing course to catalog…' });

    const payload = {
      title: draftTitle.trim(),
      description: draftDesc.trim(),
      level: draftLevel,
      videos: draftLessons.map((l) => ({
        id: l.id,
        title: l.title,
        thumbnail: l.thumbnail,
        duration_s: l.duration_s,
        reason: l.reason,
      })),
      overwrite,
    };

    const { ok, status: code, data } = await apiFetch(
      `/admin/curations/${activeCurationId}/publish`,
      'POST',
      payload
    );

    setPublishing(false);

    if (ok) {
      setPublishStatus({
        type: 'success',
        message: data?.message || 'Course published successfully! Visible in course catalog.',
      });
      loadCurationDetail(activeCurationId);
      loadPastCurations();
    } else if (code === 409) {
      setPublishStatus({
        type: 'conflict',
        message: `A course named "${draftTitle.trim()}" already exists in the catalog. Would you like to replace it?`,
      });
    } else {
      setPublishStatus({
        type: 'error',
        message: data?.error || 'Failed to publish course. Please try again.',
      });
    }
  };

  return (
    <div className="curator-container" style={{ width: '100%' }}>
      {/* Sub-navigation bar inside AI Curator */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn ${view === 'create' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '6px 14px', fontSize: '0.85rem' }}
            onClick={() => {
              setView('create');
              setPublishStatus(null);
            }}
          >
            <Sparkles size={14} /> New AI Curation
          </button>
          <button
            type="button"
            className={`btn ${view === 'curations_list' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '6px 14px', fontSize: '0.85rem' }}
            onClick={() => {
              setView('curations_list');
              loadPastCurations();
            }}
          >
            <Layers size={14} /> History ({pastCurations.length})
          </button>
        </div>

        {activeCurationId && view !== 'review' && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '6px 14px', fontSize: '0.85rem' }}
            onClick={() => setView('review')}
          >
            Return to Active Draft ({activeCurationId}) &rarr;
          </button>
        )}
      </div>

      {/* ── VIEW 1: CREATE NEW CURATION FORM ────────── */}
      {view === 'create' && (
        <div className="card" style={{ padding: '32px', cursor: 'default' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={20} color="var(--color-accent-light)" />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800' }}>AI Curriculum Curator</h2>
          </div>

          <p
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: '0.88rem',
              lineHeight: '1.6',
              marginBottom: '24px',
            }}
          >
            Describe the skills, technologies, and target outcome you want to teach. The AI agent
            will explore YouTube, inspect lesson durations, filter noise, and propose an ordered
            curriculum draft for your review.
          </p>

          <form onSubmit={handleStartCuration} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="curator-prompt">
                What should this course teach?
              </label>
              <textarea
                id="curator-prompt"
                rows={4}
                className="textarea"
                placeholder="e.g., A comprehensive hands-on guide to Docker & Kubernetes for junior backend engineers. Cover container fundamentals, multi-container compose, networking, deployment, and cluster debugging."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="curator-level">
                  Target Experience Level
                </label>
                <select
                  id="curator-level"
                  className="input"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  <option value="All Levels">All Levels</option>
                  <option value="Beginner">Beginner (Foundations)</option>
                  <option value="Intermediate">Intermediate (Core & Patterns)</option>
                  <option value="Advanced">Advanced (Production & Architecture)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="curator-max">
                  Maximum Lessons
                </label>
                <select
                  id="curator-max"
                  className="input"
                  value={maxVideos}
                  onChange={(e) => setMaxVideos(e.target.value)}
                >
                  <option value="4">4 Lessons (Quick Tour)</option>
                  <option value="6">6 Lessons (Standard Mini-Course)</option>
                  <option value="8">8 Lessons (Comprehensive)</option>
                  <option value="10">10 Lessons (In-depth Bootcamp)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="curator-duration">
                  Target Duration (mins, optional)
                </label>
                <input
                  id="curator-duration"
                  type="number"
                  className="input"
                  placeholder="e.g. 60"
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(e.target.value)}
                />
              </div>
            </div>

            {formError && (
              <div className="alert alert-error">
                <AlertCircle size={17} />
                <span>{formError}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ padding: '14px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {submitting ? (
                <>
                  <Spinner size="sm" /> Dispatching AI Agent…
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Research & Curate Course
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ── VIEW 2: CURATION HISTORY LIST ───────────── */}
      {view === 'curations_list' && (
        <div className="card" style={{ padding: '28px', cursor: 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '800' }}>Curated Course Drafts</h2>
            <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={loadPastCurations}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {listLoading && (
            <div className="alert alert-info">
              <Spinner size="sm" />
              <span>Loading drafts…</span>
            </div>
          )}

          {!listLoading && pastCurations.length === 0 && (
            <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '32px 0' }}>
              No curation drafts yet. Click "New AI Curation" to create one.
            </p>
          )}

          {!listLoading && pastCurations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pastCurations.map((c) => {
                const curId = c.CurationId || c.PK.replace('CURATION#', '');
                const title = c.Draft?.title || c.Prompt;
                const status = c.Status || 'UNKNOWN';

                return (
                  <div
                    key={c.PK}
                    onClick={() => handleSelectCuration(c)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent-light)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                  >
                    <div style={{ flex: 1, minWidth: 0, marginRight: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span
                          className={`badge ${
                            status === 'PUBLISHED'
                              ? 'badge-green'
                              : status === 'DRAFT'
                              ? 'badge-blue'
                              : status === 'RUNNING'
                              ? 'badge-gold'
                              : 'badge'
                          }`}
                        >
                          {status}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
                          ID: {curId} · {c.CreatedAt ? new Date(c.CreatedAt).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <div
                        style={{
                          fontWeight: '700',
                          fontSize: '0.95rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {title}
                      </div>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--color-text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {c.Prompt}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '6px 10px', color: '#f87171' }}
                        title="Delete draft"
                        onClick={(e) => handleDeleteCuration(curId, e)}
                      >
                        <Trash2 size={14} />
                      </button>
                      <ArrowRight size={16} color="var(--color-text-subtle)" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── VIEW 3: DRAFT REVIEW & PUBLISH ───────────── */}
      {view === 'review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {curationLoading && (
            <div className="alert alert-info">
              <Spinner size="sm" />
              <span>Loading curation details…</span>
            </div>
          )}

          {/* Running State Banner with live polling */}
          {curationData?.Status === 'RUNNING' && (
            <div
              className="card"
              style={{
                padding: '32px',
                textAlign: 'center',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                background: 'rgba(251, 191, 36, 0.04)',
              }}
            >
              <div style={{ display: 'inline-block', marginBottom: '16px' }}>
                <Spinner size="lg" />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '8px' }}>
                AI Curator is Searching & Reasoning
              </h2>
              <p
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.9rem',
                  maxWidth: '540px',
                  margin: '0 auto 16px',
                  lineHeight: '1.6',
                }}
              >
                The agent is calling the YouTube API, evaluating video content, filtering out shorts, and
                structuring the optimal lesson progression for:
                <br />
                <strong style={{ color: 'var(--color-text-primary)' }}>"{curationData.Prompt}"</strong>
              </p>
              <span className="badge badge-gold">Status: RUNNING (checking every 4s)</span>
            </div>
          )}

          {/* Failed State Banner */}
          {curationData?.Status === 'FAILED' && (
            <div className="alert alert-error" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} />
                <strong style={{ fontSize: '1rem' }}>Curation failed</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>{curationData.Error || 'An error occurred during agent execution.'}</p>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '6px 14px', marginTop: '8px' }}
                onClick={() => setView('create')}
              >
                Try Again with Different Prompt
              </button>
            </div>
          )}

          {/* Published State Notification */}
          {curationData?.Status === 'PUBLISHED' && (
            <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CheckCircle size={20} />
              <div>
                <strong>Course Published!</strong> This curriculum is live in the course catalog.
                {curationData.PublishedCourseId && (
                  <span style={{ display: 'block', fontSize: '0.8rem', marginTop: '2px' }}>
                    Course ID: <code>{curationData.PublishedCourseId}</code>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Review & Edit Screen (Available when DRAFT or PUBLISHED) */}
          {curationData && curationData.Status !== 'RUNNING' && curationData.Status !== 'FAILED' && (
            <>
              {/* Header card with summary & rationale */}
              <div className="card" style={{ padding: '28px', cursor: 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <span className="badge badge-blue" style={{ marginBottom: '8px' }}>
                      Admin Review Required
                    </span>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: '800' }}>Curriculum Review</h2>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      Review, adjust, reorder, or edit the AI-curated course before publishing to learners.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={publishing || draftLessons.length === 0}
                      onClick={() => handlePublish(false)}
                      style={{ padding: '10px 20px', fontSize: '0.92rem' }}
                    >
                      {publishing ? <><Spinner size="sm" /> Publishing…</> : <><CheckCircle size={16} /> Publish to Catalog</>}
                    </button>
                  </div>
                </div>

                {/* AI Rationale box */}
                {curationData.Draft?.summary_rationale && (
                  <div
                    style={{
                      background: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      borderRadius: '8px',
                      padding: '14px 18px',
                      fontSize: '0.88rem',
                      lineHeight: '1.6',
                      color: 'var(--color-text-primary)',
                      marginBottom: '20px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', marginBottom: '4px', color: 'var(--color-accent-light)' }}>
                      <Sparkles size={14} /> Agent Curriculum Rationale
                    </div>
                    {curationData.Draft.summary_rationale}
                  </div>
                )}

                {/* Course Metadata Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="draft-title">
                      Course Title
                    </label>
                    <input
                      id="draft-title"
                      type="text"
                      className="input"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder="e.g. Modern Full-Stack Web Development"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="draft-desc">
                      Course Description
                    </label>
                    <textarea
                      id="draft-desc"
                      rows={2}
                      className="textarea"
                      value={draftDesc}
                      onChange={(e) => setDraftDesc(e.target.value)}
                      placeholder="Brief overview of the curriculum…"
                    />
                  </div>

                  <div style={{ maxWidth: '240px' }} className="form-group">
                    <label className="form-label" htmlFor="draft-level">
                      Level
                    </label>
                    <select
                      id="draft-level"
                      className="input"
                      value={draftLevel}
                      onChange={(e) => setDraftLevel(e.target.value)}
                    >
                      <option value="All Levels">All Levels</option>
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </div>
                </div>

                {/* Status messages & conflict resolution */}
                {publishStatus?.type === 'loading' && (
                  <div className="alert alert-info" style={{ marginTop: '20px' }}>
                    <Spinner size="sm" />
                    <span>{publishStatus.message}</span>
                  </div>
                )}
                {publishStatus?.type === 'success' && (
                  <div className="alert alert-success" style={{ marginTop: '20px' }}>
                    <CheckCircle size={18} />
                    <span>{publishStatus.message}</span>
                  </div>
                )}
                {publishStatus?.type === 'error' && (
                  <div className="alert alert-error" style={{ marginTop: '20px' }}>
                    <AlertCircle size={18} />
                    <span>{publishStatus.message}</span>
                  </div>
                )}
                {publishStatus?.type === 'conflict' && (
                  <div className="alert alert-error" style={{ marginTop: '20px', flexWrap: 'wrap' }}>
                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{publishStatus.message}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="btn btn-primary" onClick={() => handlePublish(true)}>
                        Overwrite Existing Course
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setPublishStatus(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Lesson Items Review List */}
              <div className="card" style={{ padding: '28px', cursor: 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '800' }}>
                    Curated Lessons ({draftLessons.length})
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>
                    Reorder with arrows or remove irrelevant videos
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {draftLessons.map((lesson, idx) => (
                    <div
                      key={`${lesson.id}-${idx}`}
                      style={{
                        display: 'flex',
                        gap: '16px',
                        padding: '16px',
                        borderRadius: '10px',
                        border: '1px solid var(--color-border)',
                        background: 'rgba(255, 255, 255, 0.02)',
                        alignItems: 'flex-start',
                      }}
                    >
                      {/* Order Number */}
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'var(--color-accent-glow)',
                          color: 'var(--color-accent-light)',
                          fontWeight: '800',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.85rem',
                          flexShrink: 0,
                          marginTop: '4px',
                        }}
                      >
                        {idx + 1}
                      </div>

                      {/* Video Thumbnail */}
                      <div
                        style={{
                          width: '120px',
                          height: '68px',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          flexShrink: 0,
                          background: '#000',
                          position: 'relative',
                        }}
                      >
                        <img
                          src={lesson.thumbnail}
                          alt={lesson.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {lesson.duration_formatted && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '4px',
                              right: '4px',
                              background: 'rgba(0,0,0,0.8)',
                              color: '#fff',
                              fontSize: '0.65rem',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                          >
                            <Clock size={8} /> {lesson.duration_formatted}
                          </div>
                        )}
                      </div>

                      {/* Title & Agent Reason */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          type="text"
                          className="input"
                          value={lesson.title}
                          onChange={(e) => updateLessonTitle(idx, e.target.value)}
                          style={{ marginBottom: '8px', fontWeight: '600', padding: '6px 10px', fontSize: '0.9rem' }}
                        />

                        {lesson.reason && (
                          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
                            <strong style={{ color: 'var(--color-text-soft)' }}>Reason:</strong> {lesson.reason}
                          </p>
                        )}
                      </div>

                      {/* Reorder and Delete Actions */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '6px' }}
                            title="Move Up"
                            disabled={idx === 0}
                            onClick={() => moveLesson(idx, -1)}
                          >
                            <MoveUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '6px' }}
                            title="Move Down"
                            disabled={idx === draftLessons.length - 1}
                            onClick={() => moveLesson(idx, 1)}
                          >
                            <MoveDown size={14} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <a
                            href={`https://www.youtube.com/watch?v=${lesson.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost"
                            style={{ padding: '6px' }}
                            title="Preview on YouTube"
                          >
                            <ExternalLink size={14} />
                          </a>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '6px', color: '#f87171' }}
                            title="Remove from Curriculum"
                            onClick={() => removeLesson(idx)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Custom Video Form */}
                <form
                  onSubmit={handleAddCustomVideo}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    marginTop: '20px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--color-border)',
                  }}
                >
                  <input
                    type="text"
                    className="input"
                    placeholder="Add lesson by YouTube URL (e.g. https://www.youtube.com/watch?v=...)"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn btn-ghost" style={{ padding: '8px 16px' }}>
                    <Plus size={15} /> Add Video
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminCurator;
