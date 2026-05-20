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
            <span className="about-info-value">March 2, 2026</span>
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
            Send bug reports, feature requests, and Frog & Toad quotes to{' '}
            <a 
              href="mailto:duncan.johnson@tufts.edu" 
              className="about-link"
            >
              duncan.johnson@tufts.edu
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

