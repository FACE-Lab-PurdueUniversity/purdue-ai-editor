-- Repoint messages.code_context_id from the mutable `code` table to the
-- immutable `code_snapshots` table.
--
-- Why: when code is attached to a chat message we snapshot it at send time.
-- Previously code_context_id referenced code(id) (a row whose content keeps
-- changing via live edits), so two messages with different attached code ended
-- up pointing at the same code row. Linking to code_snapshots(id) captures the
-- exact code as it was when the message was sent.
--
-- Run this in the Supabase SQL editor.
update public.messages
set code_context_id = null
where code_context_id is not null;

alter table public.messages
  drop constraint if exists messages_code_context_id_fkey;

alter table public.messages
  add constraint messages_code_context_id_fkey
  foreign key (code_context_id)
  references public.code_snapshots (id)
  on update cascade
  on delete set null;
