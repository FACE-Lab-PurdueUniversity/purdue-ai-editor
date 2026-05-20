/**
 * TitleBar Component
 * Main navigation bar with session management, debug, and about features
 */

import { useState, useRef, useEffect } from 'react';
import AboutModal from './AboutModal';
import { signOut } from '../services/auth';
import brand from '../config/brand';
import { getPlatform } from '../platforms';
import './ModalBase.css';
import './TitleBar.css';

const TitleBar = ({
  onSaveSession,
  onOpenSessions,
  onShowDebug,
  onOpenHardwareConfig,
  activeSession,
  onUpdateSessionName,
}) => {
  const [showAbout, setShowAbout] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameClick = () => {
    if (activeSession) {
      setEditedName(activeSession.name || '');
      setIsEditingName(true);
    }
  };

  const handleNameSave = async () => {
    if (activeSession && onUpdateSessionName) {
      await onUpdateSessionName(activeSession.id, editedName.trim());
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
    }
  };

  const handleNameBlur = () => {
    handleNameSave();
  };

  const handleLogOut = async () => {
    try {
      await signOut();
      // The auth state listener will handle navigation/cleanup
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-logo">
          <img
            src={brand.logoSrc}
            alt={brand.logoAlt}
            style={{ height: brand.logoHeight }}
          />
        </div>
        <div className="topbar-title">{brand.name}</div>
        {activeSession && (
          <div className="topbar-session-name">
            {isEditingName ? (
              <input
                ref={inputRef}
                type="text"
                className="topbar-session-name-input"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={handleNameBlur}
                placeholder="Enter session name"
                maxLength={100}
              />
            ) : (
              <div
                className="topbar-session-name-display"
                onClick={handleNameClick}
                title="Click to rename session"
              >
                <span>{activeSession.name || 'Unnamed Session'}</span>
              </div>
            )}
            {getPlatform(activeSession.hardware_platform) && (
              <span className="platform-badge" title="Hardware platform">
                {getPlatform(activeSession.hardware_platform).label}
              </span>
            )}
          </div>
        )}
        <div className="topbar-actions">
          {activeSession && onSaveSession && (
            <button 
              className="topbar-button save" 
              onClick={onSaveSession}
              title="Save current code and console"
            >
              SAVE SESSION
            </button>
          )}
          {onOpenSessions && (
            <button 
              className="topbar-button" 
              onClick={onOpenSessions}
              title="Switch between editor sessions"
            >
              EDITOR SESSIONS
            </button>
          )}
          {onOpenHardwareConfig && activeSession?.hardware_platform === 'lilybot' && (
            <button
              className="topbar-button"
              onClick={onOpenHardwareConfig}
              title="Configure your hardware pin mapping"
            >
              CONFIGURE HARDWARE
            </button>
          )}
          <button 
            className="topbar-button" 
            onClick={() => setShowAbout(true)}
            title="About this application"
          >
            ABOUT
          </button>
          {onShowDebug && (
            <button 
              className="topbar-button" 
              onClick={onShowDebug}
              title="Open debug console"
            >
              DEBUG
            </button>
          )}
          <button 
            className="topbar-button logout" 
            onClick={handleLogOut}
            title="Sign out of your account"
          >
            LOG OUT
          </button>
        </div>
      </div>

      <AboutModal visible={showAbout} onClose={() => setShowAbout(false)} />
    </>
  );
};

export default TitleBar;

