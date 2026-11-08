import { obterExportacaoAdministrativa } from '../../services/exportacaoAdministrativa.js'
import { fetchAutenticado as fetch } from '../../services/sessaoRevendedora.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8082'
const moeda = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const numero = v => new Intl.NumberFormat('pt-BR').format(Number(v) || 0)
const token = () => sessionStorage.getItem('quitai_token') || localStorage.getItem('quitai_token')

const ICONES = {
  vendas: <><path d="M3 3h2l2 12h11l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
  dinheiro: <><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></>,
  carteira: <><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M7 6V4h12"/><path d="M16 15h2"/></>,
  grafico: <><path d="M4 19V5M4 19h16M8 15l4-5 3 2 5-7"/></>,
  usuarios: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/></>,
  clientes: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  caixa: <><path d="m3 7 9-4 9 4-9 4-9-4ZM3 7v10l9 4 9-4V7M12 11v10"/></>,
  unidades: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  atraso: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
  filtro: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
  atualizar: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M4 12l1 5a8 8 0 0 0 14-2"/></>,
  seta: <><path d="m15 18-6-6 6-6"/></>,
}
function Icone({ nome, size = 20 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONES[nome]}</svg> }

function Indicador({ titulo, valor, legenda, icone, cor = 'azul', destaque = false }) {
  return <article className={`qr-card qr-card--${cor} ${destaque ? 'qr-card--destaque' : ''}`}>
    <div className="qr-card-top"><span className="qr-card-label">{titulo}</span><span className="qr-card-icon"><Icone nome={icone} size={19}/></span></div>
    <strong className={`qr-card-value ${typeof valor === 'string' && valor.startsWith('R$') ? 'qr-card-value--money' : ''}`} title={valor}>{valor}</strong>
    <span className="qr-card-caption">{legenda}</span>
  </article>
}
function Tabela({ colunas, linhas, vazio }) {
  return <div className="qr-table-scroll"><table className="qr-table"><thead><tr>{colunas.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{linhas.length ? linhas.map((linha, i) => <tr key={linha.key ?? i}>{linha.valores.map((v, j) => <td key={j}>{v}</td>)}</tr>) : <tr><td colSpan={colunas.length} className="qr-empty">{vazio}</td></tr>}</tbody></table></div>
}
const estilo = `
.qr-page{max-width:1320px;margin:0 auto;color:#1e293b;padding:4px 0 30px;font-family:inherit}
.qr-page *{box-sizing:border-box}
.qr-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:21px}
.qr-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#2563eb;margin-bottom:7px}
.qr-title{font-size:clamp(25px,3vw,32px);font-weight:800;letter-spacing:-.9px;line-height:1.2;margin:0 0 7px;color:#17263c}
.qr-subtitle{font-size:14px;color:#64748b;margin:0;line-height:1.5}
.qr-top-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.qr-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:10px;border:1px solid #dce4ef;background:#fff;color:#334155;font-size:13px;font-weight:700;padding:10px 14px;min-height:41px;cursor:pointer;transition:background .15s,border-color .15s,transform .15s;white-space:nowrap}
.qr-btn:hover:not(:disabled){background:#f0f6ff;border-color:#a7c8fa}
.qr-btn:disabled{opacity:.55;cursor:not-allowed}
.qr-btn-primary{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 3px 8px rgba(37,99,235,.14)}
.qr-btn-primary:hover:not(:disabled){background:#1d4ed8;border-color:#1d4ed8}
.qr-filter-panel{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;box-shadow:0 3px 16px rgba(15,23,42,.025);margin-bottom:22px}
.qr-filter-heading{display:flex;align-items:center;gap:9px;font-weight:800;font-size:14px;margin-bottom:14px;color:#25344b}
.qr-filter-heading svg{color:#2563eb}
.qr-filter-grid{display:grid;grid-template-columns:minmax(180px,1.3fr) repeat(2,minmax(140px,1fr)) auto;gap:12px;align-items:end}
.qr-field{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:12px;font-weight:700;color:#475569}
.qr-field input,.qr-field select{height:41px;width:100%;min-width:0;border:1px solid #dbe3ee;border-radius:9px;background:#fff;color:#273449;font-size:13px;padding:0 11px;outline:none}
.qr-field input:focus,.qr-field select:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12)}
.qr-filter-buttons{display:flex;gap:8px}
.qr-filter-note{font-size:11px;line-height:1.5;color:#94a3b8;margin:12px 0 0}
.qr-section{margin-top:21px}
.qr-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:13px}
.qr-section-title{font-size:17px;font-weight:800;letter-spacing:-.3px;color:#1e293b;margin:0 0 4px}
.qr-section-subtitle{font-size:12px;color:#8090a5;margin:0}
.qr-grid-finance{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.qr-grid-overview{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
.qr-card{position:relative;min-width:0;background:#fff;border:1px solid #e4eaf2;border-radius:15px;padding:17px 16px;display:flex;flex-direction:column;gap:11px;min-height:145px;box-shadow:0 5px 20px rgba(15,23,42,.035);transition:transform .18s,box-shadow .18s}.qr-card:hover{transform:translateY(-2px);box-shadow:0 10px 25px rgba(15,23,42,.07)}
.qr-card--destaque{border-color:#c7dcff;background:linear-gradient(145deg,#fff 55%,#f0f6ff)}
.qr-card-top{display:flex;align-items:center;justify-content:space-between;gap:7px}
.qr-card-label{font-size:12px;font-weight:700;color:#66758a}
.qr-card-icon{display:grid;place-items:center;width:33px;height:33px;flex-shrink:0;border-radius:9px;background:#edf4ff;color:#2563eb}
.qr-card--verde .qr-card-icon{background:#e7f8ef;color:#15935a}
.qr-card--laranja .qr-card-icon{background:#fff3e6;color:#d97706}
.qr-card--roxo .qr-card-icon{background:#f2edff;color:#7952d6}
.qr-card-value{display:block;font-size:clamp(22px,2vw,29px);line-height:1.15;letter-spacing:-.75px;font-weight:800;color:#1e293b;font-variant-numeric:tabular-nums;white-space:nowrap}.qr-card-value--money{font-size:clamp(19px,1.75vw,27px);letter-spacing:-.9px}
.qr-card-caption{font-size:11px;color:#8292aa;line-height:1.45;margin-top:auto}
.qr-detail{margin-top:23px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(15,23,42,.025)}
.qr-detail-header{padding:19px 20px 14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:13px}
.qr-tabs{display:inline-flex;gap:4px;padding:4px;background:#f1f5f9;border-radius:10px}
.qr-tab{border:0;background:transparent;border-radius:8px;padding:9px 13px;font-size:12px;font-weight:700;color:#64748b;cursor:pointer}
.qr-tab[aria-selected=true]{background:#fff;color:#2563eb;box-shadow:0 1px 5px rgba(15,23,42,.1)}
.qr-table-scroll{overflow-x:auto}
.qr-table{border-collapse:collapse;width:100%;min-width:680px;text-align:left}
.qr-table th{font-size:11px;letter-spacing:.2px;text-transform:uppercase;color:#7c8ba0;background:#f8fafc;font-weight:800;padding:13px 17px;border-top:1px solid #eef2f7;border-bottom:1px solid #e9eef5;white-space:nowrap}
.qr-table td{font-size:13px;color:#475569;padding:14px 17px;border-bottom:1px solid #f0f3f8;vertical-align:middle;font-variant-numeric:tabular-nums}
.qr-table tbody tr:last-child td{border-bottom:0}
.qr-table tbody tr:hover{background:#f8fbff}
.qr-table .qr-empty{text-align:center;padding:34px;color:#94a3b8}
.qr-name{display:block;color:#1e293b;font-weight:750}
.qr-muted{display:block;color:#94a3b8;font-size:11px;margin-top:4px}
.qr-status{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;padding:5px 9px;border-radius:999px;background:#eaf8ef;color:#15803d}
.qr-status:before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
.qr-status--off{background:#fff1f1;color:#b42318}
.qr-money{font-weight:750;color:#243247;white-space:nowrap}
.qr-alert{padding:13px 15px;border:1px solid #fecaca;border-radius:10px;background:#fff1f2;color:#b42318;font-size:13px;margin:12px 0}
.qr-loading{padding:28px;text-align:center;color:#64748b;font-size:13px}
.qr-footer{display:flex;justify-content:flex-start;margin-top:20px}
@media(max-width:1250px){.qr-card-value--money{font-size:clamp(17px,1.7vw,24px)}.qr-card{padding:15px 13px}}
@media(max-width:1100px){.qr-grid-overview{grid-template-columns:repeat(3,minmax(0,1fr))}.qr-filter-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.qr-filter-buttons{grid-column:1/-1}}
@media(max-width:850px){.qr-card-value--money{font-size:clamp(19px,3vw,26px)}.qr-grid-finance{grid-template-columns:repeat(2,minmax(0,1fr))}.qr-grid-overview{grid-template-columns:repeat(2,minmax(0,1fr))}.qr-detail-header{align-items:flex-start}}
@media(max-width:580px){.qr-card-value--money{font-size:clamp(15px,4vw,22px)}.qr-filter-panel{padding:15px}.qr-filter-grid{grid-template-columns:1fr}.qr-filter-buttons{grid-column:auto;flex-wrap:wrap}.qr-grid-finance,.qr-grid-overview{gap:9px}.qr-card{padding:12px;min-height:122px}.qr-card-value:not(.qr-card-value--money){font-size:22px}.qr-card-icon{width:29px;height:29px}.qr-detail-header{padding:16px 13px}.qr-tabs{width:100%;overflow:auto}.qr-tab{flex:1}.qr-top-actions{width:100%}.qr-btn{font-size:12px}}
@media(max-width:390px){.qr-grid-finance{grid-template-columns:1fr}.qr-card-value--money{font-size:27px}}
`

export default function Relatorios({ onVoltar }) {
  const [revendedoraId, setRevendedoraId] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [aplicados, setAplicados] = useState({ revendedoraId: '', inicio: '', fim: '' })
  const [dados, setDados] = useState(null)
  const [opcoes, setOpcoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState('revendedoras')
  const [atualizacao, setAtualizacao] = useState(0)

  const [exportando, setExportando] = useState(false)
  const exportacaoRef = useRef(null)
  const exportacaoMontadaRef = useRef(true)
  useEffect(() => {
    exportacaoMontadaRef.current = true
    return () => { exportacaoMontadaRef.current = false; exportacaoRef.current?.abort() }
  }, [])
  async function exportarDados() {
    if (exportacaoRef.current) return
    if (!window.confirm('Este arquivo contem dados pessoais e financeiros de TODAS as revendedoras, sem os filtros do relatorio. Guarde-o criptografado e nao o compartilhe publicamente. Ele nao substitui um backup PostgreSQL completo. Continuar?')) return
    const controle = new AbortController()
    exportacaoRef.current = controle
    setExportando(true)
    setErro('')
    const prazo = setTimeout(() => controle.abort(), 30000)
    let url
    try {
      const blob = await obterExportacaoAdministrativa(API_URL, controle.signal)
      if (controle.signal.aborted) return
      url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'quitai-exportacao-v1-' + new Date().toISOString().replaceAll(':', '-') + '.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (e) {
      if (exportacaoMontadaRef.current) setErro(controle.signal.aborted ? 'Exportacao cancelada ou prazo excedido. Nenhum backup foi salvo.' : (e.message || 'Nao foi possivel exportar os dados.'))
    } finally {
      clearTimeout(prazo)
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (exportacaoRef.current === controle) {
        exportacaoRef.current = null
        if (exportacaoMontadaRef.current) setExportando(false)
      }
    }
  }

  const carregar = useCallback(async signal => {
    setCarregando(true)
    setErro('')
    try {
      const jwt = token()
      if (!jwt) throw new Error('Sessão não encontrada. Entre novamente na sua conta.')
      const params = new URLSearchParams()
      if (aplicados.revendedoraId) params.set('revendedora_id', aplicados.revendedoraId)
      if (aplicados.inicio) params.set('inicio', aplicados.inicio)
      if (aplicados.fim) params.set('fim', aplicados.fim)
      const url = `${API_URL}/admin/relatorios${params.toString() ? `?${params}` : ''}`
      const resposta = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` }, signal, cache: 'no-store' })
      const json = await resposta.json().catch(() => ({}))
      if (!resposta.ok) throw new Error(json.mensagem || `Não foi possível carregar os relatórios (${resposta.status}).`)
      if (!json.resumo || !Array.isArray(json.revendedoras) || !Array.isArray(json.produtos) || !Array.isArray(json.clientes)) throw new Error('O servidor retornou um formato de relatório inesperado.')
      if (signal.aborted) return
      setDados(json)
      if (!aplicados.revendedoraId) setOpcoes(json.revendedoras.map(r => ({ id: r.id, nome: r.nome })))
    } catch (e) {
      if (e.name !== 'AbortError' && !signal.aborted) { setErro(e.message || 'Falha ao consultar relatórios.'); setDados(null) }
    } finally { if (!signal.aborted) setCarregando(false) }
  }, [aplicados, atualizacao])

  useEffect(() => { const c = new AbortController(); carregar(c.signal); return () => c.abort() }, [carregar])
  function filtrar(e) { e.preventDefault(); if (inicio && fim && inicio > fim) { setErro('A data inicial não pode ser posterior à data final.'); return }; setAplicados({ revendedoraId, inicio, fim }); setAtualizacao(n => n + 1) }
  function limpar() { setRevendedoraId(''); setInicio(''); setFim(''); setAplicados({ revendedoraId: '', inicio: '', fim: '' }); setAtualizacao(n => n + 1) }
  const nomes = useMemo(() => Object.fromEntries(opcoes.map(r => [r.id, r.nome])), [opcoes])
  const r = dados?.resumo

  return <section className="qr-page">
    <style>{estilo}</style>
    <header className="qr-top">
      <div><span className="qr-eyebrow">PAINEL GESTOR / ANÁLISE DE DADOS</span><h1 className="qr-title">Relatórios gerais</h1><p className="qr-subtitle">Acompanhe o desempenho das revendedoras e a movimentação do negócio.</p></div>
      <div className="qr-top-actions"><button type="button" className="qr-btn" onClick={exportarDados} disabled={exportando}>{exportando ? 'Exportando...' : 'Exportar dados'}</button><button type="button" className="qr-btn" onClick={() => setAtualizacao(n => n + 1)} disabled={carregando}><Icone nome="atualizar" size={16}/>{carregando ? 'Atualizando...' : 'Atualizar dados'}</button></div>
    </header>

    <form className="qr-filter-panel" onSubmit={filtrar}>
      <div className="qr-filter-heading"><Icone nome="filtro" size={17}/> Filtros do relatório</div>
      <div className="qr-filter-grid">
        <label className="qr-field">Revendedora<select value={revendedoraId} onChange={e => setRevendedoraId(e.target.value)}><option value="">Todas as revendedoras</option>{opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></label>
        <label className="qr-field">Data inicial<input type="date" value={inicio} onChange={e => setInicio(e.target.value)}/></label>
        <label className="qr-field">Data final<input type="date" value={fim} onChange={e => setFim(e.target.value)}/></label>
        <div className="qr-filter-buttons"><button className="qr-btn qr-btn-primary" type="submit" disabled={carregando}>Aplicar filtros</button><button className="qr-btn" type="button" onClick={limpar} disabled={carregando}>Limpar</button></div>
      </div>
      <p className="qr-filter-note">O período considera a data das vendas, dos pagamentos e dos vencimentos. Cadastros e estoque refletem a situação atual.</p>
    </form>

    {erro && <div className="qr-alert" role="alert">{erro}</div>}
    {carregando && <div className="qr-loading" role="status">Consultando dados do sistema...</div>}
    {!carregando && r && <>
      <section className="qr-section" aria-labelledby="qr-finance-title"><div className="qr-section-head"><div><h2 className="qr-section-title" id="qr-finance-title">Visão financeira</h2><p className="qr-section-subtitle">Resultados financeiros das operações selecionadas</p></div></div>
        <div className="qr-grid-finance">
          <Indicador titulo="Total vendido" valor={moeda(r.total_vendido)} legenda="Vendas realizadas no período" icone="grafico" destaque/>
          <Indicador titulo="Total recebido" valor={moeda(r.total_recebido)} legenda="Pagamentos no período" icone="dinheiro" cor="verde"/>
          <Indicador titulo="Saldo das vendas" valor={moeda(r.saldo_vendas)} legenda="Saldo atual das vendas filtradas" icone="carteira" cor="laranja"/>
          <Indicador titulo="Vendas realizadas" valor={numero(r.vendas)} legenda="Quantidade de vendas no período" icone="vendas" cor="roxo"/>
        </div>
      </section>
      <section className="qr-section" aria-labelledby="qr-overview-title"><div className="qr-section-head"><div><h2 className="qr-section-title" id="qr-overview-title">Movimentação e cadastros</h2><p className="qr-section-subtitle">Visão rápida dos registros e parcelas</p></div></div>
        <div className="qr-grid-overview">
          <Indicador titulo="Revendedoras" valor={numero(r.revendedoras)} legenda="Contas selecionadas" icone="usuarios"/>
          <Indicador titulo="Clientes" valor={numero(r.clientes)} legenda="Clientes cadastrados" icone="clientes" cor="roxo"/>
          <Indicador titulo="Produtos" valor={numero(r.produtos)} legenda="Produtos cadastrados" icone="caixa"/>
          <Indicador titulo="Unidades vendidas" valor={numero(r.unidades_vendidas)} legenda="Itens vendidos no período" icone="unidades" cor="verde"/>
          <Indicador titulo="Parcelas vencidas" valor={numero(r.parcelas_vencidas)} legenda="Em atraso e não quitadas" icone="atraso" cor="laranja"/>
        </div>
      </section>
      <section className="qr-detail" aria-label="Detalhamento dos relatórios"><div className="qr-detail-header"><div><h2 className="qr-section-title">Detalhamento</h2><p className="qr-section-subtitle">Explore os resultados por categoria</p></div><div className="qr-tabs" role="tablist" aria-label="Tipo de relatório">{[['revendedoras','Revendedoras'],['produtos','Produtos'],['clientes','Clientes']].map(([id, nome]) => <button key={id} type="button" role="tab" aria-selected={aba === id} className="qr-tab" onClick={() => setAba(id)}>{nome}</button>)}</div></div>
        {aba === 'revendedoras' && <Tabela colunas={['Revendedora','Status','Clientes','Produtos','Vendas','Total vendido','Total recebido']} linhas={dados.revendedoras.map(x => ({ key:x.id, valores:[<span><span className="qr-name">{x.nome}</span><span className="qr-muted">{x.email}</span></span>,<span className={`qr-status ${x.ativo ? '' : 'qr-status--off'}`}>{x.ativo ? 'Ativa' : 'Bloqueada'}</span>,numero(x.clientes),numero(x.produtos),numero(x.vendas),<span className="qr-money">{moeda(x.total_vendido)}</span>,<span className="qr-money">{moeda(x.total_recebido)}</span>] }))} vazio="Nenhuma revendedora encontrada."/>}
        {aba === 'produtos' && <Tabela colunas={['Produto','Código','Revendedora','Estoque atual','Unidades vendidas','Faturamento']} linhas={dados.produtos.map(x => ({ key:x.id, valores:[<span className="qr-name">{x.nome}</span>,x.codigo,nomes[x.revendedora_id] || `Conta #${x.revendedora_id}`,numero(x.estoque),numero(x.quantidade_vendida),<span className="qr-money">{moeda(x.faturamento)}</span>] }))} vazio="Nenhum produto encontrado."/>}
        {aba === 'clientes' && <Tabela colunas={['Cliente','Revendedora','Compras','Total comprado']} linhas={dados.clientes.map(x => ({ key:x.id, valores:[<span className="qr-name">{x.nome}</span>,nomes[x.revendedora_id] || `Conta #${x.revendedora_id}`,numero(x.compras),<span className="qr-money">{moeda(x.total_compras)}</span>] }))} vazio="Nenhum cliente encontrado."/>}
      </section>
    </>}
    <div className="qr-footer"><button type="button" className="qr-btn" onClick={onVoltar}><Icone nome="seta" size={16}/> Voltar ao início</button></div>
  </section>
}
