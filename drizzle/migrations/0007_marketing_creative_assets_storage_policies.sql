-- Private generated-asset storage. Paths are company UUID / creative UUID.

DROP POLICY IF EXISTS marketing_creative_assets_read ON storage.objects;
CREATE POLICY marketing_creative_assets_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'marketing-creatives'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
  AND public.is_approved(auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_company_access a
    WHERE a.user_id = auth.uid() AND a.company_id = public.current_company_id() AND a.can_view));

DROP POLICY IF EXISTS marketing_creative_assets_insert ON storage.objects;
CREATE POLICY marketing_creative_assets_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'marketing-creatives'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
  AND public.is_approved(auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_company_access a
    WHERE a.user_id = auth.uid() AND a.company_id = public.current_company_id() AND a.can_view AND a.can_create));

DROP POLICY IF EXISTS marketing_creative_assets_delete ON storage.objects;
CREATE POLICY marketing_creative_assets_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'marketing-creatives'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
  AND public.is_approved(auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_company_access a
    WHERE a.user_id = auth.uid() AND a.company_id = public.current_company_id() AND a.can_view AND a.can_delete));