import { useCallback, useEffect, useState } from 'react'
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8082'
async function api(path, options = {}) {
  const token = localStorage.getItem('quitai_token') || sessionStorage.getItem('quitai_token')
  const res = await fetch(BASE + path, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.mensagem || `Erro HTTP ${res.status}`)
  return data
}
export default function GestaoAvisosAdmin() {
  const [dados, setDados] = useState({ avisos: [], manutencao: false, mensagem_manutencao: '' })
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [tipo, setTipo] = useState('informacao')
  const [msgManutencao, setMsgManutencao] = useState('')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmacao, setConfirmacao] = useState(null)
  const carregar = useCallback(async () => { const d = await api('/admin/sistema/avisos'); setDados(d); setMsgManutencao(d.mensagem_manutencao || '') }, [])
  useEffect(() => { carregar().catch(e => setErro(e.message)) }, [carregar])
  async function executar(fn) { setOcupado(true); setErro(''); setSucesso(''); try { await fn(); await carregar(); setSucesso('Alteração salva com sucesso.') } catch(e) { setErro(e.message) } finally { setOcupado(false) } }
  function confirmarAcao() {
    if (!confirmacao || ocupado) return
    const acao = confirmacao.acao
    setConfirmacao(null)
    executar(acao)
  }
  const botao = { padding: '11px 18px', border: 0, borderRadius: 11, background: '#1765c1', color: '#fff', cursor: 'pointer', fontWeight: 700 }
  const campo = { width: '100%', padding: '13px 15px', border: '1px solid #d9e3f1', borderRadius: 12, boxSizing: 'border-box', font: 'inherit', background: '#fff', color: '#22334c' }
  return <section className="qa-gestao">
    <style>{`
      .qa-gestao{margin-top:28px;padding:clamp(18px,3vw,32px);background:#fff;border:1px solid #e0e8f4;border-radius:22px;color:#25354d;box-shadow:0 12px 35px rgba(30,68,116,.06);font-family:inherit}
      .qa-gestao *{box-sizing:border-box}.qa-gestao .qa-hero{background:linear-gradient(120deg,#103b74,#216dc5);padding:25px 26px;border-radius:17px;color:#fff;margin-bottom:22px;position:relative;overflow:hidden}
      .qa-gestao .qa-hero:after{content:'✦';position:absolute;right:23px;top:-30px;font-size:120px;opacity:.09;pointer-events:none}.qa-gestao .qa-hero h2{margin:8px 0;font-size:clamp(21px,3vw,27px);color:#fff}.qa-gestao .qa-hero p{margin:0;color:#e5f0ff;line-height:1.6;font-size:14px}.qa-gestao .qa-kicker{font-size:11px;letter-spacing:1.5px;font-weight:800;color:#b8d9ff;text-transform:uppercase}
      .qa-gestao .qa-section{border:1px solid #e0e8f4;border-radius:17px;padding:clamp(17px,2.5vw,24px);margin-bottom:19px;background:#fff}.qa-gestao .qa-section h3{font-size:18px;margin:0 0 7px;color:#1e3657}.qa-gestao .qa-muted{font-size:13px;color:#718198;line-height:1.6;margin:0 0 17px}.qa-gestao .qa-heading-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:13px}
      .qa-gestao .qa-status{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:100px;font-size:12px;font-weight:800}.qa-gestao .qa-status:before{content:'';height:8px;width:8px;border-radius:50%;background:currentColor}.qa-gestao .qa-status-on{background:#fff1e7;color:#a34e15}.qa-gestao .qa-status-off{background:#e9f9ef;color:#167447}
      .qa-gestao label{display:block;font-size:13px;font-weight:700;color:#405470;margin:0 0 9px}.qa-gestao input,.qa-gestao select,.qa-gestao textarea{transition:border-color .2s,box-shadow .2s;outline:none}.qa-gestao input:focus,.qa-gestao select:focus,.qa-gestao textarea:focus{border-color:#3b82f6!important;box-shadow:0 0 0 3px #dbeafe}.qa-gestao textarea{resize:vertical;line-height:1.55}.qa-gestao button{transition:transform .15s,filter .15s}.qa-gestao button:hover:not(:disabled){filter:brightness(1.07);transform:translateY(-1px)}.qa-gestao button:disabled{opacity:.55;cursor:wait}.qa-gestao .qa-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:13px}.qa-gestao .qa-actions button{margin:0!important}
      .qa-gestao .qa-publish{display:grid;gap:12px}.qa-gestao .qa-publish button[type=submit]{padding:14px}.qa-gestao .qa-notice{border:1px solid #e1e8f2;border-radius:14px;padding:17px 18px;background:#fbfdff;display:grid;gap:10px}.qa-gestao .qa-notice-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.qa-gestao .qa-notice strong{color:#233955}.qa-gestao .qa-tag{font-size:11px;font-weight:800;padding:5px 9px;border-radius:20px;background:#eaf2ff;color:#2463ae}.qa-gestao .qa-tag.is-hidden{background:#f0f1f4;color:#6d7480}.qa-gestao .qa-notice p{margin:0;color:#63748a;line-height:1.6;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}.qa-gestao .qa-feedback{padding:11px 14px;border-radius:10px;font-size:13px;font-weight:650;margin-bottom:16px}
      .qa-confirm-overlay{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.62);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:20px}
      .qa-confirm-card{width:min(100%,460px);background:#fff;border-radius:22px;box-shadow:0 28px 90px rgba(5,26,61,.3);overflow:hidden;animation:qa-confirm-enter .18s ease-out;border:1px solid #dbe7f6}
      @keyframes qa-confirm-enter{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
      .qa-confirm-top{padding:19px 23px;background:linear-gradient(110deg,#123d78,#246ec4);color:white;display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:14px;font-weight:800}
      .qa-confirm-close{border:0;background:rgba(255,255,255,.13);color:white;border-radius:9px;font-size:23px;line-height:1;width:33px;height:33px;cursor:pointer}
      .qa-confirm-body{padding:27px 27px 25px;text-align:center}.qa-confirm-icon{margin:0 auto 16px;width:74px;height:74px;border-radius:22px;display:grid;place-items:center;font-size:34px}.qa-confirm-icon.is-warning{background:#fff1df;color:#ac5a13}.qa-confirm-icon.is-success{background:#e8f8ee;color:#14804b}.qa-confirm-icon.is-danger{background:#fff0f0;color:#b42332}
      .qa-confirm-body h3{margin:0 0 10px;font-size:23px;color:#142e50}.qa-confirm-body p{font-size:14px;line-height:1.65;color:#5b6d85;margin:0 0 20px}.qa-confirm-note{padding:12px 14px;background:#f0f6ff;border:1px solid #dce8f8;border-radius:12px;color:#315577;font-size:12px;line-height:1.5;margin-bottom:22px;text-align:left}
      .qa-confirm-buttons{display:flex;gap:10px}.qa-confirm-buttons button{flex:1;min-height:46px;border-radius:11px;font-weight:800;font-size:13px;cursor:pointer;padding:10px}.qa-confirm-cancel{background:white;border:1px solid #ccd8e8;color:#39506c}.qa-confirm-accept{border:0;color:white;background:#1765c1}.qa-confirm-accept.is-warning{background:#b85d21}.qa-confirm-accept.is-success{background:#168252}.qa-confirm-accept.is-danger{background:#b42332}
      @media(max-width:540px){.qa-gestao .qa-hero{padding:22px 19px}.qa-gestao .qa-actions button{flex:1}.qa-gestao .qa-section{padding:17px}}
    `}</style>
    <header className="qa-hero"><span className="qa-kicker">PAINEL GESTOR · COMUNICAÇÃO</span><h2>Avisos e manutenção</h2><p>Comunique novidades às revendedoras e gerencie a disponibilidade do QuitaAí em um só lugar.</p></header>
    {erro && <p role="alert" className="qa-feedback" style={{ color: '#a1242c', background: '#fff1f2' }}>{erro}</p>}{sucesso && <p role="status" className="qa-feedback" style={{ color: '#176b42', background: '#eaf9ef' }}>{sucesso}</p>}
    <div className="qa-section">
      <div className="qa-heading-row"><h3>🛠️ Modo manutenção</h3><span className={'qa-status ' + (dados.manutencao ? 'qa-status-on' : 'qa-status-off')}>{dados.manutencao ? 'Manutenção ativa' : 'Sistema disponível'}</span></div>
      <p className="qa-muted">Controle o acesso das revendedoras enquanto realiza melhorias no sistema.</p>
      <label htmlFor="msg-manutencao">Mensagem exibida às revendedoras</label>
      <textarea id="msg-manutencao" rows={3} maxLength={1000} style={campo} value={msgManutencao} onChange={e => setMsgManutencao(e.target.value)} />
      <div className="qa-actions"><button type="button" style={{ ...botao, background: dados.manutencao ? '#168252' : '#b85d21' }} disabled={ocupado} onClick={() => { const proximo = !dados.manutencao; setConfirmacao({ tipo: proximo ? 'warning' : 'success', icone: proximo ? '🛠' : '✓', titulo: proximo ? 'Ativar modo manutenção?' : 'Finalizar manutenção?', descricao: proximo ? 'As revendedoras ficarão temporariamente sem acesso às operações do aplicativo.' : 'O aplicativo será liberado novamente para todas as revendedoras.', nota: proximo ? 'Os dados de clientes, vendas e pagamentos serão preservados. O painel gestor continuará disponível.' : 'As revendedoras poderão voltar a utilizar o QuitaAí normalmente.', botao: proximo ? 'Ativar manutenção' : 'Liberar sistema', acao: () => api('/admin/sistema/manutencao', { method: 'PATCH', body: JSON.stringify({ manutencao: proximo, mensagem: msgManutencao }) }) }) }}>{dados.manutencao ? '✓ Desativar manutenção' : '🛠 Ativar manutenção'}</button>
      <button type="button" style={botao} disabled={ocupado} onClick={() => executar(() => api('/admin/sistema/manutencao', { method: 'PATCH', body: JSON.stringify({ manutencao: dados.manutencao, mensagem: msgManutencao }) }))}>Salvar mensagem</button></div>
    </div>
    <form className="qa-section qa-publish" onSubmit={e => { e.preventDefault(); executar(async () => { await api('/admin/sistema/avisos', { method: 'POST', body: JSON.stringify({ titulo, mensagem, tipo }) }); setTitulo(''); setMensagem('') }) }}>
      <h3>📣 Publicar novo aviso</h3><p className="qa-muted">Os avisos publicados aparecem no painel das revendedoras.</p>
      <label htmlFor="qa-aviso-titulo">Título do comunicado</label><input id="qa-aviso-titulo" placeholder="Ex.: Novidades no QuitaAí" minLength={3} maxLength={160} required value={titulo} onChange={e => setTitulo(e.target.value)} style={campo} />
      <label htmlFor="qa-aviso-tipo">Categoria</label><select id="qa-aviso-tipo" value={tipo} onChange={e => setTipo(e.target.value)} style={campo}><option value="informacao">Informação</option><option value="novidade">Novidade</option><option value="alerta">Alerta</option></select>
      <label htmlFor="qa-aviso-msg">Mensagem</label><textarea id="qa-aviso-msg" placeholder="Escreva sua mensagem para as revendedoras..." minLength={3} maxLength={5000} rows={4} required value={mensagem} onChange={e => setMensagem(e.target.value)} style={campo} />
      <button type="submit" disabled={ocupado} style={botao}>＋ Publicar aviso</button>
    </form>
    <div className="qa-section" style={{marginBottom:0}}><div className="qa-heading-row"><h3>📋 Avisos publicados</h3><span className="qa-tag">{dados.avisos?.length || 0} avisos</span></div>
    <div style={{ display: 'grid', gap: 11 }}>{(dados.avisos || []).length === 0 && <p className="qa-muted">Nenhum aviso publicado até o momento.</p>}{(dados.avisos || []).map(a => <article key={a.id} className="qa-notice" style={{opacity:a.ativo?1:.72}}><div className="qa-notice-top"><strong>{a.titulo}</strong><span className="qa-tag">{a.tipo === 'novidade' ? '✨ Novidade' : a.tipo === 'alerta' ? '⚠ Alerta' : 'Informação'}</span><span className={'qa-tag '+(a.ativo?'':'is-hidden')}>{a.ativo?'Visível':'Oculto'}</span></div><p>{a.mensagem}</p><div className="qa-actions" style={{marginTop:2}}><button type="button" disabled={ocupado} style={botao} onClick={() => executar(() => api(`/admin/sistema/avisos/${a.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: !a.ativo }) }))}>{a.ativo ? 'Ocultar' : 'Exibir'}</button><button type="button" disabled={ocupado} style={{ ...botao, background: '#b42332' }} onClick={() => setConfirmacao({ tipo: 'danger', icone: '🗑', titulo: 'Excluir este aviso?', descricao: `O comunicado “${a.titulo}” será excluído permanentemente.`, nota: 'Esta ação não poderá ser desfeita.', botao: 'Excluir aviso', acao: () => api(`/admin/sistema/avisos/${a.id}`, { method: 'DELETE' }) })}>Excluir</button></div></article>)}</div></div>
    {confirmacao && <div className="qa-confirm-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) setConfirmacao(null) }}>
      <div className="qa-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="qa-confirm-title" aria-describedby="qa-confirm-description">
        <div className="qa-confirm-top"><span>QuitaAí · Painel Gestor</span><button type="button" className="qa-confirm-close" aria-label="Fechar confirmação" onClick={() => setConfirmacao(null)}>×</button></div>
        <div className="qa-confirm-body">
          <div className={'qa-confirm-icon is-' + confirmacao.tipo} aria-hidden="true">{confirmacao.icone}</div>
          <h3 id="qa-confirm-title">{confirmacao.titulo}</h3>
          <p id="qa-confirm-description">{confirmacao.descricao}</p>
          <div className="qa-confirm-note">ⓘ &nbsp;{confirmacao.nota}</div>
          <div className="qa-confirm-buttons"><button type="button" className="qa-confirm-cancel" onClick={() => setConfirmacao(null)}>Cancelar</button><button type="button" className={'qa-confirm-accept is-' + confirmacao.tipo} onClick={confirmarAcao}>{confirmacao.botao}</button></div>
        </div>
      </div>
    </div>}
  </section>
}
