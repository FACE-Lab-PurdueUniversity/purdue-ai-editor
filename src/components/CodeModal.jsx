import { useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { EditorView } from '@codemirror/view';
import './ModalBase.css';
import './CodeModal.css';

const CodeModal = ({ isOpen, code, lang, onClose, onCopy, onReplace }) => {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === modalRef.current) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" ref={modalRef} onClick={handleBackdropClick}>
      <div className="modal-content modal-content-wide code-box">
        {lang && (
          <div className="code-lang">{lang.toUpperCase()}</div>
        )}
        <div className="code-editor-container">
          <CodeMirror
            value={code}
            height="100%"
            extensions={[
              python(),
              EditorView.editable.of(false),
              EditorView.theme({
                '&': {
                  height: '100%',
                  fontSize: '14px',
                },
                '.cm-scroller': {
                  overflow: 'auto',
                  fontFamily: 'Monaco, Courier New, monospace'
                },
                '.cm-line': {
                  fontWeight: 'bold',
                }
              })
            ]}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
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
            readOnly={true}
          />
        </div>
        <div className="code-actions">
          <button data-act="cancel" onClick={onClose}>Cancel</button>
          <button data-act="copy" onClick={onCopy}>Copy</button>
          <button data-act="replace" onClick={onReplace}>Replace</button>
        </div>
      </div>
    </div>
  );
};

export default CodeModal;

