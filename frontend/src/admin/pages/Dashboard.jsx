import { fetchAutenticado as fetch } from '../../services/sessaoRevendedora.js'
import { useEffect, useRef, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8082'
const TAMANHO_EDITOR = 300
const TAMANHO_FINAL = 512
const LIMITE_ARQUIVO = 10 * 1024 * 1024

function obterToken() {
  return localStorage.getItem('quitai_token') || sessionStorage.getItem('quitai_token')
}

const indicadoresBase = [
  { titulo: 'Total de revendedoras', campo: 'total_revendedoras', descricao: 'Contas cadastradas no sistema', simbolo: '♙' },
  { titulo: 'Contas ativas', campo: 'contas_ativas', descricao: 'Revendedoras com acesso ativo', simbolo: '✓' },
  { titulo: 'Contas bloqueadas', campo: 'contas_bloqueadas', descricao: 'Revendedoras com acesso suspenso', simbolo: '⊘' },
  { titulo: 'Novos cadastros', campo: 'novos_cadastros_30_dias', descricao: 'Contas criadas nos últimos 30 dias', simbolo: '+' },
]

const estiloBotao = {
  border: 0, borderRadius: 9, padding: '11px 18px', cursor: 'pointer',
  fontWeight: 650, fontSize: 14,
}

function limitarPosicao(posicao, largura, altura, escala) {
  const maxX = Math.max(0, (largura * escala - TAMANHO_EDITOR) / 2)
  const maxY = Math.max(0, (altura * escala - TAMANHO_EDITOR) / 2)
  return { x: Math.max(-maxX, Math.min(maxX, posicao.x)), y: Math.max(-maxY, Math.min(maxY, posicao.y)) }
}

export function EditorFoto({ onFechar, onSalvar }) {
  const inputRef = useRef(null)
  const imgRef = useRef(null)
  const urlArquivoRef = useRef(null)
  const arrasteRef = useRef(null)
  const [imagem, setImagem] = useState(null)
  const [dimensoes, setDimensoes] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [posicao, setPosicao] = useState({ x: 0, y: 0 })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    return () => { if (urlArquivoRef.current) URL.revokeObjectURL(urlArquivoRef.current) }
  }, [])

  useEffect(() => {
    function fecharComEsc(evento) { if (evento.key === 'Escape' && !salvando) onFechar() }
    window.addEventListener('keydown', fecharComEsc)
    return () => window.removeEventListener('keydown', fecharComEsc)
  }, [onFechar, salvando])

  const escalaBase = dimensoes ? Math.max(TAMANHO_EDITOR / dimensoes.width, TAMANHO_EDITOR / dimensoes.height) : 1
  const escala = escalaBase * zoom

  function escolherArquivo(evento) {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivo) return
    setErro('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type)) {
      setErro('Escolha uma imagem JPG, PNG ou WebP.')
      return
    }
    if (arquivo.size > LIMITE_ARQUIVO) {
      setErro('A imagem original deve ter no máximo 10 MB.')
      return
    }
    const novaUrl = URL.createObjectURL(arquivo)
    const teste = new Image()
    teste.onload = () => {
      if (urlArquivoRef.current) URL.revokeObjectURL(urlArquivoRef.current)
      urlArquivoRef.current = novaUrl
      setImagem(novaUrl)
      setDimensoes({ width: teste.naturalWidth, height: teste.naturalHeight })
      setZoom(1)
      setPosicao({ x: 0, y: 0 })
    }
    teste.onerror = () => {
      URL.revokeObjectURL(novaUrl)
      setErro('Não foi possível abrir esta imagem.')
    }
    teste.src = novaUrl
  }

  function iniciarArraste(evento) {
    if (!imagem) return
    evento.preventDefault()
    evento.currentTarget.setPointerCapture(evento.pointerId)
    arrasteRef.current = { x: evento.clientX, y: evento.clientY, inicioX: posicao.x, inicioY: posicao.y }
  }

  function mover(evento) {
    if (!arrasteRef.current || !dimensoes) return
    const atual = arrasteRef.current
    setPosicao(limitarPosicao({
      x: atual.inicioX + evento.clientX - atual.x,
      y: atual.inicioY + evento.clientY - atual.y,
    }, dimensoes.width, dimensoes.height, escala))
  }

  function alterarZoom(evento) {
    const novoZoom = Number(evento.target.value)
    setZoom(novoZoom)
    if (dimensoes) setPosicao(anterior => limitarPosicao(anterior, dimensoes.width, dimensoes.height, escalaBase * novoZoom))
  }

  async function salvar() {
    if (!imgRef.current || !dimensoes || salvando) return
    setErro('')
    setSalvando(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = TAMANHO_FINAL
      canvas.height = TAMANHO_FINAL
      const contexto = canvas.getContext('2d')
      if (!contexto) throw new Error('Seu navegador não conseguiu preparar o recorte.')
      const proporcao = TAMANHO_FINAL / TAMANHO_EDITOR
      const largura = dimensoes.width * escala * proporcao
      const altura = dimensoes.height * escala * proporcao
      contexto.drawImage(
        imgRef.current,
        (TAMANHO_FINAL - largura) / 2 + posicao.x * proporcao,
        (TAMANHO_FINAL - altura) / 2 + posicao.y * proporcao,
        largura, altura,
      )
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Não foi possível gerar a foto.')
      if (blob.size > 5 * 1024 * 1024) throw new Error('A foto recortada excedeu 5 MB. Escolha outra imagem.')
      const token = obterToken()
      if (!token) throw new Error('Sua sessão expirou. Faça login novamente.')
      const formulario = new FormData()
      formulario.append('foto', blob, 'foto-perfil.png')
      const resposta = await fetch(`${API_URL}/admin/perfil/foto`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formulario,
      })
      if (!resposta.ok) {
        const mensagem = await resposta.text()
        throw new Error(mensagem?.trim() || 'Não foi possível salvar a foto.')
      }
      await onSalvar()
      onFechar()
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar a foto.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !salvando) onFechar() }} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,19,35,.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div role="dialog" aria-modal="true" aria-label="Editar foto de perfil" style={{
        background: '#fff', color: '#172033', width: '100%', maxWidth: 440,
        borderRadius: 18, padding: 24, boxShadow: '0 24px 70px rgba(0,0,0,.3)',
        maxHeight: '95vh', overflowY: 'auto', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div><h2 style={{ margin: 0, fontSize: 22 }}>Foto de perfil</h2><p style={{ margin: '7px 0 0', color: '#64748b', fontSize: 13 }}>Ajuste o enquadramento antes de salvar.</p></div>
          <button type="button" aria-label="Fechar editor" disabled={salvando} onClick={onFechar} style={{ ...estiloBotao, background: '#edf2f8', padding: '8px 12px' }}>✕</button>
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={escolherArquivo} style={{ display: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0 14px' }}>
          <div onPointerDown={iniciarArraste} onPointerMove={mover} onPointerUp={() => { arrasteRef.current = null }} onPointerCancel={() => { arrasteRef.current = null }} style={{
            width: TAMANHO_EDITOR, height: TAMANHO_EDITOR, maxWidth: '100%', position: 'relative', overflow: 'hidden',
            background: '#e8edf5', borderRadius: 12, cursor: imagem ? 'grab' : 'default', touchAction: 'none',
            userSelect: 'none', flexShrink: 0,
          }}>
            {imagem && dimensoes ? (
              <img ref={imgRef} src={imagem} alt="Prévia da foto para recorte" draggable="false" style={{
                position: 'absolute', width: dimensoes.width * escala, height: dimensoes.height * escala,
                maxWidth: 'none', left: '50%', top: '50%',
                transform: `translate(calc(-50% + ${posicao.x}px), calc(-50% + ${posicao.y}px))`,
                pointerEvents: 'none',
              }} />
            ) : <div style={{ display: 'grid', placeItems: 'center', height: '100%', textAlign: 'center', padding: 22, boxSizing: 'border-box', color: '#64748b' }}>Selecione uma foto para começar</div>}
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: '0 0 0 90px rgba(12,22,39,.48)', border: '2px solid rgba(255,255,255,.95)', pointerEvents: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
        <p style={{ textAlign: 'center', color: '#64748b', fontSize: 12, margin: '0 0 16px' }}>Arraste a imagem para posicionar o rosto dentro do círculo.</p>
        <button type="button" disabled={salvando} onClick={() => inputRef.current?.click()} style={{ ...estiloBotao, background: '#e9f1ff', color: '#1956ac', width: '100%' }}>{imagem ? 'Escolher outra imagem' : 'Selecionar imagem'}</button>
        <label htmlFor="admin-foto-zoom" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, margin: '18px 0 7px' }}><span>Zoom</span><span>{Math.round(zoom * 100)}%</span></label>
        <input id="admin-foto-zoom" type="range" min="1" max="3" step="0.01" value={zoom} disabled={!imagem || salvando} onChange={alterarZoom} style={{ width: '100%', accentColor: '#2563eb' }} />
        {erro && <p role="alert" style={{ background: '#fff0f0', color: '#b42318', borderRadius: 8, padding: 12, fontSize: 13 }}>{erro}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" disabled={salvando} onClick={onFechar} style={{ ...estiloBotao, background: '#eef2f7', color: '#334155' }}>Cancelar</button>
          <button type="button" disabled={!imagem || salvando} onClick={salvar} style={{ ...estiloBotao, background: '#2563eb', color: '#fff', opacity: !imagem || salvando ? .55 : 1 }}>{salvando ? 'Salvando...' : 'Salvar foto'}</button>
        </div>
      </div>
    </div>
  )
}

function saudacaoPorHorario(hora) {
  if (hora >= 5 && hora < 12) return { titulo: 'Bom dia', emoji: '☀️', mensagem: 'Um novo dia para fazer seu negócio crescer!' }
  if (hora >= 12 && hora < 18) return { titulo: 'Boa tarde', emoji: '🌤️', mensagem: 'Que tal conferir como estão as coisas por aqui?' }
  return { titulo: 'Boa noite', emoji: '🌙', mensagem: 'Hora de acompanhar os resultados do dia!' }
}

export default function Dashboard() {
  const [fotoUrl, setFotoUrl] = useState(null)
  const fotoUrlRef = useRef(null)
  const [erroFoto, setErroFoto] = useState('')
  const [nomeUsuario, setNomeUsuario] = useState('')
  const [horaAtual, setHoraAtual] = useState(() => new Date().getHours())
  const [estatisticas, setEstatisticas] = useState(null)
  const [carregandoIndicadores, setCarregandoIndicadores] = useState(true)
  const [atualizandoIndicadores, setAtualizandoIndicadores] = useState(false)
  const [erroIndicadores, setErroIndicadores] = useState('')
  const controladorIndicadoresRef = useRef(null)

  async function atualizarIndicadores(inicial = false) {
    if (controladorIndicadoresRef.current) controladorIndicadoresRef.current.abort()
    const controlador = new AbortController()
    controladorIndicadoresRef.current = controlador
    if (inicial) setCarregandoIndicadores(true)
    else setAtualizandoIndicadores(true)
    setErroIndicadores('')
    try {
      const token = obterToken()
      if (!token) throw new Error('Sua sessão expirou. Faça login novamente.')
      const resposta = await fetch(`${API_URL}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: controlador.signal,
      })
      if (!resposta.ok) {
        if (resposta.status === 401 || resposta.status === 403) throw new Error('Sua sessão não tem acesso aos indicadores. Entre novamente como administrador.')
        throw new Error('Não foi possível consultar os indicadores. Verifique se a API está funcionando.')
      }
      const dados = await resposta.json()
      if (!indicadoresBase.every(item => Number.isSafeInteger(dados[item.campo]) && dados[item.campo] >= 0)) {
        throw new Error('A API retornou indicadores em um formato inesperado.')
      }
      if (!controlador.signal.aborted) setEstatisticas(dados)
    } catch (erro) {
      if (!controlador.signal.aborted) setErroIndicadores(erro.message || 'Erro ao carregar indicadores.')
    } finally {
      if (!controlador.signal.aborted) {
        setCarregandoIndicadores(false)
        setAtualizandoIndicadores(false)
      }
    }
  }

  useEffect(() => {
    atualizarIndicadores(true)
    return () => controladorIndicadoresRef.current?.abort()
  }, [])

  const saudacao = saudacaoPorHorario(horaAtual)
  const primeiroNome = nomeUsuario.trim().split(/\s+/)[0]

  useEffect(() => {
    const atualizarHora = () => setHoraAtual(new Date().getHours())
    const intervalo = window.setInterval(atualizarHora, 60 * 1000)
    return () => window.clearInterval(intervalo)
  }, [])

  useEffect(() => {
    const controlador = new AbortController()
    const token = obterToken()
    if (!token) return () => controlador.abort()
    fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controlador.signal,
      cache: 'no-store',
    }).then(resposta => {
      if (!resposta.ok) throw new Error('Não foi possível carregar o nome.')
      return resposta.json()
    }).then(dados => {
      if (!controlador.signal.aborted && typeof dados.nome === 'string') setNomeUsuario(dados.nome)
    }).catch(() => {})
    return () => controlador.abort()
  }, [])

  async function carregarFoto(signal) {
    const token = obterToken()
    if (!token) return
    const resposta = await fetch(`${API_URL}/admin/perfil/foto`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal,
    })
    if (resposta.status === 404) {
      if (fotoUrlRef.current) URL.revokeObjectURL(fotoUrlRef.current)
      fotoUrlRef.current = null
      setFotoUrl(null)
      return
    }
    if (!resposta.ok) throw new Error('Não foi possível carregar a foto de perfil.')
    const blob = await resposta.blob()
    if (!blob.type.startsWith('image/')) throw new Error('O servidor retornou um formato de foto inválido.')
    const novaUrl = URL.createObjectURL(blob)
    if (signal?.aborted) { URL.revokeObjectURL(novaUrl); return }
    const anterior = fotoUrlRef.current
    fotoUrlRef.current = novaUrl
    setFotoUrl(novaUrl)
    if (anterior) URL.revokeObjectURL(anterior)
  }

  useEffect(() => {
    const controlador = new AbortController()
    carregarFoto(controlador.signal).catch(e => { if (e.name !== 'AbortError') setErroFoto(e.message) })
    return () => {
      controlador.abort()
      if (fotoUrlRef.current) URL.revokeObjectURL(fotoUrlRef.current)
      fotoUrlRef.current = null
    }
  }, [])

  return (
    <div className="admin-dashboard">
      <style>{`
        @keyframes quitaiSaudacaoEntrada {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes quitaiSaudacaoAceno {
          0%, 100% { transform: rotate(0deg); }
          20%, 55% { transform: rotate(18deg); }
          40%, 75% { transform: rotate(-8deg); }
        }
        .quitai-saudacao-conteudo { animation: quitaiSaudacaoEntrada .65s ease-out both; }
        .quitai-saudacao-emoji { display: inline-block; transform-origin: 75% 80%; animation: quitaiSaudacaoAceno 1.5s ease-in-out .4s 1; }
        @media (prefers-reduced-motion: reduce) {
          .quitai-saudacao-conteudo, .quitai-saudacao-emoji { animation: none !important; }
        }
      `}</style>
      <section className="admin-welcome">
        <div className="quitai-saudacao-conteudo">
          <span className="admin-eyebrow">VISÃO GERAL</span>
          <h1 aria-live="polite">{saudacao.titulo}{primeiroNome ? `, ${primeiroNome}` : ''}! <span className="quitai-saudacao-emoji" aria-hidden="true">{saudacao.emoji}</span></h1>
          <p>{saudacao.mensagem}</p>
        </div>
        <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0, margin: '8px 12px' }}>
          <div style={{ width: 92, height: 92, borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 5px 18px rgba(25,65,125,.2)', background: '#2364c8', display: 'grid', placeItems: 'center', overflow: 'hidden', boxSizing: 'border-box' }}>
            {fotoUrl ? <img src={fotoUrl} alt="Foto de perfil do administrador" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span aria-hidden="true" style={{ fontSize: 36, fontWeight: 750, color: '#fff' }}>Q</span>}
          </div>
        </div>
      </section>
      {erroFoto && <p role="status" style={{ fontSize: 13, color: '#b42318' }}>{erroFoto}</p>}
      <section className="admin-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div><h2>Visão geral</h2><p>Acompanhe as informações das revendedoras em tempo real.</p></div>
        <button type="button" onClick={() => atualizarIndicadores()} disabled={carregandoIndicadores || atualizandoIndicadores} style={{ ...estiloBotao, background: '#e9f1ff', color: '#1956ac', opacity: carregandoIndicadores || atualizandoIndicadores ? 0.65 : 1 }}>
          {carregandoIndicadores || atualizandoIndicadores ? 'Atualizando...' : '↻ Atualizar dados'}
        </button>
      </section>
      {erroIndicadores && <p role="alert" style={{ background: '#fff0f0', color: '#b42318', borderRadius: 10, padding: 14, fontSize: 13 }}>{erroIndicadores}{estatisticas ? ' Exibindo os últimos dados carregados.' : ''}</p>}
      <section className="admin-stats-grid" aria-label="Visão geral das contas" aria-busy={carregandoIndicadores}>
        {indicadoresBase.map(item => (
          <article className="admin-stat-card" key={item.campo}>
            <div className="admin-stat-top"><span className="admin-stat-title">{item.titulo}</span><span className="admin-stat-icon" aria-hidden="true">{item.simbolo}</span></div>
            <strong className="admin-stat-value">{estatisticas ? estatisticas[item.campo].toLocaleString('pt-BR') : carregandoIndicadores ? '...' : '—'}</strong>
            <p className="admin-stat-description">{item.descricao}</p>
          </article>
        ))}
      </section>
      <section className="admin-info-panel"><div className="admin-info-icon" aria-hidden="true">↗</div><div><h2>Seu negócio em números</h2><p>Acompanhe o crescimento das revendedoras e mantenha tudo sob controle.</p><p style={{ marginTop: 8, fontSize: 12, opacity: 0.72 }}>↻ Dados atualizados diretamente do sistema</p></div></section>
      <footer className="admin-dashboard-footer">QuitaAí · Gestor Administrativo</footer>
    </div>
  )
}
