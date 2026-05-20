/**
 * Student Group Modal
 * Shown on first login for an account so the instructor records the names of
 * the students sharing the account. The submitted text is persisted as the
 * `students` column on `user_profiles`.
 */

import { useEffect, useRef, useState } from 'react';
import './ModalBase.css';
import './StudentGroupModal.css';

const StudentGroupModal = ({ visible, onSubmit, saving = false }) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setValue('');
      // Focus after the slide-up animation so the cursor lands in the field.
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!visible) return null;

  const names = value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const canSubmit = names.length > 0 && !saving;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit?.(names.join('\n'));
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="student-group-title">Who's in your group?</h2>
        <p className="student-group-description">
          List the names of the students sharing this account — one per line.
          You'll only need to do this once.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="student-group-label" htmlFor="student-group-names">
            Student names
          </label>
          <textarea
            id="student-group-names"
            ref={textareaRef}
            className="student-group-textarea"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={'Ada Lovelace\nGrace Hopper\nKatherine Johnson'}
            rows={6}
            disabled={saving}
          />

          <div className="student-group-actions">
            <button
              type="submit"
              className="modal-close-button"
              disabled={!canSubmit}
            >
              {saving ? 'Saving…' : 'Save and continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentGroupModal;
