/**
 * Initial replay screen: two file pickers (browse + drag-drop) — one for a
 * merged session_<id>.csv to replay, one for a personas.csv to read.
 * Parsing happens locally; nothing is uploaded.
 */

import { useRef, useState } from 'react';
import brand from '../../config/brand';
import { loadSession } from './replayModel';
import { parsePersonasCsv } from './personaModel';
import './Replay.css';

/** One drop target. `parse` turns the file text into data or throws. */
const CsvDropzone = ({ title, hint, parse, onLoaded }) => {
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
        onLoaded(parse(String(reader.result)), file.name);
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
    <div className="replay-dropzone-column">
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
        <div className="replay-dropzone-title">{title}</div>
        <div className="replay-dropzone-text">
          <strong>Choose a file</strong> or drag &amp; drop it here
        </div>
        <div className="replay-dropzone-hint">{hint}</div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {error && <div className="replay-upload-error">{error}</div>}
    </div>
  );
};

const ReplayUpload = ({ onLoaded, onPersonasLoaded }) => (
  <div className="replay-upload-screen">
    <img
      className="replay-upload-logo"
      src={brand.logoSrc}
      alt={brand.logoAlt}
      style={{ height: 48 }}
    />
    <h1 className="replay-upload-title">Session Replay Viewer</h1>
    <p className="replay-upload-subtitle">
      Upload a merged <code>session_&lt;id&gt;.csv</code> to replay it, or a{' '}
      <code>personas.csv</code> to read the personas a student created. Your file stays in this
      browser and is never uploaded — refreshing the page clears it.
    </p>

    <div className="replay-dropzones">
      <CsvDropzone
        title="Session CSV"
        hint={<>Replay a <code>session_&lt;id&gt;.csv</code></>}
        parse={loadSession}
        onLoaded={(data, fileName) => onLoaded({ ...data, fileName })}
      />
      <CsvDropzone
        title="Personas CSV"
        hint={<>Read prompts from a <code>personas.csv</code></>}
        parse={parsePersonasCsv}
        onLoaded={(personas, fileName) => onPersonasLoaded({ personas, fileName })}
      />
    </div>
  </div>
);

export default ReplayUpload;
