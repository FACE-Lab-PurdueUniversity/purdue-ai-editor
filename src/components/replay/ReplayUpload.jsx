/**
 * Initial replay screen: a single-file picker (browse + drag-drop) for a
 * merged session_<id>.csv. Parsing happens locally; nothing is uploaded.
 */

import { useRef, useState } from 'react';
import brand from '../../config/brand';
import { loadSession } from './replayModel';
import './Replay.css';

const ReplayUpload = ({ onLoaded }) => {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file) => {
    setError('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = loadSession(String(reader.result));
        onLoaded({ ...data, fileName: file.name });
      } catch (err) {
        setError(err?.message || 'Could not read this CSV.');
      }
    };
    reader.onerror = () => setError('Could not read this file.');
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="replay-upload-screen">
      <img
        className="replay-upload-logo"
        src={brand.logoSrc}
        alt={brand.logoAlt}
        style={{ height: 48 }}
      />
      <h1 className="replay-upload-title">Session Replay Viewer</h1>
      <p className="replay-upload-subtitle">
        Upload a merged <code>session_&lt;id&gt;.csv</code> to replay it. Your file stays in this
        browser and is never uploaded — refreshing the page clears it.
      </p>

      <div
        className={`replay-dropzone${dragOver ? ' drag-over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="replay-dropzone-icon">⬆</div>
        <div className="replay-dropzone-text">
          <strong>Choose a session CSV</strong> or drag &amp; drop it here
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {error && <div className="replay-upload-error">{error}</div>}
    </div>
  );
};

export default ReplayUpload;
