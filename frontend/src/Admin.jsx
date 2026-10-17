import React, { useState } from 'react';
import { apiFetch } from './Api';
import { useNavigate } from 'react-router-dom';
import { Shield, Youtube, Type, ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import Spinner from './components/Spinner';
import AdminDescriptions from './AdminDescriptions';

const Admin = () => {
  const [tab,      setTab]      = useState('manual');
  const [playlist, setPlaylist] = useState('');
  const [title,    setTitle]    = useState('');
  // status: null | { type: 'loading' | 'success' | 'error' | 'conflict', message: string }
  const [status, setStatus] = useState(null);
  const navigate = useNavigate();

  const runImport = async (overwrite = false) => {
    setStatus({ type: 'loading', message: 'Importing course… This may take up to 30 seconds.' });

    const { ok, status: code, data } = await apiFetch('/admin/ingest', 'POST', {
      playlistId:  playlist,
      courseTitle: title,
      overwrite,
    });

    if (ok && data?.message) {
      setStatus({ type: 'success', message: data.message });
      setPlaylist('');
      setTitle('');
    } else if (code === 409) {
      setStatus({
        type: 'conflict',
        message: `A course called "${title.trim()}" already exists. Replace it with this playlist?`,
      });
    } else {
      setStatus({
        type: 'error',
        message: data?.error
          ?? 'Import failed. Check that you are an Admin and the Playlist ID is valid.',
      });
    }
  };

  const handleImport = (e) => {
    e.preventDefault();
    runImport(false);
  };

  return (
    <div className="page-wrapper" style={{ padding: '40px 0 72px' }}>
      <div className="container">

        {/* Back */}
        <button
          onClick={() => navigate('/dashboard')}
          className="btn btn-ghost"
          style={{ marginBottom: '28px', padding: '8px 16px' }}
        >
          <ArrowLeft size={15} /> Back to Dashboard
        </button>

        <div style={{ maxWidth: '580px' }}>

          {/* Header */}
          <div
            style={{
              display: 'flex', alignItems: 'center',
              gap: '16px', marginBottom: '8px',
            }}
          >
            <div
              style={{
                width: '48px', height: '48px',
                background: 'var(--color-gold-bg)',
                border: '1px solid rgba(251, 191, 36, 0.25)',
                borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Shield size={22} color="var(--color-gold)" />
            </div>
            <div>
              <h1
                style={{
                  fontSize: '1.5rem', fontWeight: '800',
                  letterSpacing: '-0.5px',
                }}
              >
                Admin Panel
              </h1>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
                Authorized access only
              </p>
            </div>
          </div>

          <div className="divider" />

          <div role="tablist" aria-label="Admin tools" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[['manual', 'Manual Import'], ['ad', 'Audio Descriptions']].map(([key, label]) => (
              <button key={key} id={`admin-tab-${key}`} type="button" role="tab"
                aria-selected={tab === key}
                className={`btn ${tab === key ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '8px 16px' }}
                onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'ad' && <AdminDescriptions />}

          {/* Form card */}
          {tab === 'manual' && (
          <div className="card" style={{ padding: '32px', cursor: 'default' }}>
            <h2
              style={{
                fontWeight: '700', marginBottom: '8px',
                fontSize: '1.15rem', color: 'var(--color-text-primary)',
              }}
            >
              Import New Course
            </h2>
            <p
              style={{
                color: 'var(--color-text-secondary)', fontSize: '0.88rem',
                marginBottom: '28px', lineHeight: '1.65',
              }}
            >
              Import a YouTube playlist as a structured course. Paste the playlist ID
              found in the YouTube URL after <code style={{ color: 'var(--color-accent-light)' }}>?list=</code>,
              or the full playlist URL.
            </p>

            <form
              onSubmit={handleImport}
              style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
            >
              {/* Course title */}
              <div className="form-group">
                <label className="form-label" htmlFor="admin-title">
                  Course Title
                </label>
                <div style={{ position: 'relative' }}>
                  <Type
                    size={15}
                    style={{
                      position: 'absolute', left: '14px', top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--color-text-subtle)', pointerEvents: 'none',
                    }}
                  />
                  <input
                    id="admin-title"
                    type="text"
                    placeholder="e.g. React for Beginners"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    required
                    className="input"
                    style={{ paddingLeft: '42px' }}
                  />
                </div>
              </div>

              {/* Playlist ID */}
              <div className="form-group">
                <label className="form-label" htmlFor="admin-playlist">
                  YouTube Playlist ID
                </label>
                <div style={{ position: 'relative' }}>
                  <Youtube
                    size={15}
                    style={{
                      position: 'absolute', left: '14px', top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--color-text-subtle)', pointerEvents: 'none',
                    }}
                  />
                  <input
                    id="admin-playlist"
                    type="text"
                    placeholder="e.g. PLxxxxxxxxxxxx or https://youtube.com/playlist?list=…"
                    value={playlist}
                    onChange={e => setPlaylist(e.target.value)}
                    required
                    className="input"
                    style={{ paddingLeft: '42px' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full"
                style={{ padding: '14px', fontSize: '0.95rem' }}
                disabled={status?.type === 'loading'}
              >
                {status?.type === 'loading'
                  ? <><Spinner size="sm" /> Importing…</>
                  : 'Import Course'}
              </button>
            </form>

            {/* Status feedback */}
            {status?.type === 'loading' && (
              <div className="alert alert-info" style={{ marginTop: '20px' }}>
                <Spinner size="sm" />
                <span>{status.message}</span>
              </div>
            )}
            {status?.type === 'success' && (
              <div className="alert alert-success" style={{ marginTop: '20px' }}>
                <CheckCircle size={17} style={{ flexShrink: 0 }} />
                <span>{status.message}</span>
              </div>
            )}
            {status?.type === 'error' && (
              <div className="alert alert-error" style={{ marginTop: '20px' }}>
                <AlertCircle size={17} style={{ flexShrink: 0 }} />
                <span>{status.message}</span>
              </div>
            )}
            {status?.type === 'conflict' && (
              <div className="alert alert-error" style={{ marginTop: '20px', flexWrap: 'wrap' }}>
                <AlertCircle size={17} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{status.message}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button id="admin-overwrite-confirm" type="button" className="btn btn-primary" onClick={() => runImport(true)}>
                    Replace existing course
                  </button>
                  <button id="admin-overwrite-cancel" type="button" className="btn btn-ghost" onClick={() => setStatus(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Admin;