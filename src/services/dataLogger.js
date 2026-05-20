/**
 * Data Logger Service
 * Handles logging and retrieving session-related data from Supabase
 * Ported from Python DataLogger class
 */

import { supabase } from './supabase';
import {
  TABLES,
  messageInsertSchema,
  interactionInsertSchema,
  consoleInsertSchema,
  sessionUpdateSchema,
  messageUpdateSchema,
  validate,
} from './dbSchemas';

/**
 * Log a chat message (system, user, or assistant)
 */
export const logMessage = async (messageData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !messageData.conversation_id) {
      console.error('Cannot log message without user and conversation ID');
      return null;
    }

    const payload = {
      ...messageData,
      user_id: user.id,
    };

    // Validate payload against schema
    const validation = validate(messageInsertSchema, payload);
    if (!validation.success) {
      console.error('Message validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.MESSAGES)
      .insert(validation.data)
      .select()
      .single();

    if (error) {
      console.error('Error logging message:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in logMessage:', error);
    return null;
  }
};

/**
 * Log a user interaction (button press, etc.)
 */
export const logInteraction = async (buttonName, sessionId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !sessionId) {
      console.error('Cannot log interaction without user and session ID');
      return null;
    }

    const payload = {
      user_id: user.id,
      session_id: sessionId,
      button_name: buttonName,
    };

    // Validate payload against schema
    const validation = validate(interactionInsertSchema, payload);
    if (!validation.success) {
      console.error('Interaction validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.INTERACTIONS)
      .insert(validation.data)
      .select()
      .single();

    if (error) {
      console.error('Error logging interaction:', error);
      return null;
    }

    console.log(`✅ Logged interaction: '${buttonName}'`);
    return data;
  } catch (error) {
    console.error('Error in logInteraction:', error);
    return null;
  }
};

/**
 * Log console output and optionally update session's current_console_id
 */
export const logConsole = async (consoleContent, sessionId, saveSource) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !sessionId) {
      console.error('Cannot log console without user and session ID');
      return null;
    }

    const payload = {
      user_id: user.id,
      session_id: sessionId,
      content: consoleContent,
      save_source: saveSource,
    };

    // Validate payload against schema
    const validation = validate(consoleInsertSchema, payload);
    if (!validation.success) {
      console.error('Console validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.CONSOLE)
      .insert(validation.data)
      .select()
      .single();

    if (error) {
      console.error('Error logging console:', error);
      return null;
    }

    const newConsoleId = data.id;

    // Update session pointer if not a context log
    if (saveSource !== 'chat_context') {
      const updatePayload = {
        current_console_id: newConsoleId,
        last_updated: new Date().toISOString(),
      };

      // Validate update payload
      const updateValidation = validate(sessionUpdateSchema, updatePayload);
      if (!updateValidation.success) {
        console.error('Session update validation failed:', updateValidation.error.issues);
      } else {
        const { error: updateError } = await supabase
          .from(TABLES.SESSIONS)
          .update(updateValidation.data)
          .eq('id', sessionId);

        if (updateError) {
          console.error('Error updating session console pointer:', updateError);
        } else {
          console.log(`✅ Console saved (source: ${saveSource}) and session ${sessionId} updated`);
        }
      }
    }

    return newConsoleId;
  } catch (error) {
    console.error('Error in logConsole:', error);
    return null;
  }
};

/**
 * Get conversation history for a specific conversation ID
 */
export const getConversationHistory = async (conversationId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('No authenticated user');
      return [];
    }

    const { data, error } = await supabase
      .from(TABLES.MESSAGES)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching conversation history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getConversationHistory:', error);
    return [];
  }
};

/**
 * Get latest code for a session
 */
export const getLatestCode = async (sessionId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('No authenticated user');
      return null;
    }

    // First get the session to find current_code_id
    const { data: sessionData, error: sessionError } = await supabase
      .from(TABLES.SESSIONS)
      .select('current_code_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !sessionData || !sessionData.current_code_id) {
      console.log(`No code associated with session ${sessionId}`);
      return null;
    }

    // Now get the code content
    const { data: codeData, error: codeError } = await supabase
      .from(TABLES.CODE)
      .select('content')
      .eq('id', sessionData.current_code_id)
      .single();

    if (codeError || !codeData) {
      console.error('Error fetching code:', codeError);
      return null;
    }

    return codeData.content;
  } catch (error) {
    console.error('Error in getLatestCode:', error);
    return null;
  }
};

/**
 * Get latest console for a session
 */
export const getLatestConsole = async (sessionId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('No authenticated user');
      return null;
    }

    // First get the session to find current_console_id
    const { data: sessionData, error: sessionError } = await supabase
      .from(TABLES.SESSIONS)
      .select('current_console_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !sessionData || !sessionData.current_console_id) {
      console.log(`No console associated with session ${sessionId}`);
      return null;
    }

    // Now get the console content
    const { data: consoleData, error: consoleError } = await supabase
      .from(TABLES.CONSOLE)
      .select('content')
      .eq('id', sessionData.current_console_id)
      .single();

    if (consoleError || !consoleData) {
      console.error('Error fetching console:', consoleError);
      return null;
    }

    return consoleData.content;
  } catch (error) {
    console.error('Error in getLatestConsole:', error);
    return null;
  }
};

/**
 * Update session loaded timestamps
 */
export const updateSessionOnLoad = async (sessionId) => {
  try {
    // Read existing timestamps
    const { data: sessionData, error: readError } = await supabase
      .from(TABLES.SESSIONS)
      .select('loaded_timestamps')
      .eq('id', sessionId)
      .single();

    if (readError || !sessionData) {
      console.error('Could not find session to update timestamps');
      return;
    }

    // Add new timestamp to array
    const existingTimestamps = sessionData.loaded_timestamps || [];
    const newTimestamp = new Date().toISOString();
    existingTimestamps.push(newTimestamp);

    const updatePayload = {
      loaded_timestamps: existingTimestamps,
      last_updated: newTimestamp,
    };

    // Validate update payload
    const validation = validate(sessionUpdateSchema, updatePayload);
    if (!validation.success) {
      console.error('Session update validation failed:', validation.error.issues);
      return;
    }

    // Write back
    const { error: updateError } = await supabase
      .from(TABLES.SESSIONS)
      .update(validation.data)
      .eq('id', sessionId);

    if (updateError) {
      console.error('Failed to update session timestamps:', updateError);
    } else {
      console.log(`✅ Updated timestamps for session ${sessionId}`);
    }
  } catch (error) {
    console.error('Error in updateSessionOnLoad:', error);
  }
};
