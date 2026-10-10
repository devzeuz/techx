import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from './Api';
import {
  Bookmark, BookOpen, CheckCircle, PlayCircle,
} from 'lucide-react';
import SkeletonLoader from './components/SkeletonLoader';

/* ── Progress ring (SVG) ──────────────────────────────── */
const ProgressRing = ({ progress }) => {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  const stroke = progress === 100 ? 'var(--color-green)' : 'var(--color-accent)';

  return (
    <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx="28" cy="28" r={r} stroke="var(--color-border)" strokeWidth="4" fill="none" />
      {/* Fill */}
      <circle
        cx="28" cy="28" r={r}
        stroke={stroke}
        strokeWidth="4"
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      {/* Label */}
      <text
        x="28" y="33"
        textAnchor="middle"
        fill="var(--color-text-primary)"
        fontSize="11"
        fontWeight="700"
        fontFamily="Inter, sans-serif"
      >
        {progress}%
      </text>
    </svg>
  );
};

/* ── Dashboard ────────────────────────────────────────── */
const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const [myCourses, setMyCourses] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Amplify v6 getCurrentUser() returns a UUID in .username;
  // .signInDetails.loginId holds the actual email used to sign in — same key
  // that LandingPage uses when writing enrollments/bookmarks to DynamoDB.
  const userId = user?.signInDetails?.loginId ?? user?.username ?? '';

  const loadDashboard = async () => {
    setIsLoading(true);

    const userData = await apiRequest(`/user?userId=${userId}`);
    if (!Array.isArray(userData)) { setIsLoading(false); return; }

    const catalog = await apiRequest('/courses');

    const enrollments  = userData.filter(i => i.SK.startsWith('COURSE#'));
    const watchedItems = userData.filter(i => i.SK.startsWith('WATCHED#'));
    const bookmarkItems= userData.filter(i => i.SK.startsWith('BOOKMARK#'));

    setBookmarks(bookmarkItems);

    const coursesWithProgress = enrollments.map(userCourse => {
      const courseId = userCourse.SK.split('#')[1];

      // Repair missing TotalVideos from public catalog
      let total = userCourse.TotalVideos;
      if (!total || total === 0) {
        const pub = catalog.find(c => c.PK === `COURSE#${courseId}`);
        total = pub ? pub.TotalVideos : 0;
      }
      if (!total) total = 1; // division-by-zero guard

      const watchedCount = watchedItems.filter(w => w.CourseId === courseId).length;
      let percent = Math.round((watchedCount / total) * 100);
      if (percent > 100) percent = 100;

      return { ...userCourse, progress: percent, TotalVideos: total };
    });

    setMyCourses(coursesWithProgress);
    setIsLoading(false);
  };

  useEffect(() => {
    loadDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completed  = myCourses.filter(c => c.progress === 100).length;
  const inProgress = myCourses.filter(c => c.progress  <  100).length;

  return (
    <div className="page-wrapper" style={{ padding: '40px 0 72px' }}>
      <div className="container">

        {/* ── Page header ── */}
        <div className="fade-in-up" style={{ marginBottom: '36px' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.5px' }}>
            My Dashboard
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
          Welcome back, <strong style={{ color: 'var(--color-text-soft)' }}>{userId}</strong>.
            Keep building.
          </p>
        </div>

        {/* ── Stats ── */}
        {isLoading ? (
          <SkeletonLoader variant="stat" count={3} />
        ) : (
          <div className="stats-grid fade-in-up">
            <div className="stat-card">
              <BookOpen size={20} color="var(--color-accent-light)" style={{ marginBottom: '8px' }} />
              <span className="stat-value">{myCourses.length}</span>
              <span className="stat-label">Enrolled Courses</span>
            </div>
            <div className="stat-card">
              <CheckCircle size={20} color="var(--color-green)" style={{ marginBottom: '8px' }} />
              <span className="stat-value" style={{ color: 'var(--color-green)' }}>{completed}</span>
              <span className="stat-label">Completed</span>
            </div>
            <div className="stat-card">
              <PlayCircle size={20} color="var(--color-gold)" style={{ marginBottom: '8px' }} />
              <span className="stat-value" style={{ color: 'var(--color-gold)' }}>{inProgress}</span>
              <span className="stat-label">In Progress</span>
            </div>
          </div>
        )}

        {/* ── Bookmarks ── */}
        {!isLoading && bookmarks.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <div className="section-header">
              <h2 className="section-title">
                <Bookmark size={18} color="var(--color-accent-light)" />
                Saved for Later
              </h2>
              <Link
                to="/bookmarks"
                className="btn btn-ghost"
                style={{ fontSize: '0.82rem', padding: '6px 12px', gap: '4px' }}
              >
                View all →
              </Link>
            </div>
            <div className="bookmark-rail">
              {bookmarks.map(b => (
                <div key={b.SK} className="card bookmark-card">
                  <span
                    style={{
                      fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'var(--color-text-subtle)',
                      display: 'block', marginBottom: '6px',
                    }}
                  >
                    Bookmarked
                  </span>
                  <h4
                    style={{
                      color: 'var(--color-text-primary)', marginBottom: '16px',
                      fontWeight: '600', fontSize: '0.95rem', lineHeight: '1.35',
                    }}
                  >
                    {b.Title}
                  </h4>
                  <Link
                    to={`/learn/${b.SK.split('#')[1]}`}
                    className="btn btn-outline btn-full"
                    style={{ padding: '8px 12px', fontSize: '0.82rem' }}
                  >
                    View Course
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── In Progress ── */}
        <div className="section-header">
          <h2 className="section-title">
            <PlayCircle size={18} color="var(--color-accent-light)" />
            In Progress
          </h2>
        </div>

        {isLoading ? (
          <SkeletonLoader variant="card" count={3} />
        ) : myCourses.length === 0 ? (
          /* Empty state */
          <div
            className="card"
            style={{ padding: '56px', textAlign: 'center', cursor: 'default' }}
          >
            <BookOpen
              size={44}
              color="var(--color-text-subtle)"
              style={{ margin: '0 auto 16px', display: 'block' }}
            />
            <h3
              style={{
                color: 'var(--color-text-secondary)', marginBottom: '10px', fontWeight: '700',
              }}
            >
              No courses enrolled yet
            </h3>
            <p
              style={{
                color: 'var(--color-text-subtle)', marginBottom: '28px',
                fontSize: '0.9rem', maxWidth: '340px', margin: '0 auto 28px',
              }}
            >
              Head to Explore to find a course that fits your goals.
            </p>
            <Link to="/" className="btn btn-primary">
              Explore Courses
            </Link>
          </div>
        ) : (
          <div className="course-grid fade-in-up">
            {myCourses.map(c => (
              <div key={c.SK} className="card" style={{ cursor: 'default' }}>
                {/* Colour accent bar at top */}
                <div
                  style={{
                    height: '5px',
                    background: c.progress === 100
                      ? 'var(--color-green)'
                      : 'linear-gradient(90deg, var(--color-accent), var(--color-accent-light))',
                  }}
                />

                <div style={{ padding: '20px' }}>
                  {/* Title + ring */}
                  <div
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', gap: '12px', marginBottom: '16px',
                    }}
                  >
                    <h3
                      style={{
                        fontWeight: '700', color: 'var(--color-text-primary)',
                        fontSize: '1rem', lineHeight: '1.35', flex: 1,
                      }}
                    >
                      {c.Title}
                    </h3>
                    <ProgressRing progress={c.progress} />
                  </div>

                  {/* Completion badge */}
                  {c.progress === 100 && (
                    <div className="badge badge-green" style={{ marginBottom: '14px' }}>
                      <CheckCircle size={11} /> Completed
                    </div>
                  )}

                  {/* Progress bar */}
                  <div style={{ marginBottom: '20px' }}>
                    <div
                      style={{
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: '0.78rem', marginBottom: '6px',
                        color: 'var(--color-text-subtle)',
                      }}
                    >
                      <span>{c.progress}% complete</span>
                      <span>{c.TotalVideos} videos</span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${c.progress}%`,
                          background: c.progress === 100
                            ? 'var(--color-green)'
                            : 'var(--color-accent)',
                        }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/learn/${c.SK.split('#')[1]}`)}
                    className={`btn btn-full ${c.progress === 100 ? 'btn-ghost' : 'btn-primary'}`}
                  >
                    {c.progress === 100 ? 'Review Course' : 'Continue Learning'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;