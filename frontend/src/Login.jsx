import { useEffect, useRef, useState } from 'react'
import './Login.css'
import logoQuitaAi from './assets/quitai-logo.svg'

function Login({ onLogin }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [confirmarSenhaCadastro, setConfirmarSenhaCadastro] = useState('')
  const [modoCadastro, setModoCadastro] = useState(false)
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [lembrar, setLembrar] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [modalRecuperacao, setModalRecuperacao] = useState(false)
  const [etapaRecuperacao, setEtapaRecuperacao] = useState(1)
  const [codigoRecuperacao, setCodigoRecuperacao] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [googleCarregando, setGoogleCarregando] = useState(false)
  const googleBotaoRef = useRef(null)

  function salvarSessao(dados) {
    if (!dados?.token || !dados?.usuario) {
      throw new Error('O servidor não retornou o token ou os dados do usuário.')
    }
    const armazenamento = lembrar ? localStorage : sessionStorage
    const outroArmazenamento = lembrar ? sessionStorage : localStorage
    outroArmazenamento.removeItem('quitai_token')
    outroArmazenamento.removeItem('quitai_usuario')
    armazenamento.setItem('quitai_token', dados.token)
    armazenamento.setItem('quitai_usuario', JSON.stringify(dados.usuario))
    if (typeof onLogin === 'function') onLogin(dados.usuario)
  }

  async function processarCredencialGoogle(response) {
    setErro('')
    setMensagem('')
    try {
      setGoogleCarregando(true)
      const resposta = await fetch('http://localhost:8082/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) {
        throw new Error(dados.mensagem || dados.erro || 'Não foi possível entrar com Google.')
      }
      salvarSessao(dados)
    } catch (error) {
      setErro(error.message || 'Falha ao entrar com Google.')
    } finally {
      setGoogleCarregando(false)
    }
  }

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) return

    let tentativas = 0
    const configurarGoogle = () => {
      if (!window.google?.accounts?.id || !googleBotaoRef.current) {
        tentativas += 1
        if (tentativas < 30) window.setTimeout(configurarGoogle, 200)
        return
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: processarCredencialGoogle,
      })
      googleBotaoRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(googleBotaoRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: Math.min(320, googleBotaoRef.current.clientWidth || 320),
        locale: 'pt-BR',
      })
    }

    if (!document.querySelector('script[data-google-identity]')) {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.googleIdentity = 'true'
      script.onload = configurarGoogle
      script.onerror = () => setErro('Não foi possível carregar o login do Google.')
      document.head.appendChild(script)
    } else {
      configurarGoogle()
    }

    return () => {}
  }, [])

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

      salvarSessao(dados)
    } catch (error) {
      console.error('Erro ao realizar login:', error)

      setErro(
        'Não foi possível conectar ao servidor. Verifique se o backend está funcionando na porta 8082.'
      )
    } finally {
      setCarregando(false)
    }
  }

  async function recuperarSenha(event) {
    event.preventDefault()
    setErro('')
    setMensagem('')
    if (!email.trim()) {
      setErro('Informe seu e-mail no campo acima para receber o código.')
      return
    }
    try {
      setCarregando(true)
      const resposta = await fetch('http://localhost:8082/auth/recuperar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) throw new Error(dados.mensagem || dados.erro || 'Não foi possível solicitar a recuperação.')
      setModalRecuperacao(true)
      setEtapaRecuperacao(2)
      setMensagem(dados.mensagem || 'Se o e-mail estiver cadastrado, você receberá um código.')
    } catch (error) {
      setErro(error.message || 'Não foi possível solicitar a recuperação.')
    } finally {
      setCarregando(false)
    }
  }

  async function redefinirSenha(event) {
    event.preventDefault()
    setErro('')
    setMensagem('')
    if (novaSenha.length < 6) {
      setErro('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não são iguais.')
      return
    }
    try {
      setCarregando(true)
      const resposta = await fetch('http://localhost:8082/auth/redefinir-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          codigo: codigoRecuperacao.trim(),
          nova_senha: novaSenha,
        }),
      })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) throw new Error(dados.mensagem || dados.erro || 'Não foi possível redefinir a senha.')
      setModalRecuperacao(false)
      setEtapaRecuperacao(1)
      setCodigoRecuperacao('')
      setNovaSenha('')
      setConfirmarSenha('')
      setSenha('')
      setMensagem(dados.mensagem || 'Senha redefinida com sucesso.')
      setErro('')
    } catch (error) {
      setErro(error.message || 'Não foi possível redefinir a senha.')
    } finally {
      setCarregando(false)
    }
  }

  async function criarConta(event) {
    event.preventDefault()
    setErro('')
    setMensagem('')

    if (!nome.trim()) {
      setErro('Informe seu nome.')
      return
    }
    if (!email.trim()) {
      setErro('Informe seu e-mail.')
      return
    }
    if (senha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirmarSenhaCadastro) {
      setErro('As senhas não são iguais.')
      return
    }

    try {
      setCarregando(true)
      const resposta = await fetch('http://localhost:8082/auth/cadastro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim(),
          senha,
        }),
      })

      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) {
        throw new Error(
          dados.mensagem ||
            dados.erro ||
            'Não foi possível criar sua conta. Confira os dados e tente novamente.'
        )
      }

      // Se a API já devolver token e usuário, inicia a sessão imediatamente.
      if (dados.token && dados.usuario) {
        salvarSessao(dados)
        return
      }

      setModoCadastro(false)
      setSenha('')
      setConfirmarSenhaCadastro('')
      setMensagem(
        dados.mensagem ||
          'Conta criada com sucesso! Entre com seu e-mail e sua senha.'
      )
    } catch (error) {
      setErro(
        error.message ||
          'Não foi possível conectar ao servidor. Verifique se o backend está funcionando na porta 8082.'
      )
    } finally {
      setCarregando(false)
    }
  }

  function alternarModoCadastro() {
    setModoCadastro((atual) => !atual)
    setErro('')
    setMensagem('')
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
              className="login-logo-svg"
            />

            <div className="login-marca-texto">
              <h1>Quitaí</h1>
              <p>Vendas simples - Recebimentos organizados.</p>
            </div>
          </div>
        </header>

        <div className="login-introducao">
          <h2>{modoCadastro ? 'Crie sua conta' : 'Bem-vinda de volta!'}</h2>
          <p>
            {modoCadastro
              ? 'Cadastre-se para organizar suas vendas e recebimentos.'
              : 'Entre na sua conta para continuar.'}
          </p>
        </div>

        <form
          className="login-formulario"
          onSubmit={modoCadastro ? criarConta : entrar}
        >
          {modoCadastro && (
            <div className="login-grupo">
              <label htmlFor="nome-cadastro">Nome completo</label>
              <input
                id="nome-cadastro"
                name="nome"
                type="text"
                placeholder="Digite seu nome"
                autoComplete="name"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                required
                disabled={carregando}
              />
            </div>
          )}

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
                autoComplete={modoCadastro ? "new-password" : "current-password"}
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

          {modoCadastro && (
            <div className="login-grupo">
              <label htmlFor="confirmar-senha-cadastro">Confirmar senha</label>
              <input
                id="confirmar-senha-cadastro"
                name="confirmarSenha"
                type={mostrarSenha ? 'text' : 'password'}
                placeholder="Digite a senha novamente"
                autoComplete="new-password"
                value={confirmarSenhaCadastro}
                onChange={(event) => setConfirmarSenhaCadastro(event.target.value)}
                required
                minLength={6}
                disabled={carregando}
              />
            </div>
          )}

          {erro && (
            <div className="login-erro" role="alert">
              {erro}
            </div>
          )}
          {mensagem && !modalRecuperacao && (
            <div className="login-sucesso" role="status">{mensagem}</div>
          )}

          {!modoCadastro && (
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
          )}

          <button
            type="submit"
            className="login-botao-entrar"
            disabled={carregando}
          >
            {carregando
              ? (modoCadastro ? 'Criando conta...' : 'Entrando...')
              : (modoCadastro ? 'Criar conta' : 'Entrar')}
          </button>
        </form>

        {!modoCadastro && (
        <>
        <div className="login-divisor">
          <span></span>
          <strong>ou</strong>
          <span></span>
        </div>

        <div className="login-google-area">
          <div ref={googleBotaoRef} className="login-google-oficial" />
          {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <p className="login-google-aviso">
              Configure VITE_GOOGLE_CLIENT_ID para ativar o login Google.
            </p>
          )}
          {googleCarregando && <p role="status">Conectando com Google...</p>}
        </div>
        </>
        )}

        <div className="login-criar-conta">
          <span>
            {modoCadastro ? 'Já possui uma conta?' : 'Ainda não possui uma conta?'}
          </span>

          <button type="button" onClick={alternarModoCadastro} disabled={carregando}>
            {modoCadastro ? 'Entrar' : 'Criar minha conta'}
          </button>
        </div>

        {modalRecuperacao && (
          <div className="login-modal-fundo" role="presentation">
            <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="recuperacao-titulo">
              <button
                type="button"
                className="login-modal-fechar"
                aria-label="Fechar"
                onClick={() => { setModalRecuperacao(false); setErro(''); setMensagem('') }}
              >
                ×
              </button>
              <h2 id="recuperacao-titulo">Recuperar senha</h2>
              <p>Informe o código enviado para <strong>{email}</strong> e escolha uma nova senha.</p>
              {mensagem && <div className="login-sucesso" role="status">{mensagem}</div>}
              <form onSubmit={redefinirSenha} className="login-formulario login-formulario-recuperacao">
                <div className="login-grupo">
                  <label htmlFor="codigo-recuperacao">Código de 6 dígitos</label>
                  <input
                    id="codigo-recuperacao"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={codigoRecuperacao}
                    onChange={(event) => setCodigoRecuperacao(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                  />
                </div>
                <div className="login-grupo">
                  <label htmlFor="nova-senha">Nova senha</label>
                  <input id="nova-senha" type="password" autoComplete="new-password" minLength={6} value={novaSenha} onChange={(event) => setNovaSenha(event.target.value)} required />
                </div>
                <div className="login-grupo">
                  <label htmlFor="confirmar-senha">Confirmar nova senha</label>
                  <input id="confirmar-senha" type="password" autoComplete="new-password" minLength={6} value={confirmarSenha} onChange={(event) => setConfirmarSenha(event.target.value)} required />
                </div>
                {erro && <div className="login-erro" role="alert">{erro}</div>}
                <button type="submit" className="login-botao-entrar" disabled={carregando}>
                  {carregando ? 'Salvando...' : 'Redefinir senha'}
                </button>
              </form>
              <button
                type="button"
                className="login-link login-reenviar"
                disabled={carregando}
                onClick={recuperarSenha}
              >
                Reenviar código
              </button>
            </section>
          </div>
        )}

        <footer class="login-rodape">
           <span>© 2026 Quitaí</span>
           <span class="login-rodape-ponto">·</span>
           <a href="#termos">Termos</a>
           <span class="login-rodape-ponto">·</span>
          <a href="#privacidade">Privacidade</a>
          <span class="login-rodape-ponto">·</span>
          <a href="#suporte">Suporte</a>
          <span class="login-rodape-versao">v1.0.0</span>
        </footer>
      </section>
    </main>
  )
}

export default Login