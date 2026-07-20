/**
 * New Chat Modal
 * Lets a student start a regular chat, talk to one of the fixed personas
 * (jumping to the existing conversation if that persona was already used
 * this session), or create their own custom persona.
 */

import { useSession } from '../contexts/SessionContext';
import { PRESET_PERSONAS, presetPersonaTypeFor } from '../prompts/personas';
import './ModalBase.css';
import './NewChatModal.css';

const NewChatModal = ({ isOpen, onClose, onOpenCustomPersona }) => {
  const { conversations, createNewConversation, switchConversation } = useSession();

  if (!isOpen) return null;

  const handleRegularChat = async () => {
    await createNewConversation();
    onClose();
  };

  const handlePreset = async (persona) => {
    const personaType = presetPersonaTypeFor(persona.id);
    const existing = conversations.find((c) => c.persona_type === personaType);
    if (existing) {
      await switchConversation(existing.id);
    } else {
      await createNewConversation({ name: persona.label, personaType });
    }
    onClose();
  };

  const handleCustomPersona = () => {
    onClose();
    onOpenCustomPersona();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content new-chat-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Start a New Chat</h2>
        <p className="new-chat-modal-subtitle">
          Choose a regular chat, talk to a persona, or create your own.
        </p>

        <div className="new-chat-option-list">
          <button type="button" className="new-chat-option" onClick={handleRegularChat}>
            <span className="new-chat-option-title">Regular Chat</span>
            <span className="new-chat-option-desc">Get coding help, same as usual.</span>
          </button>

          {PRESET_PERSONAS.map((persona) => {
            const personaType = presetPersonaTypeFor(persona.id);
            const existing = conversations.find((c) => c.persona_type === personaType);
            return (
              <button
                type="button"
                key={persona.id}
                className="new-chat-option"
                onClick={() => handlePreset(persona)}
              >
                <span className="new-chat-option-title">{persona.label}</span>
                <span className="new-chat-option-desc">
                  {existing ? 'Continue your existing conversation.' : persona.description}
                </span>
              </button>
            );
          })}

          <button type="button" className="new-chat-option" onClick={handleCustomPersona}>
            <span className="new-chat-option-title">Create Custom Persona</span>
            <span className="new-chat-option-desc">Make up your own character to talk to.</span>
          </button>
        </div>

        <button className="modal-close-button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default NewChatModal;
