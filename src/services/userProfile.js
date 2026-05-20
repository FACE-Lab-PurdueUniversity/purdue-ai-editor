/**
 * User Profile Service
 * Reads/writes per-user profile rows in `user_profiles`. The `students` column
 * holds the (newline-separated) names of the students in the camp group that
 * shares this account.
 */

import { supabase } from './supabase';
import { TABLES, userProfileUpsertSchema, validate } from './dbSchemas';

/**
 * Fetch the profile row for the current user. Returns null if no row exists
 * yet (PGRST116 = "no rows returned" from .single()), or on error.
 */
export const getUserProfile = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from(TABLES.USER_PROFILES)
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return data;
};

/**
 * Save the current user's student-group text. Tries UPDATE first (the steady
 * state after first login) and falls back to INSERT if no row exists yet.
 *
 * Why not upsert: column-level RLS grants UPDATE on `students` only. The
 * INSERT ... ON CONFLICT DO UPDATE that supabase-js generates for upsert
 * touches every column in the payload (including `email`), which the grant
 * forbids and Postgres rejects with `permission denied for table`.
 */
export const saveUserProfile = async ({ students }) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('No authenticated user');
    return null;
  }

  const studentsValue = students ?? null;

  const { data: updated, error: updateErr } = await supabase
    .from(TABLES.USER_PROFILES)
    .update({ students: studentsValue })
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (updateErr) {
    console.error('Error updating user profile:', updateErr);
    return null;
  }

  if (updated) return updated;

  const insertPayload = {
    user_id: user.id,
    email: user.email ?? null,
    students: studentsValue,
  };

  const result = validate(userProfileUpsertSchema, insertPayload);
  if (!result.success) {
    console.error('User profile validation failed:', result.error.issues);
    return null;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from(TABLES.USER_PROFILES)
    .insert(result.data)
    .select()
    .single();

  if (insertErr) {
    console.error('Error inserting user profile:', insertErr);
    return null;
  }

  return inserted;
};

/**
 * True when the profile is missing or has no students recorded yet.
 */
export const profileNeedsStudentGroup = (profile) => {
  if (!profile) return true;
  const s = profile.students;
  return !s || !s.trim();
};
