package handlers

import (
	"bytes"
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
