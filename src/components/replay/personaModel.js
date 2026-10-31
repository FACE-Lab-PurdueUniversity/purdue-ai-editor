/**
 * Persona data model.
 *
 * Parses a per-student personas.csv (produced by scripts/merge_sessions_to_csv.py)
 * into a list of persona records for the Persona Viewer.
 *
 * Everything here is pure and runs entirely in the browser; no network.
 */

import Papa from 'papaparse';

const REQUIRED_COLUMNS = ['Chat Tab Name', 'Persona Type', 'Persona Prompt'];

/** "custom" -> "Custom persona", "preset:nora" -> "Preset: Nora". */
export function describePersonaType(personaType) {
  const type = (personaType || '').trim();
  if (type === 'custom') return 'Custom persona';
  if (type.startsWith('preset:')) {
    const id = type.slice('preset:'.length);
    return `Preset: ${id.charAt(0).toUpperCase()}${id.slice(1)}`;
  }
  return type || 'Unknown type';
}

/**
 * Parse the raw CSV text into an array of
 * { sessionId, sessionName, conversationId, name, personaType, startedAt, prompt }.
 */
export function parsePersonasCsv(text) {
  const { data: rows } = Papa.parse(text, { skipEmptyLines: 'greedy' });

  if (rows.some((r) => (r[0] || '').trim() === 'Event ID')) {
    throw new Error(
      'This looks like a session CSV. Drop it in the "Session CSV" box to replay it.'
    );
  }

  const columns = (rows[0] || []).map((c) => (c || '').trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `This file does not look like a personas.csv (missing column${
        missing.length > 1 ? 's' : ''
      }: ${missing.join(', ')}).`
    );
  }

  const personas = rows.slice(1).map((r) => {
    const row = {};
    columns.forEach((col, i) => {
      row[col] = r[i] ?? '';
    });
    return {
      sessionId: row['Session ID'] || '',
      sessionName: row['Session Name'] || '',
      conversationId: row['Conversation ID'] || '',
      name: row['Chat Tab Name'] || 'Untitled persona',
      personaType: row['Persona Type'] || '',
      startedAt: row['Started At'] || '',
      prompt: row['Persona Prompt'] || '',
    };
  });

  if (personas.length === 0) {
    throw new Error('This personas.csv has no personas in it.');
  }

  return personas;
}
