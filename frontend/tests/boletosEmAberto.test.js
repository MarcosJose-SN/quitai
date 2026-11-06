import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { somarBoletosEmAbertoCentavos as somar, formatarCentavos } from '../src/utils/boletosEmAberto.js'

const venda = valor => ({ valor_parcelas_em_aberto_centavos: valor, saldo: 999 })

test('lista vazia, uma venda e multiplas vendas: centavos exatos sem usar saldo', () => {
  assert.equal(somar([]), 0)
  assert.equal(somar([venda(31)]), 31)
  assert.equal(somar([venda(31), venda(0), venda(766)]), 797)
  assert.equal(formatarCentavos(797), '7,97')
})

test('equivalencia com parcelas parciais, futuras, vencidas, quitadas e excedentes', () => {
  const parcelas = [[1000, 0], [2000, 500], [3000, 3000], [1000, 1200], [3, 2]]
  const anterior = parcelas.reduce((s, [valor, pago]) => s + Math.max(valor - pago, 0), 0)
  assert.equal(somar([venda(2501)]), anterior)
})

test('valores grandes e apresentacao preservam cada centavo', () => {
  assert.equal(somar([venda(19999999998), venda(1)]), 19999999999)
  assert.equal(formatarCentavos(Number.MAX_SAFE_INTEGER), '90.071.992.547.409,91')
  assert.equal(formatarCentavos(1), '0,01')
  assert.equal(formatarCentavos(0), '0,00')
  assert.throws(() => somar([venda(Number.MAX_SAFE_INTEGER), venda(1)]))
})

test('ausencia ou invalidade em qualquer venda impede total parcial ou zero silencioso', () => {
  for (const valor of [undefined, null, '100', -1, 0.5, NaN, Infinity, 9007199254740992]) {
    assert.throws(() => somar([venda(100), venda(valor)]))
  }
  assert.throws(() => somar([null]))
  assert.throws(() => somar(null))
})

test('buscarVendas faz apenas a listagem; detalhes funcionais continuam separados', async () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const trecho = app.slice(app.indexOf('  async function buscarVendas()'), app.indexOf('  async function abrirNovaVenda()'))
  assert.equal((trecho.match(/fetchAutenticado\(/g) || []).length, 1)
  assert.ok(trecho.includes('/vendas/listar'))
  assert.ok(trecho.includes('somarBoletosEmAbertoCentavos(vendasRecebidas)'))
  assert.ok(trecho.includes('setTotalBoletosEmAbertoCentavos(null)'))
  assert.ok(app.includes('/vendas/${vendaId}'))
  assert.ok(app.includes('/vendas/${vendaSelecionada.venda.id}'))
})

test('fluxo real buscarVendas com HTTP simulado: N vendas usam uma requisicao e erro controlado', async () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const inicio = app.indexOf('  async function buscarVendas()')
  const fim = app.indexOf('\n  // =========================================================', inicio + 1)
  const fonte = app.slice(inicio, fim).replaceAll('import.meta.env.VITE_API_URL', '"http://fixture.local"')
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  for (const dados of [[], [venda(31)], [venda(31), venda(0), venda(766)], [{}], [venda(-1)]]) {
    const urls = [], totais = [], listas = [], erros = [], carregando = []
    const executar = new AsyncFunction('fetchAutenticado', 'setCarregandoVendas', 'setErroVendas', 'setVendas', 'setTotalBoletosEmAbertoCentavos', 'somarBoletosEmAbertoCentavos', 'console', `${fonte}; await buscarVendas()`)
    await executar(async url => {
      urls.push(url)
      return new Response(JSON.stringify(dados), { status: 200 })
    }, v => carregando.push(v), v => erros.push(v), v => listas.push(v), v => totais.push(v), somar, { error() {} })
    assert.deepEqual(urls, ['http://fixture.local/vendas/listar'])
    assert.deepEqual(listas, [dados])
    assert.deepEqual(carregando, [true, false])
    assert.deepEqual(erros, [''])
    const valido = dados.every(v => Number.isSafeInteger(v.valor_parcelas_em_aberto_centavos) && v.valor_parcelas_em_aberto_centavos >= 0)
    assert.deepEqual(totais, [valido ? somar(dados) : null])
  }
})
