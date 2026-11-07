// Coordena apenas leituras desta instancia React; nao armazena dados financeiros.
export function criarLeituraVendas({ contexto, carregar, iniciar, sucesso, falha, finalizar }) {
  let geracao = 0
  let pendente = null
  let encerrado = false

  function invalidar() {
    ++geracao
    pendente = null
  }

  function buscar({ atualizar = false } = {}) {
    if (encerrado) return Promise.resolve()
    if (atualizar) invalidar()
    const origem = contexto()
    if (pendente?.origem === origem) return pendente.promessa
    const numero = ++geracao
    const atual = () => !encerrado && numero === geracao && origem === contexto()
    iniciar()
    const registro = { origem, promessa: null }
    pendente = registro
    registro.promessa = Promise.resolve().then(() => {
      if (atual()) return carregar()
    }).then(dados => {
      if (atual()) sucesso(dados)
    }).catch(erro => {
      if (atual()) falha(erro)
    }).finally(() => {
      if (atual()) finalizar()
      if (pendente === registro) pendente = null
    })
    return registro.promessa
  }

  return { buscar, invalidar, encerrar() { encerrado = true; invalidar() } }
}
