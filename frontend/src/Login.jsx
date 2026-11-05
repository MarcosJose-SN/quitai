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
  const [mensagem, setMensagem] = useState('')
  const [modalRecuperacao, setModalRecuperacao] = useState(false)
  const [codigoRecuperacao, setCodigoRecuperacao] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [modalAjuda, setModalAjuda] = useState(false)
  const [tipoAjuda, setTipoAjuda] = useState('')

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
        `${import.meta.env.VITE_API_URL || "http://localhost:8082"}/auth/login`,
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
        console.error('Resposta de login sem os campos obrigatorios.')

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
    event?.preventDefault?.()
    setErro('')
    setMensagem('')
    if (!email.trim()) {
      setErro('Informe seu e-mail no campo acima para receber o código.')
      return
    }
    try {
      setCarregando(true)
      const resposta = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8082"}/auth/recuperar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) throw new Error(dados.mensagem || dados.erro || 'Não foi possível solicitar a recuperação.')
      setModalAjuda(false)
      setModalRecuperacao(true)
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
      const resposta = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8082"}/auth/redefinir-senha`, {
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
              <h1>QuitaAí</h1>
              <p>Vendas simples • Recebimentos organizados.</p>
            </div>
          </div>
        </header>

        <div className="login-introducao">
          <h2>Bem-vinda de volta!</h2>
          <p>Entre na sua conta para continuar.</p>
        </div>

        <form
          className="login-formulario"
          onSubmit={entrar}
        >

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
          {mensagem && !modalRecuperacao && (
            <div className="login-sucesso" role="status">{mensagem}</div>
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

        <div className="login-divisor"><span></span><strong>PRECISA DE AJUDA?</strong><span></span></div>
        <button type="button" className="login-botao-ajuda" onClick={() => { setTipoAjuda(''); setModalAjuda(true); setErro('') }}>
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="12" width="4" height="7" rx="2"/><rect x="18" y="12" width="4" height="7" rx="2"/><path d="M20 19a5 5 0 0 1-5 3h-3"/></svg>
          Preciso de ajuda para entrar
        </button>

        {modalAjuda && (
          <div className="login-modal-fundo" role="presentation">
            <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="ajuda-titulo">
              <button type="button" className="login-modal-fechar" aria-label="Fechar ajuda" onClick={() => { setModalAjuda(false); setTipoAjuda(''); setErro('') }}>×</button>
              <h2 id="ajuda-titulo">Ajuda para entrar</h2>
              <p>Escolha o que aconteceu com seu acesso ao QuitaAí.</p>
              {!tipoAjuda ? (
                <div className="login-ajuda-opcoes">
                  <button type="button" onClick={() => setTipoAjuda('senha')}><strong>Esqueci minha senha</strong><small>Receber um código no e-mail cadastrado</small></button>
                  <button type="button" onClick={() => setTipoAjuda('email')}><strong>Esqueci meu e-mail</strong><small>Solicitar ajuda para localizar minha conta</small></button>
                  <button type="button" onClick={() => setTipoAjuda('outro')}><strong>Outro problema de acesso</strong><small>Falar com o suporte</small></button>
                </div>
              ) : tipoAjuda === 'senha' ? (
                <form className="login-formulario-recuperacao" onSubmit={async (event) => { await recuperarSenha(event); }}>
                  <div className="login-grupo"><label htmlFor="ajuda-email">E-mail cadastrado</label><input id="ajuda-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="seuemail@exemplo.com" required disabled={carregando}/></div>
                  {erro && <div className="login-erro" role="alert">{erro}</div>}
                  <button type="submit" className="login-botao-entrar" disabled={carregando}>{carregando ? 'Enviando...' : 'Enviar código de recuperação'}</button>
                  <button type="button" className="login-link login-reenviar" onClick={() => { setTipoAjuda(''); setErro('') }}>Voltar às opções</button>
                </form>
              ) : (
                <div className="login-ajuda-contato">
                  <p>{tipoAjuda === 'email' ? 'Para recuperar seu e-mail de acesso, entre em contato com o suporte. A equipe precisará confirmar sua identidade antes de alterar qualquer dado.' : 'Descreva o problema ao suporte para receber orientação.'}</p>
                  <a className="login-botao-entrar login-ajuda-email" href={`mailto:marcosjosesouzadonascimento@gmail.com?subject=${encodeURIComponent(tipoAjuda === 'email' ? 'QuitaAí - Esqueci meu e-mail de acesso' : 'QuitaAí - Problema de acesso')}&body=${encodeURIComponent('Olá, preciso de ajuda para acessar minha conta QuitaAí.\n\nMeu nome: \nDescrição do problema: ')}`}>Abrir e-mail para o suporte</a>
                  <p className="login-ajuda-nota">O envio é feito pelo aplicativo de e-mail do seu dispositivo. Não envie sua senha ou códigos de recuperação.</p>
                  <button type="button" className="login-link login-reenviar" onClick={() => setTipoAjuda('')}>Voltar às opções</button>
                </div>
              )}
            </section>
          </div>
        )}

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

        <footer className="login-rodape" style={{ flexWrap: 'wrap', rowGap: 8, justifyContent: 'center' }}>
          <span>© 2026 QuitaAí</span>
          <span className="login-rodape-ponto">·</span>
          <a href="/termos-de-uso">Termos de Uso</a>
          <span className="login-rodape-ponto">·</span>
          <a href="/politica-de-privacidade">Privacidade</a>
          <span className="login-rodape-ponto">·</span>
          <a href="/direitos-lgpd">Direitos LGPD</a>
          <span className="login-rodape-versao">v1.0.0</span>
        </footer>
      </section>
    </main>
  )
}

export default Login
