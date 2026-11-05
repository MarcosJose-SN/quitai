import { fetchAutenticado as fetch } from '../../services/sessaoRevendedora.js'
import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8082'

const cores = {
  texto: '#1e293b', secundario: '#64748b', borda: '#dbe3ed', azul: '#2563eb', fundo: '#f8fafc'
}

function Icone({ nome, tamanho = 20 }) {
  const caminhos = {
    usuario: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    escudo: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    servidor: <><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01"/></>,
    arquivo: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
    seta: <path d="m9 18 6-6-6-6"/>,
    atualizar: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.7 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.3-3"/></>,
    info: <><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/></>,
    balanca: <><path d="M12 3v18M5 7h14M3 17l4-10 4 10H3ZM13 17l4-10 4 10h-8ZM8 21h8"/></>,
  }
  return <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{caminhos[nome] || caminhos.info}</svg>
}

function Cartao({ icone, titulo, descricao, children }) {
  return <section style={{ background: '#fff', border: `1px solid ${cores.borda}`, borderRadius: 14, padding: 22, boxShadow: '0 3px 14px rgba(15,23,42,.035)' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, marginBottom: 18 }}>
      <div style={{ width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 11, color: cores.azul, background: '#eff6ff' }}><Icone nome={icone} /></div>
      <div><h2 style={{ fontSize: 17, margin: '1px 0 5px', color: cores.texto }}>{titulo}</h2><p style={{ margin: 0, color: cores.secundario, fontSize: 13, lineHeight: 1.6 }}>{descricao}</p></div>
    </div>
    {children}
  </section>
}

const estiloBotao = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: '1px solid #bfdbfe', borderRadius: 9, background: '#eff6ff', color: '#1d4ed8', fontWeight: 650, fontSize: 13, cursor: 'pointer' }

export default function Configuracoes({ usuario, onNavegar }) {
  const [conexao, setConexao] = useState('verificando')
  const [detalhe, setDetalhe] = useState('')

  async function verificarConexao(signal) {
    setConexao('verificando')
    setDetalhe('')
    const token = localStorage.getItem('quitai_token') || sessionStorage.getItem('quitai_token')
    if (!token) { setConexao('erro'); setDetalhe('Sessão não encontrada.'); return }
    try {
      const resposta = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal })
      if (signal?.aborted) return
      if (!resposta.ok) throw new Error(resposta.status === 401 ? 'Sessão expirada.' : `Servidor respondeu com HTTP ${resposta.status}.`)
      const dados = await resposta.json()
      if (dados.perfil !== 'admin' || dados.ativo !== true) throw new Error('Sua conta não possui acesso administrativo ativo.')
      setConexao('online')
    } catch (erro) {
      if (erro.name === 'AbortError') return
      setConexao('erro')
      setDetalhe(erro.message || 'Não foi possível estabelecer conexão.')
    }
  }

  useEffect(() => {
    const controlador = new AbortController()
    verificarConexao(controlador.signal)
    return () => controlador.abort()
  }, [])

  const linha = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: '1px solid #edf1f6', flexWrap: 'wrap' }
  const legal = [
    ['Política de Privacidade', 'Como os dados pessoais são tratados e protegidos.', 'arquivo', 'politica-privacidade'],
    ['Termos de Uso', 'Condições e responsabilidades de utilização.', 'arquivo', 'termos-uso'],
    ['Direitos dos titulares (LGPD)', 'Informações sobre direitos e solicitações de dados.', 'balanca', 'direitos-lgpd'],
  ]

  return <section className="admin-placeholder" style={{ maxWidth: 1100 }}>
    <span className="admin-eyebrow">GESTÃO ADMINISTRATIVA</span>
    <h1>Configurações</h1>
    <p>Gerencie informações administrativas, consulte o estado do sistema e acesse a central de privacidade.</p>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 18, marginTop: 24 }}>
      <Cartao icone="usuario" titulo="Minha conta" descricao="Seus dados de acesso e informações de perfil.">
        <div style={{ ...linha, borderTop: 'none', paddingTop: 0 }}><div><strong style={{ color: cores.texto, fontSize: 14 }}>{usuario?.nome || 'Administrador'}</strong><div style={{ color: cores.secundario, fontSize: 13, marginTop: 3, overflowWrap: 'anywhere' }}>{usuario?.email || 'E-mail não informado'}</div></div><span style={{ fontSize: 12, color: '#166534', background: '#dcfce7', padding: '5px 9px', borderRadius: 20 }}>Administrador</span></div>
        <button type="button" style={estiloBotao} onClick={() => onNavegar('minha-conta')}>Gerenciar minha conta <Icone nome="seta" tamanho={15}/></button>
      </Cartao>

      <Cartao icone="servidor" titulo="Informações do sistema" descricao="Verifique a comunicação do Painel Gestor com a API.">
        <div style={{ ...linha, borderTop: 'none', paddingTop: 0 }}><span style={{ color: cores.secundario, fontSize: 14 }}>Conexão com a API</span><strong role="status" style={{ color: conexao === 'online' ? '#15803d' : conexao === 'erro' ? '#b42318' : '#92400e', fontSize: 13 }}>{conexao === 'online' ? '● Conectado' : conexao === 'erro' ? '● Indisponível' : '● Verificando...'}</strong></div>
        {detalhe && <p role="alert" style={{ color: '#b42318', fontSize: 13, margin: '0 0 12px' }}>{detalhe}</p>}
        <button type="button" style={estiloBotao} onClick={() => verificarConexao()} disabled={conexao === 'verificando'}><Icone nome="atualizar" tamanho={15}/> {conexao === 'verificando' ? 'Verificando...' : 'Verificar novamente'}</button>
      </Cartao>

      <Cartao icone="escudo" titulo="Privacidade e proteção de dados" descricao="Documentos legais e transparência no tratamento de dados pessoais.">
        {legal.map(([titulo, descricao, icone, pagina]) => (
          <div key={pagina} style={linha}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 190 }}>
              <span style={{ color: cores.azul }}><Icone nome={icone} tamanho={18}/></span>
              <div>
                <strong style={{ color: cores.texto, fontSize: 13 }}>{titulo}</strong>
                <p style={{ margin: '3px 0 0', color: cores.secundario, fontSize: 12, lineHeight: 1.5 }}>{descricao}</p>
              </div>
            </div>
            <button type="button" style={estiloBotao} onClick={() => onNavegar(pagina)} aria-label={`Abrir ${titulo}`}>
              Visualizar <Icone nome="seta" tamanho={15}/>
            </button>
          </div>
        ))}
        <p style={{ margin: '14px 0 0', color: cores.secundario, fontSize: 12, lineHeight: 1.6 }}>
          Documentos em revisão. Confirme os dados do responsável e as práticas reais do sistema antes da publicação.
        </p>
      </Cartao>

      <Cartao icone="info" titulo="Sobre o QuitAÍ" descricao="Informações sobre a plataforma de gestão de vendas.">
        <div style={{ ...linha, borderTop: 'none', paddingTop: 0 }}><span style={{ color: cores.secundario, fontSize: 13 }}>Aplicação</span><strong style={{ color: cores.texto, fontSize: 13 }}>QuitAÍ | Painel Gestor</strong></div>
        <div style={linha}><span style={{ color: cores.secundario, fontSize: 13 }}>Desenvolvimento</span><strong style={{ color: cores.texto, fontSize: 13, textAlign: 'right' }}>Marcos José Souza do Nascimento</strong></div>
        <p style={{ color: cores.secundario, fontSize: 12, lineHeight: 1.6, marginBottom: 0 }}>Plataforma para administração de revendedoras e acompanhamento de vendas, clientes e produtos.</p>
      </Cartao>
    </div>
  </section>
}
