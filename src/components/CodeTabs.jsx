/**
 * Code Tabs Component
 * Displays a horizontal scrollable list of code tabs for code file management
 */

import { useState, useRef } from 'react';
import './CodeTabs.css';

const CodeTabs = ({
  codeRecords,
  currentCodeId,
  onSwitchCode,
  onCreateCode,
  onRenameCode,
}) => {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const tabsContainerRef = useRef(null);

  const handleStartEdit = (codeRecord, index) => {
    setEditingId(codeRecord.id);
    setEditingName(codeRecord.name || `Code tab ${index + 1}`);
  };

  const handleSaveEdit = async (codeId) => {
    if (editingName.trim()) {
      await onRenameCode(codeId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e, codeId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(codeId);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleWheel = (e) => {
    if (tabsContainerRef.current && e.deltaY !== 0) {
      e.preventDefault();
      tabsContainerRef.current.scrollBy({ left: e.deltaY, behavior: 'auto' });
    }
  };

  return (
    <div className="code-tabs-wrapper">
      <div
        className="code-tabs-container"
        ref={tabsContainerRef}
        onWheel={handleWheel}
      >
        {codeRecords.map((codeRecord, index) => {
          const isActive = codeRecord.id === currentCodeId;
          const isEditing = editingId === codeRecord.id;
          const displayName = codeRecord.name || `Code tab ${index + 1}`;

          return (
            <div
              key={codeRecord.id}
              className={`code-tab ${isActive ? 'active' : ''}`}
              onClick={() => !isEditing && onSwitchCode(codeRecord.id)}
            >
              {isEditing ? (
                <input
                  type="text"
                  className="code-tab-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleSaveEdit(codeRecord.id)}
                  onKeyDown={(e) => handleKeyDown(e, codeRecord.id)}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="code-tab-name">
                    {displayName}
                  </span>
                  <button
                    type="button"
                    className="code-tab-edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(codeRecord, index);
                    }}
                    aria-label="Rename tab"
                  >
                    &#9998;
                  </button>
                </>
              )}
            </div>
          );
        })}
        <button className="code-tab-add" onClick={onCreateCode} aria-label="Add new code">
          +
        </button>
      </div>
    </div>
  );
};

export default CodeTabs;
