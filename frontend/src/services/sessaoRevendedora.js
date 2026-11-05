export function obterToken() {
  return localStorage.getItem('quitai_token') || sessionStorage.getItem('quitai_token')
}

export function limparSessao() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem('quitai_token')
    storage.removeItem('quitai_usuario')
  }
}

export function chaveDaConta(prefixo, api) {
  try {
    const usuario = JSON.parse(localStorage.getItem('quitai_usuario') || sessionStorage.getItem('quitai_usuario') || 'null')
    if (!Number.isSafeInteger(usuario?.id) || usuario.id <= 0) return null
    return `${prefixo}:${encodeURIComponent(api)}:${usuario.id}`
  } catch { return null }
}

export function lerListaLocal(chave) {
  if (!chave) return []
  try {
    const dados = JSON.parse(localStorage.getItem(chave) || '[]')
    return Array.isArray(dados) ? dados : []
  } catch { return [] }
}

export async function fetchAutenticado(url, options = {}) {
  const token = obterToken()
  const headers = new Headers(options.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const resposta = await fetch(url, { ...options, headers })
  if (obterToken() !== token) throw new DOMException('Sessao alterada.', 'AbortError')
  const caminho = new URL(url, window.location.origin).pathname
  if (resposta.status === 401 || resposta.status === 403) {
    const erro = await resposta.clone().json().catch(() => ({}))
    // Parsing the body is asynchronous: a late denial must not clear a new login.
    if (obterToken() !== token) throw new DOMException('Sessao alterada.', 'AbortError')
    const perfilSenha = ['/minha-conta', '/minha-conta/senha', '/admin/minha-conta', '/admin/minha-conta/senha'].includes(caminho)
    if (resposta.status === 401 && perfilSenha && (erro?.codigo === 'senha_atual_incorreta' || (!erro?.codigo && erro?.mensagem === 'Senha atual incorreta.'))) return resposta
    if (resposta.status === 403 && token && erro?.codigo === 'permissao_insuficiente' && erro?.sessao_validada === true) return resposta
    limparSessao()
    window.dispatchEvent(new Event('quitai:sessao-encerrada'))
    throw new Error('Sua sessão expirou ou o acesso foi bloqueado. Entre novamente.')
  }
  return resposta
}

export function exigirNovoLogin() {
  limparSessao()
  window.dispatchEvent(new Event('quitai:sessao-encerrada'))
}
export async function encerrarSessaoServidor(api) {
  const token = obterToken()
  if (!token) { exigirNovoLogin(); return }
  const controle = new AbortController()
  const timer = setTimeout(() => controle.abort(), 10000)
  try {
    const resposta = await fetch(`${api}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: controle.signal })
    if (obterToken() !== token) throw new DOMException('Sessao alterada.', 'AbortError')
    if (!resposta.ok && resposta.status !== 401) throw new Error('Nao foi possivel encerrar a sessao no servidor. Tente novamente.')
    exigirNovoLogin()
  } finally { clearTimeout(timer) }
}
