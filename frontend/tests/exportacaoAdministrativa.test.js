import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { obterExportacaoAdministrativa, validarExportacao } from '../src/services/exportacaoAdministrativa.js'

const tabelas = ['revendedoras', 'clientes', 'produtos', 'vendas', 'itens', 'parcelas', 'pagamentos']
function storage() { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k,v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
function preparar() {
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage()
  globalThis.window = { location: { origin: 'http://fixture.local' }, dispatchEvent() {} }
  sessionStorage.setItem('quitai_token', 'fixture-exportacao')
  sessionStorage.setItem('quitai_usuario', JSON.stringify({ id: 1, perfil: 'admin' }))
}
async function arquivo() {
  const dados = Object.fromEntries(tabelas.map(t => [t, []]))
  dados.produtos = [{ id: 3, usuario_id: 1, preco_venda: '99999999.99', nome: 'Produto ç' }]
  const conteudo_json = JSON.stringify({ ambiente_financeiro: 'fixture-env-A', escopo: 'todas_revendedoras_sem_filtros', dados }) + '\n'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(conteudo_json))
  return JSON.stringify({ formato: 'quitai-exportacao-dados', versao: 1, sha256: Buffer.from(digest).toString('hex'), conteudo_json })
}
const resposta = texto => new Response(texto, { headers: { 'Content-Type': 'application/json' } })

test('exportacao autenticada valida integridade UTF-8 e preserva dinheiro como texto', async () => {
  preparar(); const texto = await arquivo(); let chamadas = 0
  globalThis.fetch = async (url, options) => {
    ++chamadas
    assert.equal(url, 'http://fixture.local/admin/relatorios/exportar')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.headers.get('Authorization'), 'Bearer fixture-exportacao')
    return resposta(texto)
  }
  const blob = await obterExportacaoAdministrativa('http://fixture.local', new AbortController().signal)
  assert.equal(await blob.text(), texto); assert.equal(chamadas, 1)
  assert.equal(JSON.parse(JSON.parse(texto).conteudo_json).dados.produtos[0].preco_venda, '99999999.99')
  assert.equal(localStorage.getItem('exportacao'), null)
})

test('arquivo alterado, versao desconhecida e truncamento nunca sao aceitos', async () => {
  const texto = await arquivo()
  await assert.rejects(validarExportacao(texto.replace('99999999.99', '99999999.98')), /integridade/)
  await assert.rejects(validarExportacao(texto.replace('"versao":1', '"versao":2')), /versão/)
  await assert.rejects(validarExportacao(texto.slice(0, -5)))
})

test('permissao negada e falha de servidor nao geram download', async () => {
  for (const status of [403, 413, 429, 503]) {
    preparar()
    globalThis.fetch = async () => new Response(JSON.stringify({ codigo: 'permissao_insuficiente', sessao_validada: true }), { status })
    await assert.rejects(obterExportacaoAdministrativa('http://fixture.local'), /Não foi possível exportar/)
  }
})

test('troca de conta durante leitura do corpo impede salvar exportacao anterior', async () => {
  preparar(); const texto = await arquivo()
  globalThis.fetch = async () => {
    let n = 0
    return new Response(new ReadableStream({
      pull(controller) {
        if (++n === 1) controller.enqueue(new TextEncoder().encode(texto))
        else { sessionStorage.setItem('quitai_usuario', JSON.stringify({ id: 2 })); controller.close() }
      },
    }), { headers: { 'Content-Type': 'application/json' } })
  }
  await assert.rejects(obterExportacaoAdministrativa('http://fixture.local'), e => e.name === 'AbortError')
})

test('arquivo acima do limite cancela stream e nao retorna blob', async () => {
  preparar(); let cancelado = false
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)) },
    cancel() { cancelado = true },
  }), { headers: { 'Content-Type': 'application/json' } })
  await assert.rejects(obterExportacaoAdministrativa('http://fixture.local'), /limite seguro/)
  assert.equal(cancelado, true)
})

test('sem sessao nao envia HTTP; cancelamento impede download', async () => {
  preparar(); sessionStorage.removeItem('quitai_token')
  globalThis.fetch = async () => assert.fail('nao deveria enviar HTTP')
  await assert.rejects(obterExportacaoAdministrativa('http://fixture.local'), /administrador/)
  preparar(); const texto = await arquivo(); const c = new AbortController()
  globalThis.fetch = async () => { c.abort(); return resposta(texto) }
  await assert.rejects(obterExportacaoAdministrativa('http://fixture.local', c.signal), e => e.name === 'AbortError')
})

test('Relatorios exige confirmacao de sensibilidade, escopo total e libera estado apos timeout', () => {
  const fonte = readFileSync(new URL('../src/admin/pages/Relatorios.jsx', import.meta.url), 'utf8')
  assert.ok(fonte.includes('Exportar dados'))
  assert.ok(fonte.includes('window.confirm('))
  assert.ok(fonte.includes('TODAS as revendedoras'))
  assert.ok(fonte.includes('if (exportacaoRef.current) return'))
  assert.ok(fonte.includes('exportacaoMontadaRef.current) setExportando(false)'))
  assert.ok(fonte.includes('URL.revokeObjectURL(url)'))
})
