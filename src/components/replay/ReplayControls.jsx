/**
 * Bottom playback bar: step back/forward, play/pause auto-advance, and a
 * per-event scrubber (each notch = one event; time gaps are not represented).
 */

import './Replay.css';

const ReplayControls = ({
  index,
  total,
  isPlaying,
  onStepBack,
  onStepForward,
  onTogglePlay,
  onSeek,
}) => {
  const atStart = index <= 0;
  const atEnd = index >= total - 1;

  return (
    <div className="replay-controls">
      <button className="replay-btn" onClick={onStepBack} disabled={atStart} title="Previous event">
        ◀
      </button>
      <button className="replay-btn replay-play" onClick={onTogglePlay} title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button className="replay-btn" onClick={onStepForward} disabled={atEnd} title="Next event">
        ▶▶
      </button>

      <input
        className="replay-scrubber"
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        step={1}
        value={index}
        onChange={(e) => onSeek(Number(e.target.value))}
      />

      <div className="replay-count">
        {total ? index + 1 : 0} / {total}
      </div>
    </div>
  );
};

export default ReplayControls;
