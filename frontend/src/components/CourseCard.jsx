import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PlayCircle, Bookmark, ArrowRight, CheckCircle, Layers } from 'lucide-react';
import Spinner from './Spinner';
import { inferCourseCategory } from '../courseUtils';

const CourseCard = ({
  course,
  bookmarked = false,
  enrolling = false,
  isEnrolled = false,
  progress = null,
  onEnroll,
  onToggleBookmark,
}) => {
  const [imgError, setImgError] = useState(false);
  const courseId = course.PK?.includes('#') ? course.PK.split('#')[1] : course.PK;
  const category = inferCourseCategory(course);
  const lessonCount = Number(course.TotalVideos) || 0;
  const hasThumb = Boolean(course.Thumbnail) && !imgError;

  return (
    <article className="card course-card">
      <div className={`course-card-media ${hasThumb ? '' : 'course-card-media--fallback'}`}>
        {hasThumb ? (
          <img
            src={course.Thumbnail}
            alt=""
            loading="lazy"
            className="course-card-img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="course-card-fallback-inner" aria-hidden="true">
            <span className="course-card-monogram">{category.code}</span>
          </div>
        )}
        <div className="course-card-media-bar">
          <span className="course-card-domain">{category.name}</span>
          <span className="course-card-count">
            <PlayCircle size={12} aria-hidden="true" />
            {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
          </span>
        </div>
      </div>

      <div className="course-card-body">
        <div className="course-card-badges">
          {course.Level && (
            <span className="course-card-level">
              <Layers size={11} aria-hidden="true" />
              {course.Level}
            </span>
          )}
          {isEnrolled && (
            <span className="badge badge-green" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
              <CheckCircle size={11} aria-hidden="true" />
              {progress === 100 ? 'Completed' : typeof progress === 'number' ? `Enrolled · ${progress}%` : 'Enrolled'}
            </span>
          )}
        </div>

        <h3 className="course-card-title">{course.Title}</h3>

        {course.Description && (
          <p className="course-card-desc">{course.Description}</p>
        )}

        <footer className="course-card-actions">
          {isEnrolled ? (
            <Link
              to={`/learn/${courseId}`}
              className="btn btn-primary"
              style={{ flex: 1 }}
              aria-label={`Continue ${course.Title}`}
            >
              {progress === 100 ? 'Review Course' : 'Continue'}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => onEnroll?.(course)}
              className="btn btn-outline"
              style={{ flex: 1 }}
              disabled={enrolling}
              aria-label={`Enroll in ${course.Title}`}
            >
              {enrolling ? (
                <>
                  <Spinner size="sm" /> Enrolling...
                </>
              ) : (
                'Enroll Now'
              )}
            </button>
          )}

          {onToggleBookmark && (
            <button
              type="button"
              onClick={() => onToggleBookmark(course)}
              className={`bookmark-btn ${bookmarked ? 'is-bookmarked' : ''}`}
              aria-label={bookmarked ? `Remove ${course.Title} from saved courses` : `Save ${course.Title} for later`}
              aria-pressed={bookmarked}
              title={bookmarked ? 'Remove bookmark' : 'Save for later'}
            >
              <Bookmark size={16} fill={bookmarked ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
          )}
        </footer>
      </div>
    </article>
  );
};

export default CourseCard;
