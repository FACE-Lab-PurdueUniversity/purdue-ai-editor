/**
 * Budget Error Modal Component
 * Displays budget exceeded messages
 */

import { useEffect } from 'react';
import './ModalBase.css';
import './BudgetErrorModal.css';

const BudgetErrorModal = ({ visible, onClose, accessLevel, premiumModels = [], nonPremiumModels = [] }) => {
  useEffect(() => {
    if (!visible) return;
  }, [visible]);

  if (!visible) return null;

  const isCamps = accessLevel === 'camps' || accessLevel === 'en1';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="budget-error-modal-header">
          <h2>Daily LLM Usage Limit Reached</h2>
        </div>
        <div className="budget-error-modal-body">
          {isCamps ? (
            <>
              <p className="budget-error-message">
                Every message sent to a Large Language Model (LLM) uses power and water. To ensure everyone is using these resources respectfully, there is a daily usage limit for premium models.
              </p>
              <div className="budget-error-suggestion-block">
                <p className="budget-error-suggestion">
                  <strong>{nonPremiumModels.length > 1 ? 'Please use one of these non-premium models:' : 'Please use the non-premium model:'}</strong>
                </p>
                <ul className="budget-error-model-list">
                  {nonPremiumModels.map((model) => (
                    <li key={model}>{model}</li>
                  ))}
                </ul>
              </div>
              <p className="budget-error-info">
                You can use premium models again at midnight Eastern Time.
              </p>
            </>
          ) : (
            <>
              <p className="budget-error-message">
              Every message sent to a Large Language Model (LLM) uses power and water. To ensure everyone is using these resources respectfully, there is a daily usage limit.
              </p>
              <p className="budget-error-info">
                You can use LLMs again at midnight Eastern Time.
              </p>
            </>
          )}
        </div>
        <div className="budget-error-modal-footer">
          <button className="modal-close-button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default BudgetErrorModal;

