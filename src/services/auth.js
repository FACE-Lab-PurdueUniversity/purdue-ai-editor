/**
 * Authentication Service
 * Handles email/password authentication and session management
 */

import { supabase } from './supabase';

const CAMPS_EMAIL_DOMAINS = ['tufts.edu', 'purdue.edu'];

/**
 * Check if user is admin for UI gating.
 * Source of truth is JWT/app metadata role used by RLS policies.
 */
export const isAdmin = (userOrEmail) => {
  if (!userOrEmail) return false;

  if (typeof userOrEmail === 'object') {
    const role = userOrEmail.app_metadata?.role;
    if (role === 'admin') {
      return true;
    }
  }
};

/**
 * Determine access level based on email domain
 * @param {string} email - User's email address
 * @returns {string} - 'camps' or 'standard'
 */
export const getAccessLevelFromEmail = (email) => {
  if (!email) return 'standard';

  const lowerEmail = email.toLowerCase();

  for (const domain of CAMPS_EMAIL_DOMAINS) {
    if (lowerEmail.endsWith(`@${domain.toLowerCase()}`)) {
      return 'camps';
    }
  }

  return 'standard';
};

/**
 * Sign in with email and password
 */
export const signInWithPassword = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Password sign-in error:', error);
    throw error;
  }

  return data;
};

/**
 * Sign up with email and password
 */
export const signUpWithPassword = async (email, password) => {
  const accessLevel = getAccessLevelFromEmail(email);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        access_level: accessLevel,
      },
    },
  });

  if (error) {
    console.error('Password sign-up error:', error);
    throw error;
  }

  return data;
};

/**
 * Sign out current user
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};

/**
 * Get current session
 */
export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Get session error:', error);
    throw error;
  }
  return data.session;
};

/**
 * Get current user
 */
export const getUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Get user error:', error);
    throw error;
  }
  return data.user;
};

/**
 * Listen for auth state changes
 */
export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback);
};

/**
 * Check and set access level for users that signed up before access_level was tracked.
 * @param {Object} user - Optional user object (if already available from session)
 */
export const ensureAccessLevel = async (user = null) => {
  try {
    if (!user) {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getUser timeout')), 5000)
      );

      const getUserPromise = supabase.auth.getUser();

      const result = await Promise.race([getUserPromise, timeoutPromise]);
      user = result.data?.user;
    }

    if (!user) {
      return;
    }

    if (user.user_metadata?.access_level) {
      return;
    }

    const accessLevel = getAccessLevelFromEmail(user.email);

    console.log('Setting access level to:', accessLevel);

    const { error } = await supabase.auth.updateUser({
      data: {
        access_level: accessLevel,
      },
    });

    if (error) {
      console.error('Error setting access level:', error);
    } else {
      console.log(`Access level set to '${accessLevel}' for ${user.email}`);
    }
  } catch (error) {
    console.error('Error in ensureAccessLevel:', error);
    // Don't throw - we don't want to block auth flow
  }
};
