/**
 * DebugManager Component
 * Custom debug console for capturing and displaying application logs
 */

import { useState, useRef, useEffect } from 'react';
import './ModalBase.css';
import './DebugManager.css';

// Global log storage
let globalLogs = [];
let logSubscribers = [];

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn
};

// Export function for logging from anywhere
export const debugLog = (message, type = 'log') => {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { timestamp, message, type };
  globalLogs.push(logEntry);
  
  // Notify all subscribers
  logSubscribers.forEach(callback => callback(logEntry));
};

// Override console methods to capture all logs
console.log = (...args) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  debugLog(message, 'log');
  originalConsole.log(...args); // Still log to real console
};

console.error = (...args) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  debugLog(`ERROR: ${message}`, 'error');
  originalConsole.error(...args); // Still log to real console
};

console.warn = (...args) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  debugLog(`WARNING: ${message}`, 'warn');
  originalConsole.warn(...args); // Still log to real console
};

const DebugManager = ({ visible, onClose }) => {
  const [logs, setLogs] = useState(globalLogs);
  const [copyNotifyVisible, setCopyNotifyVisible] = useState(false);
  
  const logBodyRef = useRef(null);

  // Subscribe to log updates
  useEffect(() => {
    const logCallback = (entry) => {
      setLogs(prev => [...prev, entry]);
    };
    
    logSubscribers.push(logCallback);
    
    return () => {
      logSubscribers = logSubscribers.filter(cb => cb !== logCallback);
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopyToClipboard = () => {
    let text = '=== CONSOLE LOG ===\n';
    logs.forEach(entry => {
      text += `[${entry.timestamp}] ${entry.message}\n`;
    });

    navigator.clipboard.writeText(text)
      .then(() => {
        setCopyNotifyVisible(true);
        setTimeout(() => setCopyNotifyVisible(false), 2500);
      })
      .catch(err => {
        originalConsole.error('Failed to copy to clipboard:', err);
      });
  };

  if (!visible) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content-wide dbg-box" onClick={(e) => e.stopPropagation()}>
        <div className="dbg-header">Console Log</div>
        <div className="dbg-body-terminal" ref={logBodyRef}>
          {logs.map((entry, idx) => (
            <div key={idx} className={`dbg-log-entry dbg-log-${entry.type}`}>
              [{entry.timestamp}] {entry.message}
            </div>
          ))}
          {logs.length === 0 && (
            <div className="dbg-empty">No logs yet. Console output will appear here.</div>
          )}
        </div>

        <div className="dbg-controls">
          {copyNotifyVisible && (
            <span className="dbg-copy-notify">Copied to Clipboard!</span>
          )}
          <button className="dbg-button" onClick={handleCopyToClipboard}>
            Copy Console
          </button>
          <button className="dbg-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="dbg-footer">
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSdTnA3rlGU8dFAgdukbg2uRyPaUwXAWeBHDvLgMyyxbox-ViA/viewform?usp=dialog"
            target="_blank"
            rel="noopener noreferrer"
          >
            Report a Bug
          </a>
        </div>
      </div>
    </div>
  );
};

export default DebugManager;

