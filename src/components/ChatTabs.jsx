/**
 * Chat Tabs Component
 * Displays a horizontal scrollable list of chat tabs for conversation management
 */

import { useState, useRef } from 'react';
import './ChatTabs.css';

const ChatTabs = ({
  conversations,
  currentConversationId,
  onSwitchConversation,
  onCreateConversation,
  onRenameConversation,
}) => {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const tabsContainerRef = useRef(null);

  const handleStartEdit = (conversation, index) => {
    setEditingId(conversation.id);
    setEditingName(conversation.name || `Chat ${index + 1}`);
  };

  const handleSaveEdit = async (conversationId) => {
    if (editingName.trim()) {
      await onRenameConversation(conversationId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e, conversationId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(conversationId);
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
    <div className="chat-tabs-wrapper">
      <div
        className="chat-tabs-container"
        ref={tabsContainerRef}
        onWheel={handleWheel}
      >
        {conversations.map((conversation, index) => {
          const isActive = conversation.id === currentConversationId;
          const isEditing = editingId === conversation.id;
          const displayName = conversation.name || `Chat ${index + 1}`;

          return (
            <div
              key={conversation.id}
              className={`chat-tab ${isActive ? 'active' : ''}`}
              onClick={() => !isEditing && onSwitchConversation(conversation.id)}
            >
              {isEditing ? (
                <input
                  type="text"
                  className="chat-tab-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleSaveEdit(conversation.id)}
                  onKeyDown={(e) => handleKeyDown(e, conversation.id)}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="chat-tab-name">
                    {displayName}
                  </span>
                  <button
                    type="button"
                    className="chat-tab-edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(conversation, index);
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
        <button className="chat-tab-add" onClick={onCreateConversation} aria-label="Add new chat">
          +
        </button>
      </div>
    </div>
  );
};

export default ChatTabs;
