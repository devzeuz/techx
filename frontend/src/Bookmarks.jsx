import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from './Api';
import { Bookmark, BookOpen, ArrowLeft, Trash2, PlayCircle } from 'lucide-react';
import SkeletonLoader from './components/SkeletonLoader';
import Spinner from './components/Spinner';

const GRADIENTS = [
  'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
  'linear-gradient(135deg, #1d4ed8 0%, #60a5fa 100%)',
  'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
  'linear-gradient(135deg, #1d4ed8 0%, #93c5fd 100%)',
];

const Bookmarks = ({ user }) => {
  const navigate = useNavigate();
  const [bookmarks,  setBookmarks]  = useState([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [removingId, setRemovingId] = useState(null);

  const userId = user?.signInDetails?.loginId ?? user?.username ?? '';

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const userData = await apiRequest(`/user?userId=${userId}`);
      if (Array.isArray(userData)) {
        setBookmarks(userData.filter(i => i.SK?.startsWith('BOOKMARK#')));
      }
      setIsLoading(false);
    })();
  }, [userId]);

  const handleRemove = async (bookmark) => {
    const courseId = bookmark.SK.split('#')[1];
    setRemovingId(courseId);
    await apiRequest('/user', 'POST', {
      userId, type: 'REMOVE_BOOKMARK', courseId,
    });
    setBookmarks(prev => prev.filter(b => b.SK !== bookmark.SK));
    setRemovingId(null);
  };

  return (
    <div className="page-wrapper" style={{ padding: '40px 0 72px' }}>
      <div className="container">

        {/* ── Header ── */}
        <button
          onClick={() => navigate('/dashboard')}
          className="btn btn-ghost"
          style={{ marginBottom: '28px', padding: '8px 16px' }}
        >
          <ArrowLeft size={15} /> Back to Dashboard
        </button>

        <div className="fade-in-up" style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: 'var(--color-accent-bg)',
              border: '1px solid rgba(99,102,241,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Bookmark size={22} color="var(--color-accent-light)" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>
                Saved for Later
              </h1>
              <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '0.9rem' }}>
                Courses you've bookmarked — start whenever you're ready.
              </p>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <SkeletonLoader variant="card" count={6} />

        ) : bookmarks.length === 0 ? (
          /* Empty state */
          <div className="card" style={{ padding: '64px 32px', textAlign: 'center', cursor: 'default' }}>
            <BookOpen
              size={48}
              color="var(--color-text-subtle)"
              style={{ margin: '0 auto 16px', display: 'block' }}
            />
            <h3 style={{ color: 'var(--color-text-secondary)', marginBottom: '10px', fontWeight: '700' }}>
              No bookmarks yet
            </h3>
            <p style={{
              color: 'var(--color-text-subtle)', fontSize: '0.9rem',
              maxWidth: '320px', margin: '0 auto 28px',
            }}>
              Browse courses and hit the bookmark icon to save them here.
            </p>
            <Link to="/" className="btn btn-primary">Explore Courses</Link>
          </div>

        ) : (
          <div className="course-grid fade-in-up">
            {bookmarks.map((b, idx) => {
              const courseId  = b.SK.split('#')[1];
              const removing  = removingId === courseId;

              return (
                <div key={b.SK} className="card course-card">
                  {/* Thumbnail */}
                  <div
                    className="course-card-thumb"
                    style={{ background: GRADIENTS[idx % GRADIENTS.length] }}
                  >
                    <PlayCircle size={38} color="rgba(255,255,255,0.65)" />
                  </div>

                  <div className="course-card-body">
                    {/* Bookmark badge */}
                    <span style={{
                      fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'var(--color-accent-light)',
                      display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px',
                    }}>
                      <Bookmark size={10} fill="currentColor" /> Saved
                    </span>

                    <h3 className="course-card-title">{b.Title}</h3>

                    {b.TotalVideos && (
                      <div className="course-card-meta">
                        <PlayCircle size={13} />
                        <span>{b.TotalVideos} videos</span>
                      </div>
                    )}

                    <div className="course-card-actions">
                      <Link
                        to={`/learn/${courseId}`}
                        className="btn btn-outline"
                        style={{ flex: 1 }}
                      >
                        Start Course
                      </Link>

                      <button
                        onClick={() => handleRemove(b)}
                        disabled={removing}
                        className="bookmark-btn is-bookmarked"
                        title="Remove bookmark"
                        aria-label="Remove bookmark"
                        style={{ color: 'var(--color-red, #ef4444)' }}
                      >
                        {removing ? <Spinner size="sm" /> : <Trash2 size={17} />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
};

export default Bookmarks;
