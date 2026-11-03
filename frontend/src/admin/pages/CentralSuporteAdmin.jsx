import GestaoAvisosAdmin from './GestaoAvisosAdmin'
import { conectarEventosSuporte } from '../../services/suporteEventos'
import { useCallback, useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8082'
const cores = { aberto: '#b45309', em_andamento: '#1d4ed8', resolvido: '#15803d' }
const nomes = { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido' }
const campo = { width: '100%', padding: '11px 12px', border: '1px solid #cbd5e1', borderRadius: 9, boxSizing: 'border-box', font: 'inherit' }
const painel = { background: '#fff', border: '1px solid #dbe3ed', borderRadius: 12, padding: 20 }

function token() {
  return localStorage.getItem('quitai_token') || sessionStorage.getItem('quitai_token')
}
async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`${API_URL}${caminho}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token()}`, ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}), ...opcoes.headers },
  })
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) throw new Error(dados.mensagem || `Erro HTTP ${resposta.status}`)
  return dados
}
function dataHora(valor) {
  if (!valor) return '—'
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleString('pt-BR')
}

export default function CentralSuporteAdmin({ onVoltar }) {
  const [chamados, setChamados] = useState([])
  const [selecionado, setSelecionado] = useState(null)
  const [detalhe, setDetalhe] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [resposta, setResposta] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [confirmarEncerramento, setConfirmarEncerramento] = useState(false)

  const atualizarLista = useCallback(async () => {
    const dados = await api('/admin/suporte')
    if (!Array.isArray(dados)) throw new Error('Resposta inesperada ao listar chamados.')
    setChamados(dados)
  }, [])

  const abrir = useCallback(async (id) => {
    setErro('')
    setSucesso('')
    setSelecionado(id)
    setDetalhe(null)
    try {
      const dados = await api(`/admin/suporte/${id}`)
      setDetalhe(dados)
    } catch (e) {
      setErro(e.message)
    }
  }, [])

  useEffect(() => {
    let ativo = true
    api('/admin/suporte').then(dados => {
      if (!ativo) return
      if (!Array.isArray(dados)) throw new Error('Resposta inesperada ao listar chamados.')
      setChamados(dados)
    }).catch(e => { if (ativo) setErro(e.message) }).finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [])

  // Atualização imediata por SSE; fallback periódico em caso de falha de rede.
  useEffect(() => {
    let ativo = true
    let ocupado = false
    const sincronizar = async () => {
      if (!ativo || ocupado || document.hidden) return
      ocupado = true
      try {
        const lista = await api('/admin/suporte')
        if (ativo && Array.isArray(lista)) setChamados(lista)
        if (selecionado) {
          const dados = await api(`/admin/suporte/${selecionado}`)
          if (ativo) setDetalhe(dados)
        }
      } catch (_) { /* mantém os dados atuais */ }
      finally { ocupado = false }
    }
    const desconectar = conectarEventosSuporte('/admin/suporte/eventos', sincronizar)
    const intervalo = window.setInterval(sincronizar, 15000)
    const aoRetornar = () => { if (!document.hidden) sincronizar() }
    document.addEventListener('visibilitychange', aoRetornar)
    window.addEventListener('focus', aoRetornar)
    return () => { ativo = false; desconectar(); clearInterval(intervalo); document.removeEventListener('visibilitychange', aoRetornar); window.removeEventListener('focus', aoRetornar) }
  }, [selecionado])

  async function responder(evento) {
    evento.preventDefault()
    const mensagem = resposta.trim()
    if (!selecionado || !mensagem || processando) return
    setProcessando(true)
    setErro('')
    setSucesso('')
    try {
      await api(`/admin/suporte/${selecionado}/respostas`, { method: 'POST', body: JSON.stringify({ mensagem }) })
      setResposta('')
      await Promise.all([atualizarLista(), abrir(selecionado)])
      setSucesso('Resposta enviada e salva com sucesso.')
    } catch (e) { setErro(e.message) }
    finally { setProcessando(false) }
  }

  async function mudarStatus(status) {
    if (!selecionado || processando) return
    setProcessando(true)
    setErro('')
    setSucesso('')
    try {
      await api(`/admin/suporte/${selecionado}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await Promise.all([atualizarLista(), abrir(selecionado)])
      setSucesso('Status atualizado com sucesso.')
    } catch (e) { setErro(e.message) }
    finally { setProcessando(false) }
  }

  function sairDaConversa() {
    setSelecionado(null)
    setDetalhe(null)
    setConfirmarEncerramento(false)
    setResposta('')
    setErro('')
    setSucesso('')
  }

  async function encerrarAtendimento() {
    if (!selecionado || processando) return
    setConfirmarEncerramento(false)
    const id = selecionado
    setProcessando(true)
    setErro('')
    setSucesso('')
    try {
      await api(`/admin/suporte/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolvido' }),
      })
      await atualizarLista()
      setSelecionado(null)
      setDetalhe(null)
      setResposta('')
      setSucesso(`Atendimento #${id} encerrado com sucesso.`)
    } catch (e) {
      setErro(e.message)
    } finally {
      setProcessando(false)
    }
  }

  const filtrados = chamados.filter(c => {
    const texto = `${c.id} ${c.assunto} ${c.categoria} ${c.revendedora_nome} ${c.revendedora_email}`.toLowerCase()
    return (filtro === 'todos' || c.status === filtro) && texto.includes(busca.trim().toLowerCase())
  })

  return (
    <section className="admin-placeholder">
      <style>{`
.qa-modal-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px)}
.qa-modal{width:min(100%,520px);background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 25px 70px rgba(15,23,42,.3);border:1px solid #dbeafe;color:#152238}
.qa-modal-header{background:linear-gradient(115deg,#58a2f4,#0861c4);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:18px 24px;font-weight:750;font-size:17px}
.qa-modal-close{background:transparent;color:#fff;border:0;font-size:27px;cursor:pointer;line-height:1}
.qa-modal-body{padding:26px 28px 28px;text-align:center}
.qa-modal-icon{width:76px;height:76px;border-radius:20px;background:#e0efff;color:#0861c4;display:grid;place-items:center;margin:0 auto 15px;font-size:39px}
.qa-modal h2{font-size:25px;margin:0 0 12px;color:#0f172a}
.qa-modal-description{font-size:16px;line-height:1.55;margin:0 0 20px;color:#475569}
.qa-modal-info{display:flex;align-items:center;gap:12px;text-align:left;background:#e7f1ff;color:#1e3a5f;padding:15px;border-radius:12px;font-size:14px;line-height:1.45;margin-bottom:22px}
.qa-modal-actions{display:flex;gap:12px}
.qa-modal-actions button{flex:1;min-height:47px;padding:10px;border-radius:11px;font-size:14px;font-weight:750;cursor:pointer}
.qa-modal-cancel{background:#fff;color:#334155;border:1px solid #cbd5e1}
.qa-modal-confirm{background:#0861c4;color:white;border:1px solid #0861c4}
.qa-modal-actions button:disabled{opacity:.6;cursor:wait}
@media(max-width:480px){.qa-modal-actions{flex-direction:column}.qa-modal-body{padding:20px}}
/* Conversa moderna do painel gestor */
.qa-status-panel{margin:16px 0 20px;padding:16px;background:#f8faff;border:1px solid #e1e9f5;border-radius:16px}
.qa-status-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;color:#24364e;font-size:13px}
.qa-status-heading span{font-size:11px;font-weight:400;color:#7c8aa0}
.qa-status-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.qa-status-option{min-height:49px;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 8px;border:1px solid #dbe4f0;background:white;color:#516177;border-radius:11px;cursor:pointer;font:600 12px inherit;font-size:12px;font-weight:650;transition:background .15s,border-color .15s,box-shadow .15s}
.qa-status-option:hover:not(:disabled){background:#f2f6ff;border-color:#a8bce0}
.qa-status-option:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}
.qa-status-option:disabled{opacity:.6;cursor:wait}
.qa-status-icon{font-size:17px;line-height:1}
.qa-status-check{font-size:13px;margin-left:2px}
.qa-status-aberto.is-active{background:#fff7e8;border-color:#eabf6a;color:#996313;box-shadow:0 0 0 1px #eabf6a inset}
.qa-status-em_andamento.is-active{background:#eaf2ff;border-color:#76a6f5;color:#1d58ad;box-shadow:0 0 0 1px #76a6f5 inset}
.qa-status-resolvido.is-active{background:#e8f8ee;border-color:#74c79a;color:#18794a;box-shadow:0 0 0 1px #74c79a inset}
@media(max-width:550px){.qa-status-options{grid-template-columns:1fr}.qa-status-option{justify-content:flex-start;padding-left:16px}.qa-status-check{margin-left:auto}}

.qa-chat-admin{--qa-accent:#2563eb;--qa-bg:#f0f5fc;--qa-out:#dceaff;--qa-in:#fff}
.qa-chat{--qa-accent:#b93678;--qa-bg:#fff2f7;--qa-out:#f8d9e8;--qa-in:#fff;overflow:hidden;border:1px solid #ecd5e0;border-radius:20px;margin-top:20px;background:#fff}
.qa-chat-header{display:flex;align-items:center;gap:11px;padding:14px 16px;background:var(--qa-accent);color:white}
.qa-chat-back{border:0;background:transparent;color:white;font-size:25px;cursor:pointer;padding:3px 8px}
.qa-chat-avatar{width:39px;height:39px;border-radius:50%;background:#ffffff2b;display:grid;place-items:center;font-weight:800;font-size:19px}
.qa-chat-title{display:flex;flex-direction:column;gap:3px;min-width:0}.qa-chat-title strong{font-size:15px}.qa-chat-title small{font-size:11px;opacity:.88}
.qa-chat-subject{background:#fff;padding:10px 16px;font-size:12px;color:#856b78;border-bottom:1px solid #f0dfe6;overflow-wrap:anywhere}
.qa-chat-messages{display:flex;flex-direction:column;gap:11px;min-height:190px;max-height:450px;overflow-y:auto;padding:22px 16px;background:var(--qa-bg)}
.qa-chat-bubble{width:fit-content;max-width:84%;padding:10px 13px 7px;border-radius:15px;box-shadow:0 2px 5px #2e14200b;overflow-wrap:anywhere}
.qa-chat-in{align-self:flex-start;background:var(--qa-in);border-bottom-left-radius:4px}.qa-chat-out{align-self:flex-end;background:var(--qa-out);border-bottom-right-radius:4px}
.qa-chat-sender{display:block;font-weight:750;font-size:11px;color:var(--qa-accent);margin-bottom:4px}
.qa-chat-bubble p{font-size:14px;line-height:1.55;white-space:pre-wrap;margin:0;color:#302630}.qa-chat-bubble time{display:block;text-align:right;font-size:10px;color:#876d7b;margin-top:5px}
.qa-chat-compose{display:flex;align-items:center;gap:10px;padding:12px;background:white;border-top:1px solid #f0dfe6}
.qa-chat-compose textarea{flex:1;min-width:0;resize:vertical;border:1px solid #ead5df;border-radius:15px;padding:12px 14px;font:inherit;font-size:14px;outline-color:var(--qa-accent)}
.qa-chat-compose button{border:0;border-radius:50%;width:44px;height:44px;flex:none;background:var(--qa-accent);color:white;font-size:20px;cursor:pointer}
.qa-chat-compose button:disabled{opacity:.4;cursor:not-allowed}
@media(max-width:550px){.qa-chat{border-radius:15px}.qa-chat-messages{padding:14px 10px}.qa-chat-bubble{max-width:92%}}
`}</style>
      <span className="admin-eyebrow">GESTÃO ADMINISTRATIVA</span>
      <h1>Central de Suporte</h1>
      <p>Consulte os chamados das revendedoras e responda diretamente pelo painel.</p>
      {erro && <p role="alert" style={{ color: '#b42318', padding: 12, background: '#fff1f2', borderRadius: 8 }}>{erro}</p>}
      {sucesso && <p role="status" style={{ color: '#166534', padding: 12, background: '#ecfdf5', borderRadius: 8 }}>{sucesso}</p>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '20px 0' }}>
        {['todos', 'aberto', 'em_andamento', 'resolvido'].map(s => (
          <button key={s} type="button" onClick={() => setFiltro(s)} style={{ padding: '10px 15px', borderRadius: 9, border: filtro === s ? '2px solid #2563eb' : '1px solid #cbd5e1', background: filtro === s ? '#eff6ff' : '#fff', color: '#1e293b', cursor: 'pointer', fontWeight: 650 }}>
            {s === 'todos' ? 'Todos' : nomes[s]} ({chamados.filter(c => s === 'todos' || c.status === s).length})
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <input aria-label="Buscar chamados" placeholder="Buscar por assunto, revendedora ou número..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...campo, maxWidth: 420, flex: '1 1 260px' }} />
        <button type="button" className="admin-primary-button" onClick={() => { setErro(''); atualizarLista().catch(e => setErro(e.message)) }}>Atualizar</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18, alignItems: 'start' }}>
        <div style={painel}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>Chamados ({filtrados.length})</h2>
          {carregando ? <p>Carregando chamados...</p> : filtrados.length === 0 ? <p>Nenhum chamado encontrado.</p> : (
            <div style={{ display: 'grid', gap: 10, maxHeight: 590, overflowY: 'auto' }}>
              {filtrados.map(c => (
                <button key={c.id} type="button" onClick={() => abrir(c.id)} style={{ textAlign: 'left', cursor: 'pointer', padding: 14, borderRadius: 9, border: selecionado === c.id ? '2px solid #2563eb' : '1px solid #e2e8f0', background: selecionado === c.id ? '#eff6ff' : '#fff', color: '#1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><strong>#{c.id} — {c.assunto}</strong><span style={{ color: cores[c.status] || '#64748b', fontWeight: 700 }}>{nomes[c.status] || c.status}</span></div>
                  <div style={{ marginTop: 6, fontSize: 14, color: '#475569' }}>{c.revendedora_nome} · {c.revendedora_email}</div>
                  <div style={{ marginTop: 5, fontSize: 12, color: '#64748b' }}>{c.categoria} · {dataHora(c.atualizado_em)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={painel}>
          {!selecionado ? <p>Selecione um chamado para visualizar a conversa.</p> : !detalhe ? <p>Carregando atendimento...</p> : (
            <>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>#{detalhe.id} — {detalhe.assunto}</h2>
              <p style={{ color: '#64748b', marginTop: 0 }}>{detalhe.revendedora_nome} · {detalhe.revendedora_email}</p>
              <div className="qa-status-panel" role="group" aria-label="Status do chamado">
                <div className="qa-status-heading"><strong>Status do chamado</strong><span>Selecione para atualizar</span></div>
                <div className="qa-status-options">
                  {[
                    { valor: 'aberto', rotulo: 'Aberto', simbolo: '○' },
                    { valor: 'em_andamento', rotulo: 'Em andamento', simbolo: '◷' },
                    { valor: 'resolvido', rotulo: 'Resolvido', simbolo: '✓' },
                  ].map(opcao => (
                    <button key={opcao.valor} type="button" disabled={processando}
                      aria-pressed={detalhe.status === opcao.valor}
                      className={'qa-status-option qa-status-' + opcao.valor + (detalhe.status === opcao.valor ? ' is-active' : '')}
                      onClick={() => { if (detalhe.status !== opcao.valor) mudarStatus(opcao.valor) }}>
                      <span className="qa-status-icon" aria-hidden="true">{opcao.simbolo}</span>
                      <span>{opcao.rotulo}</span>
                      {detalhe.status === opcao.valor && <span className="qa-status-check" aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0' }}>
                <button type="button" onClick={sairDaConversa} disabled={processando} style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', fontWeight: 700 }}>
                  ← Sair da conversa
                </button>
                <button type="button" onClick={() => setConfirmarEncerramento(true)} disabled={processando || detalhe.status === 'resolvido'} style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid #0861c4', background: '#0861c4', color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: processando || detalhe.status === 'resolvido' ? 0.55 : 1 }}>
                  ✓ Encerrar atendimento
                </button>
              </div>
              <div className="qa-chat qa-chat-admin">
                <div className="qa-chat-header"><span className="qa-chat-avatar">{(detalhe.revendedora_nome || 'R').charAt(0).toUpperCase()}</span><div className="qa-chat-title"><strong>{detalhe.revendedora_nome}</strong><small>Atendimento #{detalhe.id} · {nomes[detalhe.status]}</small></div></div>
                <div className="qa-chat-messages" aria-label="Histórico da conversa">
                  {(detalhe.mensagens || []).map(m => (
                    <div key={m.id} className={'qa-chat-bubble ' + (m.autor_perfil === 'admin' ? 'qa-chat-out' : 'qa-chat-in')}>
                      <span className="qa-chat-sender">{m.autor_perfil === 'admin' ? 'Você · Administrador' : detalhe.revendedora_nome}</span>
                      <p>{m.mensagem}</p><time>{dataHora(m.criado_em)}</time>
                    </div>
                  ))}
                </div>
                <form onSubmit={responder} className="qa-chat-compose"><textarea aria-label="Responder revendedora" rows={2} maxLength={5000} required placeholder="Digite sua resposta..." value={resposta} disabled={processando} onChange={e => setResposta(e.target.value)} /><button type="submit" disabled={processando || !resposta.trim()} aria-label="Enviar resposta">➤</button></form>
              </div>
            </>
          )}
        </div>
      </div>
      {confirmarEncerramento && detalhe && (
        <div className="qa-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !processando) setConfirmarEncerramento(false) }}>
          <div className="qa-modal" role="dialog" aria-modal="true" aria-labelledby="qa-modal-title">
            <div className="qa-modal-header"><span>◉ QuitaAí — Central de Suporte</span><button type="button" className="qa-modal-close" aria-label="Fechar" disabled={processando} onClick={() => setConfirmarEncerramento(false)}>×</button></div>
            <div className="qa-modal-body">
              <div className="qa-modal-icon" aria-hidden="true">✓</div>
              <h2 id="qa-modal-title">Encerrar atendimento?</h2>
              <p className="qa-modal-description">O chamado <strong>#{detalhe.id}</strong> será marcado como <strong>Resolvido</strong> e o atendimento será finalizado.</p>
              <div className="qa-modal-info"><span style={{ fontSize: 24 }} aria-hidden="true">ⓘ</span><span>O histórico da conversa será mantido e poderá ser consultado posteriormente.</span></div>
              <div className="qa-modal-actions">
                <button type="button" className="qa-modal-cancel" disabled={processando} onClick={() => setConfirmarEncerramento(false)}>× &nbsp; Cancelar</button>
                <button type="button" className="qa-modal-confirm" disabled={processando} onClick={encerrarAtendimento}>{processando ? 'Encerrando...' : '✓  Encerrar atendimento'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <GestaoAvisosAdmin />
      <button type="button" className="admin-primary-button" onClick={onVoltar} style={{ marginTop: 22 }}>Voltar ao início</button>
    </section>
  )
}
