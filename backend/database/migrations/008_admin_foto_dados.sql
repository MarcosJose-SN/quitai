-- Foto PNG persistida no PostgreSQL, inclusive em hospedagem com disco efemero.
-- Migracao aditiva: preserva foto_perfil_url e todos os registros existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS foto_perfil_dados BYTEA;
COMMENT ON COLUMN public.usuarios.foto_perfil_dados IS
    'Foto administrativa em PNG (512 x 512), validada pela API; NULL quando ausente.';
COMMIT;
