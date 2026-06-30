/**
 * Replay top bar.
 *
 * Reuses the app's .topbar styling but, in place of the logout / change-session
 * actions, shows where the replay currently is: session name, event position,
 * the current event's timestamp, and a short description of what just happened.
 */

import brand from '../../config/brand';
import '../TitleBar.css';
import './Replay.css';

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

const ReplayTitleBar = ({ meta, frame, index, total, onLoadAnother }) => {
  const sessionLabel =
    meta?.sessionName && meta.sessionName !== 'Unnamed Session'
      ? meta.sessionName
      : `Session ${meta?.sessionId || ''}`;

  return (
    <div className="topbar">
      <div className="topbar-logo">
        <img src={brand.logoSrc} alt={brand.logoAlt} style={{ height: brand.logoHeight }} />
      </div>
      <div className="topbar-title">{brand.name}</div>

      <div className="replay-position">
        <div className="replay-position-main">
          <span className="replay-session-name" title={meta?.student || ''}>
            {sessionLabel}
            {meta?.student ? ` — ${meta.student}` : ''}
          </span>
          <span className="replay-counter">
            Event {total ? index + 1 : 0} / {total}
          </span>
        </div>
        <div className="replay-position-sub">
          <span className={`replay-kind replay-kind-${frame?.event?.type || 'none'}`}>
            {frame?.event?.description || '—'}
          </span>
          <span className="replay-timestamp">{formatTimestamp(frame?.event?.timestamp)}</span>
        </div>
      </div>

      <div className="topbar-actions">
        <button className="topbar-button" onClick={onLoadAnother} title="Upload a different session CSV">
          LOAD ANOTHER
        </button>
      </div>
    </div>
  );
};

export default ReplayTitleBar;
