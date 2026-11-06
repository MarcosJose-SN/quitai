import { transacionarIntencao } from './intencoesFinanceirasStore.js'
import { chaveDaConta, fetchAutenticado, obterToken, obterAmbienteFinanceiro } from './sessaoRevendedora.js'

const caminhos = { venda_completa: '/vendas/completa', pagamento: '/pagamentos' }
const chaveValida = /^[A-Za-z0-9_-]{16,128}$/
const estados = ['preparada', 'pendente', 'confirmada', 'nao_confirmada']
const erroLocal = 'Controle financeiro local invalido. Preserve os dados e solicite suporte antes de reenviar.'

function serializar(valor) {
  if (Array.isArray(valor)) return `[${valor.map(serializar).join(',')}]`
  if (valor && typeof valor === 'object') return `{${Object.keys(valor).sort().map(k => `${JSON.stringify(k)}:${serializar(valor[k])}`).join(',')}}`
  return JSON.stringify(valor)
}
function congelar(valor) {
  if (valor && typeof valor === 'object') {
    Object.values(valor).forEach(congelar)
    Object.freeze(valor)
  }
  return valor
}
export function escopoFinanceiro(api, tipo) {
  if (!caminhos[tipo]) throw new Error('Operacao financeira desconhecida.')
  const chave = chaveDaConta(`quitai_financeiro_pendente:${tipo}`, api)
  if (!chave) throw new Error('Valide sua conta antes de enviar uma operacao financeira.')
  return `${chave}:ambiente:${obterAmbienteFinanceiro()}`
}
function contexto(api, tipo) {
  const token = obterToken()
  if (!token) throw new Error('Valide sua conta antes de enviar uma operacao financeira.')
  return { chave: escopoFinanceiro(api, tipo), base: chaveDaConta(`quitai_financeiro_pendente:${tipo}`, api), ambiente: obterAmbienteFinanceiro(), token, api, tipo }
}
function validarSessao(ctx) {
  if (obterToken() !== ctx.token || escopoFinanceiro(ctx.api, ctx.tipo) !== ctx.chave) {
    throw new Error('Sessao alterada. Reabra o formulario na conta correta; a pendencia foi preservada.')
  }
}
function comprovanteValido(tipo, dados) {
  const id = tipo === 'venda_completa' ? dados?.id : dados?.pagamento_id
  return Number.isSafeInteger(id) && id > 0
}
function comprovanteMinimo(tipo, dados) {
  return tipo === 'venda_completa' ? { id: dados.id } : { pagamento_id: dados.pagamento_id }
}
function validarRegistro(r) {
  if (r === null) return null
  if (typeof r?.ambiente !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(r.ambiente)) throw new Error('Intencao legada sem ambiente. Preserve os dados; envio bloqueado.')
  const pedidoValido = r?.pedido && typeof r.pedido === 'object' && !Array.isArray(r.pedido)
  if (typeof r?.chave !== 'string' || !chaveValida.test(r.chave)) throw new Error(erroLocal)
  if (!Object.hasOwn(r, 'versao')) throw new Error(erroLocal)
  if (r.versao !== 1 || typeof r.id !== 'string' || !chaveValida.test(r.id) || !estados.includes(r.estado)) throw new Error(erroLocal)
  if (r.estado === 'preparada' ? r.pedido !== null : !pedidoValido) throw new Error(erroLocal)
  return r.estado === 'nao_confirmada' ? { ...r, estado: 'pendente', resultado_remoto: 'desconhecido' } : r
}
function espelhoDaConta(chave) {
  let texto
  try { texto = localStorage.getItem(chave) }
  catch { throw new Error('Armazenamento local indisponivel. Preserve os dados e reabra o formulario antes de reenviar.') }
  if (texto === null) return null
  try { const registro = JSON.parse(texto); if (registro === null) throw new Error(erroLocal); return validarRegistro(registro) }
  catch { throw new Error(erroLocal) }
}
function reconciliar(autoritativo, espelho, tipo) {
  if (autoritativo === undefined) {
    if (!espelho) return null
    // A receipt in localStorage alone is never evidence of a committed result.
    const { antecessora: _naoVerificada, espelhoSuperado: _origemNaoVerificada, ...legado } = espelho
    return legado.estado === 'confirmada'
      ? { ...legado, estado: 'pendente', resultado_remoto: 'desconhecido' }
      : legado
  }
  let atual = validarRegistro(autoritativo)
  if (espelho && espelho.ambiente !== atual?.ambiente) throw new Error('Ambiente divergente entre armazenamentos; envio bloqueado.')
  if (!atual || (atual.estado === 'confirmada' && !comprovanteValido(tipo, atual.comprovante))) throw new Error(erroLocal)
  if (atual.estado === 'preparada' && espelho?.id === atual.id && espelho.chave === atual.chave && espelho.pedido !== null) {
    atual = { ...atual, pedido: espelho.pedido, estado: 'pendente', resultado_remoto: 'desconhecido' }
  }
  const corresponde = prova => prova && prova.ambiente === atual.ambiente && comprovanteValido(tipo, prova.comprovante) && espelho?.id === prova.id && espelho?.chave === prova.chave &&
    (espelho.pedido === null || (prova.pedido !== undefined && serializar(espelho.pedido) === serializar(prova.pedido)))
  const antecessoraConfirmada = corresponde(atual.antecessora) || corresponde(atual.espelhoSuperado)
  if (espelho && !antecessoraConfirmada && (espelho.id !== atual.id || espelho.chave !== atual.chave ||
      (espelho.pedido !== null && serializar(espelho.pedido) !== serializar(atual.pedido)))) {
    // There is no automatic winner for distinct intents. Keep both for recovery.
    throw new Error('Existem intencoes financeiras diferentes nos armazenamentos. Preserve os dados, atualize todas as abas e solicite suporte antes de reenviar.')
  }
  return atual
}
function notificar(ctx) {
  // Notifications only refresh views. Neither channel is a source of truth.
  try { window.dispatchEvent(new CustomEvent('quitai:financeiro-atualizado', { detail: { escopo: ctx.chave } })) } catch { /* no effect on persistence */ }
  if (typeof window.BroadcastChannel === 'function') {
    try {
      const canal = new window.BroadcastChannel('quitai-financeiro')
      canal.postMessage({ escopo: ctx.chave })
      canal.close()
    } catch { /* focus/recovery actions also refresh from IndexedDB */ }
  }
}

async function comTrava(ctx, executar) {
  if (!globalThis.navigator?.locks?.request) {
    throw new Error('Este navegador nao oferece coordenacao segura entre abas (Web Locks). O envio financeiro foi bloqueado; as pendencias foram preservadas.')
  }
  const controle = new AbortController()
  const timer = setTimeout(() => controle.abort(), 5000)
  try {
    const nome = `quitai:financeiro:${window.location.origin}:${ctx.chave}`
    return await navigator.locks.request(nome, { mode: 'exclusive', signal: controle.signal }, async () => {
      clearTimeout(timer)
      validarSessao(ctx)
      let registroCommit, alterado = false
      const resultado = await transacionarIntencao(ctx.chave, (autoritativo, salvar) => {
        validarSessao(ctx)
        for (let i=0;i<localStorage.length;i++) {
          const key = localStorage.key(i)
          if (key?.startsWith(ctx.base+':ambiente:') && key !== ctx.chave) {
            const outro = espelhoDaConta(key)
            if (outro) throw new Error('Pendencia de outro ambiente; envio bloqueado. Preserve os dados.')
          }
        }
        if (localStorage.getItem(ctx.base) !== null) throw new Error('Pendencia legada sem ambiente. Preserve os dados e solicite suporte; envio bloqueado.')
        if (autoritativo && autoritativo.ambiente !== ctx.ambiente) throw new Error('Ambiente da intencao divergente; envio bloqueado.')
        const atual = reconciliar(autoritativo, espelhoDaConta(ctx.chave), ctx.tipo)
        if (atual && atual.ambiente !== ctx.ambiente) throw new Error('Intencao sem ambiente ou divergente; envio bloqueado.')
        registroCommit = atual
        const persistir = registro => {
          validarSessao(ctx)
          // Reject known conflicts before committing a new authoritative identity.
          reconciliar(registro, espelhoDaConta(ctx.chave), ctx.tipo)
          salvar(registro)
          registroCommit = registro
          alterado = true
        }
        // Import legacy/mirror-only records conservatively, in the same transaction.
        if (atual && serializar(atual) !== serializar(autoritativo)) persistir(atual)
        return executar(atual, persistir)
      }, ctx.base)
      // This point is reached only after tx.oncomplete, while still holding the lock.
      validarSessao(ctx)
      if (registroCommit) {
        const reconciliado = reconciliar(registroCommit, espelhoDaConta(ctx.chave), ctx.tipo)
        if (serializar(reconciliado) !== serializar(registroCommit)) throw new Error('Outra aba alterou a recuperacao financeira. Preserve a pendencia e reabra o formulario.')
        const texto = JSON.stringify(registroCommit)
        try {
          if (localStorage.getItem(ctx.chave) !== texto) localStorage.setItem(ctx.chave, texto)
        } catch { /* IndexedDB is committed: mirror quota cannot undo server evidence. */ }
      }
      if (alterado) notificar(ctx)
      return resultado
    })
  } catch (erro) {
    if (erro.name === 'AbortError') throw new Error('Outra aba esta atualizando esta operacao. Aguarde e reabra o formulario; nenhuma nova requisicao foi enviada.')
    throw erro
  } finally { clearTimeout(timer) }
}

// All recovery decisions await a committed authoritative read, never the mirror.
export async function obterOperacaoPendente(api, tipo) {
  const ctx = contexto(api, tipo)
  return comTrava(ctx, r => r?.estado === 'pendente' ? congelar({ chave: r.chave, pedido: r.pedido }) : null)
}

// Only on an explicit new-operation/recovery action, never automatically on submit.
export async function prepararIntencaoFinanceira(api, tipo, { somenteRecuperar = false } = {}) {
  const ctx = contexto(api, tipo)
  return comTrava(ctx, (anterior, salvar) => {
    if (somenteRecuperar) {
      if (!anterior) throw new Error('Nao ha intencao financeira a recuperar. Atualize os detalhes da venda.')
      return congelar({ id: anterior.id, escopo: ctx.chave, confirmada: anterior.estado === 'confirmada', comprovante: anterior.comprovante, pendente: anterior.estado === 'pendente' ? { chave: anterior.chave, pedido: anterior.pedido } : null })
    }
    const r = anterior && ['preparada', 'pendente'].includes(anterior.estado)
      ? anterior
      : { versao: 1, ambiente: ctx.ambiente, id: crypto.randomUUID(), chave: crypto.randomUUID(), estado: 'preparada', pedido: null }
    if (anterior?.estado === 'confirmada' && r.id !== anterior.id) {
      const prova = { ambiente: anterior.ambiente, id: anterior.id, chave: anterior.chave, pedido: anterior.pedido, comprovante: anterior.comprovante }
      r.antecessora = prova
      const espelho = espelhoDaConta(ctx.chave)
      // Carry only the observed, already verified stale generation, not an
      // unbounded history. Evidence comes exclusively from committed IndexedDB.
      r.espelhoSuperado = espelho && espelho.id !== anterior.id
        ? (anterior.espelhoSuperado?.id === espelho.id ? anterior.espelhoSuperado : anterior.antecessora)
        : prova
    }
    salvar(r)
    return congelar({ id: r.id, escopo: ctx.chave, pendente: r.estado === 'pendente' ? { chave: r.chave, pedido: r.pedido } : null })
  })
}

export async function enviarOperacaoFinanceira(api, tipo, pedido, intencao) {
  const ctx = contexto(api, tipo)
  if (!intencao?.id || intencao.escopo !== ctx.chave) throw new Error('Abra ou recupere explicitamente o formulario antes de enviar.')
  // Snapshot before any await: later edits cannot change this request.
  const copia = congelar(JSON.parse(JSON.stringify(pedido)))
  if (!copia || typeof copia !== 'object' || Array.isArray(copia)) throw new Error('Pedido financeiro invalido.')
  const operacao = await comTrava(ctx, (r, salvar) => {
    if (!r || r.id !== intencao.id) throw new Error('Esta intencao foi substituida por uma nova operacao explicita. Reabra o formulario; nenhum pedido foi enviado.')
    if (r.pedido && serializar(r.pedido) !== serializar(copia)) {
      throw new Error('Existe uma operacao com outro pedido. Reabra o formulario para recuperar e resolver o pedido original antes de altera-lo.')
    }
    if (r.estado === 'confirmada') return r
    // Persist remote uncertainty before HTTP. Tab closure, abort and a local
    // request count of zero can never establish that the server did not commit.
    const reservado = { ...r, estado: 'pendente', pedido: r.pedido || copia, resultado_remoto: 'desconhecido' }
    salvar(reservado)
    return congelar(reservado)
  })
  if (operacao.estado === 'confirmada') return operacao.comprovante

  validarSessao(ctx)
  const controle = new AbortController()
  const limite = setTimeout(() => controle.abort(), 30000)
  try {
    // No Web Lock is held during HTTP. Replays use the durable key and payload.
    const resposta = await fetchAutenticado(`${api}${caminhos[tipo]}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operacao.chave, 'X-Financial-Environment': operacao.ambiente },
      body: JSON.stringify(operacao.pedido), signal: controle.signal,
    })
    const dados = await resposta.json().catch(() => null)
    const resultado = await comTrava(ctx, (r, salvar) => {
      if (!r || r.id !== operacao.id || r.chave !== operacao.chave || serializar(r.pedido) !== serializar(operacao.pedido)) {
        throw new Error('Resposta de uma intencao anterior. A operacao atual foi preservada; reabra o formulario para conferir o resultado.')
      }
      // A late failure cannot downgrade an already confirmed result.
      if (r.estado === 'confirmada') {
        if (resposta.ok && comprovanteValido(tipo, dados) && serializar(comprovanteMinimo(tipo, dados)) !== serializar(r.comprovante)) throw new Error('Resultados financeiros divergentes. Preserve os dados e solicite suporte.')
        return r.comprovante
      }
      if (!resposta.ok) {
        // A negative response describes this attempt, not all remote attempts.
        // Never release this identity, even if no other tab is currently alive.
        salvar({ ...r, estado: 'pendente', resultado_remoto: 'desconhecido' })
        return { erroFinanceiro: new Error(`${dados?.mensagem || `Resultado financeiro nao confirmado (HTTP ${resposta.status}).`} A intencao continua pendente. Reabra o formulario para recuperar e repetir somente o pedido original com a mesma chave; nao inicie outra operacao desse tipo enquanto o resultado remoto estiver desconhecido.`) }
      }
      if (!comprovanteValido(tipo, dados)) throw new Error('Resposta financeira incompleta. Pedido e chave preservados; repita o pedido original.')
      salvar({ ...r, estado: 'confirmada', resultado_remoto: 'confirmado', comprovante: comprovanteMinimo(tipo, dados) })
      return dados
    })
    if (resultado.erroFinanceiro) throw resultado.erroFinanceiro
    return resultado
  } catch (erro) {
    if (erro.name === 'AbortError' || erro instanceof TypeError) {
      throw new Error('Resultado incerto por falha de conexao. O pedido e a chave foram preservados. Reabra o formulario e repita o pedido original.')
    }
    throw erro
  } finally { clearTimeout(limite) }
}
