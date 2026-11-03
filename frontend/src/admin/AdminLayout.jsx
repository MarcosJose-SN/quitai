
import { useEffect, useState } from 'react'
import './admin.css'

const iconesPagina = {
  inicio: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-7h6v7"/></>,
  revendedoras: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/></>,
  cadastro: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M18 8v8M14 12h8"/></>,
  relatorios: <><path d="M4 20V5M4 20h17M8 16v-4M13 16V8M18 16V4"/></>,
  suporte: <><path d="M4 5h16v12H8l-4 4V5Z"/><path d="M8 10h8M8 13h5"/></>,
  configuracoes: <><path d="M12 2.75a2 2 0 0 1 1.93 1.48l.26.96c.32.11.63.24.92.39l.88-.49a2 2 0 0 1 2.41.32l.43.43a2 2 0 0 1 .32 2.41l-.49.88c.15.29.28.6.39.92l.96.26A2 2 0 0 1 21.25 12a2 2 0 0 1-1.48 1.93l-.96.26c-.11.32-.24.63-.39.92l.49.88a2 2 0 0 1-.32 2.41l-.43.43a2 2 0 0 1-2.41.32l-.88-.49c-.29.15-.6.28-.92.39l-.26.96A2 2 0 0 1 12 21.25a2 2 0 0 1-1.93-1.48l-.26-.96a7.6 7.6 0 0 1-.92-.39l-.88.49a2 2 0 0 1-2.41-.32l-.43-.43a2 2 0 0 1-.32-2.41l.49-.88a7.6 7.6 0 0 1-.39-.92l-.96-.26A2 2 0 0 1 2.75 12a2 2 0 0 1 1.48-1.93l.96-.26c.11-.32.24-.63.39-.92l-.49-.88a2 2 0 0 1 .32-2.41l.43-.43a2 2 0 0 1 2.41-.32l.88.49c.29-.15.6-.28.92-.39l.26-.96A2 2 0 0 1 12 2.75Z"/><circle cx="12" cy="12" r="3"/></>,
  'minha-conta': <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
}

const menuItems = [
  { id: 'inicio', label: 'Início', icon: '⌂' },
  { id: 'revendedoras', label: 'Revendedoras', icon: '♙' },
  { id: 'cadastro', label: 'Cadastrar conta', icon: '+' },
  { id: 'relatorios', label: 'Relatórios', icon: '▤' },
  { id: 'suporte', label: 'Central de Suporte', icon: '✉' },
  { id: 'configuracoes', label: 'Configurações', icon: '⚙' },
]

export default function AdminLayout({ children, paginaAtual = 'inicio', onNavegar, onSair, usuario }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const nomeExibido = usuario?.nome?.trim() || 'Administrador'
  const inicial = nomeExibido.charAt(0).toUpperCase()
  const pagina = paginaAtual === 'minha-conta' ? { label: 'Minha conta', icon: '◉', descricao: 'Perfil e segurança' } : ({ inicio: { descricao: 'Resumo do negócio' }, revendedoras: { descricao: 'Gestão de contas' }, cadastro: { descricao: 'Nova revendedora' }, relatorios: { descricao: 'Análise e resultados' }, suporte: { descricao: 'Atendimento às revendedoras' }, configuracoes: { descricao: 'Preferências do painel' } }[paginaAtual] || {})
  const itemAtual = menuItems.find(item => item.id === paginaAtual)
  const tituloPagina = pagina.label || itemAtual?.label || 'Início'

  useEffect(() => {
    const tituloAnterior = document.title
    document.title = 'QuitAÍ | Painel Gestor'
    const iconeAnterior = document.querySelector('link[rel="icon"]')
    const hrefAnterior = iconeAnterior?.getAttribute('href')
    const icone = iconeAnterior || document.createElement('link')
    icone.setAttribute('rel', 'icon')
    icone.setAttribute('type', 'image/svg+xml')
    icone.setAttribute('href', '/quitai-painel-gestor.svg')
    if (!iconeAnterior) document.head.appendChild(icone)
    return () => {
      document.title = tituloAnterior
      if (iconeAnterior) {
        if (hrefAnterior === null) iconeAnterior.removeAttribute('href')
        else iconeAnterior.setAttribute('href', hrefAnterior)
      } else {
        icone.remove()
      }
    }
  }, [])

  function navegar(id) {
    onNavegar?.(id)
    setMenuAberto(false)
  }

  return (
    <div className="admin-shell">
      {menuAberto && (
        <button
          className="admin-overlay"
          aria-label="Fechar menu"
          onClick={() => setMenuAberto(false)}
        />
      )}

      <aside className={`admin-sidebar ${menuAberto ? 'admin-sidebar-aberto' : ''}`}>
        <div className="admin-brand">
          <div className="admin-brand-icon" aria-hidden="true"><img src="/quitai-painel-gestor.svg" alt="" className="admin-brand-image" width="44" height="44" style={{ display: 'block', width: 44, height: 44, maxWidth: 44, maxHeight: 44, objectFit: 'contain' }} /></div>
          <div>
            <strong>QuitAÍ</strong>
            <span>Painel Gestor</span>
          </div>
        </div>

        <div className="admin-menu-label">MENU PRINCIPAL</div>

        <nav className="admin-nav" aria-label="Menu administrativo">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-nav-item ${paginaAtual === item.id ? 'ativo' : ''}`}
              onClick={() => navegar(item.id)}
            >
              <span className="admin-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {paginaAtual === item.id && <span className="admin-nav-indicador" />}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="admin-sidebar-footer"
          onClick={() => navegar('minha-conta')}
          aria-label="Abrir Minha conta"
          aria-current={paginaAtual === 'minha-conta' ? 'page' : undefined}
          title="Abrir Minha conta"
          style={{
            width: '100%', textAlign: 'left', cursor: 'pointer',
            font: 'inherit', color: 'inherit', background: paginaAtual === 'minha-conta' ? 'rgba(125, 182, 233, 0.14)' : 'transparent',
            borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
          }}
        >
          <div className="admin-avatar" aria-hidden="true">{inicial}</div>
          <div className="admin-user-info" style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{nomeExibido}</strong>
            <span>Minha conta</span>
          </div>
          <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.8 }}>›</span>
        </button>
        <button type="button" className="admin-nav-item admin-logout-button" onClick={onSair}>
          <span className="admin-nav-icon" aria-hidden="true">↪</span>
          <span>Sair</span>
        </button>
      </aside>

      <div className="admin-main">
        <style>{`
          .qa-topbar{position:relative;display:flex;align-items:center;justify-content:space-between;gap:22px;min-height:102px;padding:20px clamp(20px,3vw,38px);background:#fff;border-bottom:1px solid #e6ebf2;overflow:hidden}
          .qa-topbar::before{content:"";position:absolute;bottom:0;left:0;width:100%;height:2px;background:linear-gradient(90deg,#2563eb 0%,#60a5fa 38%,transparent 78%);opacity:.75}
          .qa-topbar-left{display:flex;align-items:center;gap:16px;min-width:0;position:relative;z-index:1}
          .qa-topbar-icon{width:44px;height:44px;flex:none;display:grid;place-items:center;border-radius:12px;background:#f5f8fd;color:#2563eb;border:1px solid #e4eaf3;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:transform .25s ease,background .25s ease}
          .qa-topbar-icon svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
          .qa-topbar-left:hover .qa-topbar-icon{transform:translateY(-2px);background:#edf4ff;box-shadow:0 5px 12px rgba(37,99,235,.08)}
          .qa-topbar-icon svg{display:block;overflow:visible}
          .qa-topbar-icon{animation:qa-icon-in .38s ease both}
          @keyframes qa-icon-in{from{opacity:.3;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
          .qa-topbar-heading{min-width:0;animation:qa-top-enter .36s cubic-bezier(.2,.75,.3,1) both}
          .qa-topbar-trail{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:.075em;text-transform:uppercase;color:#8794a7;margin:0 0 5px}
          .qa-topbar-trail strong{color:#4774b5;font-weight:800}
          .qa-topbar-trail-sep{color:#cbd5e1;font-weight:400}
          .qa-topbar-title{font-size:clamp(19px,1.7vw,23px);line-height:1.2;letter-spacing:-.6px;font-weight:800;color:#17263c;margin:0}
          .qa-topbar-desc{font-size:12px;line-height:1.45;color:#8491a4;margin:5px 0 0}
          .qa-topbar-right{display:flex;align-items:center;gap:10px;position:relative;z-index:1;flex:none}
          .qa-topbar-access{display:inline-flex;align-items:center;gap:9px;padding:9px 13px;border:1px solid #e5eaf2;border-radius:10px;background:#f8fafc;color:#52647b;font-size:12px;font-weight:700;white-space:nowrap}
          .qa-topbar-dot{height:8px;width:8px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 3px #dcfce7;flex:none}
          .qa-topbar-access-icon{width:16px;height:16px;color:#64748b;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
          @keyframes qa-top-enter{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}
          @media(max-width:750px){.qa-topbar{padding:16px 18px;min-height:88px;gap:10px}.qa-topbar-left{gap:11px}.qa-topbar-icon{height:42px;width:42px;border-radius:11px}.qa-topbar-icon svg{height:21px;width:21px}.qa-topbar-access{padding:9px}.qa-topbar-access-label{display:none}}
          @media(max-width:420px){.qa-topbar{padding:13px 12px}.qa-topbar-trail{font-size:9px;letter-spacing:.03em}.qa-topbar-desc{font-size:11px}.qa-topbar-title{font-size:17px}.qa-topbar-icon{width:38px;height:38px}.qa-topbar-left{gap:8px}}
          @media(prefers-reduced-motion:reduce){.qa-topbar-heading{animation:none}.qa-topbar-icon{transition:none;animation:none}}
          .qa-legal-footer{box-sizing:border-box;margin:24px 18px 18px;padding:22px 20px 20px;background:#fff;border:1px solid #e2e8f0;border-radius:15px;display:flex;flex-direction:column;align-items:center;gap:0;text-align:center;color:#64748b;font-size:13px;line-height:1.6}
          .qa-legal-footer-links{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;width:100%;padding:0 0 19px;border-bottom:1px solid #e8edf4}
          .qa-legal-footer-link{border:0;padding:0;background:transparent;color:#2563eb;font:inherit;cursor:pointer;text-decoration:none}
          .qa-legal-footer-link:hover{color:#1d4ed8;text-decoration:underline}
          .qa-legal-footer-link:focus-visible{outline:2px solid #93c5fd;outline-offset:4px;border-radius:3px}
          .qa-legal-footer-separator{color:#94a3b8;user-select:none}
          .qa-legal-footer-copy{margin:24px 0 10px}
          .qa-legal-footer-credit{margin:0 0 9px;color:#334155;font-size:15px}
          .qa-legal-footer-credit strong{font-weight:750}
          .qa-legal-footer-role{margin:0;color:#64748b}
          @media(max-width:550px){.qa-legal-footer{margin:16px 10px;padding:20px 12px;font-size:12px}.qa-legal-footer-links{gap:8px}.qa-legal-footer-credit{font-size:13px}}

        `}</style>
        <header className="qa-topbar">
          <div className="qa-topbar-left">
            <button className="admin-menu-toggle" type="button" aria-label="Abrir menu" onClick={() => setMenuAberto(true)}>☰</button>
            <span className="qa-topbar-icon" aria-hidden="true" key={`icon-${paginaAtual}`}>
              <svg viewBox="0 0 24 24">{iconesPagina[paginaAtual] || iconesPagina.inicio}</svg>
            </span>
            <div className="qa-topbar-heading" key={paginaAtual}>
              <div className="qa-topbar-trail"><span>Painel Gestor</span><span className="qa-topbar-trail-sep">/</span><strong>{tituloPagina}</strong></div>
              <h2 className="qa-topbar-title">{tituloPagina}</h2>
              <p className="qa-topbar-desc">{pagina.descricao || 'Acompanhe sua operação'}</p>
            </div>
          </div>
          <div className="qa-topbar-right">
            <span className="qa-topbar-access" title="Acesso administrativo">
              <span className="qa-topbar-dot" aria-hidden="true" />
              <span className="qa-topbar-access-label">Área administrativa</span>
              <svg className="qa-topbar-access-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
            </span>
          </div>
        </header>

        <main className="admin-content">
          {children}
        </main>
        <footer className="qa-legal-footer" aria-label="Informações legais do QuitAÍ">
          <nav className="qa-legal-footer-links" aria-label="Documentos legais">
            <button type="button" className="qa-legal-footer-link" onClick={() => navegar('politica-privacidade')}>Política de Privacidade</button>
            <span className="qa-legal-footer-separator" aria-hidden="true">·</span>
            <button type="button" className="qa-legal-footer-link" onClick={() => navegar('termos-uso')}>Termos de Uso</button>
            <span className="qa-legal-footer-separator" aria-hidden="true">·</span>
            <button type="button" className="qa-legal-footer-link" onClick={() => navegar('direitos-lgpd')}>Direitos LGPD</button>
          </nav>
          <p className="qa-legal-footer-copy">© {new Date().getFullYear()} QuitAÍ | Painel Gestor. Todos os direitos reservados.</p>
          <p className="qa-legal-footer-credit">Desenvolvido por <strong>Marcos José Souza do Nascimento</strong></p>
          <p className="qa-legal-footer-role">Engenharia de Software &amp; Desenvolvimento Web</p>
        </footer>
      </div>
    </div>
  )
}
