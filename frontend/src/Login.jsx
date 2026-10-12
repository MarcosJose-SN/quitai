import { useState } from 'react'
import './Login.css'
import logoQuitaAi from './assets/quitai-logo.svg'

function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [lembrar, setLembrar] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function entrar(event) {
    event.preventDefault()
    setErro('')

    if (!email.trim() || !senha) {
      setErro('Informe seu e-mail e sua senha.')
      return
    }

    try {
      setCarregando(true)

      const resposta = await fetch(
        'http://localhost:8082/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            email: email.trim(),
            senha,
          }),
        }
      )

      let dados = {}

      try {
        dados = await resposta.json()
      } catch {
        dados = {}
      }

      if (!resposta.ok) {
        setErro(
          dados.mensagem ||
            dados.erro ||
            'E-mail ou senha inválidos.'
        )
        return
      }

      if (!dados.token || !dados.usuario) {
        console.error('Resposta inesperada do login:', dados)

        setErro(
          'O servidor não retornou o token ou os dados do usuário.'
        )
        return
      }

      const armazenamento = lembrar
        ? localStorage
        : sessionStorage

      const outroArmazenamento = lembrar
        ? sessionStorage
        : localStorage

      outroArmazenamento.removeItem('quitai_token')
      outroArmazenamento.removeItem('quitai_usuario')

      armazenamento.setItem('quitai_token', dados.token)
      armazenamento.setItem(
        'quitai_usuario',
        JSON.stringify(dados.usuario)
      )

      if (typeof onLogin === 'function') {
        onLogin(dados.usuario)
      }
    } catch (error) {
      console.error('Erro ao realizar login:', error)

      setErro(
        'Não foi possível conectar ao servidor. Verifique se o backend está funcionando na porta 8082.'
      )
    } finally {
      setCarregando(false)
    }
  }

  function recuperarSenha(event) {
    event.preventDefault()
    setErro('A recuperação de senha ainda não está configurada.')
  }

  function continuarComGoogle(event) {
    event.preventDefault()
    setErro('O login com Google ainda não está configurado.')
  }

  function criarConta(event) {
    event.preventDefault()
    setErro('O cadastro ainda não está conectado a esta tela.')
  }

  return (
    <main className="login-pagina">
      <div className="login-decoracao login-decoracao-1"></div>
      <div className="login-decoracao login-decoracao-2"></div>

      <section className="login-card">
        <header className="login-cabecalho">
          <div className="login-marca">
            <img
              src={logoQuitaAi}
              alt="Logo QuitaAí"
              className="quitai-logo.svg"
            />

            <div className="login-marca-texto">
              <h1>Quitaí</h1>
              <p>Vendas simples - Recebimentos organizados.</p>
            </div>
          </div>
        </header>

        <div className="login-introducao">
          <h2>Bem-vinda de volta!</h2>
          <p>Entre na sua conta para continuar.</p>
        </div>

        <form className="login-formulario" onSubmit={entrar}>
          <div className="login-grupo">
            <label htmlFor="email">E-mail</label>

            <div className="login-input-wrapper">
              <span className="login-icone">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="2"
                  />
                  <path d="M3 7l9 6 9-6" />
                </svg>
              </span>

              <input
                id="email"
                name="email"
                type="email"
                placeholder="seuemail@exemplo.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={carregando}
              />
            </div>
          </div>

          <div className="login-grupo">
            <label htmlFor="senha">Senha</label>

            <div className="login-input-wrapper">
              <span className="login-icone">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect
                    x="5"
                    y="10"
                    width="14"
                    height="10"
                    rx="2"
                  />
                  <path d="M8 10V7a4 4 0 018 0v3" />
                </svg>
              </span>

              <input
                id="senha"
                name="senha"
                type={mostrarSenha ? 'text' : 'password'}
                placeholder="Digite sua senha"
                autoComplete="current-password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                required
                disabled={carregando}
              />

              <button
                type="button"
                className="login-mostrar-senha"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                aria-label={
                  mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'
                }
                disabled={carregando}
              >
                {mostrarSenha ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2 2l20 20" />
                    <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                    <path d="M9.9 5.1A10.7 10.7 0 0112 5c5 0 8.7 4.1 10 7a14 14 0 01-3.2 4.4" />
                    <path d="M6.6 6.6C4.3 8.1 2.8 10.3 2 12c1.3 2.9 5 7 10 7a10.7 10.7 0 003-.4" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {erro && (
            <div className="login-erro" role="alert">
              {erro}
            </div>
          )}

          <div className="login-opcoes">
            <label className="login-checkbox">
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(event) => setLembrar(event.target.checked)}
                disabled={carregando}
              />

              <span className="login-checkbox-caixa"></span>
              <span>Lembrar de mim</span>
            </label>

            <button
              type="button"
              className="login-link"
              onClick={recuperarSenha}
              disabled={carregando}
            >
              Esqueci minha senha
            </button>
          </div>

          <button
            type="submit"
            className="login-botao-entrar"
            disabled={carregando}
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-divisor">
          <span></span>
          <strong>ou</strong>
          <span></span>
        </div>

        <button
          type="button"
          className="login-google"
          onClick={continuarComGoogle}
        >
          <span className="login-google-logo">G</span>
          <span>Continuar com Google</span>
        </button>

        <div className="login-criar-conta">
          <span>Ainda não possui uma conta?</span>

          <button type="button" onClick={criarConta}>
            Criar minha conta
          </button>
        </div>

        <footer className="login-rodape">
          © 2026 QuitaAí · Gestão de vendas e recebimentos
        </footer>
      </section>
    </main>
  )
}

export default Login