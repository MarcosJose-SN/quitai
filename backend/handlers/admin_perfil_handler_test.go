package handlers

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/MarcosJose/quitai/auth"
	"github.com/golang-jwt/jwt/v5"
)

const chaveTesteFoto = "quitai-chave-de-teste-foto-admin-2026-segura"

func tokenTesteFoto(t *testing.T, id int) string {
	t.Helper()

	agora := time.Now()
	claims := auth.Claims{
		UsuarioID: id,
		Email:     "admin@teste.local",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "1",
			ExpiresAt: jwt.NewNumericDate(agora.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(agora),
			NotBefore: jwt.NewNumericDate(agora),
		},
	}

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).
		SignedString([]byte(chaveTesteFoto))
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func imagemTesteFoto(t *testing.T) []byte {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, 512, 512))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestAdminFotoPerfilGET(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	foto := imagemTesteFoto(t)

	mock.ExpectQuery("SELECT perfil, ativo").
		WithArgs(1).
		WillReturnRows(
			sqlmock.NewRows([]string{"perfil", "ativo"}).
				AddRow("admin", true),
		)

	mock.ExpectQuery("SELECT versao_sessao").WillReturnRows(sqlmock.NewRows([]string{"valida"}).AddRow(true))
	mock.ExpectQuery("SELECT foto_perfil_dados").
		WithArgs(1).
		WillReturnRows(
			sqlmock.NewRows([]string{"foto_perfil_dados"}).
				AddRow(foto),
		)

	handler := auth.AdminMiddleware(db, AdminFotoPerfil(db))

	req := httptest.NewRequest(http.MethodGet, "/admin/perfil/foto", nil)
	req.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 1))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("esperava 200, recebeu %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("Content-Type inesperado: %s", rec.Header().Get("Content-Type"))
	}
	if !bytes.Equal(rec.Body.Bytes(), foto) {
		t.Fatal("imagem retornada diferente da armazenada")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAdminFotoPerfilPOST(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	foto := imagemTesteFoto(t)

	mock.ExpectQuery("SELECT perfil, ativo").
		WithArgs(1).
		WillReturnRows(
			sqlmock.NewRows([]string{"perfil", "ativo"}).
				AddRow("admin", true),
		)
	mock.ExpectQuery("SELECT versao_sessao").WillReturnRows(sqlmock.NewRows([]string{"valida"}).AddRow(true))

	mock.ExpectExec("UPDATE usuarios").
		WithArgs(foto, 1).
		WillReturnResult(sqlmock.NewResult(0, 1))

	var corpo bytes.Buffer
	writer := multipart.NewWriter(&corpo)

	parte, err := writer.CreateFormFile("foto", "foto.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := parte.Write(foto); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	handler := auth.AdminMiddleware(db, AdminFotoPerfil(db))

	req := httptest.NewRequest(http.MethodPost, "/admin/perfil/foto", &corpo)
	req.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 1))
	req.Header.Set("Content-Type", writer.FormDataContentType())

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("esperava 200, recebeu %d: %s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAdminFotoPerfilSemToken(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	handler := auth.AdminMiddleware(db, AdminFotoPerfil(db))
	req := httptest.NewRequest(http.MethodGet, "/admin/perfil/foto", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("esperava 401, recebeu %d", rec.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAdminFotoPerfilBloqueiaRevendedora(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectQuery("SELECT perfil, ativo").
		WithArgs(1).
		WillReturnRows(
			sqlmock.NewRows([]string{"perfil", "ativo"}).
				AddRow("revendedora", true),
		)

	handler := auth.AdminMiddleware(db, AdminFotoPerfil(db))
	req := httptest.NewRequest(http.MethodGet, "/admin/perfil/foto", nil)
	req.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 1))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("esperava 403, recebeu %d: %s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// Ausencia de foto nao e falha de banco; falhas reais continuam retornando 500.
func TestAdminFotoPerfilGETSemFotoOuFalha(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	for _, caso := range []struct {
		nome       string
		dados      []byte
		semUsuario bool
		falha      bool
		status     int
	}{
		{nome: "NULL", status: http.StatusNotFound},
		{nome: "vazia", dados: []byte{}, status: http.StatusNotFound},
		{nome: "usuario_ausente", semUsuario: true, status: http.StatusNotFound},
		{nome: "falha_banco", falha: true, status: http.StatusInternalServerError},
	} {
		t.Run(caso.nome, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			consulta := mock.ExpectQuery("SELECT foto_perfil_dados").WithArgs(1)
			if caso.falha {
				consulta.WillReturnError(errors.New("falha de consulta simulada"))
			} else {
				rows := sqlmock.NewRows([]string{"foto_perfil_dados"})
				if !caso.semUsuario {
					if caso.dados == nil {
						rows.AddRow(nil)
					} else {
						rows.AddRow(caso.dados)
					}
				}
				consulta.WillReturnRows(rows)
			}
			handler := auth.AuthMiddleware(AdminFotoPerfil(db))
			req := httptest.NewRequest(http.MethodGet, "/admin/perfil/foto", nil)
			req.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 1))
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != caso.status {
				t.Fatalf("esperava %d, recebeu %d", caso.status, rec.Code)
			}
			if bytes.Contains(rec.Body.Bytes(), []byte("simulada")) {
				t.Fatal("erro interno exposto na resposta")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestAdminFotoPerfilGETCancelado(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// O middleware valida o token, mas a consulta recebe o contexto ja cancelado.
	ctx, cancelar := context.WithCancel(context.Background())
	cancelar()
	req := httptest.NewRequest(http.MethodGet, "/admin/perfil/foto", nil).WithContext(ctx)
	req.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 1))
	rec := httptest.NewRecorder()
	auth.AuthMiddleware(AdminFotoPerfil(db)).ServeHTTP(rec, req)
	if rec.Code == http.StatusInternalServerError {
		t.Fatal("cancelamento tratado como falha interna")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
