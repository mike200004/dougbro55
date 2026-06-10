-- 0008: built-in document library expansion.
-- The set of built-in document types now lives in code (lib/templates) and
-- will keep growing — stop enumerating it in the schema.
alter table public.documents drop constraint if exists documents_type_check;
