/**
 * Session Selection Modal Component
 * Displays past sessions and allows creating new sessions
 */

import './ModalBase.css';
import './SessionModal.css';
import { getPlatform } from '../platforms';

const SessionModal = ({ visible, sessions, onSelect, onCreateNew, cancellable = false, onCancel }) => {
  if (!visible) return null;

  const handleOverlayClick = (e) => {
    if (cancellable && e.target === e.currentTarget) {
      onCancel?.();
    }
  };

  const handleSessionSelect = (sessionId) => {
    onSelect?.(sessionId);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const formatLastUpdated = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="session-modal-title">Select a Session</h2>
        
        <div className="session-modal-list">
          {sessions && sessions.length > 0 ? (
            sessions.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated)).map((session) => (
              <button
                key={session.id}
                className="session-modal-button"
                onClick={() => handleSessionSelect(session.id)}
              >
                <div className="session-modal-button-content">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
                    <span className="session-name">
                      {session.name || 'Unnamed Session'}
                    </span>
                    {getPlatform(session.hardware_platform) && (
                      <span className="platform-badge" title="Hardware platform">
                        {getPlatform(session.hardware_platform).label}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="session-updated">
                      {formatLastUpdated(session.last_updated || session.start_time)}
                    </span>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <p className="session-modal-empty">No past sessions found</p>
          )}
        </div>

        <div className="session-modal-new-section">
          <button
            className="session-modal-button session-modal-new-button"
            onClick={() => onCreateNew?.()}
          >
            Start New Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionModal;

