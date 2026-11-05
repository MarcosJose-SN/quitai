package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"image"
	_ "image/png"
	"io"
	"log"
	"net/http"

	"github.com/MarcosJose/quitai/auth"
)

const limiteFotoAdmin = 5 << 20 // 5 MiB

// AdminFotoPerfil consulta e atualiza a foto do administrador no PostgreSQL.
func AdminFotoPerfil(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Sessão inválida", http.StatusUnauthorized)
			return
		}

		switch r.Method {
		case http.MethodGet:
			var dados []byte

			err := db.QueryRowContext(r.Context(), `
				SELECT foto_perfil_dados
				FROM usuarios
				WHERE id = $1
				  AND perfil = 'admin'
				  AND ativo = TRUE
			`, id).Scan(&dados)

			if errors.Is(err, sql.ErrNoRows) || (err == nil && len(dados) == 0) {
				http.Error(w, "Foto não cadastrada", http.StatusNotFound)
				return
			}

			if err != nil {
				if r.Context().Err() != nil {
					return
				}
				log.Printf("Falha ao consultar foto administrativa (usuario_id=%d): %v", id, err)
				http.Error(w, "Não foi possível consultar a foto", http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(dados)

		case http.MethodPost:
			r.Body = http.MaxBytesReader(w, r.Body, limiteFotoAdmin+(1<<20))

			if err := r.ParseMultipartForm(limiteFotoAdmin); err != nil {
				http.Error(w, "Envie uma imagem de até 5 MB", http.StatusBadRequest)
				return
			}

			if r.MultipartForm != nil {
				defer r.MultipartForm.RemoveAll()
			}

			entrada, _, err := r.FormFile("foto")
			if err != nil {
				http.Error(w, "Campo 'foto' obrigatório", http.StatusBadRequest)
				return
			}
			defer entrada.Close()

			dados, err := io.ReadAll(io.LimitReader(entrada, limiteFotoAdmin+1))
			if err != nil || len(dados) == 0 || len(dados) > limiteFotoAdmin {
				http.Error(w, "Imagem vazia ou maior que 5 MB", http.StatusBadRequest)
				return
			}

			cfg, formato, err := image.DecodeConfig(bytes.NewReader(dados))
			if err != nil || formato != "png" || cfg.Width != 512 || cfg.Height != 512 {
				http.Error(w, "A imagem precisa ser PNG com 512 x 512 pixels", http.StatusBadRequest)
				return
			}

			if _, _, err := image.Decode(bytes.NewReader(dados)); err != nil {
				http.Error(w, "Arquivo PNG inválido", http.StatusBadRequest)
				return
			}

			resultado, err := db.ExecContext(r.Context(), `
				UPDATE usuarios
				SET foto_perfil_dados = $1,
				    atualizado_em = CURRENT_TIMESTAMP
				WHERE id = $2
				  AND perfil = 'admin'
				  AND ativo = TRUE
			`, dados, id)

			if err != nil {
				if r.Context().Err() != nil {
					return
				}
				log.Printf("Falha ao atualizar foto administrativa (usuario_id=%d): %v", id, err)
				http.Error(w, "Não foi possível atualizar a foto", http.StatusInternalServerError)
				return
			}

			linhas, err := resultado.RowsAffected()
			if err != nil || linhas != 1 {
				http.Error(w, "Administrador não encontrado ou inativo", http.StatusForbidden)
				return
			}

			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")

			_ = json.NewEncoder(w).Encode(map[string]string{
				"mensagem": "Foto de perfil atualizada com sucesso",
			})

		default:
			w.Header().Set("Allow", "GET, POST")
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		}
	}
}
