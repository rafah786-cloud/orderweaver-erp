DROP FUNCTION IF EXISTS public.match_ai_document_chunks(extensions.vector, integer, uuid);

DELETE FROM public.ai_document_chunks WHERE embedding IS NOT NULL;

ALTER TABLE public.ai_document_chunks
  ALTER COLUMN embedding TYPE extensions.vector(2048) USING NULL;

CREATE OR REPLACE FUNCTION public.match_ai_document_chunks(
  _embedding extensions.vector(2048),
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