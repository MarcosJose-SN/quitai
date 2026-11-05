export function dataLocalISO(data = new Date()) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

export function centavosValidos(valor) {
  if (valor === '' || valor === null || valor === undefined) return null
  const numero = Number(valor)
  const centavos = Math.round(numero * 100)
  if (!Number.isFinite(numero) || !Number.isSafeInteger(centavos) || Math.abs(numero * 100 - centavos) > 0.000001) return null
  return centavos
}

export function quantidadeValida(valor, permitirZero = false) {
  const quantidade = Number(valor)
  return valor !== '' && Number.isInteger(quantidade) && quantidade >= (permitirZero ? 0 : 1) && quantidade <= 2147483647
}

export function criarTravaOperacoes() {
  const pendentes = new Set()
  return async (chave, executar) => {
    if (pendentes.has(chave)) return
    pendentes.add(chave)
    try { return await executar() }
    finally { pendentes.delete(chave) }
  }
}
