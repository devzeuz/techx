import React from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, TrendingUp, CheckCircle, Zap, Users, Award,
} from 'lucide-react';

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Curated Curriculum',
    description:
      'Every course is hand-picked and structured for real-world impact. No fluff, only the skills that move careers forward.',
  },
  {
    icon: TrendingUp,
    title: 'Track Your Progress',
    description:
      'Watch your advancement in real time. Detailed per-course progress tracking keeps you accountable and motivated.',
  },
  {
    icon: Zap,
    title: 'Learn at Your Pace',
    description:
      'No deadlines, no pressure. Pause, rewind, and build your understanding on your own schedule — on any device.',
  },
  {
    icon: CheckCircle,
    title: 'Project-First Approach',
    description:
      'Theory is just the beginning. Every course is centred around building things so you finish with tangible proof of skill.',
  },
  {
    icon: Users,
    title: 'Expert-Led Content',
    description:
      'Content sourced from industry practitioners who have solved real production problems at scale — not just theorists.',
  },
  {
    icon: Award,
    title: 'Milestone Recognition',
    description:
      'Complete courses, mark lessons watched, and build a portfolio of completed work that speaks louder than a certificate.',
  },
];

const STATS = [
  { value: '50+', label: 'Courses Available' },
  { value: '∞', label: 'Lessons Completed' },
  { value: '10+', label: 'Active Learners' },
  { value: '85%', label: 'Satisfaction Rate' },
];

const TECH_STACK = [
  'React', 'Node.js', 'Python', 'AWS', 'TypeScript',
  'Docker', 'SQL', 'Git', 'Linux', 'REST APIs',
];

const About = () => (
  <div className="page-wrapper">

    {/* ── HERO ─────────────────────────────────────── */}
    <section className="about-hero">
      <div className="container">
        <div className="about-hero-content fade-in-up">
          <div
            className="badge badge-blue"
            style={{ marginBottom: '22px', display: 'inline-flex' }}
          >
            Our Mission
          </div>

          <h1 className="about-title">
            Built for everyone,<br />
            {/* <span className="about-title-accent">by developers.</span> */}
          </h1>

          <p className="about-subtitle">
            tx is a focused learning platform for people who are serious about technology.
            We believe the best way to learn is by doing and everything here
            is built around that principle.
          </p>

          <div className="about-hero-actions">
            <Link
              to="/"
              className="btn btn-primary"
              style={{ padding: '14px 28px', fontSize: '1rem' }}
            >
              Start Exploring
            </Link>
            <Link
              to="/dashboard"
              className="btn btn-ghost"
              style={{ padding: '14px 28px', fontSize: '1rem' }}
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
    <section style={{ padding: '80px 0' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '52px' }}>
          <h2
            style={{
              fontSize: '1.9rem',
              fontWeight: '800',
              marginBottom: '14px',
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.5px',
            }}
          >
            Everything you need to level up
          </h2>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              maxWidth: '520px',
              margin: '0 auto',
              fontSize: '1rem',
              lineHeight: '1.7',
            }}
          >
            We've stripped away the noise and kept only what makes developers better.
          </p>
        </div>

        <div className="about-features-grid">
          {FEATURES.map((feature) => {
            const FeatureIcon = feature.icon;
            return (
              <div key={feature.title} className="card about-feature-card">
                <div className="about-icon-wrap">
                  <FeatureIcon size={22} color="var(--color-accent-light)" />
                </div>
                <h3
                  style={{
                    fontWeight: '700',
                    marginBottom: '10px',
                    color: 'var(--color-text-primary)',
                    fontSize: '1.05rem',
                  }}
                >
                  {feature.title}
                </h3>
                <p
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: '0.88rem',
                    lineHeight: '1.75',
                  }}
                >
                  {feature.description}
                </p>
              </div>
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
            marginBottom: '40px',
            color: 'var(--color-text-primary)',
            fontSize: '1.7rem',
            letterSpacing: '-0.5px',
          }}
        >
          What you'll master
        </h2>
        <div className="about-stack-grid">
          {TECH_STACK.map(tech => (
            <div key={tech} className="about-stack-chip">
              {tech}
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── CTA ──────────────────────────────────────── */}
    <section style={{ padding: '80px 0' }}>
      <div className="container">
        <div className="about-cta-card fade-in-up">
          <h2
            style={{
              fontSize: '2rem',
              fontWeight: '800',
              marginBottom: '16px',
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.5px',
            }}
          >
            Ready to start building?
          </h2>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              marginBottom: '32px',
              maxWidth: '420px',
              margin: '0 auto 32px',
              fontSize: '1rem',
              lineHeight: '1.7',
            }}
          >
            Join hundreds of developers already sharpening their skills on tx.
            Your next breakthrough is one course away.
          </p>
          <Link
            to="/"
            className="btn btn-primary"
            style={{ padding: '14px 32px', fontSize: '1rem' }}
          >
            Browse All Courses
          </Link>
        </div>
      </div>
    </section>

  </div>
);

export default About;
