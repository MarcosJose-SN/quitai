import { chaveDaConta, fetchAutenticado } from './sessaoRevendedora.js'

const caminhos = { venda_completa: '/vendas/completa', pagamento: '/pagamentos' }
function serializar(valor) {
  if (Array.isArray(valor)) return `[${valor.map(serializar).join(',')}]`
  if (valor && typeof valor === 'object') return `{${Object.keys(valor).sort().map(k => `${JSON.stringify(k)}:${serializar(valor[k])}`).join(',')}}`
  return JSON.stringify(valor)
}
function chaveLocal(api, tipo) {
  if (!caminhos[tipo]) throw new Error('Operacao financeira desconhecida.')
  const chave = chaveDaConta(`quitai_financeiro_pendente:${tipo}`, api)
  if (!chave) throw new Error('Valide sua conta antes de enviar uma operacao financeira.')
  return chave
}
export function obterOperacaoPendente(api, tipo) {
  const chave = chaveLocal(api, tipo)
  const texto = localStorage.getItem(chave)
  if (!texto) return null
  try {
    const operacao = JSON.parse(texto)
    if (typeof operacao?.chave !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(operacao.chave) || !operacao.pedido || typeof operacao.pedido !== 'object' || Array.isArray(operacao.pedido)) throw new Error()
    return operacao
  } catch { throw new Error('Controle financeiro local invalido. Preserve os dados e solicite suporte antes de reenviar.') }
}
export async function enviarOperacaoFinanceira(api, tipo, pedido) {
  const chave = chaveLocal(api, tipo)
  const anterior = obterOperacaoPendente(api, tipo)
  if (anterior && serializar(anterior.pedido) !== serializar(pedido)) {
    throw new Error('Existe uma operacao pendente com outro pedido. Reabra o formulario para recuperar e resolver o pedido original antes de altera-lo.')
  }
  const operacao = anterior || { chave: crypto.randomUUID(), pedido }
  try { localStorage.setItem(chave, JSON.stringify(operacao)) }
  catch { throw new Error('Nao foi possivel guardar o controle financeiro. Nenhuma nova requisicao foi enviada.') }
  const controle = new AbortController()
  const limite = setTimeout(() => controle.abort(), 30000)
  try {
    const resposta = await fetchAutenticado(`${api}${caminhos[tipo]}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operacao.chave },
      body: JSON.stringify(operacao.pedido), signal: controle.signal,
    })
    const dados = await resposta.json().catch(() => null)
    if (!resposta.ok) {
      if (dados?.resultado === 'nao_confirmado') {
        const atual = obterOperacaoPendente(api, tipo)
        if (atual?.chave === operacao.chave) localStorage.removeItem(chave)
      }
      throw new Error(dados?.mensagem || `Resultado financeiro nao confirmado (HTTP ${resposta.status}). Repita o pedido original.`)
    }
    const id = tipo === 'venda_completa' ? dados?.id : dados?.pagamento_id
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Resposta financeira incompleta. Pedido e chave preservados; repita o pedido original.')
    const atual = obterOperacaoPendente(api, tipo)
    if (atual?.chave === operacao.chave) localStorage.removeItem(chave)
    return dados
  } catch (erro) {
    if (erro.name === 'AbortError' || erro instanceof TypeError) {
      throw new Error('Resultado incerto por falha de conexao. O pedido e a chave foram preservados. Reabra o formulario e repita o pedido original.')
    }
    throw erro
  } finally { clearTimeout(limite) }
}