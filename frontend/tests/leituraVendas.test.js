import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { criarLeituraVendas } from '../src/services/leituraVendas.js'

function fixture() {
  let identidade = 'api-A/conta-1/token-A/ambiente-A'
  const pedidos = [], estados = [], erros = []
  let finais = 0
  const leitura = criarLeituraVendas({
    contexto: () => identidade,
    carregar: () => new Promise((resolve, reject) => pedidos.push({ resolve, reject })),
    iniciar() {}, sucesso: dados => estados.push(dados), falha: erro => erros.push(erro),
    finalizar: () => ++finais,
  })
  return { leitura, pedidos, estados, erros, mudar: v => { identidade = v }, finais: () => finais }
}
const tick = () => Promise.resolve()

test('duas leituras simultaneas compartilham uma chamada; nao ha cache apos conclusao', async () => {
  const f = fixture(), a = f.leitura.buscar(), b = f.leitura.buscar()
  assert.equal(a, b)
  await tick(); assert.equal(f.pedidos.length, 1)
  f.pedidos[0].resolve([1]); await a
  assert.deepEqual(f.estados, [[1]])
  const c = f.leitura.buscar(); await tick(); assert.equal(f.pedidos.length, 2)
  f.pedidos[1].resolve([2]); await c
})

test('atualizacao apos mutacao ignora resposta anterior, inclusive finalizacao e erro', async () => {
  for (const falhar of [false, true]) {
    const f = fixture(), antiga = f.leitura.buscar(); await tick()
    const nova = f.leitura.buscar({ atualizar: true }); await tick()
    if (falhar) f.pedidos[0].reject(new Error('antigo'))
    else f.pedidos[0].resolve(['antigo'])
    await antiga
    assert.equal(f.finais(), 0); assert.deepEqual(f.estados, []); assert.deepEqual(f.erros, [])
    f.pedidos[1].resolve(['novo']); await nova
    assert.deepEqual(f.estados, [['novo']]); assert.equal(f.finais(), 1)
  }
})

test('confirmacao nova prevalece mesmo quando a resposta antiga chega depois', async () => {
  const f = fixture(), a = f.leitura.buscar(); await tick()
  const b = f.leitura.buscar({ atualizar: true }); await tick()
  f.pedidos[1].resolve(['novo']); await b
  f.pedidos[0].resolve(['antigo']); await a
  assert.deepEqual(f.estados, [['novo']]); assert.equal(f.finais(), 1)
})

test('mudanca de conta, API, token ou ambiente invalida a resposta e nao compartilha pedido', async () => {
  for (const identidade of ['api-B', 'conta-2', 'token-B', 'ambiente-B']) {
    const f = fixture(), a = f.leitura.buscar(); await tick()
    f.mudar(identidade)
    const b = f.leitura.buscar(); await tick()
    assert.equal(f.pedidos.length, 2)
    f.pedidos[0].resolve(['outra sessao']); await a
    assert.deepEqual(f.estados, [])
    f.pedidos[1].resolve(['atual']); await b
    assert.deepEqual(f.estados, [['atual']])
  }
})

test('exclusao invalida leitura anterior e navegacao inicia uma unica atualizacao', async () => {
  const f = fixture(), a = f.leitura.buscar(); await tick()
  f.leitura.invalidar()
  const b = f.leitura.buscar(), c = f.leitura.buscar(); await tick()
  assert.equal(b, c); assert.equal(f.pedidos.length, 2)
  f.pedidos[0].resolve(['venda excluida']); await a
  f.pedidos[1].resolve([]); await b
  assert.deepEqual(f.estados, [[]])
})

test('desmontagem impede atualizacao e novas chamadas; falha atual permite tentar novamente', async () => {
  const f = fixture(), a = f.leitura.buscar(); await tick()
  f.pedidos[0].reject(new Error('rede')); await a
  assert.equal(f.erros.length, 1)
  const b = f.leitura.buscar(); await tick(); f.leitura.encerrar()
  f.pedidos[1].resolve(['tarde']); await b; await f.leitura.buscar()
  assert.deepEqual(f.estados, []); assert.equal(f.pedidos.length, 2)
})

test('desmontagem antes do envio nao chega ao servidor', async () => {
  const f = fixture(), a = f.leitura.buscar()
  f.leitura.encerrar(); await a
  assert.equal(f.pedidos.length, 0); assert.deepEqual(f.estados, [])
})

test('integracao da exclusao usa caminhos exclusivos e criacao/pagamento exigem leitura nova', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const inicio = app.indexOf('  async function confirmarExclusaoVenda()')
  const trecho = app.slice(inicio, app.indexOf('\n  // =========================================================', inicio))
  assert.ok(trecho.includes('leituraVendasRef.current?.invalidar()'))
  assert.match(trecho, /if \(telaVendasRef.current === 'vendas'\) await buscarVendas\(\)\s+else setTela\('vendas'\)/)
  assert.equal((trecho.match(/buscarVendas\(/g) || []).length, 1)
  assert.equal((app.match(/await buscarVendas\(\{ atualizar: true \}\)/g) || []).length, 2)
})

test('exclusao real: invalidacao seguida de leitura direta ou efeito nao deixa carregamento preso', async () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const inicio = app.indexOf('  async function confirmarExclusaoVenda()')
  const fonte = app.slice(inicio, app.indexOf('\n  // =========================================================', inicio))
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  for (const tela of ['detalhes-venda', 'vendas', 'inicio', 'clientes']) {
    let carregando = false, atualizacao, finais = 0
    const pedidos = [], publicados = [], contexto = {}
    const leitura = criarLeituraVendas({
      contexto: () => 'sessao-A',
      carregar: () => new Promise(resolve => pedidos.push(resolve)),
      iniciar: () => { carregando = true },
      sucesso: v => publicados.push(v), falha: assert.fail,
      finalizar: () => { carregando = false; ++finais },
    })
    const antiga = leitura.buscar(); await tick()
    const parametros = {
      vendaParaExcluir: { id: 1 }, contextoExclusaoRef: { current: contexto }, apiBase: 'http://fixture.local',
      excluirVendaNoAmbiente: async () => {}, validarContextoExclusao() {},
      setExcluindoVenda() {}, setErroExclusaoVenda: v => assert.equal(v, ''),
      setVendaParaExcluir() {}, setVendaSelecionada() {}, setPagamentosVenda() {}, setErroDetalhesVenda() {},
      leituraVendasRef: { current: leitura }, telaVendasRef: { current: tela },
      buscarVendas: () => (atualizacao = leitura.buscar()),
      setTela: v => {
        assert.equal(v, 'vendas')
        // Simula o efeito de navegacao apos o commit React.
        queueMicrotask(() => { atualizacao = leitura.buscar() })
      },
    }
    const executar = new AsyncFunction(...Object.keys(parametros), `${fonte}; await confirmarExclusaoVenda()`)
    const exclusao = executar(...Object.values(parametros))
    for (let i = 0; i < 8 && pedidos.length < 2; ++i) await tick()
    assert.equal(pedidos.length, 2, `tela ${tela}: uma leitura antiga e uma nova`)
    pedidos[0](['anterior']); await antiga
    assert.equal(carregando, true); assert.equal(finais, 0)
    pedidos[1]([]); await atualizacao; await exclusao
    assert.equal(carregando, false); assert.equal(finais, 1)
    assert.deepEqual(publicados, [[]])
  }
})

test('atualizar true apos leitura concluida tambem envia pedido novo', async () => {
  const f = fixture(), a = f.leitura.buscar(); await tick()
  f.pedidos[0].resolve(['antes']); await a
  const b = f.leitura.buscar({ atualizar: true }); await tick()
  assert.equal(f.pedidos.length, 2)
  f.pedidos[1].resolve(['depois']); await b
  assert.deepEqual(f.estados, [['antes'], ['depois']])
})

test('fluxos oficiais de logout, login e troca entre abas recriam a aplicacao', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const sessao = readFileSync(new URL('../src/services/sessaoRevendedora.js', import.meta.url), 'utf8')
  const login = readFileSync(new URL('../src/Login.jsx', import.meta.url), 'utf8')
  assert.ok(app.includes("const encerrar = () => window.location.replace('/')"))
  assert.ok(app.includes("window.addEventListener('quitai:sessao-encerrada', encerrar)"))
  assert.match(app, /evento.key === 'quitai_token'.*evento.key === 'quitai_usuario'.*encerrar\(\)/)
  const callback = app.slice(app.indexOf('onLogin={(usuario)'), app.indexOf('onLogin={(usuario)') + 600)
  assert.ok(callback.includes("window.location.replace('/')"))
  assert.ok(callback.includes("window.location.replace('/admin')"))
  assert.match(sessao, /export function exigirNovoLogin\(\)\s*\{\s*limparSessao\(\)\s*window.dispatchEvent/)
  assert.match(sessao, /export async function encerrarSessaoServidor[\s\S]*exigirNovoLogin\(\)/)
  assert.ok(login.includes("outroArmazenamento.removeItem('quitai_token')"))
  assert.ok(login.includes("outroArmazenamento.removeItem('quitai_usuario')"))
  assert.ok(app.includes('const [vendas, setVendas] = useState([])'))
  assert.ok(app.includes('const [totalBoletosEmAbertoCentavos, setTotalBoletosEmAbertoCentavos] = useState(null)'))
})
