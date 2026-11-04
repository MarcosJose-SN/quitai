package database

import (
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

func Connect() (*sql.DB, error) {
	host := strings.TrimSpace(os.Getenv("DB_HOST"))
	port := strings.TrimSpace(os.Getenv("DB_PORT"))
	user := strings.TrimSpace(os.Getenv("DB_USER"))
	password := os.Getenv("DB_PASSWORD")
	dbname := strings.TrimSpace(os.Getenv("DB_NAME"))
	sslmode := strings.TrimSpace(os.Getenv("DB_SSLMODE"))

	if host == "" || port == "" || user == "" || password == "" || dbname == "" || sslmode == "" {
		return nil, fmt.Errorf("configuracao do PostgreSQL incompleta")
	}

	connURL := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(user, password),
		Host:   net.JoinHostPort(host, port),
		Path:   "/" + dbname,
	}

	query := connURL.Query()
	query.Set("sslmode", sslmode)
	connURL.RawQuery = query.Encode()

	connStr := connURL.String()

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}
