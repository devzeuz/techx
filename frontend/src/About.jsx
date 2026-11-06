import React from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  TrendingUp,
  CheckCircle,
  Volume2,
  FileText,
  MessageSquare,
} from 'lucide-react';

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Ordered Video Curricula',
    description:
      'Courses are organized into sequential lessons so you can study complex systems from foundational concepts to implementation.',
  },
  {
    icon: FileText,
    title: 'Timestamped Lesson Notes',
    description:
      'Capture study notes alongside every video lesson, insert playback timestamps with one click, and jump directly back to key moments.',
  },
  {
    icon: Volume2,
    title: 'Synchronized Audio Descriptions',
    description:
      'Optional extended audio descriptions narrate on-screen code, terminal output, and architecture diagrams during natural pauses.',
  },
  {
    icon: MessageSquare,
    title: 'Grounded Lesson Q&A',
    description:
      'Ask technical questions about the active lesson and receive answers grounded in the video transcript and on-screen code with clickable timestamps.',
  },
  {
    icon: TrendingUp,
    title: 'Per-Lesson Progress Tracking',
    description:
      'Track completed lessons across every enrolled course from your personal dashboard and pick up right where you left off.',
  },
  {
    icon: CheckCircle,
    title: 'Curated & Reviewed Catalog',
    description:
      'Every curriculum in the marketplace is reviewed by platform administrators before publication to maintain consistent technical quality.',
  },
];

const STATS = [
  { value: '50+',   label: 'Technical Courses' },
  { value: '400+',  label: 'Video Lessons' },
  { value: '100%',  label: 'Self-Paced Access' },
  { value: 'WCAG',  label: 'Accessible Player' },
];

const TECH_STACK = [
  'React', 'Node.js', 'Python', 'AWS', 'TypeScript',
  'Docker', 'SQL', 'Git', 'Linux', 'REST APIs',
];

const About = () => (
  <main className="page-wrapper">
    {/* ── HERO ─────────────────────────────────────── */}
    <section className="about-hero">
      <div className="container">
        <div className="about-hero-content">
          <p className="section-eyebrow">About the Platform</p>

          <h1 className="about-title">
            Focused technical education for working and aspiring engineers.
          </h1>

          <p className="about-subtitle">
            tx organizes high-signal technical tutorials into structured, distraction-free courses
            complete with progress tracking, per-lesson study notes, and accessibility tools.
          </p>

          <div className="about-hero-actions">
            <Link
              to="/courses"
              className="btn btn-primary"
              style={{ padding: '12px 24px', fontSize: '0.95rem' }}
            >
              Course Marketplace
            </Link>
            <Link
              to="/dashboard"
              className="btn btn-ghost"
              style={{ padding: '12px 24px', fontSize: '0.95rem' }}
            >
              My Dashboard
            </Link>
          </div>
        </div>
      </div>
    </section>

    {/* ── STATS BAR ────────────────────────────────── */}
    <section className="about-stats-bar">
      <div className="container">
        <div className="about-stats-inner">
          {STATS.map(({ value, label }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <span className="about-stat-value">{value}</span>
              <span className="about-stat-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── FEATURES ─────────────────────────────────── */}
    <section style={{ padding: '72px 0' }}>
      <div className="container">
        <div style={{ marginBottom: '44px', maxWidth: '580px' }}>
          <p className="section-eyebrow">Capabilities</p>
          <h2
            style={{
              fontSize: '1.8rem',
              fontWeight: '800',
              marginBottom: '12px',
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.5px',
            }}
          >
            Designed for technical study
          </h2>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: '0.95rem',
              lineHeight: '1.65',
            }}
          >
            Video platforms are built for entertainment. tx wraps technical video content in a workspace designed for retention and active study.
          </p>
        </div>

        <div className="about-features-grid">
          {FEATURES.map((feature) => {
            const FeatureIcon = feature.icon;
            return (
              <article key={feature.title} className="card about-feature-card">
                <div className="about-icon-wrap" aria-hidden="true">
                  <FeatureIcon size={20} color="var(--color-accent-light)" />
                </div>
                <h3
                  style={{
                    fontWeight: '700',
                    marginBottom: '8px',
                    color: 'var(--color-text-primary)',
                    fontSize: '1.02rem',
                  }}
                >
                  {feature.title}
                </h3>
                <p
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: '0.88rem',
                    lineHeight: '1.7',
                  }}
                >
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>

    {/* ── TECH STACK ───────────────────────────────── */}
    <section className="about-stack-section">
      <div className="container">
        <h2
          style={{
            textAlign: 'center',
            fontWeight: '800',
            marginBottom: '32px',
            color: 'var(--color-text-primary)',
            fontSize: '1.5rem',
            letterSpacing: '-0.4px',
          }}
        >
          Core topics covered in the catalog
        </h2>
        <div className="about-stack-grid">
          {TECH_STACK.map((tech) => (
            <div key={tech} className="about-stack-chip">
              {tech}
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── CTA ──────────────────────────────────────── */}
    <section style={{ padding: '72px 0' }}>
      <div className="container">
        <div className="about-cta-card">
          <h2
            style={{
              fontSize: '1.75rem',
              fontWeight: '800',
              marginBottom: '12px',
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.5px',
            }}
          >
            Explore the course catalog
          </h2>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              maxWidth: '440px',
              margin: '0 auto 28px',
              fontSize: '0.95rem',
              lineHeight: '1.65',
            }}
          >
            Browse all available courses in the marketplace, filter by technology or experience level, and start learning immediately.
          </p>
          <Link
            to="/courses"
            className="btn btn-primary"
            style={{ padding: '12px 28px', fontSize: '0.95rem' }}
          >
            Browse Course Marketplace
          </Link>
        </div>
      </div>
    </section>
  </main>
);

export default About;
