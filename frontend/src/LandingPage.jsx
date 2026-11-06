import React, { useState, useEffect } from 'react';
import { apiRequest } from './Api';
import { useNavigate, Link } from 'react-router-dom';
import { Search, BookOpen, AlertCircle, ArrowRight, Compass } from 'lucide-react';
import SkeletonLoader from './components/SkeletonLoader';
import CourseCard from './components/CourseCard';

const MAX_FEATURED_COURSES = 6;

const LandingPage = ({ user }) => {
  const [allCourses, setAllCourses]             = useState([]);
  const [bookmarks, setBookmarks]               = useState(new Set());
  const [enrolledMap, setEnrolledMap]           = useState({});
  const [search, setSearch]                     = useState('');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [loadError, setLoadError]               = useState(false);
  const [enrollingId, setEnrollingId]           = useState(null);
  const navigate = useNavigate();

  const userId = user?.signInDetails?.loginId ?? user?.username ?? '';

  const loadCatalogAndUser = async () => {
    setIsLoadingCatalog(true);
    setLoadError(false);

    const [catalog, userData] = await Promise.all([
      apiRequest('/courses'),
      userId ? apiRequest(`/user?userId=${encodeURIComponent(userId)}`) : Promise.resolve([]),
    ]);

    if (catalog === null) {
      setLoadError(true);
      setIsLoadingCatalog(false);
      return;
    }

    const coursesList = Array.isArray(catalog) ? catalog : [];
    setAllCourses(coursesList);

    if (Array.isArray(userData)) {
      const b = new Set(
        userData
          .filter((i) => i.SK?.startsWith('BOOKMARK#'))
          .map((i) => i.SK.split('#')[1]),
      );
      setBookmarks(b);

      const enrollments = userData.filter((i) => i.SK?.startsWith('COURSE#'));
      const watchedItems = userData.filter((i) => i.SK?.startsWith('WATCHED#'));
      const nextEnrolled = {};

      enrollments.forEach((userCourse) => {
        const cid = userCourse.SK.split('#')[1];
        let total = userCourse.TotalVideos;
        if (!total || total === 0) {
          const pub = coursesList.find((c) => c.PK === `COURSE#${cid}`);
          total = pub ? pub.TotalVideos : 0;
        }
        if (!total) total = 1;
        const watchedCount = watchedItems.filter((w) => w.CourseId === cid).length;
        nextEnrolled[cid] = Math.min(100, Math.round((watchedCount / total) * 100));
      });
      setEnrolledMap(nextEnrolled);
    }

    setIsLoadingCatalog(false);
  };

  useEffect(() => {
    loadCatalogAndUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleEnroll = async (course) => {
    const courseId = course.PK.split('#')[1];
    setEnrollingId(courseId);
    await apiRequest('/user', 'POST', {
      userId,
      type: 'ENROLL',
      courseId,
      title: course.Title,
      totalVideos: course.TotalVideos,
    });
    setEnrollingId(null);
    navigate('/dashboard');
  };

  const toggleBookmark = async (course) => {
    const courseId = course.PK.split('#')[1];
    if (bookmarks.has(courseId)) {
      await apiRequest('/user', 'POST', {
        userId,
        type: 'REMOVE_BOOKMARK',
        courseId,
      });
      const next = new Set(bookmarks);
      next.delete(courseId);
      setBookmarks(next);
    } else {
      await apiRequest('/user', 'POST', {
        userId,
        type: 'BOOKMARK',
        courseId,
        title: course.Title,
        totalVideos: course.TotalVideos,
        thumbnail: course.Thumbnail,
      });
      const next = new Set(bookmarks);
      next.add(courseId);
      setBookmarks(next);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = search.trim();
    navigate(q ? `/courses?q=${encodeURIComponent(q)}` : '/courses');
  };

  const filtered = allCourses.filter(
    (c) => c.Title && c.Title.toLowerCase().includes(search.toLowerCase()),
  );

  // Main page "Explore Courses" is strictly capped at 6 courses
  const featuredCourses = filtered.slice(0, MAX_FEATURED_COURSES);
  const marketplaceHref = search.trim()
    ? `/courses?q=${encodeURIComponent(search.trim())}`
    : '/courses';

  return (
    <main className="page-wrapper">
      {/* ── HERO ────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="container">
          <div className="landing-hero-content">
            <p className="section-eyebrow">Technical Learning Platform</p>

            <h1 className="landing-title">
              Structured engineering courses, built around real code.
            </h1>

            <p className="landing-subtitle">
              Study curated video curricula covering cloud infrastructure, backend systems, and web development.
              Track lesson completion, take timestamped study notes, and ask grounded questions as you watch.
            </p>

            {/* Search + Marketplace CTA */}
            <form className="landing-search-form" onSubmit={handleSearchSubmit} role="search">
              <div className="landing-search-wrap">
                <label htmlFor="course-search" className="sr-only">
                  Search courses
                </label>
                <Search size={17} className="landing-search-icon" aria-hidden="true" />
                <input
                  id="course-search"
                  name="q"
                  type="search"
                  placeholder="Search Python, React, AWS, Linux..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="landing-search-input"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              </div>
              <Link to={marketplaceHref} className="btn btn-primary landing-marketplace-btn">
                <Compass size={16} aria-hidden="true" />
                Course Marketplace
              </Link>
            </form>
          </div>
        </div>
      </section>

      {/* ── EXPLORE COURSES (LIMITED TO 6) ──────────── */}
      <section style={{ padding: '48px 0 80px' }}>
        <div className="container">
          <div className="section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 className="section-title">
                <BookOpen size={18} color="var(--color-accent-light)" aria-hidden="true" />
                {search ? `Results for "${search}"` : 'Explore Courses'}
              </h2>
              {!isLoadingCatalog && !loadError && filtered.length > 0 && (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.84rem', marginTop: '4px' }}>
                  Showing {featuredCourses.length} of {filtered.length}{' '}
                  {filtered.length === 1 ? 'available course' : 'available courses'}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Link to={marketplaceHref} className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                View All Courses
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* States */}
          {isLoadingCatalog ? (
            <SkeletonLoader variant="card" count={MAX_FEATURED_COURSES} />
          ) : loadError ? (
            <div className="card landing-empty-state">
              <AlertCircle size={36} color="var(--color-text-subtle)" aria-hidden="true" />
              <h3 style={{ color: 'var(--color-text-secondary)', fontWeight: '700' }}>
                Could not load courses
              </h3>
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.88rem' }}>
                There was a problem reaching the server. Check your connection and try again.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={loadCatalogAndUser}
                style={{ marginTop: '4px' }}
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 && search ? (
            <div className="card landing-empty-state">
              <Search size={36} color="var(--color-text-subtle)" aria-hidden="true" />
              <h3 style={{ color: 'var(--color-text-secondary)', fontWeight: '700' }}>
                No results for &ldquo;{search}&rdquo;
              </h3>
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.88rem' }}>
                Try a different search term or browse the full Course Marketplace.
              </p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSearch('')}
                >
                  Clear search
                </button>
                <Link to="/courses" className="btn btn-primary">
                  Open Marketplace
                </Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card landing-empty-state">
              <BookOpen size={36} color="var(--color-text-subtle)" aria-hidden="true" />
              <h3 style={{ color: 'var(--color-text-secondary)', fontWeight: '700' }}>
                No courses published yet
              </h3>
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.88rem' }}>
                New courses will appear here once published to the catalog.
              </p>
            </div>
          ) : (
            <>
              <div className="course-grid">
                {featuredCourses.map((course) => {
                  const courseId = course.PK.split('#')[1];
                  return (
                    <CourseCard
                      key={course.PK}
                      course={course}
                      bookmarked={bookmarks.has(courseId)}
                      enrolling={enrollingId === courseId}
                      isEnrolled={enrolledMap[courseId] !== undefined}
                      progress={enrolledMap[courseId]}
                      onEnroll={handleEnroll}
                      onToggleBookmark={toggleBookmark}
                    />
                  );
                })}
              </div>

              {/* Marketplace callout banner */}
              <div className="marketplace-cta-banner">
                <div className="marketplace-cta-text">
                  <h3 className="marketplace-cta-title">
                    Browse the Full Course Marketplace
                  </h3>
                  <p className="marketplace-cta-desc">
                    {filtered.length > MAX_FEATURED_COURSES
                      ? `${filtered.length - MAX_FEATURED_COURSES} additional ${
                          filtered.length - MAX_FEATURED_COURSES === 1 ? 'course is' : 'courses are'
                        } available in the catalog. Filter by domain, experience level, or lesson count.`
                      : `Explore all ${allCourses.length} ${
                          allCourses.length === 1 ? 'course' : 'courses'
                        } with topic filtering, sorting, and enrollment status views.`}
                  </p>
                </div>
                <Link to={marketplaceHref} className="btn btn-primary" style={{ padding: '12px 22px' }}>
                  View Course Marketplace
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default LandingPage;
