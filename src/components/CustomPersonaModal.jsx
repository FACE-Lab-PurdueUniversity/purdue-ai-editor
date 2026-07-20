/**
 * Custom Persona Modal
 * Lets a student create their own persona chat: a display name plus a
 * priming document (.txt/.pdf/.docx), parsed client-side into plain text
 * that becomes that conversation's persona_prompt.
 */

import { useState, useRef } from 'react';
import { useSession } from '../contexts/SessionContext';
import { extractTextFromFile } from '../utils/personaFileParser';
import './ModalBase.css';
import './NewChatModal.css';

const CustomPersonaModal = ({ isOpen, onClose }) => {
  const { createNewConversation } = useSession();
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | parsing | error
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setName('');
    setFile(null);
    setStatus('idle');
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    setStatus('idle');
    setErrorMessage('');
  };

  const handleCreate = async () => {
    if (!name.trim() || !file) return;

    setStatus('parsing');
    setErrorMessage('');
    try {
      const personaPrompt = await extractTextFromFile(file);
      await createNewConversation({ name: name.trim(), personaType: 'custom', personaPrompt });
      resetAndClose();
    } catch (error) {
      console.error('Error creating custom persona:', error);
      setStatus('error');
      setErrorMessage(error.message || 'Something went wrong reading that file. Please try again.');
    }
  };

  const canCreate = name.trim().length > 0 && !!file && status !== 'parsing';

  return (
    <div className="modal-overlay" onClick={resetAndClose}>
      <div className="modal-content new-chat-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create Your Own Character</h2>
        <p className="new-chat-modal-subtitle">
          Give your character a name and upload a document describing who they are and how they talk.
        </p>

        <label className="custom-persona-label" htmlFor="custom-persona-name">
          Character name
        </label>
        <input
          id="custom-persona-name"
          type="text"
          className="custom-persona-input"
          placeholder="e.g. Skeptical Investor"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />

        <label className="custom-persona-label" htmlFor="custom-persona-file">
          Character description (.txt, .pdf, or .docx)
        </label>
        <input
          id="custom-persona-file"
          type="file"
          className="custom-persona-file-input"
          ref={fileInputRef}
          accept=".txt,.pdf,.docx"
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="custom-persona-file-button"
          onClick={() => fileInputRef.current?.click()}
        >
          📄 {file ? 'Choose a different file' : 'Choose file'}
        </button>
        {file && <p className="custom-persona-file-name">Selected: {file.name}</p>}

        {status === 'error' && (
          <p className="custom-persona-error">{errorMessage}</p>
        )}

        <div className="custom-persona-actions">
          <button className="modal-close-button" onClick={handleCreate} disabled={!canCreate}>
            {status === 'parsing' ? 'Reading document…' : 'Create Persona Chat'}
          </button>
          <button className="custom-persona-cancel" onClick={resetAndClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomPersonaModal;
