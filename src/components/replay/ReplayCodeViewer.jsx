/**
 * Read-only CodeMirror view for the replay editor.
 *
 * Mirrors the look of the live CodeEditor (python(), bold monospace, line
 * numbers) but is non-editable and paints the lines changed by the current
 * code event in blue via a line decoration (class .cm-changed-line).
 */

import { useEffect, useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { EditorView, Decoration } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

const setChangedLines = StateEffect.define();

const changedLineField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setChangedLines)) {
        const ranges = [];
        for (const lineNo of effect.value) {
          if (lineNo >= 1 && lineNo <= tr.state.doc.lines) {
            const line = tr.state.doc.line(lineNo);
            ranges.push(Decoration.line({ class: 'cm-changed-line' }).range(line.from));
          }
        }
        ranges.sort((a, b) => a.from - b.from);
        deco = Decoration.set(ranges);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'Monaco, Courier New, monospace' },
  '.cm-line': { fontWeight: 'bold' },
});

const ReplayCodeViewer = ({ content = '', changedLines }) => {
  const viewRef = useRef(null);

  const extensions = useMemo(
    () => [python(), EditorView.editable.of(false), baseTheme, changedLineField],
    []
  );

  // Re-apply the changed-line decorations whenever the content or the
  // highlighted lines change (after react-codemirror has swapped the doc).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const lines = changedLines ? Array.from(changedLines) : [];
    view.dispatch({ effects: setChangedLines.of(lines) });
  }, [content, changedLines]);

  return (
    <CodeMirror
      value={content}
      height="100%"
      extensions={extensions}
      onCreateEditor={(view) => {
        viewRef.current = view;
      }}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: false,
        highlightSpecialChars: true,
        history: false,
        foldGutter: true,
        drawSelection: false,
        dropCursor: false,
        allowMultipleSelections: false,
        indentOnInput: false,
        syntaxHighlighting: true,
        bracketMatching: true,
        closeBrackets: false,
        autocompletion: false,
        rectangularSelection: false,
        crosshairCursor: false,
        highlightActiveLine: false,
        highlightSelectionMatches: false,
        closeBracketsKeymap: false,
        defaultKeymap: false,
        searchKeymap: true,
        historyKeymap: false,
        foldKeymap: true,
        completionKeymap: false,
        lintKeymap: false,
      }}
      readOnly
    />
  );
};

export default ReplayCodeViewer;
