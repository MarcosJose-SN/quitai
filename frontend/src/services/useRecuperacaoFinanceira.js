import { useCallback, useEffect, useRef, useState } from 'react'
import { obterOperacaoPendente, escopoFinanceiro } from './operacoesFinanceiras.js'
import { obterToken } from './sessaoRevendedora.js'

function escopoSeguro(api,tipo) { try { return escopoFinanceiro(api,tipo) } catch { return null } }

export function useRecuperacaoFinanceira(api, tipo, habilitada, referencia) {
  const escopoAtual = escopoSeguro(api,tipo)
  const [estado, setEstado] = useState({ carregando: true, pendente: null, erro: '', referencia: null, escopo: null })
  const [revisao, setRevisao] = useState(0)
  const geracao = useRef(0)
  const atualizar = useCallback(() => setRevisao(v => v + 1), [])
  useEffect(() => {
    if (!habilitada) return
    let ativo = true
    const geracaoAtual = ++geracao.current
    const token = obterToken()
    setEstado(anterior => ({ ...anterior, carregando: true, erro: '' }))
    obterOperacaoPendente(api, tipo).then(pendente => {
      if (ativo && geracao.current === geracaoAtual && obterToken() === token) setEstado({ carregando: false, pendente, erro: '', referencia, escopo: escopoAtual })
    }).catch(() => {
      if (ativo && geracao.current === geracaoAtual && obterToken() === token) setEstado({ carregando: false, pendente: null, referencia, escopo: escopoAtual, erro: 'Nao foi possivel verificar a recuperacao financeira no armazenamento seguro. Nao inicie outro pagamento. Preserve os dados e tente verificar novamente.' })
    })
    return () => { ativo = false }
  }, [api, tipo, habilitada, referencia, revisao, escopoAtual])
  useEffect(() => {
    if (!habilitada) return
    const escopo = escopoSeguro(api,tipo)
    const local = evento => { if (evento.detail?.escopo === escopo) atualizar() }
    const storage = evento => { if (evento.key === escopo || evento.key === null) atualizar() }
    const aoFocar = () => atualizar()
    let canal
    if (typeof window.BroadcastChannel === 'function') {
      canal = new window.BroadcastChannel('quitai-financeiro')
      canal.onmessage = evento => { if (evento.data?.escopo === escopo) atualizar() }
    }
    window.addEventListener('quitai:financeiro-atualizado', local)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', aoFocar)
    return () => {
      window.removeEventListener('quitai:financeiro-atualizado', local)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', aoFocar)
      canal?.close()
    }
  }, [api, tipo, habilitada, atualizar])
  const corresponde = estado.referencia === referencia && estado.escopo === escopoAtual
  return { ...estado, carregando: estado.carregando || !corresponde, pendente: corresponde ? estado.pendente : null, erro: corresponde ? estado.erro : '', atualizar }
}
