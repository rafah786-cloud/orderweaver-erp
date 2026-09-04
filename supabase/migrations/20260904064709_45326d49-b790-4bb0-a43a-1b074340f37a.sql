CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============ ai_documents ============
CREATE TABLE public.ai_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  doc_kind text NOT NULL DEFAULT 'other',
  file_name text,
  mime_type text,
  storage_path text,
  content_text text,
  extraction jsonb,
  extraction_status text NOT NULL DEFAULT 'pending',
  extraction_error text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  quotation_group text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_documents_kind_idx ON public.ai_documents (doc_kind, created_at DESC);
CREATE INDEX ai_documents_supplier_idx ON public.ai_documents (supplier_id);
CREATE INDEX ai_documents_group_idx ON public.ai_documents (quotation_group);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_documents TO authenticated;
GRANT ALL ON public.ai_documents TO service_role;
ALTER TABLE public.ai_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved staff can read AI documents"
  ON public.ai_documents FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "Operational roles can write AI documents"
  ON public.ai_documents FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'production')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'production')
  );

CREATE TRIGGER ai_documents_touch BEFORE UPDATE ON public.ai_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ai_document_chunks ============
CREATE TABLE public.ai_document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.ai_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding extensions.vector(1024),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX ai_document_chunks_doc_idx ON public.ai_document_chunks (document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_document_chunks TO authenticated;
GRANT ALL ON public.ai_document_chunks TO service_role;
ALTER TABLE public.ai_document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved staff can read AI document chunks"
  ON public.ai_document_chunks FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "Operational roles can write AI document chunks"
  ON public.ai_document_chunks FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'production')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'production')
  );

-- semantic search helper
CREATE OR REPLACE FUNCTION public.match_ai_document_chunks(
  _embedding extensions.vector(1024),
  _match_count integer DEFAULT 8,
  _supplier_id uuid DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  title text,
  doc_kind text,
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT c.id, d.id, d.title, d.doc_kind, c.content,
         1 - (c.embedding OPERATOR(extensions.<=>) _embedding) AS similarity
  FROM public.ai_document_chunks c
  JOIN public.ai_documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
    AND (_supplier_id IS NULL OR d.supplier_id = _supplier_id)
  ORDER BY c.embedding OPERATOR(extensions.<=>) _embedding
  LIMIT GREATEST(1, LEAST(_match_count, 50));
$$;
REVOKE EXECUTE ON FUNCTION public.match_ai_document_chunks(extensions.vector, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_ai_document_chunks(extensions.vector, integer, uuid) TO authenticated, service_role;

-- ============ ai_insights ============
CREATE TABLE public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  scope_key text NOT NULL DEFAULT 'global',
  payload jsonb NOT NULL,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid,
  UNIQUE (kind, scope_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insights TO authenticated;
GRANT ALL ON public.ai_insights TO service_role;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved staff can read AI insights"
  ON public.ai_insights FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "Admins and accountants manage AI insights"
  ON public.ai_insights FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

-- ============ ai_conversations / ai_messages ============
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own AI conversations"
  ON public.ai_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER ai_conversations_touch BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conv_idx ON public.ai_messages (conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own AI messages"
  ON public.ai_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ ai_proposals ============
CREATE TABLE public.ai_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL,
  source_document_id uuid REFERENCES public.ai_documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  applied_table text,
  applied_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_proposals_status_idx ON public.ai_proposals (status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_proposals TO authenticated;
GRANT ALL ON public.ai_proposals TO service_role;
ALTER TABLE public.ai_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage AI proposals"
  ON public.ai_proposals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Creators can read their AI proposals"
  ON public.ai_proposals FOR SELECT TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY "Creators can raise AI proposals"
  ON public.ai_proposals FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_approved(auth.uid()));
CREATE TRIGGER ai_proposals_touch BEFORE UPDATE ON public.ai_proposals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ai_audit_log ============
CREATE TABLE public.ai_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  feature text NOT NULL,
  action text NOT NULL DEFAULT 'analyze',
  model text,
  prompt_summary text,
  status text NOT NULL DEFAULT 'ok',
  error text,
  duration_ms integer,
  ref_table text,
  ref_id uuid,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_audit_log_created_idx ON public.ai_audit_log (created_at DESC);
GRANT SELECT, INSERT ON public.ai_audit_log TO authenticated;
GRANT ALL ON public.ai_audit_log TO service_role;
ALTER TABLE public.ai_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read the AI audit log"
  ON public.ai_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Signed-in users can append to the AI audit log"
  ON public.ai_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);