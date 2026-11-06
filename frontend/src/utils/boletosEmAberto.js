function exigirCentavos(valor) {
  if (!Number.isSafeInteger(valor) || valor < 0) {
    throw new Error('Resumo de parcelas indisponível ou incompatível.')
  }
  return valor
}

export function somarBoletosEmAbertoCentavos(vendas) {
  if (!Array.isArray(vendas)) throw new Error('Formato inesperado de vendas.')
  return vendas.reduce((total, venda) => {
    const valor = exigirCentavos(venda?.valor_parcelas_em_aberto_centavos)
    return exigirCentavos(total + valor)
  }, 0)
}

// Formata somente na apresentação, sem dividir o total monetário em float.
export function formatarCentavos(valor) {
  const centavos = BigInt(exigirCentavos(valor))
  return `${(centavos / 100n).toLocaleString('pt-BR')},${String(centavos % 100n).padStart(2, '0')}`
}
