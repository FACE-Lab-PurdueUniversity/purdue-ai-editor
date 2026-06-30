/**
 * Replay data model.
 *
 * Parses a per-session merged CSV (produced by scripts/merge_sessions_to_csv.py)
 * and turns it into a list of immutable "frames" — one per event — that fully
 * describe the editor/chat state at that point in the replay.
 *
 * Everything here is pure and runs entirely in the browser; no network.
 */

import Papa from 'papaparse';

const DEFAULT_CODE_TAB = 'Code Tab';
const DEFAULT_CHAT_TAB = 'Chat';

/** True for null/empty/whitespace and the literal string 'None'. */
function isBlank(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return text === '' || text.toLowerCase() === 'none';
}

/**
 * Parse the raw CSV text into { meta, events }.
 *
 * The file is a small metadata block, a blank line, then a header row that
 * starts with "Event ID" followed by the time-sorted event rows.
 */
export function parseSessionCsv(text) {
  const { data: rows } = Papa.parse(text, { skipEmptyLines: false });

  const headerIdx = rows.findIndex((r) => (r[0] || '').trim() === 'Event ID');
  if (headerIdx === -1) {
    throw new Error(
      'This file does not look like a merged session CSV (no "Event ID" header row was found).'
    );
  }

  // --- Metadata block (everything before the header row) ---
  const metaByKey = {};
  for (const row of rows.slice(0, headerIdx)) {
    if (row.length >= 2 && (row[0] || '').trim()) {
      metaByKey[row[0].trim()] = row[1];
    }
  }
  const meta = {
    student: metaByKey['Student'] || '',
    sessionId: metaByKey['Session ID'] || '',
    sessionName: metaByKey['Session Name'] || '',
    platform: metaByKey['Hardware Platform'] || '',
    startedAt: metaByKey['Started At'] || '',
    lastUpdated: metaByKey['Last Updated'] || '',
  };

  // --- Event table ---
  const columns = rows[headerIdx];
  const events = rows
    .slice(headerIdx + 1)
    .filter((r) => r.some((cell) => cell !== '' && cell !== null && cell !== undefined))
    .map((r) => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = r[i] ?? '';
      });
      return obj;
    });

  if (events.length === 0) {
    throw new Error('This session CSV has no events to replay.');
  }

  return { meta, events };
}

/**
 * Line-level diff. Returns a Set of 1-based line numbers in `next` that were
 * added or changed relative to `prev` (used to paint changed code lines blue).
 */
export function diffLines(prev, next) {
  if (prev === next) return new Set();
  const a = prev ? prev.split('\n') : [];
  const b = next ? next.split('\n') : [];
  const m = a.length;
  const n = b.length;

  // LCS table over lines.
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const changed = new Set();
  let i = 0;
  let j = 0;
  while (j < n) {
    if (i < m && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < m && dp[i + 1][j] >= dp[i][j + 1]) {
      i++; // line only in `prev` (removed)
    } else {
      changed.add(j + 1); // line added/changed in `next`
      j++;
    }
  }
  return changed;
}

function describeEvent(type, fields) {
  switch (type) {
    case 'code':
      return `Code change in "${fields.tabName}"${
        fields.saveSource ? ` (${fields.saveSource})` : ''
      }`;
    case 'console':
      return `Console output${fields.saveSource ? ` (${fields.saveSource})` : ''}`;
    case 'interaction':
      return `Button pressed: ${fields.buttonName || 'unknown'}`;
    case 'message':
      return `New message from ${
        fields.role === 'user' ? 'User' : 'AI Bot'
      } in "${fields.tabName}"`;
    default:
      return type || 'event';
  }
}

/**
 * Build one frame per event. Each frame is a self-contained snapshot of what
 * the replay UI should show at that step.
 *
 * Tabs are keyed by name (the CSV carries no tab IDs); same-named tabs merge.
 */
export function buildFrames(events) {
  const codeTabs = new Map(); // name -> latest content
  const convs = new Map(); // name -> messages[]
  let activeCodeTab = null;
  let activeChatTab = null;
  let consoleText = '';

  const frames = [];

  for (const ev of events) {
    const type = ev['Type'];
    const timestamp = ev['Timestamp'] || '';

    let changedLines = null;
    let codeTabSwitched = false;
    let chatTabSwitched = false;
    let buttonName = '';
    let newMessageIndex = -1;
    const descFields = {};

    if (type === 'code') {
      const name = !isBlank(ev['Code Tab Name']) ? ev['Code Tab Name'] : DEFAULT_CODE_TAB;
      const content = ev['Code'] || '';
      const prevContent = codeTabs.get(name) ?? '';
      changedLines = diffLines(prevContent, content);
      codeTabs.set(name, content);
      codeTabSwitched = activeCodeTab !== name;
      activeCodeTab = name;
      descFields.tabName = name;
      descFields.saveSource = ev['Code Save Source'] || '';
    } else if (type === 'console') {
      consoleText = ev['Console'] || '';
      descFields.saveSource = ev['Console Save Source'] || '';
    } else if (type === 'interaction') {
      buttonName = ev['Button Clicked'] || '';
      descFields.buttonName = buttonName;
    } else if (type === 'message') {
      const name = !isBlank(ev['Chat Tab Name']) ? ev['Chat Tab Name'] : DEFAULT_CHAT_TAB;
      const role = ev['Message Author'] === 'user' ? 'user' : 'bot';
      const msg = {
        role,
        content: ev['Message'] || '',
        aiModel: ev['AI Model'] || '',
        codingLevel: ev['LLM Coding Level'] || '',
        promptTokens: ev['Prompt Tokens'] || '',
        completionTokens: ev['Completion Tokens'] || '',
      };
      if (!convs.has(name)) convs.set(name, []);
      const list = convs.get(name);
      list.push(msg);
      newMessageIndex = list.length - 1;
      chatTabSwitched = activeChatTab !== name;
      activeChatTab = name;
      descFields.tabName = name;
      descFields.role = ev['Message Author'];
    }

    frames.push({
      // Editor state
      codeTabs: Array.from(codeTabs, ([name, content]) => ({ name, content })),
      activeCodeTab,
      consoleText,
      // Chat state (materialized snapshot up to this event)
      conversations: Array.from(convs, ([name, list]) => ({
        name,
        messages: list.slice(),
      })),
      activeChatTab,
      // Current-event metadata + highlight hints
      event: {
        type,
        timestamp,
        buttonName,
        description: describeEvent(type, descFields),
      },
      highlightKind: type,
      changedLines, // Set | null (only for code events)
      codeTabSwitched,
      chatTabSwitched,
      newMessageIndex, // index within the active chat tab, or -1
    });
  }

  return frames;
}

/** Parse + build in one call. Returns { meta, events, frames }. */
export function loadSession(text) {
  const { meta, events } = parseSessionCsv(text);
  const frames = buildFrames(events);
  return { meta, events, frames };
}
