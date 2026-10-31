/**
 * Persona Viewer (/view-data, after a personas.csv is uploaded).
 *
 * Lists every persona in the file on the left; the selected persona's full
 * prompt is shown read-only on the right. The prompt is rendered as plain text
 * (never HTML) since it comes from a student-uploaded document.
 */

import { useState } from 'react';
import brand from '../../config/brand';
import { describePersonaType } from './personaModel';
import '../TitleBar.css';
import './Replay.css';

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function sessionLabel(persona) {
  return persona.sessionName && persona.sessionName !== 'Unnamed Session'
    ? persona.sessionName
    : `Session ${persona.sessionId}`;
}

const PersonaViewer = ({ personas, fileName, onLoadAnother }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = personas[selectedIndex];
  const isPreset = selected.personaType.startsWith('preset:');

  return (
    <div className="app-container">
      <div className="topbar">
        <div className="topbar-logo">
          <img src={brand.logoSrc} alt={brand.logoAlt} style={{ height: brand.logoHeight }} />
        </div>
        <div className="topbar-title">{brand.name}</div>

        <div className="replay-position">
          <div className="replay-position-main">
            <span className="replay-session-name" title={fileName}>
              Personas — {fileName}
            </span>
            <span className="replay-counter">
              {personas.length} persona{personas.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="topbar-button" onClick={onLoadAnother} title="Upload a different file">
            LOAD ANOTHER
          </button>
        </div>
      </div>

      <div className="persona-viewer">
        <nav className="persona-list" aria-label="Personas">
          {personas.map((persona, i) => (
            <button
              key={persona.conversationId || i}
              type="button"
              className={`persona-list-item${i === selectedIndex ? ' selected' : ''}`}
              onClick={() => setSelectedIndex(i)}
            >
              <span className="persona-list-name">{persona.name}</span>
              <span className="persona-type-badge">{describePersonaType(persona.personaType)}</span>
              <span className="persona-list-meta">
                {sessionLabel(persona)}
                {persona.startedAt ? ` · ${formatTimestamp(persona.startedAt)}` : ''}
              </span>
            </button>
          ))}
        </nav>

        <article className="persona-detail">
          <header className="persona-detail-header">
            <h2 className="persona-detail-name">{selected.name}</h2>
            <span className="persona-type-badge">{describePersonaType(selected.personaType)}</span>
          </header>

          <dl className="persona-detail-meta">
            <dt>Session</dt>
            <dd>{sessionLabel(selected)}</dd>
            <dt>Session ID</dt>
            <dd>{selected.sessionId || '—'}</dd>
            <dt>Conversation ID</dt>
            <dd>{selected.conversationId || '—'}</dd>
            <dt>Created</dt>
            <dd>{formatTimestamp(selected.startedAt) || '—'}</dd>
          </dl>

          <h3 className="persona-prompt-heading">Persona description</h3>
          {selected.prompt.trim() ? (
            <div className="persona-prompt">{selected.prompt}</div>
          ) : (
            <div className="persona-prompt-empty">
              {isPreset
                ? 'This is a built-in preset persona. Its prompt is part of the app and is not included in the export.'
                : 'No description was saved for this persona.'}
            </div>
          )}
        </article>
      </div>
    </div>
  );
};

export default PersonaViewer;
