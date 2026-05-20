import './FlashProgressModal.css';
import './ModalBase.css';

const FlashProgressModal = ({ open, phase, progress, message }) => {
  if (!open) return null;

  const hasProgress = typeof progress === 'number';
  const pct = hasProgress ? Math.max(0, Math.min(100, Math.round(progress))) : 0;

  const title =
    phase === 'probing'
      ? 'Checking micro:bit...'
      : phase === 'flashing'
      ? 'Installing MicroPython'
      : phase === 'reconnecting'
      ? 'Reconnecting micro:bit...'
      : 'Connecting micro:bit';

  return (
    <div className="modal-overlay flash-progress-overlay">
      <div className="modal-content flash-progress-modal">
        <h2 className="flash-progress-title">{title}</h2>
        <p className="flash-progress-message">{message}</p>
        <div className="flash-progress-bar">
          <div
            className={`flash-progress-bar-fill ${hasProgress ? '' : 'indeterminate'}`}
            style={hasProgress ? { width: `${pct}%` } : undefined}
          />
        </div>
        <div className="flash-progress-percent">
          {hasProgress ? `${pct}%` : 'Working...'}
        </div>
        <p className="flash-progress-hint">
          Keep the micro:bit plugged in. This can take up to a minute.
        </p>
      </div>
    </div>
  );
};

export default FlashProgressModal;
