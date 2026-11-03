// SSE autenticado com fetch (EventSource nativo não envia header Authorization).
// Retorna uma função para encerrar a conexão e o temporizador de reconexão.
export function conectarEventosSuporte(caminho, atualizar) {
  const controlador = new AbortController()
  let encerrado = false
  let reconectar
  let ultimaAtualizacao = 0
  const atualizarSeguro = () => {
    const agora = Date.now()
    if (agora - ultimaAtualizacao > 200) { ultimaAtualizacao = agora; atualizar() }
  }
  async function conectar() {
    if (encerrado) return
    try {
      const token = localStorage.getItem('quitai_token') || sessionStorage.getItem('quitai_token')
      const resposta = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8082"}${caminho}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: controlador.signal,
        cache: 'no-store',
      })
      if (!resposta.ok || !resposta.body) throw new Error(`Conexão SSE: ${resposta.status}`)
      const leitor = resposta.body.getReader()
      const decodificador = new TextDecoder()
      let buffer = ''
      atualizarSeguro()
      while (!encerrado) {
        const { value, done } = await leitor.read()
        if (done) break
        buffer += decodificador.decode(value, { stream: true })
        let posicao
        while ((posicao = buffer.indexOf('\n\n')) !== -1) {
          const evento = buffer.slice(0, posicao)
          buffer = buffer.slice(posicao + 2)
          if (evento.includes('event: atualizar')) atualizarSeguro()
        }
      }
    } catch (erro) {
      if (encerrado || erro.name === 'AbortError') return
    }
    if (!encerrado) reconectar = setTimeout(conectar, 1500)
  }
  conectar()
  return () => { encerrado = true; clearTimeout(reconectar); controlador.abort() }
}
