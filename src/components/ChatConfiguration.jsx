/**
 * Chat Configuration Component
 * Contains controls for coding level, AI model selection, and documentation attachment
 */

import './ChatConfiguration.css';

const ChatConfiguration = ({ 
  codingLevel, 
  onCodingLevelChange,
  selectedModel,
  onModelChange,
  attachDocumentation,
  onAttachDocumentationChange,
  modelsByProvider,
  streamableByModel,
  selectedModelStreaming,
  dailyUsagePercentage,
  dailyUsageLoading,
}) => {
  const usagePercent = Number.isFinite(dailyUsagePercentage) ? Math.max(0, Math.min(100, Math.round(dailyUsagePercentage))) : 0;
  
  return (
    <div className="chat-configuration">
      <div className="config-left">
        <label htmlFor="coding-level-selector">Coding Level:</label>
        <select
          id="coding-level-selector"
          className="chat-level-selector"
          value={codingLevel}
          onChange={(e) => onCodingLevelChange(e.target.value)}
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="experienced">Experienced</option>
        </select>

        <label htmlFor="model-selector" style={{ marginLeft: '15px' }}>AI Model:</label>
        <select
          id="model-selector"
          className="chat-level-selector"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
        >
          {Object.entries(modelsByProvider || {}).map(([provider, models]) => (
            <optgroup key={provider} label={provider.toUpperCase()}>
              {models.map((model) => {
                return (
                  <option key={model} value={model}>
                    {model}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
        <div className="llm-usage-indicator">
          <div
            className="llm-usage-ring"
            style={{ '--usage-percent': usagePercent }}
            aria-label={`${usagePercent}% of LLM limit used`}
            role="img"
          >
          </div>
          <div className="llm-usage-text">
            {usagePercent}% of LLM limit used today
            <span className="usage-tooltip">
              <span className="usage-tooltip-icon">ℹ️</span>
              <span className="usage-tooltip-text">
                Using Large Language Models (LLMs) requires power and water. 
                Different models use power and water at different rates. 
                To ensure everyone is using these resources respectfully, 
                there is a daily usage limit for higher-usage models. 
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatConfiguration;

