/**
 * Chat Panel Component
 * Handles AI chat with streaming, markdown rendering, and code snippets
 */

import { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useSession } from '../contexts/SessionContext';
import { logMessage, logConsole } from '../services/dataLogger';
import { streamChatCompletionWithBudget } from '../utils/chatStream';
import { getUserAccessLevel, getDailyBudgetUsage } from '../services/aiUsage';
import { fetchModelMetadata, pickInitialModel } from '../services/aiModels';
import { 
  LEVEL_INSTRUCTION_PREFIX,
  beginnerPrompt,
  intermediatePrompt,
  experiencedPrompt,
} from '../prompts/codingLevels';
import CodeModal from './CodeModal';
import ConsoleModal from './ConsoleModal';
import BudgetErrorModal from './BudgetErrorModal';
import ChatConfiguration from './ChatConfiguration';
import ChatTabs from './ChatTabs';
import './ChatPanel.css';

// Configure marked for better markdown rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

const EMPTY_MODEL_METADATA = {
  rows: [],
  allModels: [],
  modelsByProvider: {},
  streamableByModel: {},
  unlimitedByModel: {},
  defaultModels: [],
  premiumModels: [],
  nonPremiumModels: [],
};

const ChatPanel = ({ onReplaceCode, getCodeContent, getConsoleContent }) => {
  const { 
    activeSession, 
    conversationHistory, 
    conversations,
    currentConversationId,
    getSystemPriming,
    switchConversation,
    createNewConversation,
    updateConversationName,
    createSnapshot,
  } = useSession();
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [codingLevel, setCodingLevel] = useState('beginner');
  const [modelMetadata, setModelMetadata] = useState(EMPTY_MODEL_METADATA);
  const [selectedModel, setSelectedModel] = useState('');
  const [dailyUsagePercentage, setDailyUsagePercentage] = useState(0);
  const [dailyUsageLoading, setDailyUsageLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState(null);
  const [attachedContext, setAttachedContext] = useState({ includeCode: false, includeConsole: false });
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [currentCodeSnippet, setCurrentCodeSnippet] = useState({ code: '', lang: '' });
  const [consoleModalOpen, setConsoleModalOpen] = useState(false);
  const [currentConsoleContent, setCurrentConsoleContent] = useState('');
  const [consoleHasContent, setConsoleHasContent] = useState(false);
  const [budgetErrorVisible, setBudgetErrorVisible] = useState(false);
  const [userAccessLevel, setUserAccessLevel] = useState('standard');

  const selectedModelStreaming = modelMetadata.streamableByModel[selectedModel] ?? false;

  const chatBodyRef = useRef(null);
  const streamingMessageRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const currentConversationIdRef = useRef(currentConversationId);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  // Load conversation history from session
  useEffect(() => {
    if (conversationHistory && conversationHistory.length > 0) {
      // Filter out system messages for display
      const displayMessages = conversationHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role === 'user' ? 'user' : 'bot',
          content: msg.content,
          messageId: msg.id,
        }));
      setMessages(displayMessages);
      
    } else {
      setMessages([]);
    }
  }, [conversationHistory]);

  // Scroll to bottom when messages change, but only if the user is already near the bottom
  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  // Track whether the user is scrolled near the bottom so we know whether to auto-scroll
  const handleChatScroll = () => {
    const el = chatBodyRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 50;
  };

  // Check console content availability
  useEffect(() => {
    const checkConsole = async () => {
      if (getConsoleContent) {
        const content = await getConsoleContent();
        setConsoleHasContent(content && content.trim().length > 0);
      }
    };
    checkConsole();
  }, [getConsoleContent]);

  // Fetch user access level
  useEffect(() => {
    const fetchAccessLevel = async () => {
      try {
        const level = await getUserAccessLevel();
        setUserAccessLevel(level);
      } catch (err) {
        console.error('Error fetching access level:', err);
      }
    };
    fetchAccessLevel();
  }, []);

  // Fetch model metadata from database
  useEffect(() => {
    const loadModelMetadata = async () => {
      try {
        const metadata = await fetchModelMetadata();
        setModelMetadata(metadata);
      } catch (error) {
        console.error('Unable to load AI model metadata:', error);
        setModelMetadata(EMPTY_MODEL_METADATA);
      }
    };
    loadModelMetadata();
  }, []);

  // Keep selected model valid as available models change
  useEffect(() => {
    const allModels = modelMetadata.allModels || [];
    if (!selectedModel && allModels.length > 0) {
      setSelectedModel(pickInitialModel(modelMetadata));
      return;
    }
    if (selectedModel && !allModels.includes(selectedModel)) {
      setSelectedModel(pickInitialModel(modelMetadata));
    }
  }, [modelMetadata, selectedModel]);

  const refreshDailyUsage = async () => {
    if (!userAccessLevel) return;

    setDailyUsageLoading(true);
    try {
      const usage = await getDailyBudgetUsage(userAccessLevel);
      setDailyUsagePercentage(usage.percentage);
    } catch (error) {
      console.error('Error fetching daily usage percentage:', error);
      setDailyUsagePercentage(0);
    } finally {
      setDailyUsageLoading(false);
    }
  };

  useEffect(() => {
    refreshDailyUsage();
  }, [userAccessLevel]);

  const scrollToBottom = () => {
    if (chatBodyRef.current) {
      requestAnimationFrame(() => {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      });
    }
  };

  const getLevelPrompt = (level) => {
    switch (level) {
      case 'beginner':
        return beginnerPrompt;
      case 'intermediate':
        return intermediatePrompt;
      case 'experienced':
        return experiencedPrompt;
      default:
        return beginnerPrompt;
    }
  };

  /**
   * Extract Python code snippets from message content
   * Returns array of { code, key } objects
   * @param {string} content - The message content
   * @param {string} messageId - The database message ID (used for consistent keys)
   */
  const extractPythonSnippets = (content, messageId) => {
    const snippets = [];
    
    // Split by console blocks first (4 backticks)
    const consoleSegments = content.split(/````([\s\S]*?)````/g);
    
    consoleSegments.forEach((consoleSeg, consoleIdx) => {
      if (consoleIdx % 2 === 0) {
        // Not a console block, check for code blocks (3 backticks)
        const codeBlocks = consoleSeg.split(/```([\s\S]*?)```/g);
        
        for (let i = 1; i < codeBlocks.length; i += 2) {
          const block = codeBlocks[i];
          let codeText = block;
          let lang = '';
          
          const firstNL = block.indexOf('\n');
          if (firstNL !== -1) {
            const firstLine = block.slice(0, firstNL).trim();
            if (/^[a-zA-Z0-9+#-]+$/.test(firstLine)) {
              lang = firstLine;
              codeText = block.slice(firstNL + 1);
            }
          }
          
          const isPython = lang === 'python' || lang === 'py';
          if (isPython && codeText.trim()) {
            // Use messageId and match the rendering key format
            const key = `msg-${messageId}-${consoleIdx}-${i}`;
            snippets.push({ code: codeText, key });
          }
        }
      }
    });
    
    return snippets;
  };

  const handleSendMessage = async () => {
    if (!activeSession) {
      alert('No active session. Please select or create a session first.');
      return;
    }
    if (!selectedModel) {
      alert('No AI model is available right now. Please try again in a moment.');
      return;
    }

    let text = inputText.trim();
    if (!text && !attachedContext.includeCode && !attachedContext.includeConsole) {
      return;
    }

    // Fetch context at send time
    let codeContextId = null;
    const finalContext = { code: null, console: null };
    if (attachedContext.includeCode && getCodeContent) {
      finalContext.code = await getCodeContent();
      // Create snapshot when code is added to AI context
      codeContextId = await createSnapshot('chat_context');
    }
    if (attachedContext.includeConsole && getConsoleContent) {
      finalContext.console = await getConsoleContent();
    }

    // Build display message with wrapped code and console
    if (finalContext.code) {
      text += '\n```python\n' + finalContext.code + '\n```';
    }
    if (finalContext.console) {
      text += '\n````\n' + finalContext.console + '\n````';
    }

    // Add user message to UI — always scroll to bottom on send
    stickToBottomRef.current = true;
    if (text.trim()) {
      setMessages(prev => [...prev, { role: 'user', content: text }]);
    }

    setInputText('');
    setAttachedContext({ includeCode: false, includeConsole: false });

    // Log context to database
    const sessionId = activeSession.id;
    const conversationId = currentConversationId;
    let consoleContextId = null;

    if (finalContext.console && finalContext.console.trim()) {
      consoleContextId = await logConsole(finalContext.console, sessionId, 'chat_context');
    }

    // Log user message
    if (text) {
      await logMessage({
        conversation_id: conversationId,
        role: 'user',
        content: text,
        coding_level: codingLevel,
        code_context_id: codeContextId,
        console_context_id: consoleContextId,
      });
    }

    // Build conversation for AI
    const conversation = [];
    
    // Add system priming
    conversation.push({
      role: 'system',
      content: getSystemPriming(),
    });

    // Add coding level instructions
    const levelInstructions = getLevelPrompt(codingLevel);
    if (levelInstructions) {
      conversation.push({
        role: 'system',
        content: `${LEVEL_INSTRUCTION_PREFIX}\n\n${levelInstructions}`,
      });
    }

    // Add conversation history
    messages.forEach(msg => {
      conversation.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    });

    // Build context string
    let contextStr = '';
    if (finalContext.code && finalContext.code.trim()) {
      contextStr += `The user has provided the following code for context:\n--- START OF CODE ---\n${finalContext.code}\n--- END OF CODE ---\n\n`;
    }
    if (finalContext.console && finalContext.console.trim()) {
      contextStr += `The user has provided the following console output for context:\n--- START OF CONSOLE OUTPUT ---\n${finalContext.console}\n--- END OF CONSOLE OUTPUT ---\n\n`;
    }

    const userPrompt = text || 'Please analyze the provided context.';
    const fullPrompt = `${contextStr}User question: ${userPrompt}`;

    conversation.push({
      role: 'user',
      content: fullPrompt,
    });

    // Stream response
    setIsStreaming(true);
    setStreamingConversationId(conversationId);
    streamingMessageRef.current = '';
    let isFirstChunk = true;

    try {
      let fullResponse = '';
      let budgetStatus = null;
      let usageData = null;

      // Determine which model to use
      const actualModel = selectedModel;

      for await (const event of streamChatCompletionWithBudget(conversation, actualModel)) {
        if (event.type === 'content') {
          fullResponse += event.content;
          streamingMessageRef.current = fullResponse;

          // Skip UI updates if the user has switched to a different conversation tab
          if (currentConversationIdRef.current !== conversationId) {
            continue;
          }

          if (isFirstChunk) {
            // Add bot message only when first chunk arrives
            isFirstChunk = false;
            setMessages(prev => [...prev, { role: 'bot', content: fullResponse, streaming: true }]);
          } else {
            // Update last message
            setMessages(prev => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                role: 'bot',
                content: fullResponse,
                streaming: true,
              };
              return newMessages;
            });
          }
        } else if (event.type === 'usage_logged') {
          // Capture usage data from the usage_logged event
          usageData = event.usage;
        } else if (event.type === 'budget_status') {
          // Legacy support for budget_status events
          budgetStatus = event;
          usageData = event.usage;
        }
      }

      // Finalize message (only if user is still on the originating tab)
      if (currentConversationIdRef.current === conversationId) {
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: 'bot',
            content: fullResponse,
            streaming: false,
          };
          return newMessages;
        });
      }

      // Log assistant message first to get the message ID
      const loggedMessage = await logMessage({
        conversation_id: conversationId,
        role: 'assistant',
        content: fullResponse,
        coding_level: codingLevel,
        ai_model: actualModel,
        prompt_tokens: usageData?.input_tokens || 0,
        completion_tokens: usageData?.output_tokens || 0,
      });

      // Check budget status and show modal if budget exceeded
      if (budgetStatus && !budgetStatus.has_budget) {
        setBudgetErrorVisible(true);
      }

    } catch (error) {
      console.error('Streaming error:', error);
      
      // Check if this is a budget error
      const isBudgetError = error.message && error.message.includes('exceeded their budget');
      
      if (isBudgetError) {
        // Show budget error modal, don't add any bot message
        setBudgetErrorVisible(true);
      } else {
        // For other errors, show error message only if we started streaming
        // and the user is still on the originating tab
        if (!isFirstChunk && currentConversationIdRef.current === conversationId) {
          // We added a bot message, update it with the error
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              role: 'bot',
              content: `Error: ${error.message}`,
              streaming: false,
            };
            return newMessages;
          });
        }
        // If we didn't start streaming yet, don't add any error message
      }
    } finally {
      setIsStreaming(false);
      setStreamingConversationId(null);
      streamingMessageRef.current = null;
      await refreshDailyUsage();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter: allow default (newline)
      } else {
        // Enter: send message
        e.preventDefault();
        handleSendMessage();
      }
    }
  };

  const openCodeModal = (code, lang) => {
    setCurrentCodeSnippet({ code, lang });
    setCodeModalOpen(true);
  };

  const closeCodeModal = () => {
    setCodeModalOpen(false);
    setCurrentCodeSnippet({ code: '', lang: '' });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentCodeSnippet.code);
    closeCodeModal();
  };

  const handleReplaceCode = () => {
    if (onReplaceCode) {
      onReplaceCode(currentCodeSnippet.code);
    }
    closeCodeModal();
  };

  const openConsoleModal = (consoleContent) => {
    setCurrentConsoleContent(consoleContent);
    setConsoleModalOpen(true);
  };

  const closeConsoleModal = () => {
    setConsoleModalOpen(false);
    setCurrentConsoleContent('');
  };

  const handleCopyConsole = () => {
    navigator.clipboard.writeText(currentConsoleContent);
    closeConsoleModal();
  };

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const label = isUser ? 'User' : message.role === 'system' ? 'System' : 'AI Bot';
    const color = isUser ? '#fbe2d7' : message.role === 'system' ? '#d7e4fb' : '#d8f6d8';
    const align = isUser ? 'align-right' : 'align-left';

    // Use messageId from database for consistent keys, fallback to index for display
    const messageKey = message.messageId || index;

    // First split by console blocks (4 backticks)
    const consoleSegments = message.content.split(/````([\s\S]*?)````/g);

    return (
      <div key={index} className={`chat-msg-wrap ${align}`}>
        <div className="chat-label">{label}</div>
        <div className="chat-bubble" style={{ backgroundColor: color }}>
          {consoleSegments.map((consoleSeg, consoleIdx) => {
            if (consoleIdx % 2 === 1) {
              // This is a console block
              const consoleText = consoleSeg.trim();
              return (
                <button
                  key={consoleIdx}
                  className="console-btn"
                  onClick={() => openConsoleModal(consoleText)}
                >
                  VIEW ATTACHED CONSOLE LOG
                </button>
              );
            } else {
              // Not a console block, check for code blocks (3 backticks)
              const codeSegments = consoleSeg.split(/```([\s\S]*?)```/g);
              
              return codeSegments.map((codeSeg, codeIdx) => {
                if (codeIdx % 2 === 0) {
                  // Markdown text
                  if (codeSeg.trim()) {
                    const html = DOMPurify.sanitize(marked.parse(codeSeg, { async: false }));
                    return (
                      <div 
                        key={`${consoleIdx}-${codeIdx}`} 
                        className="markdown-content"
                        dangerouslySetInnerHTML={{ __html: html }} 
                      />
                    );
                  }
                } else {
                  // Code block
                  let codeText = codeSeg;
                  let lang = '';
                  const firstNL = codeSeg.indexOf('\n');
                  if (firstNL !== -1) {
                    const firstLine = codeSeg.slice(0, firstNL).trim();
                    if (/^[a-zA-Z0-9+#-]+$/.test(firstLine)) {
                      lang = firstLine;
                      codeText = codeSeg.slice(firstNL + 1);
                    }
                  }

                  // Create unique key for this code snippet using messageId from database
                  const codeKey = `msg-${messageKey}-${consoleIdx}-${codeIdx}`;
                  
                  // Check if this is Python code from a bot message
                  const isPython = lang === 'python' || lang === 'py';
                  const isBot = !isUser && message.role !== 'system';
                  
                  return (
                    <div key={`${consoleIdx}-${codeIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <button
                        className="code-btn"
                        onClick={() => openCodeModal(codeText, lang)}
                      >
                        VIEW CODE SNIPPET
                      </button>
                    </div>
                  );
                }
                return null;
              });
            }
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="chat-panel">
      <ChatConfiguration
        codingLevel={codingLevel}
        onCodingLevelChange={setCodingLevel}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        modelsByProvider={modelMetadata.modelsByProvider}
        streamableByModel={modelMetadata.streamableByModel}
        selectedModelStreaming={selectedModelStreaming}
        dailyUsagePercentage={dailyUsagePercentage}
        dailyUsageLoading={dailyUsageLoading}
      />

      {activeSession && conversations.length > 0 && (
        <ChatTabs
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSwitchConversation={switchConversation}
          onCreateConversation={createNewConversation}
          onRenameConversation={updateConversationName}
        />
      )}

      <div className="chat-body" ref={chatBodyRef} onScroll={handleChatScroll}>
        <div className="chat-disclaimer">
          All activity is stored and may be reviewed by course staff.
        </div>
        {messages.map((msg, idx) => renderMessage(msg, idx))}
        {isStreaming && streamingConversationId === currentConversationId && (
          <div className="chat-spinner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="loader"></div>
            {!selectedModelStreaming && (
              <div style={{ marginTop: '10px', fontSize: '0.9em', color: '#666' }}>
                Waiting for full response from {selectedModel}...
              </div>
            )}
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <div className="chat-context-controls">
          <button
            type="button"
            className={`context-checkbox-btn ${attachedContext.includeCode ? 'context-checkbox-btn--active' : ''}`}
            onClick={() => setAttachedContext(prev => ({ ...prev, includeCode: !prev.includeCode }))}
          >
            <span className="context-checkbox-btn__box">{attachedContext.includeCode ? '✓' : ''}</span>
            <span className="context-checkbox-btn__label">Add Code to Chat</span>
          </button>
          <button
            type="button"
            className={`context-checkbox-btn ${attachedContext.includeConsole ? 'context-checkbox-btn--active' : ''}`}
            onClick={() => setAttachedContext(prev => ({ ...prev, includeConsole: !prev.includeConsole }))}
            disabled={!consoleHasContent}
          >
            <span className="context-checkbox-btn__box">{attachedContext.includeConsole ? '✓' : ''}</span>
            <span className="context-checkbox-btn__label">Add Console to Chat</span>
          </button>
        </div>

        <div className="chat-input-row">
          <textarea
            id="chat-input"
            rows="2"
            placeholder="Type your message…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <button id="chat-send" onClick={handleSendMessage} disabled={isStreaming}>
            SEND
          </button>
        </div>
      </div>

      {/* Code Modal */}
      <CodeModal
        isOpen={codeModalOpen}
        code={currentCodeSnippet.code}
        lang={currentCodeSnippet.lang}
        onClose={closeCodeModal}
        onCopy={handleCopyCode}
        onReplace={handleReplaceCode}
      />

      {/* Console Modal */}
      <ConsoleModal
        isOpen={consoleModalOpen}
        consoleContent={currentConsoleContent}
        onClose={closeConsoleModal}
        onCopy={handleCopyConsole}
      />

      {/* Budget Error Modal */}
      <BudgetErrorModal
        visible={budgetErrorVisible}
        onClose={() => setBudgetErrorVisible(false)}
        accessLevel={userAccessLevel}
        premiumModels={modelMetadata.premiumModels}
        nonPremiumModels={modelMetadata.nonPremiumModels}
      />

    </div>
  );
};

export default ChatPanel;

