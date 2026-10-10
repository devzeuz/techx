import React from 'react';

/**
 * Spinner — animated CSS ring
 * @param {'sm'|'md'|'lg'} size
 * @param {string} className
 */
const Spinner = ({ size = 'md', className = '' }) => (
  <span
    className={`spinner spinner-${size} ${className}`.trim()}
    role="status"
    aria-label="Loading"
  />
);

export default Spinner;
