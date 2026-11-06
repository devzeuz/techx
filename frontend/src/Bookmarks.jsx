import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from './Api';
import { Bookmark, BookOpen, ArrowLeft, Trash2, PlayCircle } from 'lucide-react';
import SkeletonLoader from './components/SkeletonLoader';
import Spinner from './components/Spinner';
import { inferCourseCategory } from './courseUtils';

const Bookmarks = ({ user }) => {
  const navigate = useNavigate();
  const [bookmarks,  setBookmarks]  = useState([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [removingId, setRemovingId] = useState(null);

  const userId = user?.signInDetails?.loginId ?? user?.username ?? '';

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const userData = await apiRequest(`/user?userId=${encodeURIComponent(userId)}`);
      if (Array.isArray(userData)) {
        setBookmarks(userData.filter((i) => i.SK?.startsWith('BOOKMARK#')));
      }
      setIsLoading(false);
    })();
  }, [userId]);

  const handleRemove = async (bookmark) => {
    const courseId = bookmark.SK.split('#')[1];
    setRemovingId(courseId);
    await apiRequest('/user', 'POST', {
      userId,
      type: 'REMOVE_BOOKMARK',
      courseId,
    });
    setBookmarks((prev) => prev.filter((b) => b.SK !== bookmark.SK));
    setRemovingId(null);
  };

  return (
    <main className="page-wrapper" style={{ padding: '40px 0 72px' }}>
      <div className="container">
        {/* ── Header ── */}
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="btn btn-ghost"
          style={{ marginBottom: '28px', padding: '8px 16px' }}
        >
          <ArrowLeft size={15} aria-hidden="true" /> Back to Dashboard
        </button>

        <div style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'var(--color-accent-glow)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <Bookmark size={22} color="var(--color-accent-light)" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>
                Saved for Later
              </h1>
              <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '0.9rem' }}>
                Courses you have bookmarked to study next.
              </p>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <SkeletonLoader variant="card" count={6} />
        ) : bookmarks.length === 0 ? (
          <div className="card" style={{ padding: '64px 32px', textAlign: 'center', cursor: 'default' }}>
            <BookOpen
              size={44}
              color="var(--color-text-subtle)"
              style={{ margin: '0 auto 16px', display: 'block' }}
              aria-hidden="true"
            />
            <h2 style={{ color: 'var(--color-text-secondary)', marginBottom: '10px', fontWeight: '700', fontSize: '1.15rem' }}>
              No saved courses yet
            </h2>
            <p
              style={{
                color: 'var(--color-text-subtle)',
                fontSize: '0.9rem',
                maxWidth: '340px',
                margin: '0 auto 28px',
              }}
            >
              Browse the Course Marketplace and select the bookmark icon on any course to save it here.
            </p>
            <Link to="/courses" className="btn btn-primary">
              Browse Course Marketplace
            </Link>
          </div>
        ) : (
          <div className="course-grid">
            {bookmarks.map((b) => {
              const courseId = b.SK.split('#')[1];
              const removing = removingId === courseId;
              const category = inferCourseCategory(b);
              const lessonCount = Number(b.TotalVideos) || 0;

              return (
                <article key={b.SK} className="card course-card">
                  <div className={`course-card-media ${b.Thumbnail ? '' : 'course-card-media--fallback'}`}>
                    {b.Thumbnail ? (
                      <img src={b.Thumbnail} alt="" loading="lazy" className="course-card-img" />
                    ) : (
                      <div className="course-card-fallback-inner" aria-hidden="true">
                        <span className="course-card-monogram">{category.code}</span>
                      </div>
                    )}
                    <div className="course-card-media-bar">
                      <span className="course-card-domain">{category.name}</span>
                      {lessonCount > 0 && (
                        <span className="course-card-count">
                          <PlayCircle size={12} aria-hidden="true" />
                          {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="course-card-body">
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--color-accent-light)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Bookmark size={10} fill="currentColor" aria-hidden="true" /> Saved
                    </span>

                    <h3 className="course-card-title">{b.Title}</h3>

                    <footer className="course-card-actions">
                      <Link
                        to={`/learn/${courseId}`}
                        className="btn btn-outline"
                        style={{ flex: 1 }}
                      >
                        Start Course
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleRemove(b)}
                        disabled={removing}
                        className="bookmark-btn"
                        title="Remove bookmark"
                        aria-label={`Remove ${b.Title} from saved courses`}
                        style={{ color: '#f87171' }}
                      >
                        {removing ? <Spinner size="sm" /> : <Trash2 size={16} aria-hidden="true" />}
                      </button>
                    </footer>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};

export default Bookmarks;
