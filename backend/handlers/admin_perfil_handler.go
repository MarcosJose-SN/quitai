package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/MarcosJose/quitai/auth"
)

const limiteFotoAdmin = 5 << 20 // 5 MiB

// AdminFotoPerfil permite que cada administrador consulte ou atualize apenas sua própria foto.
// GET retorna a imagem (com Bearer token); POST recebe multipart/form-data, campo "foto".
// O frontend deve enviar o arquivo já recortado para 512 x 512 pixels.
func AdminFotoPerfil(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Sessão inválida", http.StatusUnauthorized)
			return
		}

		switch r.Method {
		case http.MethodGet:
			var caminho sql.NullString
			err := db.QueryRowContext(r.Context(),
				`SELECT foto_perfil_url FROM usuarios WHERE id = $1 AND perfil = 'admin' AND ativo = TRUE`, id,
			).Scan(&caminho)
			if errors.Is(err, sql.ErrNoRows) || (err == nil && (!caminho.Valid || caminho.String == "")) {
				http.Error(w, "Foto não cadastrada", http.StatusNotFound)
				return
			}
			if err != nil {
				http.Error(w, "Não foi possível consultar a foto", http.StatusInternalServerError)
				return
			}
			// Não aceita caminhos arbitrários vindos do banco.
			nome := filepath.Base(caminho.String)
			if !strings.HasPrefix(nome, fmt.Sprintf("admin_%d_", id)) || !strings.HasSuffix(nome, ".png") || caminho.String != "admin-fotos/"+nome {
				http.Error(w, "Referência de foto inválida", http.StatusInternalServerError)
				return
			}
			arquivo := filepath.Join("uploads", "admin-fotos", nome)
			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("Cache-Control", "no-store")
			http.ServeFile(w, r, arquivo)

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

			// Limita o arquivo mesmo quando o multipart contém outros campos.
			dados, err := io.ReadAll(io.LimitReader(entrada, limiteFotoAdmin+1))
			if err != nil || len(dados) == 0 || len(dados) > limiteFotoAdmin {
				http.Error(w, "Imagem vazia ou maior que 5 MB", http.StatusBadRequest)
				return
			}
			tipo := http.DetectContentType(dados)
			if tipo != "image/png" {
				http.Error(w, "Envie uma imagem PNG recortada em 512 x 512 pixels", http.StatusBadRequest)
				return
			}
			cfg, formato, err := image.DecodeConfig(bytes.NewReader(dados))
			if err != nil || formato != "png" || cfg.Width != 512 || cfg.Height != 512 {
				http.Error(w, "A imagem precisa ser PNG com 512 x 512 pixels", http.StatusBadRequest)
				return
			}
			// Valida que o arquivo pode ser decodificado integralmente.
			if _, _, err := image.Decode(bytes.NewReader(dados)); err != nil {
				http.Error(w, "Arquivo PNG inválido", http.StatusBadRequest)
				return
			}

			pasta := filepath.Join("uploads", "admin-fotos")
			if err := os.MkdirAll(pasta, 0750); err != nil {
				http.Error(w, "Erro ao preparar armazenamento", http.StatusInternalServerError)
				return
			}
			temp, err := os.CreateTemp(pasta, ".foto-*.png")
			if err != nil {
				http.Error(w, "Erro ao salvar imagem", http.StatusInternalServerError)
				return
			}
			temporario := temp.Name()
			defer os.Remove(temporario)
			if _, err = temp.Write(dados); err != nil {
				temp.Close()
				http.Error(w, "Erro ao gravar imagem", http.StatusInternalServerError)
				return
			}
			if err = temp.Close(); err != nil {
				http.Error(w, "Erro ao finalizar imagem", http.StatusInternalServerError)
				return
			}

			nome := fmt.Sprintf("admin_%d_%d.png", id, time.Now().UnixNano())
			destino := filepath.Join(pasta, nome)
			if err := os.Rename(temporario, destino); err != nil {
				http.Error(w, "Erro ao publicar imagem", http.StatusInternalServerError)
				return
			}
			referencia := "admin-fotos/" + nome
			resultado, err := db.ExecContext(r.Context(),
				`UPDATE usuarios SET foto_perfil_url = $1, atualizado_em = $2 WHERE id = $3 AND perfil = 'admin' AND ativo = TRUE`,
				referencia, time.Now(), id,
			)
			if err != nil {
				http.Error(w, "Imagem salva, mas não foi possível atualizar o perfil", http.StatusInternalServerError)
				return
			}
			linhas, err := resultado.RowsAffected()
			if err != nil || linhas != 1 {
				http.Error(w, "Administrador não encontrado", http.StatusForbidden)
				return
			}
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			json.NewEncoder(w).Encode(map[string]string{"mensagem": "Foto de perfil atualizada com sucesso", "foto_perfil_url": referencia})

		default:
			w.Header().Set("Allow", "GET, POST")
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		}
	}
}
