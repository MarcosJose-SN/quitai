$ErrorActionPreference = "Stop"

$arquivo = ".\auth\auth.go"
$conteudo = [System.IO.File]::ReadAllText(
    (Resolve-Path $arquivo),
    [System.Text.Encoding]::UTF8
)

$inicio = $conteudo.IndexOf("func Cadastro(db *sql.DB) http.HandlerFunc {")
$fim = $conteudo.IndexOf("func Login(db *sql.DB) http.HandlerFunc {")

if ($inicio -lt 0 -or $fim -le $inicio) {
    throw "Não encontrei os limites esperados. Arquivo preservado."
}

$novoCadastro = @"
func Cadastro(db *sql.DB) http.HandlerFunc {
return func(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodPost {
responderErro(w, http.StatusMethodNotAllowed, "Método não permitido.")
return
}

responderErro(
w,
http.StatusForbidden,
"Cadastro público desativado. Solicite acesso ao administrador.",
)
}
}

"@

$novoConteudo = $conteudo.Substring(0, $inicio) +
    $novoCadastro +
    $conteudo.Substring($fim)

$temporario = Join-Path (Split-Path (Resolve-Path $arquivo)) "auth.go.tmp"
[System.IO.File]::WriteAllText(
    $temporario,
    $novoConteudo,
    [System.Text.UTF8Encoding]::new($false)
)

$checagem = [System.IO.File]::ReadAllText($temporario)
if (-not $checagem.Contains("Cadastro público desativado") -or
    -not $checagem.Contains("func Login(db *sql.DB) http.HandlerFunc {")) {
    Remove-Item $temporario -ErrorAction SilentlyContinue
    throw "Validação falhou. Arquivo original preservado."
}

Move-Item $temporario $arquivo -Force
Write-Host "Alteração aplicada e validada."
