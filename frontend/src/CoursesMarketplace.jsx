import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from './Api';
import { Search, BookOpen, AlertCircle, SlidersHorizontal, X } from 'lucide-react';
import SkeletonLoader from './components/SkeletonLoader';
import CourseCard from './components/CourseCard';
import { inferCourseCategory } from './courseUtils';

const SORT_OPTIONS = [
  { value: 'featured',     label: 'Default order' },
  { value: 'title-asc',    label: 'Title (A-Z)' },
  { value: 'lessons-desc', label: 'Most lessons' },
  { value: 'lessons-asc',  label: 'Shortest courses' },
  { value: 'newest',       label: 'Recently added' },
];

const LEVEL_OPTIONS = ['All Levels', 'Beginner', 'Intermediate', 'Advanced'];

const CoursesMarketplace = ({ user }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [allCourses, setAllCourses]             = useState([]);
  const [bookmarks, setBookmarks]               = useState(new Set());
  const [enrolledMap, setEnrolledMap]           = useState({}); // { [courseId]: progressPercent }
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [loadError, setLoadError]               = useState(false);
  const [enrollingId, setEnrollingId]           = useState(null);

  const [search, setSearch]         = useState(() => searchParams.get('q') ?? '');
  const [category, setCategory]     = useState(() => searchParams.get('topic') ?? 'All Topics');
  const [level, setLevel]           = useState('All Levels');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'enrolled' | 'saved'
  const [sortBy, setSortBy]         = useState('featured');

  const userId = user?.signInDetails?.loginId ?? user?.username ?? '';

  const loadMarketplace = async () => {
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
        const pct = Math.min(100, Math.round((watchedCount / total) * 100));
        nextEnrolled[cid] = pct;
      });
      setEnrolledMap(nextEnrolled);
    }

    setIsLoadingCatalog(false);
  };

  useEffect(() => {
    loadMarketplace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Keep local search in sync if query param changes externally
  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    if (q !== search) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const updateSearch = (val) => {
    setSearch(val);
    const next = new URLSearchParams(searchParams);
    if (val.trim()) next.set('q', val);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };

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
    navigate(`/learn/${courseId}`);
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

  const categoriesWithCounts = useMemo(() => {
    const counts = new Map();
    allCourses.forEach((c) => {
      const cat = inferCourseCategory(c).name;
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    const list = [{ name: 'All Topics', count: allCourses.length }];
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .forEach(([name, count]) => list.push({ name, count }));
    return list;
  }, [allCourses]);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();

    const matches = allCourses.filter((c) => {
      const courseId = c.PK?.split('#')[1] ?? '';
      if (q) {
        const titleMatch = (c.Title ?? '').toLowerCase().includes(q);
        const descMatch = (c.Description ?? '').toLowerCase().includes(q);
        const catMatch = inferCourseCategory(c).name.toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !catMatch) return false;
      }

      if (category !== 'All Topics' && inferCourseCategory(c).name !== category) {
        return false;
      }

      if (level !== 'All Levels' && (c.Level || 'All Levels') !== level) {
        return false;
      }

      if (statusFilter === 'enrolled' && enrolledMap[courseId] === undefined) {
        return false;
      }

      if (statusFilter === 'saved' && !bookmarks.has(courseId)) {
        return false;
      }

      return true;
    });

    const sorted = [...matches];
    if (sortBy === 'title-asc') {
      sorted.sort((a, b) => (a.Title ?? '').localeCompare(b.Title ?? ''));
    } else if (sortBy === 'lessons-desc') {
      sorted.sort((a, b) => (Number(b.TotalVideos) || 0) - (Number(a.TotalVideos) || 0));
    } else if (sortBy === 'lessons-asc') {
      sorted.sort((a, b) => (Number(a.TotalVideos) || 0) - (Number(b.TotalVideos) || 0));
    } else if (sortBy === 'newest') {
      sorted.sort((a, b) => (b.CreatedAt ?? '').localeCompare(a.CreatedAt ?? ''));
    }

    return sorted;
  }, [allCourses, search, category, level, statusFilter, sortBy, enrolledMap, bookmarks]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    category !== 'All Topics' ||
    level !== 'All Levels' ||
    statusFilter !== 'all' ||
    sortBy !== 'featured';

  const resetFilters = () => {
    updateSearch('');
    setCategory('All Topics');
    setLevel('All Levels');
    setStatusFilter('all');
    setSortBy('featured');
  };

  const enrolledCount = Object.keys(enrolledMap).length;

  return (
    <main className="page-wrapper marketplace-page">
      <section className="marketplace-header-section">
        <div className="container">
          <div className="marketplace-header-top">
            <div>
              <p className="section-eyebrow">Course Catalog</p>
              <h1 className="marketplace-title">Course Marketplace</h1>
              <p className="marketplace-subtitle">
                Browse all technical courses, filter by engineering domain or level, and track your enrolled curricula.
              </p>
            </div>

            {!isLoadingCatalog && !loadError && (
              <div className="marketplace-summary-stats" aria-label="Catalog statistics">
                <div className="marketplace-stat-item">
                  <span className="marketplace-stat-num">{allCourses.length}</span>
                  <span className="marketplace-stat-lbl">Total Courses</span>
                </div>
                <div className="marketplace-stat-item">
                  <span className="marketplace-stat-num">{enrolledCount}</span>
                  <span className="marketplace-stat-lbl">Enrolled</span>
                </div>
                <div className="marketplace-stat-item">
                  <span className="marketplace-stat-num">{bookmarks.size}</span>
                  <span className="marketplace-stat-lbl">Saved</span>
                </div>
              </div>
            )}
          </div>

          {/* Search & Controls Toolbar */}
          <div className="marketplace-toolbar" role="search" aria-label="Filter courses">
            <div className="marketplace-search-box">
              <label htmlFor="marketplace-search" className="sr-only">
                Search courses by title, topic, or keyword
              </label>
              <Search size={16} className="marketplace-search-icon" aria-hidden="true" />
              <input
                id="marketplace-search"
                name="q"
                type="search"
                placeholder="Filter by technology, topic, or course title..."
                value={search}
                onChange={(e) => updateSearch(e.target.value)}
                className="input marketplace-search-input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              {search && (
                <button
                  type="button"
                  className="marketplace-search-clear"
                  onClick={() => updateSearch('')}
                  aria-label="Clear search query"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="marketplace-controls-group">
              <div className="marketplace-select-wrap">
                <label htmlFor="marketplace-level" className="sr-only">
                  Experience level
                </label>
                <select
                  id="marketplace-level"
                  name="level"
                  className="input marketplace-select"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  {LEVEL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === 'All Levels' ? 'Level: All' : opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="marketplace-select-wrap">
                <label htmlFor="marketplace-sort" className="sr-only">
                  Sort courses
                </label>
                <select
                  id="marketplace-sort"
                  name="sort"
                  className="input marketplace-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      Sort: {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="marketplace-status-tabs" role="group" aria-label="Filter by enrollment status">
                {[
                  { id: 'all',      label: 'All' },
                  { id: 'enrolled', label: `Enrolled (${enrolledCount})` },
                  { id: 'saved',    label: `Saved (${bookmarks.size})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`marketplace-status-tab ${statusFilter === tab.id ? 'is-active' : ''}`}
                    aria-pressed={statusFilter === tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Domain / Topic Pills */}
          {!isLoadingCatalog && categoriesWithCounts.length > 1 && (
            <div className="marketplace-topics" role="group" aria-label="Filter by technical domain">
              {categoriesWithCounts.map((cat) => {
                const active = category === cat.name;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    className={`marketplace-topic-pill ${active ? 'is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => setCategory(cat.name)}
                  >
                    <span>{cat.name}</span>
                    <span className="marketplace-topic-count">{cat.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="marketplace-body-section">
        <div className="container">
          {/* Active filter bar */}
          {!isLoadingCatalog && !loadError && (
            <div className="marketplace-results-bar">
              <span className="marketplace-results-count" role="status" aria-live="polite">
                Showing <strong>{filteredCourses.length}</strong> of <strong>{allCourses.length}</strong>{' '}
                {allCourses.length === 1 ? 'course' : 'courses'}
                {category !== 'All Topics' ? ` in ${category}` : ''}
                {search.trim() ? ` matching "${search.trim()}"` : ''}
              </span>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                  onClick={resetFilters}
                >
                  <SlidersHorizontal size={13} aria-hidden="true" />
                  Reset filters
                </button>
              )}
            </div>
          )}

          {isLoadingCatalog ? (
            <SkeletonLoader variant="card" count={6} />
          ) : loadError ? (
            <div className="card landing-empty-state">
              <AlertCircle size={36} color="var(--color-text-subtle)" aria-hidden="true" />
              <h2 style={{ color: 'var(--color-text-secondary)', fontWeight: '700', fontSize: '1.15rem' }}>
                Could not load the course marketplace
              </h2>
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.88rem' }}>
                There was a problem reaching the server. Check your connection and try again.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={loadMarketplace}
                style={{ marginTop: '4px' }}
              >
                Retry
              </button>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="card landing-empty-state">
              <BookOpen size={36} color="var(--color-text-subtle)" aria-hidden="true" />
              <h2 style={{ color: 'var(--color-text-secondary)', fontWeight: '700', fontSize: '1.15rem' }}>
                No matching courses found
              </h2>
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.88rem', maxWidth: '380px' }}>
                {hasActiveFilters
                  ? 'No courses match your current search or filter selection.'
                  : 'No courses have been published to the catalog yet.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={resetFilters}
                  style={{ marginTop: '4px' }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="course-grid">
              {filteredCourses.map((course) => {
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
          )}
        </div>
      </section>
    </main>
  );
};

export default CoursesMarketplace;
