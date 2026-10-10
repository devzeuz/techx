import React from 'react';

/* ─── Individual skeleton shapes ─────────────────────── */

const SkeletonBlock = ({ width = '100%', height = '16px', radius = '8px', style = {} }) => (
  <div
    className="skeleton"
    style={{ width, height, borderRadius: radius, flexShrink: 0, ...style }}
  />
);

/* Course card skeleton */
const SkeletonCard = () => (
  <div className="card" style={{ cursor: 'default', overflow: 'hidden' }}>
    <SkeletonBlock height="150px" radius="0" />
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SkeletonBlock width="72%" height="20px" />
      <SkeletonBlock width="40%" height="14px" />
      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
        <SkeletonBlock height="42px" />
        <SkeletonBlock width="44px" height="42px" radius="8px" />
      </div>
    </div>
  </div>
);

/* Sidebar video row skeleton */
const SkeletonRow = () => (
  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 0' }}>
    <SkeletonBlock width="28px" height="28px" radius="6px" />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px' }}>
      <SkeletonBlock width="75%" height="13px" />
      <SkeletonBlock width="45%" height="11px" />
    </div>
  </div>
);

/* Stat card skeleton */
const SkeletonStat = () => (
  <div className="stat-card" style={{ gap: '10px' }}>
    <SkeletonBlock width="36px" height="36px" radius="8px" />
    <SkeletonBlock width="48px" height="32px" />
    <SkeletonBlock width="90px" height="13px" />
  </div>
);

/* Full CoursePlayer skeleton */
const SkeletonPlayer = () => (
  <div className="player-layout">
    {/* Player area */}
    <div className="player-main">
      <div
        className="skeleton"
        style={{ width: '100%', paddingTop: '56.25%', borderRadius: '12px', position: 'relative' }}
      />
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SkeletonBlock width="55%" height="28px" />
        <SkeletonBlock width="35%" height="16px" />
      </div>
    </div>
    {/* Sidebar */}
    <div className="player-sidebar">
      <SkeletonBlock height="22px" style={{ marginBottom: '16px' }} />
      {[...Array(8)].map((_, i) => <SkeletonRow key={i} />)}
    </div>
  </div>
);

/* ─── Main export ────────────────────────────────────── */

/**
 * SkeletonLoader
 * @param {('card'|'row'|'stat'|'player')} variant
 * @param {number} count — how many to render (ignored for 'player')
 */
const SkeletonLoader = ({ variant = 'card', count = 3 }) => {
  if (variant === 'player') return <SkeletonPlayer />;

  const components = {
    card: SkeletonCard,
    row:  SkeletonRow,
    stat: SkeletonStat,
  };
  const Component = components[variant] || SkeletonCard;

  if (variant === 'card') {
    return (
      <div className="course-grid">
        {[...Array(count)].map((_, i) => <Component key={i} />)}
      </div>
    );
  }

  if (variant === 'stat') {
    return (
      <div className="stats-grid">
        {[...Array(count)].map((_, i) => <Component key={i} />)}
      </div>
    );
  }

  return <>{[...Array(count)].map((_, i) => <Component key={i} />)}</>;
};

export default SkeletonLoader;
