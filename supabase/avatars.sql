-- Run in the Supabase project's SQL Editor, NOT the EagleRide app database.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('avatars','avatars',true,2097152,ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS eagleride_avatar_insert ON storage.objects;
DROP POLICY IF EXISTS eagleride_avatar_select ON storage.objects;
DROP POLICY IF EXISTS eagleride_avatar_update ON storage.objects;
CREATE POLICY eagleride_avatar_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='avatars' AND name=(SELECT auth.uid()::text)||'/avatar');
CREATE POLICY eagleride_avatar_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='avatars' AND name=(SELECT auth.uid()::text)||'/avatar');
CREATE POLICY eagleride_avatar_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='avatars' AND name=(SELECT auth.uid()::text)||'/avatar')
WITH CHECK (bucket_id='avatars' AND name=(SELECT auth.uid()::text)||'/avatar');
COMMIT;
-- Existing broad policies on this bucket must not grant other users write access.
