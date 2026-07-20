-- Add persona support to conversations.
--
-- Why: conversations can now be either a regular chat (unchanged behavior),
-- one of the three fixed presets (Nora/Devon/Marcus, `preset:<id>`), or a
-- student-authored custom persona (`custom`), whose extracted priming text
-- is stored on the conversation itself in persona_prompt. Both columns are
-- nullable so every existing conversation is unaffected: NULL persona_type
-- is treated as a regular chat by the application.
--
-- Run this in the Supabase SQL editor.
alter table public.conversations
  add column if not exists persona_type text,
  add column if not exists persona_prompt text;
