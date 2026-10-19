-- Campaign attributions are evidence records: inserts only, never edits or deletes through the Data API.
REVOKE UPDATE, DELETE, TRUNCATE ON public.marketing_campaign_attributions FROM anon, authenticated;
GRANT SELECT, INSERT ON public.marketing_campaign_attributions TO authenticated;