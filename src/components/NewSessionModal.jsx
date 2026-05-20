/**
 * New Session Modal
 * Prompts the user for a session name and hardware platform when creating a
 * session, or back-fills the platform on a legacy session with no platform.
 */

import { useEffect, useState } from 'react';
import './ModalBase.css';
import './NewSessionModal.css';

const NewSessionModal = ({
  visible,
  mode = 'create',
  platforms = [],
  initialName = '',
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialName);
  const [platformId, setPlatformId] = useState(null);

  useEffect(() => {
    if (visible) {
      setName(initialName || '');
      setPlatformId(null);
    }
  }, [visible, initialName]);

  if (!visible) return null;

  const isAssign = mode === 'assign';
  const title = isAssign ? 'Choose a Hardware Platform' : 'New Session';
  const description = isAssign
    ? 'This session was created before hardware platforms existed. Pick a platform to continue.'
    : 'Name your session and pick the hardware platform you will be using.';
  const submitLabel = isAssign ? 'Use this platform' : 'Create Session';
  const canSubmit = Boolean(platformId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit?.({ name: name.trim(), platformId });
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (!isAssign && e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="new-session-title">{title}</h2>
        <p className="new-session-description">{description}</p>

        <form onSubmit={handleSubmit}>
          <label className="new-session-label" htmlFor="new-session-name">
            Session name
          </label>
          <input
            id="new-session-name"
            className="new-session-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Unnamed Session"
            autoFocus={!isAssign}
          />

          <div className="new-session-label">Hardware platform</div>
          <div className="new-session-platforms">
            {platforms.map((platform) => (
              <button
                key={platform.id}
                type="button"
                className={`new-session-platform ${
                  platformId === platform.id ? 'selected' : ''
                }`}
                onClick={() => setPlatformId(platform.id)}
              >
                {platform.label}
              </button>
            ))}
          </div>

          <div className="new-session-actions">
            {!isAssign && (
              <button
                type="button"
                className="new-session-cancel"
                onClick={onCancel}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="modal-close-button"
              disabled={!canSubmit}
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewSessionModal;
