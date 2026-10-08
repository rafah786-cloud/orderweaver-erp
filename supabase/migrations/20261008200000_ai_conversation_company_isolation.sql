-- Mattress Maestro: company-isolated AI conversation history.
-- Existing legacy conversations are intentionally not assigned to a company.
-- They become inaccessible through normal RLS until explicitly re-created/reattributed;
-- this avoids guessing historical tenant ownership.

alter table public.ai_conversations
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

create index if not exists ai_conversations_company_user_idx
  on public.ai_conversations(company_id, user_id, updated_at desc);

drop policy if exists "Users manage their own AI conversations" on public.ai_conversations;
create policy "Users manage own AI conversations in active company"
  on public.ai_conversations for all to authenticated
  using (
    user_id = auth.uid()
    and company_id = public.current_company_id()
    and public.has_company_access(company_id)
  )
  with check (
    user_id = auth.uid()
    and company_id = public.current_company_id()
    and public.has_company_access(company_id)
  );

drop policy if exists "Users manage their own AI messages" on public.ai_messages;
create policy "Users manage own AI messages in active company"
  on public.ai_messages for all to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = auth.uid()
        and c.company_id = public.current_company_id()
        and public.has_company_access(c.company_id)
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = auth.uid()
        and c.company_id = public.current_company_id()
        and public.has_company_access(c.company_id)
    )
  );

comment on column public.ai_conversations.company_id is
  'Tenant attribution for AI history. Null legacy rows are deliberately not auto-attributed because historical company ownership cannot be safely inferred.';
