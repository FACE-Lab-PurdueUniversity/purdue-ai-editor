/**
 * AboutModal Component
 * Displays application information, version, and contact details
 */

import './ModalBase.css';
import './AboutModal.css';

const AboutModal = ({ visible, onClose }) => {
  if (!visible) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="about-header">
          <h1 className="about-title">LilyBot AI Editor</h1>
          <p className="about-subtitle">
            An AI-powered environment for working with LilyBot robots.
          </p>
        </div>

        <div className="about-info-section">
          <div className="about-info-row">
            <span className="about-info-label">Version</span>
            <span className="about-info-value">May 28, 2026</span>
          </div>

          <div className="about-info-row">
            <span className="about-info-label">Created By</span>
            <span className="about-info-value">
              Dr. Ethan Danahy, Duncan Johnson, Bill Church, Dr. Morgan Hynes, and Yash Garje
            </span>
          </div>
        </div>

        <div className="about-footer">
          <p className="about-contact">
            Send bug reports to{' '}
            <a 
              href="mailto:duncanjohnson99@gmail.com" 
              className="about-link"
            >
              duncanjohnson99@gmail.com
            </a>
            .
          </p>
        </div>

        <button className="modal-close-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};

export default AboutModal;

