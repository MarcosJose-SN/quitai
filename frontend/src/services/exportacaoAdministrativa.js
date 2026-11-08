import { fetchAutenticado, obterToken } from './sessaoRevendedora.js'

const limite = 20 * 1024 * 1024
const tabelas = ['revendedoras', 'clientes', 'produtos', 'vendas', 'itens', 'parcelas', 'pagamentos']
const contexto = () => JSON.stringify([obterToken(), localStorage.getItem('quitai_usuario'), sessionStorage.getItem('quitai_usuario')])

export async function validarExportacao(texto) {
  const arquivo = JSON.parse(texto)
  if (arquivo.formato !== 'quitai-exportacao-dados' || arquivo.versao !== 1 ||
      typeof arquivo.conteudo_json !== 'string' || !/^[a-f0-9]{64}$/.test(arquivo.sha256)) {
    throw new Error('Formato ou versão da exportação não reconhecido.')
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(arquivo.conteudo_json))
  const hash = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('')
  if (hash !== arquivo.sha256) throw new Error('A integridade da exportação não foi confirmada.')
  const conteudo = JSON.parse(arquivo.conteudo_json)
  if (!conteudo.dados || !tabelas.every(t => Array.isArray(conteudo.dados[t])) ||
      conteudo.escopo !== 'todas_revendedoras_sem_filtros' || !/^[A-Za-z0-9_-]{8,128}$/.test(conteudo.ambiente_financeiro)) {
    throw new Error('Exportação incompleta ou incompatível.')
  }
}

// A private download, never localStorage/IndexedDB, console, or a public URL.
export async function obterExportacaoAdministrativa(api, signal) {
  const origem = contexto()
  if (!obterToken()) throw new Error('Entre novamente como administrador.')
  const atual = () => {
    if (signal?.aborted || origem !== contexto()) throw new DOMException('Sessão alterada ou download cancelado.', 'AbortError')
  }
  const resposta = await fetchAutenticado(`${api}/admin/relatorios/exportar`, { signal, cache: 'no-store' })
  atual()
  if (!resposta.ok) throw new Error(`Não foi possível exportar os dados (HTTP ${resposta.status}). Nenhum backup foi salvo.`)
  if (!resposta.headers.get('Content-Type')?.startsWith('application/json') || !resposta.body) throw new Error('Resposta de exportação inválida.')
  const reader = resposta.body.getReader(), partes = []
  let tamanho = 0, terminou = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      atual()
      if (done) { terminou = true; break }
      tamanho += value.byteLength
      if (tamanho > limite) throw new Error('Exportação excede o limite seguro de download.')
      partes.push(value)
    }
  } finally {
    if (!terminou) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const blob = new Blob(partes, { type: 'application/json' })
  await validarExportacao(await blob.text())
  atual()
  return blob
}
