BEGIN;

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS perfil VARCHAR(20) NOT NULL DEFAULT 'revendedora';

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.usuarios
    ADD CONSTRAINT usuarios_perfil_check
    CHECK (perfil IN ('admin', 'revendedora'));

COMMIT;
