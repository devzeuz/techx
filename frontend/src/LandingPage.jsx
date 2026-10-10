import React, { useState, useEffect } from 'react';
import { apiRequest } from './Api';
import { useNavigate } from 'react-router-dom';
import { Search, PlayCircle, Bookmark, BookOpen } from 'lucide-react';
import SkeletonLoader from './components/SkeletonLoader';
import Spinner from './components/Spinner';

/* Gradient palette cycles through course cards */
const GRADIENTS = [
  'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
  'linear-gradient(135deg, #1d4ed8 0%, #60a5fa 100%)',
  'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
  'linear-gradient(135deg, #1d4ed8 0%, #93c5fd 100%)',
];

const LandingPage = ({ user }) => {
  const [allCourses, setAllCourses]             = useState([]);
  const [bookmarks, setBookmarks]               = useState(new Set());
  const [search, setSearch]                     = useState('');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [loadError, setLoadError]               = useState(false);
  const [enrollingId, setEnrollingId]           = useState(null);
  const navigate = useNavigate();

  // Amplify v6 getCurrentUser() returns a UUID in .username;
  // .signInDetails.loginId holds the actual email used to sign in.
  const userId = user?.signInDetails?.loginId ?? user?.username ?? '';

  const loadCatalog = async () => {
    setIsLoadingCatalog(true);
    setLoadError(false);
    const catalog = await apiRequest('/courses');
    if (catalog === null) {
      // API error — network, auth, or server issue
      setLoadError(true);
    } else {
      setAllCourses(Array.isArray(catalog) ? catalog : []);
    }
    setIsLoadingCatalog(false);
  };

  const loadBookmarks = async () => {
    if (!userId) return;
    const userData = await apiRequest(`/user?userId=${userId}`);
    if (!Array.isArray(userData)) return;
    const b = new Set(
      userData
        .filter(i => i.SK?.startsWith('BOOKMARK#'))
        .map(i => i.SK.split('#')[1]),
    );
    setBookmarks(b);
  };

  useEffect(() => {
    loadCatalog();
    loadBookmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleEnroll = async (course) => {
    const courseId = course.PK.split('#')[1];
    setEnrollingId(courseId);
    await apiRequest('/user', 'POST', {
      userId,
      type:        'ENROLL',
      courseId,
      title:       course.Title,
      totalVideos: course.TotalVideos,
    });
    setEnrollingId(null);
    navigate('/dashboard');
  };

  const toggleBookmark = async (course) => {
    const courseId = course.PK.split('#')[1];
    if (bookmarks.has(courseId)) {
      await apiRequest('/user', 'POST', {
        userId, type: 'REMOVE_BOOKMARK', courseId,
      });
      const next = new Set(bookmarks);
      next.delete(courseId);
      setBookmarks(next);
    } else {
      await apiRequest('/user', 'POST', {
        userId, type: 'BOOKMARK', courseId,
        title: course.Title, totalVideos: course.TotalVideos,
      });
      const next = new Set(bookmarks);
      next.add(courseId);
      setBookmarks(next);
    }
  };

  const filtered = allCourses.filter(
    c => c.Title && c.Title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="page-wrapper">

      {/* ── HERO ────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="container">
          <div className="landing-hero-content fade-in-up">
            <div
              className="badge badge-blue"
              style={{ marginBottom: '20px', display: 'inline-flex' }}
            >
              ✦ Curated Tech Education
            </div>

            <h1 className="landing-title">
              Master Your Future.
            </h1>

            <p className="landing-subtitle">
              Curated tech courses designed to take you from zero to hero.
              Build skills that matter — at your own pace, on your own schedule.
            </p>

            {/* Search */}
            <div className="landing-search-wrap">
              <Search size={17} className="landing-search-icon" />
              <input
                id="course-search"
                type="text"
                placeholder="Search Python, React, AWS..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="landing-search-input"
                aria-label="Search courses"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── COURSE GRID ─────────────────────────────── */}
      <section style={{ padding: '56px 0 80px' }}>
        <div className="container">

          {/* Section header */}
          <div className="section-header">
            <h2 className="section-title">
              <BookOpen size={18} color="var(--color-accent-light)" />
              {search ? `Results for "${search}"` : 'Explore Courses'}
            </h2>
            {!isLoadingCatalog && (
              <span className="badge badge-blue">
                {filtered.length} {filtered.length === 1 ? 'course' : 'courses'}
              </span>
            )}
          </div>

          {/* States */}
          {isLoadingCatalog ? (
            <SkeletonLoader variant="card" count={6} />

          ) : loadError ? (
            /* ── API error state ── */
            <div className="card landing-empty-state">
              <span style={{ fontSize: '2.5rem' }}>⚠️</span>
              <h3 style={{ color: 'var(--color-text-secondary)', fontWeight: '700' }}>
                Couldn't load courses
              </h3>
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.88rem' }}>
                There was a problem reaching the server. Check your connection and try again.
              </p>
              <button
                className="btn btn-primary"
                onClick={loadCatalog}
                style={{ marginTop: '4px' }}
              >
                Retry
              </button>
            </div>

          ) : filtered.length === 0 && search ? (
            /* ── Search returned nothing ── */
            <div className="card landing-empty-state">
              <Search size={40} color="var(--color-text-subtle)" />
              <h3 style={{ color: 'var(--color-text-secondary)', fontWeight: '700' }}>
                No results for &ldquo;{search}&rdquo;
              </h3>
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.88rem' }}>
                Try a different search term.
              </p>
              <button
                className="btn btn-ghost"
                onClick={() => setSearch('')}
                style={{ marginTop: '4px' }}
              >
                Clear search
              </button>
            </div>

          ) : filtered.length === 0 ? (
            /* ── Empty catalog ── */
            <div className="card landing-empty-state">
              <BookOpen size={40} color="var(--color-text-subtle)" />
              <h3 style={{ color: 'var(--color-text-secondary)', fontWeight: '700' }}>
                No courses yet
              </h3>
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.88rem' }}>
                Check back soon — new courses are on the way.
              </p>
            </div>

          ) : (
            <div className="course-grid fade-in-up">
              {filtered.map((course, idx) => {
                const courseId   = course.PK.split('#')[1];
                const bookmarked = bookmarks.has(courseId);
                const enrolling  = enrollingId === courseId;

                return (
                  <div key={course.PK} className="card course-card">
                    {/* Thumbnail */}
                    <div
                      className="course-card-thumb"
                      style={{ background: GRADIENTS[idx % GRADIENTS.length] }}
                    >
                      <PlayCircle size={38} color="rgba(255,255,255,0.65)" />
                    </div>

                    <div className="course-card-body">
                      <h3 className="course-card-title">{course.Title}</h3>

                      <div className="course-card-meta">
                        <PlayCircle size={13} />
                        <span>{course.TotalVideos} videos</span>
                      </div>

                      <div className="course-card-actions">
                        <button
                          onClick={() => handleEnroll(course)}
                          className="btn btn-outline"
                          style={{ flex: 1 }}
                          disabled={enrolling}
                          aria-label={`Enroll in ${course.Title}`}
                        >
                          {enrolling
                            ? <><Spinner size="sm" /> Enrolling…</>
                            : 'Enroll Now'}
                        </button>

                        <button
                          onClick={() => toggleBookmark(course)}
                          className={`bookmark-btn ${bookmarked ? 'is-bookmarked' : ''}`}
                          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark course'}
                          title={bookmarked ? 'Remove bookmark' : 'Save for later'}
                        >
                          <Bookmark size={17} fill={bookmarked ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </section>

    </div>
  );
};

export default LandingPage;