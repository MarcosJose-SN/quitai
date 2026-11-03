
import { useEffect, useRef, useState } from 'react'
import AdminLayout from './AdminLayout'
import Dashboard, { EditorFoto } from './pages/Dashboard'
import Relatorios from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'
import CentralSuporteAdmin from './pages/CentralSuporteAdmin'
import PoliticaPrivacidade from './pages/legal/PoliticaPrivacidade'
import TermosUso from './pages/legal/TermosUso'
import DireitosLGPD from './pages/legal/DireitosLGPD'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8082'

function obterToken() {
  return (
    localStorage.getItem('quitai_token') ||
    sessionStorage.getItem('quitai_token')
  )
}

function limparSessao() {
  localStorage.removeItem('quitai_token')
  localStorage.removeItem('quitai_usuario')
  sessionStorage.removeItem('quitai_token')
  sessionStorage.removeItem('quitai_usuario')
}


function Aviso({ tipo = 'info', children }) {
  return <div className={`admin-alert admin-alert--${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
    <span className="admin-alert-symbol" aria-hidden="true">{tipo === 'sucesso' ? '✓' : tipo === 'erro' ? '!' : 'i'}</span>
    <span>{children}</span>
  </div>
}

function CadastroRevendedora({ onVoltar }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erroCadastro, setErroCadastro] = useState('')

  async function cadastrar(evento) {
    evento.preventDefault()
    setMensagem('')
    setErroCadastro('')

    if (!nome.trim() || !email.trim() || senha.length < 6) {
      setErroCadastro('Preencha nome, e-mail e senha de pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErroCadastro('As senhas não coincidem.')
      return
    }

    setSalvando(true)
    try {
      const resposta = await fetch(`${API_URL}/admin/contas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${obterToken()}`,
        },
        body: JSON.stringify({ nome: nome.trim(), email: email.trim(), senha }),
      })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) {
        throw new Error(dados.mensagem || 'Não foi possível cadastrar a revendedora.')
      }
      setMensagem(`Conta de ${dados.nome || nome.trim()} cadastrada com sucesso!`)
      setNome('')
      setEmail('')
      setSenha('')
      setConfirmacao('')
    } catch (e) {
      setErroCadastro(e.message || 'Erro ao cadastrar a revendedora.')
    } finally {
      setSalvando(false)
    }
  }

  const campo = {
    width: '100%', padding: '12px 14px', border: '1px solid #cbd5e1',
    borderRadius: 8, fontSize: 15, boxSizing: 'border-box', marginTop: 7,
    background: '#fff', color: '#1f2937',
  }
  const rotulo = { display: 'block', fontWeight: 600, marginBottom: 18, color: '#30343b' }

  return (
    <section className="admin-placeholder">
      <span className="admin-eyebrow">GESTÃO ADMINISTRATIVA</span>
      <h1>Cadastrar conta</h1>
      <p>Cadastre uma nova revendedora para acessar a área de vendas do QuitaAí.</p>

      <form onSubmit={cadastrar} style={{
        background: '#fff', border: '1px solid #dbe3ed', borderRadius: 12,
        padding: 26, maxWidth: 620, marginTop: 24,
      }}>
        <label style={rotulo}>Nome completo
          <input style={campo} value={nome} onChange={e => setNome(e.target.value)}
            autoComplete="name" required maxLength={120} disabled={salvando} />
        </label>
        <label style={rotulo}>E-mail
          <input style={campo} type="email" value={email} onChange={e => setEmail(e.target.value)}
            autoComplete="email" required disabled={salvando} />
        </label>
        <label style={rotulo}>Senha (mínimo de 6 caracteres)
          <input style={campo} type="password" value={senha} onChange={e => setSenha(e.target.value)}
            autoComplete="new-password" required minLength={6} disabled={salvando} />
        </label>
        <label style={rotulo}>Confirmar senha
          <input style={campo} type="password" value={confirmacao} onChange={e => setConfirmacao(e.target.value)}
            autoComplete="new-password" required minLength={6} disabled={salvando} />
        </label>
        {erroCadastro && <Aviso tipo="erro">{erroCadastro}</Aviso>}
        {mensagem && <Aviso tipo="sucesso">{mensagem}</Aviso>}
        <button type="submit" className="admin-primary-button" disabled={salvando}>
          {salvando ? 'Cadastrando...' : 'Cadastrar revendedora'}
        </button>
      </form>

      <button type="button" className="admin-primary-button"
        style={{ marginTop: 20 }} onClick={onVoltar}>Voltar ao início</button>
    </section>
  )
}


function ListaRevendedoras({ onVoltar, onCadastrar }) {
  const [contas, setContas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erroLista, setErroLista] = useState('')
  const [aviso, setAviso] = useState('')
  const [alterandoId, setAlterandoId] = useState(null)
  const [contaPendente, setContaPendente] = useState(null)

  async function carregar() {
    setCarregando(true)
    setErroLista('')
    try {
      const resposta = await fetch(`${API_URL}/admin/contas`, {
        headers: { Authorization: `Bearer ${obterToken()}` },
      })
      const dados = await resposta.json().catch(() => null)
      if (!resposta.ok) throw new Error(dados?.mensagem || 'Não foi possível carregar as revendedoras.')
      if (!Array.isArray(dados)) throw new Error('Resposta inesperada do servidor.')
      setContas(dados.filter(conta => conta.perfil === 'revendedora'))
    } catch (e) {
      setContas([])
      setErroLista(e.message || 'Erro ao consultar as revendedoras.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  async function executarAcao() {
    if (!contaPendente || alterandoId !== null) return
    const { conta, acao } = contaPendente
    if (conta.perfil !== 'revendedora' || (acao === 'excluir' && conta.ativo)) return
    setAlterandoId(conta.id)
    setErroLista('')
    setAviso('')
    try {
      const excluir = acao === 'excluir'
      const resposta = await fetch(
        excluir ? `${API_URL}/admin/contas/${conta.id}` : `${API_URL}/admin/contas/${conta.id}/${acao}`,
        { method: excluir ? 'DELETE' : 'PUT', headers: { Authorization: `Bearer ${obterToken()}` } },
      )
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) throw new Error(dados.mensagem || 'Não foi possível realizar a operação.')
      setContaPendente(null)
      setAviso(dados.mensagem || 'Operação concluída com sucesso.')
      await carregar()
    } catch (e) {
      setErroLista(e.message || 'Erro ao atualizar a conta.')
      setContaPendente(null)
    } finally {
      setAlterandoId(null)
    }
  }

  const ativas = contas.filter(conta => conta.ativo)
  const bloqueadas = contas.filter(conta => !conta.ativo)
  const estiloBotaoExcluir = {
    border: '1px solid #f3b8b8', background: '#fff1f1', color: '#b42318',
    borderRadius: 8, padding: '10px 15px', fontWeight: 700, cursor: 'pointer',
  }

  function tabelaContas(lista, titulo, descricao, cor, vazia) {
    return (
      <section style={{ marginTop: 26, maxWidth: 960 }} aria-label={titulo}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0, color: '#273449', fontSize: 21 }}>{titulo}</h2>
          <span style={{ borderRadius: 99, padding: '5px 11px', background: cor === 'verde' ? '#e6f6eb' : '#fff0ed', color: cor === 'verde' ? '#166534' : '#a83225', fontWeight: 700 }}>
            {lista.length}
          </span>
        </div>
        <p style={{ margin: '0 0 14px', color: '#64748b' }}>{descricao}</p>
        {lista.length === 0 ? (
          <div style={{ padding: 22, border: '1px solid #dbe3ed', borderRadius: 12, background: '#fff', color: '#64748b' }}>{vazia}</div>
        ) : (
          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #dbe3ed', borderRadius: 12 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', textAlign: 'left', minWidth: 580 }}>
              <thead><tr style={{ background: '#f1f6fc' }}>
                {['Nome', 'E-mail', 'Status', 'Ações'].map(coluna => (
                  <th key={coluna} style={{ padding: 15, borderBottom: '1px solid #dbe3ed' }}>{coluna}</th>
                ))}
              </tr></thead>
              <tbody>
                {lista.map(conta => (
                  <tr key={conta.id}>
                    <td style={{ padding: 15, borderBottom: '1px solid #edf0f5' }}>{conta.nome}</td>
                    <td style={{ padding: 15, borderBottom: '1px solid #edf0f5' }}>{conta.email}</td>
                    <td style={{ padding: 15, borderBottom: '1px solid #edf0f5' }}>
                      <strong style={{ color: conta.ativo ? '#16703c' : '#b42318' }}>{conta.ativo ? 'Ativa' : 'Bloqueada'}</strong>
                    </td>
                    <td style={{ padding: 15, borderBottom: '1px solid #edf0f5' }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="admin-primary-button" disabled={alterandoId !== null}
                          onClick={() => setContaPendente({ conta, acao: conta.ativo ? 'bloquear' : 'reativar' })}>
                          {alterandoId === conta.id ? 'Aguarde...' : conta.ativo ? 'Bloquear' : 'Reativar'}
                        </button>
                        {!conta.ativo && (
                          <button type="button" style={{ ...estiloBotaoExcluir, opacity: alterandoId !== null ? 0.5 : 1 }}
                            disabled={alterandoId !== null}
                            onClick={() => setContaPendente({ conta, acao: 'excluir' })}>
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="admin-placeholder">
      <span className="admin-eyebrow">GESTÃO ADMINISTRATIVA</span>
      <h1>Revendedoras</h1>
      <p>Gerencie separadamente as contas ativas e bloqueadas.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '24px 0' }}>
        <button type="button" className="admin-primary-button" onClick={onCadastrar}>+ Cadastrar conta</button>
        <button type="button" className="admin-primary-button" onClick={carregar} disabled={carregando || alterandoId !== null}>
          {carregando ? 'Atualizando...' : 'Atualizar lista'}
        </button>
      </div>
      {erroLista && <Aviso tipo="erro">{erroLista}</Aviso>}
      {aviso && <Aviso tipo="sucesso">{aviso}</Aviso>}
      {carregando && <p>Carregando revendedoras...</p>}
      {!carregando && !erroLista && (
        <>
          {tabelaContas(ativas, 'Contas ativas', 'Revendedoras com acesso ao sistema.', 'verde', 'Nenhuma conta ativa no momento.')}
          {tabelaContas(bloqueadas, 'Contas bloqueadas', 'Você pode reativar uma conta ou solicitar sua exclusão definitiva.', 'vermelho', 'Nenhuma conta bloqueada no momento.')}
        </>
      )}
      {contaPendente && (
        <div className="admin-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget && alterandoId === null) setContaPendente(null) }}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title">
            <span className="admin-modal-icon" aria-hidden="true">!</span>
            <h2 id="admin-confirm-title">
              {contaPendente.acao === 'excluir' ? 'Excluir conta definitivamente?' : contaPendente.acao === 'bloquear' ? 'Bloquear revendedora?' : 'Reativar revendedora?'}
            </h2>
            <p>
              {contaPendente.acao === 'excluir'
                ? `A conta de ${contaPendente.conta.nome} (${contaPendente.conta.email}) será excluída permanentemente. Esta ação não pode ser desfeita. Contas com clientes, produtos ou vendas vinculados não podem ser excluídas.`
                : contaPendente.acao === 'bloquear'
                  ? `A conta de ${contaPendente.conta.nome} perderá o acesso ao sistema até ser reativada.`
                  : `A conta de ${contaPendente.conta.nome} poderá acessar o sistema novamente.`}
            </p>
            <div className="admin-modal-actions">
              <button type="button" className="admin-secondary-button" disabled={alterandoId !== null} onClick={() => setContaPendente(null)}>Cancelar</button>
              <button type="button" className={contaPendente.acao === 'excluir' ? '' : 'admin-primary-button'}
                style={contaPendente.acao === 'excluir' ? estiloBotaoExcluir : undefined}
                disabled={alterandoId !== null} onClick={executarAcao}>
                {alterandoId !== null ? 'Processando...' : contaPendente.acao === 'excluir' ? 'Sim, excluir definitivamente' : contaPendente.acao === 'bloquear' ? 'Sim, bloquear' : 'Sim, reativar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <button type="button" className="admin-primary-button" style={{ marginTop: 24 }} onClick={onVoltar}>Voltar ao início</button>
    </section>
  )
}

function MinhaConta({ usuario, onVoltar, onUsuarioAtualizado }) {
  const [fotoUrl, setFotoUrl] = useState(null)
  const fotoRef = useRef(null)
  const [editorAberto, setEditorAberto] = useState(false)
  const [erroFoto, setErroFoto] = useState('')
  const [nomeEditado, setNomeEditado] = useState(usuario?.nome || '')
  const [emailEditado, setEmailEditado] = useState(usuario?.email || '')
  const [salvandoDados, setSalvandoDados] = useState(false)
  const [mensagemDados, setMensagemDados] = useState('')
  const [erroDados, setErroDados] = useState('')
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [mensagemSenha, setMensagemSenha] = useState('')
  const [erroSenha, setErroSenha] = useState('')
  const [secaoEdicao, setSecaoEdicao] = useState(null)

  useEffect(() => {
    setNomeEditado(usuario?.nome || '')
    setEmailEditado(usuario?.email || '')
  }, [usuario?.nome, usuario?.email])

  async function salvarDados(evento) {
    evento.preventDefault()
    setMensagemDados('')
    setErroDados('')
    const nomeLimpo = nomeEditado.trim()
    const emailLimpo = emailEditado.trim().toLowerCase()
    if (nomeLimpo.length < 2 || nomeLimpo.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) {
      setErroDados('Informe um nome de 2 a 120 caracteres e um e-mail válido.')
      return
    }
    setSalvandoDados(true)
    try {
      const resposta = await fetch(`${API_URL}/admin/minha-conta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${obterToken()}` },
        body: JSON.stringify({ nome: nomeLimpo, email: emailLimpo }),
      })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) throw new Error(dados.mensagem || 'Não foi possível atualizar os dados.')
      onUsuarioAtualizado(dados)
      setMensagemDados('Nome e e-mail atualizados com sucesso.')
      setSecaoEdicao(null)
    } catch (e) {
      setErroDados(e.message || 'Erro ao atualizar os dados.')
    } finally {
      setSalvandoDados(false)
    }
  }

  async function salvarSenha(evento) {
    evento.preventDefault()
    setMensagemSenha('')
    setErroSenha('')
    if (new TextEncoder().encode(novaSenha).length < 8 || new TextEncoder().encode(novaSenha).length > 72) {
      setErroSenha('A nova senha deve ter entre 8 e 72 bytes.')
      return
    }
    if (novaSenha !== confirmarSenha) {
      setErroSenha('A confirmação da senha não coincide.')
      return
    }
    setSalvandoSenha(true)
    try {
      const resposta = await fetch(`${API_URL}/admin/minha-conta/senha`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${obterToken()}` },
        body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha, confirmar_senha: confirmarSenha }),
      })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) throw new Error(dados.mensagem || 'Não foi possível alterar a senha.')
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmarSenha('')
      setMensagemSenha(dados.mensagem || 'Senha alterada com sucesso.')
      setSecaoEdicao(null)
    } catch (e) {
      setErroSenha(e.message || 'Erro ao alterar a senha.')
    } finally {
      setSalvandoSenha(false)
    }
  }


  async function carregarFoto(signal) {
    const token = obterToken()
    if (!token) throw new Error('Sua sessão expirou. Faça login novamente.')
    const resposta = await fetch(`${API_URL}/admin/perfil/foto`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal,
    })
    if (signal?.aborted) return
    if (resposta.status === 404 || resposta.status === 204) {
      if (fotoRef.current) URL.revokeObjectURL(fotoRef.current)
      fotoRef.current = null
      setFotoUrl(null)
      return
    }
    if (!resposta.ok) throw new Error('Não foi possível carregar a foto de perfil.')
    const blob = await resposta.blob()
    if (!blob.type.startsWith('image/')) throw new Error('Formato de foto inválido.')
    if (signal?.aborted) return
    const novaUrl = URL.createObjectURL(blob)
    const antiga = fotoRef.current
    fotoRef.current = novaUrl
    setFotoUrl(novaUrl)
    if (antiga) URL.revokeObjectURL(antiga)
  }

  useEffect(() => {
    const controlador = new AbortController()
    carregarFoto(controlador.signal).catch(e => {
      if (e.name !== 'AbortError') setErroFoto(e.message || 'Erro ao carregar a foto.')
    })
    return () => {
      controlador.abort()
      if (fotoRef.current) URL.revokeObjectURL(fotoRef.current)
      fotoRef.current = null
    }
  }, [])

  async function depoisDeSalvar() {
    await carregarFoto()
    setErroFoto('')
  }

  const nome = usuario?.nome || 'Administrador'
  const email = usuario?.email || 'Não informado'
  const campo = { padding: '16px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }

  return (
    <section className="admin-placeholder">
      <span className="admin-eyebrow">GESTÃO ADMINISTRATIVA</span>
      <h1>Minha conta</h1>
      <p>Gerencie seus dados pessoais, sua foto de perfil e a segurança da conta.</p>
      <div style={{ maxWidth: 760, marginTop: 24, padding: 26, borderRadius: 14, background: '#fff', border: '1px solid #dbe3ed' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', marginBottom: 28, paddingBottom: 26, borderBottom: '1px solid #edf1f6' }}>
          <div style={{ position: 'relative', width: 112, height: 112, flexShrink: 0 }}>
            <div style={{ width: 108, height: 108, borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #60a5fa)', color: '#fff', display: 'grid', placeItems: 'center', overflow: 'hidden', fontSize: 38, fontWeight: 700, border: '4px solid #fff', boxShadow: '0 0 0 1px #dbe5f2, 0 6px 20px rgba(30,64,120,.14)', boxSizing: 'border-box' }}>
              {fotoUrl ? <img src={fotoUrl} alt="Foto do administrador" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : nome.charAt(0).toUpperCase()}
            </div>
            <button type="button" aria-label="Alterar foto de perfil" title="Alterar foto de perfil"
              onClick={() => setEditorAberto(true)}
              style={{ position: 'absolute', right: 0, bottom: 0, width: 36, height: 36, borderRadius: '50%', border: '3px solid #fff', background: '#2563eb', color: '#fff', cursor: 'pointer', boxShadow: '0 3px 10px rgba(30,64,120,.22)', display: 'grid', placeItems: 'center', padding: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 4h-4L8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-3Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7 }}>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.2, color: '#1e293b' }}>{nome}</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Administrador do QuitAÍ</p>
            <button type="button" onClick={() => setEditorAberto(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #cfe0f7', borderRadius: 9, background: '#eff6ff', padding: '9px 13px', color: '#1d4ed8', cursor: 'pointer', fontWeight: 650, fontSize: 13, marginTop: 5 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 4h-4L8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-3Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              Alterar foto
            </button>
          </div>
        </div>
        {erroFoto && <Aviso tipo="erro">{erroFoto}</Aviso>}
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={campo}><strong>Nome completo</strong><p style={{ margin: '6px 0 0' }}>{nome}</p></div>
          <div style={campo}><strong>E-mail</strong><p style={{ margin: '6px 0 0' }}>{email}</p></div>
          <div style={campo}><strong>Perfil de acesso</strong><p style={{ margin: '6px 0 0' }}>Administrador</p></div>
          <div style={campo}><strong>Status da conta</strong><p style={{ margin: '6px 0 0', color: '#16703c', fontWeight: 600 }}>{usuario?.ativo ? 'Ativa' : 'Não informado'}</p></div>
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 26, paddingTop: 22 }}>
          <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: 19 }}>Gerenciar minha conta</h3>
          <p style={{ margin: '0 0 17px', color: '#64748b', fontSize: 14 }}>Escolha o que deseja alterar. Seus dados ficam protegidos até você salvar.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="admin-primary-button" aria-expanded={secaoEdicao === 'dados'}
              onClick={() => { setSecaoEdicao(atual => atual === 'dados' ? null : 'dados'); setErroDados(''); setMensagemDados('') }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 16px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg>
              {secaoEdicao === 'dados' ? 'Fechar edição' : 'Editar nome e e-mail'}
            </button>
            <button type="button" aria-expanded={secaoEdicao === 'senha'}
              onClick={() => { setSecaoEdicao(atual => atual === 'senha' ? null : 'senha'); setErroSenha(''); setMensagemSenha(''); setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha('') }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 16px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', fontWeight: 650 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              {secaoEdicao === 'senha' ? 'Fechar alteração' : 'Alterar senha'}
            </button>
          </div>
          {mensagemDados && secaoEdicao !== 'dados' && <div style={{ marginTop: 14 }}><Aviso tipo="sucesso">{mensagemDados}</Aviso></div>}
          {mensagemSenha && secaoEdicao !== 'senha' && <div style={{ marginTop: 14 }}><Aviso tipo="sucesso">{mensagemSenha}</Aviso></div>}
        </div>
        {secaoEdicao === 'dados' && <div style={{ border: '1px solid #dbe5f2', borderRadius: 12, background: '#f8fbff', marginTop: 18, padding: 20 }}>
          <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: 19 }}>Editar informações</h3>
          <p style={{ margin: '0 0 18px', color: '#64748b' }}>Atualize o nome e o e-mail usados na sua conta.</p>
          <form onSubmit={salvarDados} style={{ display: 'grid', gap: 14 }}>
            <label style={{ display: 'grid', gap: 7, fontWeight: 600, color: '#334155' }}>
              Nome completo
              <input type="text" autoComplete="name" maxLength={120} required minLength={2}
                value={nomeEditado} onChange={e => setNomeEditado(e.target.value)} disabled={salvandoDados}
                style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 9, fontSize: 15, width: '100%', boxSizing: 'border-box' }} />
            </label>
            <label style={{ display: 'grid', gap: 7, fontWeight: 600, color: '#334155' }}>
              E-mail
              <input type="email" autoComplete="email" required maxLength={254}
                value={emailEditado} onChange={e => setEmailEditado(e.target.value)} disabled={salvandoDados}
                style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 9, fontSize: 15, width: '100%', boxSizing: 'border-box' }} />
            </label>
            {erroDados && <Aviso tipo="erro">{erroDados}</Aviso>}
            {mensagemDados && <Aviso tipo="sucesso">{mensagemDados}</Aviso>}
            <div><button type="submit" className="admin-primary-button" disabled={salvandoDados || (nomeEditado.trim() === nome && emailEditado.trim().toLowerCase() === email.toLowerCase())}>
              {salvandoDados ? 'Salvando...' : 'Salvar alterações'}
            </button></div>
          </form>
        </div>}
        {secaoEdicao === 'senha' && <div style={{ border: '1px solid #dbe5f2', borderRadius: 12, background: '#f8fbff', marginTop: 18, padding: 20 }}>
          <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: 19 }}>Alterar senha</h3>
          <p style={{ margin: '0 0 18px', color: '#64748b' }}>Confirme sua senha atual para definir uma nova.</p>
          <form onSubmit={salvarSenha} style={{ display: 'grid', gap: 14 }}>
            {[
              ['Senha atual', senhaAtual, setSenhaAtual, 'current-password'],
              ['Nova senha', novaSenha, setNovaSenha, 'new-password'],
              ['Confirmar nova senha', confirmarSenha, setConfirmarSenha, 'new-password'],
            ].map(([rotulo, valor, alterar, autoComplete]) => (
              <label key={rotulo} style={{ display: 'grid', gap: 7, fontWeight: 600, color: '#334155' }}>
                {rotulo}
                <input type="password" autoComplete={autoComplete} required value={valor}
                  onChange={e => alterar(e.target.value)} disabled={salvandoSenha}
                  style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 9, fontSize: 15, width: '100%', boxSizing: 'border-box' }} />
              </label>
            ))}
            <span style={{ fontSize: 13, color: '#64748b' }}>Use uma senha nova de pelo menos 8 caracteres (máximo de 72 bytes).</span>
            {erroSenha && <Aviso tipo="erro">{erroSenha}</Aviso>}
            {mensagemSenha && <Aviso tipo="sucesso">{mensagemSenha}</Aviso>}
            <div><button type="submit" className="admin-primary-button" disabled={salvandoSenha}>
              {salvandoSenha ? 'Alterando...' : 'Alterar senha'}
            </button></div>
          </form>
        </div>}
      </div>
      <button type="button" className="admin-primary-button" style={{ marginTop: 22 }} onClick={onVoltar}>Voltar ao início</button>
      {editorAberto && <EditorFoto onFechar={() => setEditorAberto(false)} onSalvar={depoisDeSalvar} />}
    </section>
  )
}

export default function AdminApp() {
  const [paginaAtual, setPaginaAtual] = useState('inicio')
  const [estado, setEstado] = useState('validando')
  const [usuario, setUsuario] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false

    async function validarAcesso() {
      const token = obterToken()

      if (!token) {
        if (!cancelado) setEstado('sem-sessao')
        return
      }

      try {
        const resposta = await fetch(`${API_URL}/auth/me`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (resposta.status === 401) {
          limparSessao()
          if (!cancelado) setEstado('sem-sessao')
          return
        }

        if (resposta.status === 403) {
          if (!cancelado) setEstado('negado')
          return
        }

        if (!resposta.ok) {
          throw new Error('Não foi possível validar sua sessão.')
        }

        const dados = await resposta.json()

        if (cancelado) return

        if (dados.perfil !== 'admin' || dados.ativo !== true) {
          setEstado('negado')
          return
        }

        setUsuario(dados)
        setEstado('autorizado')
      } catch (e) {
        if (!cancelado) {
          setErro(e.message || 'Falha ao validar acesso.')
          setEstado('erro')
        }
      }
    }

    validarAcesso()

    return () => {
      cancelado = true
    }
  }, [])

  function sair() {
    limparSessao()
    window.location.replace('/')
  }

  function navegar(pagina) {
    setPaginaAtual(pagina)
  }

  if (estado === 'validando') {
    return (
      <div className="admin-shell">
        <main className="admin-content">
          <h1>Verificando acesso...</h1>
          <p>Aguarde enquanto validamos sua sessão.</p>
        </main>
      </div>
    )
  }

  if (estado === 'sem-sessao') {
    return (
      <div className="admin-shell">
        <main className="admin-content">
          <h1>Entre na sua conta</h1>
          <p>Faça login para continuar. Somente administradores ativos podem acessar este painel.</p>
          <button
            className="admin-primary-button"
            onClick={() => { window.location.href = '/' }}
          >
            Ir para o login
          </button>
        </main>
      </div>
    )
  }

  if (estado === 'negado') {
    return (
      <div className="admin-shell admin-access-page">
        <main className="admin-access-card">
          <div className="admin-access-brand"><img className="admin-access-brand-image" src="/quitai_admin_logo.png" alt="QuitAÍ Admin" /></div>
          <div className="admin-access-icon" aria-hidden="true">🔒</div>
          <span className="admin-access-tag">ÁREA RESTRITA</span>
          <h1>Acesso não autorizado</h1>
          <p>Este painel é exclusivo para administradores ativos.</p>
          <Aviso tipo="info">Sua conta não tem permissão para acessar esta área. Você pode continuar usando a área de vendas normalmente.</Aviso>
          <button type="button" className="admin-primary-button admin-access-action"
            onClick={() => { window.location.replace('/') }}>
            ← Voltar para Minhas Vendas
          </button>
          <span className="admin-access-footnote">Sua sessão será mantida.</span>
        </main>
      </div>
    )
  }

  if (estado === 'erro') {
    return (
      <div className="admin-shell">
        <main className="admin-content">
          <h1>Não foi possível validar o acesso</h1>
          <p>{erro}</p>
          <button
            className="admin-primary-button"
            onClick={() => window.location.reload()}
          >
            Tentar novamente
          </button>
        </main>
      </div>
    )
  }

  function renderizarPagina() {
    if (paginaAtual === 'politica-privacidade') {
      return <PoliticaPrivacidade onVoltar={() => navegar('configuracoes')} />
    }
    if (paginaAtual === 'termos-uso') {
      return <TermosUso onVoltar={() => navegar('configuracoes')} />
    }
    if (paginaAtual === 'direitos-lgpd') {
      return <DireitosLGPD onVoltar={() => navegar('configuracoes')} />
    }

    if (paginaAtual === 'minha-conta') {
      return <MinhaConta usuario={usuario} onUsuarioAtualizado={setUsuario} onVoltar={() => navegar('inicio')} />
    }
    if (paginaAtual === 'revendedoras') {
      return <ListaRevendedoras onVoltar={() => navegar('inicio')}
        onCadastrar={() => navegar('cadastro')} />
    }
    if (paginaAtual === 'cadastro') {
      return <CadastroRevendedora onVoltar={() => navegar('inicio')} />
    }
    if (paginaAtual === 'suporte') {
      return <CentralSuporteAdmin onVoltar={() => navegar('inicio')} />
    }
    if (paginaAtual === 'relatorios') {
      return <Relatorios onVoltar={() => navegar('inicio')} />
    }
    if (paginaAtual === 'configuracoes') {
      return <Configuracoes usuario={usuario} onNavegar={navegar} />
    }
    if (paginaAtual === 'inicio') {
      return <Dashboard onNavegar={navegar} />
    }

    const paginas = {
      revendedoras: {
        titulo: 'Revendedoras',
        descricao: 'Consulte e gerencie as contas das revendedoras.',
      },
      cadastro: {
        titulo: 'Cadastrar conta',
        descricao: 'Área destinada ao cadastro administrativo de novas revendedoras.',
      },
      relatorios: {
        titulo: 'Relatórios',
        descricao: 'Acompanhe informações consolidadas do sistema.',
      },
      configuracoes: {
        titulo: 'Configurações',
        descricao: 'Configurações do Gestor Administrativo.',
      },
    }

    const pagina = paginas[paginaAtual]

    if (!pagina) {
      return <Dashboard onNavegar={navegar} />
    }

    return (
      <section className="admin-placeholder">
        <span className="admin-eyebrow">GESTÃO ADMINISTRATIVA</span>
        <h1>{pagina.titulo}</h1>
        <p>{pagina.descricao}</p>

        <div className="admin-info-panel">
          <div className="admin-info-icon" aria-hidden="true">i</div>
          <div>
            <h2>Área em desenvolvimento</h2>
            <p>
              Esta página será implementada na próxima etapa e conectada
              às funcionalidades do backend.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="admin-primary-button"
          onClick={() => navegar('inicio')}
        >
          Voltar ao início
        </button>
      </section>
    )
  }

  return (
    <AdminLayout paginaAtual={paginaAtual} onNavegar={navegar} onSair={sair} usuario={usuario}>
      {renderizarPagina()}
    </AdminLayout>
  )
}
