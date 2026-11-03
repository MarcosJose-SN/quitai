-- QuitAÍ | Painel Gestor
-- Adiciona referência à foto de perfil sem alterar dados existentes.
-- Aplicar uma única vez no banco de dados do QuitaAÍ.

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS foto_perfil_url TEXT;

COMMENT ON COLUMN usuarios.foto_perfil_url IS
    'Caminho relativo da foto de perfil armazenada no servidor; NULL quando não cadastrada.';
