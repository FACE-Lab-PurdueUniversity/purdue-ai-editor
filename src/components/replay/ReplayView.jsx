/**
 * Public replay route (/view-data).
 *
 * Holds the loaded session + playback position. Renders the upload picker until
 * a file is loaded, then a read-only mirror of the editor/chat UI with a
 * video-style scrubber. Never touches auth or Supabase.
 */

import { useEffect, useRef, useState } from 'react';
import ReplayUpload from './ReplayUpload';
import ReplayTitleBar from './ReplayTitleBar';
import ReplayEditorPane from './ReplayEditorPane';
import ReplayChatPane from './ReplayChatPane';
import ReplayControls from './ReplayControls';
import '../../App.css';
import './Replay.css';

const PLAY_INTERVAL_MS = 1000;

const ReplayView = () => {
  const [session, setSession] = useState(null); // { meta, events, frames, fileName }
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef(null);
  const resizerRef = useRef(null);

  const total = session?.frames.length || 0;
  const frame = session?.frames[index] || null;

  const handleLoaded = (data) => {
    setSession(data);
    setIndex(0);
    setIsPlaying(false);
  };

  const handleLoadAnother = () => {
    setSession(null);
    setIndex(0);
    setIsPlaying(false);
  };

  // Auto-advance while playing; stop at the end.
  useEffect(() => {
    if (!isPlaying || !session) return undefined;
    const id = setInterval(() => {
      setIndex((i) => {
        if (i >= total - 1) {
          setIsPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPlaying, session, total]);

  // Draggable split between the two panes (mirrors AppContent).
  useEffect(() => {
    const resizer = resizerRef.current;
    const container = containerRef.current;
    if (!resizer || !container) return undefined;

    let dragging = false;
    const onDown = (e) => {
      e.preventDefault();
      dragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };
    const onMove = (e) => {
      if (!dragging) return;
      const rect = container.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(Math.max(percent, 15), 85);
      container.style.gridTemplateColumns = `${clamped}% 5px auto`;
    };
    const onUp = () => {
      if (dragging) {
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    resizer.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      resizer.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [session]);

  if (!session) {
    return (
      <div className="app-container">
        <ReplayUpload onLoaded={handleLoaded} />
      </div>
    );
  }

  const seek = (i) => {
    setIsPlaying(false);
    setIndex(Math.min(Math.max(i, 0), total - 1));
  };

  const togglePlay = () => {
    setIsPlaying((playing) => {
      if (!playing && index >= total - 1) setIndex(0); // replay from the start
      return !playing;
    });
  };

  return (
    <div className="app-container replay-app">
      <ReplayTitleBar
        meta={session.meta}
        frame={frame}
        index={index}
        total={total}
        onLoadAnother={handleLoadAnother}
      />
      <div className="main-content" ref={containerRef}>
        <div className="left-panel">
          <ReplayEditorPane frame={frame} />
        </div>
        <div className="horizontal-resizer" ref={resizerRef}></div>
        <div className="right-panel">
          <ReplayChatPane frame={frame} />
        </div>
      </div>
      <ReplayControls
        index={index}
        total={total}
        isPlaying={isPlaying}
        onStepBack={() => seek(index - 1)}
        onStepForward={() => seek(index + 1)}
        onTogglePlay={togglePlay}
        onSeek={seek}
      />
    </div>
  );
};

export default ReplayView;
