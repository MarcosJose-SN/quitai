import { instalarWebLocks } from './fixtures/webLocks.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { enviarOperacaoFinanceira as enviarComIntencao, obterOperacaoPendente, prepararIntencaoFinanceira } from '../src/services/operacoesFinanceiras.js'
const api='http://localhost:8082'
const pedido={cliente_id:1,data_compra:'2026-01-01',data_vencimento:'2026-01-31',total_parcelas:3,itens:[{produto_id:1,quantidade:2}]}
async function enviarOperacaoFinanceira(api,tipo,pedido) {
 const intencao = await prepararIntencaoFinanceira(api,tipo) // explicit open/recovery in these fixtures
 return enviarComIntencao(api,tipo,pedido,intencao)
}
function storage(){const dados=new Map();return {getItem:k=>dados.get(k)??null,setItem:(k,v)=>dados.set(k,String(v)),removeItem:k=>dados.delete(k)}}
function preparar(id=1){instalarWebLocks();globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.window={location:{origin:'http://localhost:5174'},dispatchEvent:()=>{}};sessionStorage.setItem('quitai_token','fixture-sem-validade');sessionStorage.setItem('quitai_usuario',JSON.stringify({id,ambiente_financeiro:'fixture-env-A'}))}
const sucesso=(tipo='venda_completa')=>new Response(JSON.stringify(tipo==='pagamento'?{pagamento_id:9}:{id:7}),{status:201})
test('perda de rede conserva pedido e chave; retry usa a mesma chave e limpa somente apos sucesso',async()=>{
 preparar();let primeira;globalThis.fetch=async(url,op)=>{assert.equal(url,api+'/vendas/completa');primeira=op.headers.get('Idempotency-Key');throw new TypeError('rede fixture')}
 await assert.rejects(enviarOperacaoFinanceira(api,'venda_completa',pedido),/preservados/)
 const pendente=(await obterOperacaoPendente(api,'venda_completa'));assert.equal(pendente.chave,primeira);assert.deepEqual(pendente.pedido,pedido)
 globalThis.fetch=async(_url,op)=>{assert.equal(op.headers.get('Idempotency-Key'),primeira);assert.deepEqual(JSON.parse(op.body),pedido);return sucesso()}
 assert.equal((await enviarOperacaoFinanceira(api,'venda_completa',pedido)).id,7)
 assert.equal((await obterOperacaoPendente(api,'venda_completa')),null)
})
test('timeout/abort conserva a chave em vez de criar outra',async()=>{
 preparar();globalThis.fetch=async()=>{throw new DOMException('timeout fixture','AbortError')}
 await assert.rejects(enviarOperacaoFinanceira(api,'venda_completa',pedido));const chave=(await obterOperacaoPendente(api,'venda_completa')).chave
 await assert.rejects(enviarOperacaoFinanceira(api,'venda_completa',pedido));assert.equal((await obterOperacaoPendente(api,'venda_completa')).chave,chave)
})
test('pedido diferente nao substitui operacao de resultado incerto',async()=>{
 preparar();let n=0;globalThis.fetch=async()=>{n++;return new Response(JSON.stringify({resultado:'incerto',mensagem:'fixture'}),{status:503})}
 await assert.rejects(enviarOperacaoFinanceira(api,'venda_completa',pedido));const chave=(await obterOperacaoPendente(api,'venda_completa')).chave
 await assert.rejects(enviarOperacaoFinanceira(api,'venda_completa',{...pedido,cliente_id:2}),/outro pedido/)
 assert.equal(n,1);assert.equal((await obterOperacaoPendente(api,'venda_completa')).chave,chave)
})
test('resposta negativa nao libera nova chave e permite recuperar o pedido original',async()=>{
 preparar();let chaveA;globalThis.fetch=async(_u,op)=>{chaveA=op.headers.get('Idempotency-Key');return new Response(JSON.stringify({resultado:'nao_confirmado',mensagem:'Estoque insuficiente'}),{status:409})}
 await assert.rejects(enviarOperacaoFinanceira(api,'venda_completa',pedido),/continua pendente/)
 assert.equal((await obterOperacaoPendente(api,'venda_completa')).chave,chaveA)
 await assert.rejects(enviarOperacaoFinanceira(api,'venda_completa',{...pedido,cliente_id:2}),/outro pedido/)
 globalThis.fetch=async(_u,op)=>{assert.equal(op.headers.get('Idempotency-Key'),chaveA);return sucesso()};await enviarOperacaoFinanceira(api,'venda_completa',pedido)
 assert.equal((await obterOperacaoPendente(api,'venda_completa')),null)
})

test('conflito de hash preserva pedido original e chave',async()=>{
 preparar();globalThis.fetch=async()=>new Response(JSON.stringify({resultado:'conflito',mensagem:'Chave divergente'}),{status:409})
 await assert.rejects(enviarOperacaoFinanceira(api,'venda_completa',pedido));assert.ok((await obterOperacaoPendente(api,'venda_completa')))
})
test('pendencias sao separadas por conta, API e tipo',async()=>{
 preparar();globalThis.fetch=async()=>{throw new TypeError('fixture')};await assert.rejects(enviarOperacaoFinanceira(api,'venda_completa',pedido))
 assert.equal((await obterOperacaoPendente('http://localhost:9082','venda_completa')),null);assert.equal((await obterOperacaoPendente(api,'pagamento')),null)
 sessionStorage.setItem('quitai_usuario',JSON.stringify({id:2,ambiente_financeiro:'fixture-env-A'}));assert.equal((await obterOperacaoPendente(api,'venda_completa')),null)
 sessionStorage.setItem('quitai_usuario',JSON.stringify({id:1,ambiente_financeiro:'fixture-env-A'}));assert.deepEqual((await obterOperacaoPendente(api,'venda_completa')).pedido,pedido)
})
test('resposta 2xx incompleta nao libera outra chave nem declara sucesso',async()=>{
 preparar();globalThis.fetch=async()=>new Response('{}',{status:201})
 await assert.rejects(enviarOperacaoFinanceira(api,'venda_completa',pedido),/incompleta/);assert.ok((await obterOperacaoPendente(api,'venda_completa')))
})
test('quota do espelho nao substitui a persistencia autoritativa',async()=>{
 preparar();localStorage.setItem=()=>{throw new Error('quota fixture')};let chamadas=0
 globalThis.fetch=async()=>{chamadas++;return sucesso()}
 await enviarOperacaoFinanceira(api,'venda_completa',pedido);assert.equal(chamadas,1)
 assert.equal(await obterOperacaoPendente(api,'venda_completa'),null)
})

test('pagamento pendente repete corpo original e recebe resultado confirmado',async()=>{
 preparar();const pagamento={venda_id:1,parcela_id:2,valor:10,data_pagamento:'2026-01-31',forma_pagamento:'PIX'}
 globalThis.fetch=async()=>{throw new TypeError('resposta perdida')};await assert.rejects(enviarOperacaoFinanceira(api,'pagamento',pagamento))
 const chave=(await obterOperacaoPendente(api,'pagamento')).chave;globalThis.fetch=async(url,op)=>{assert.equal(url,api+'/pagamentos');assert.equal(op.headers.get('Idempotency-Key'),chave);assert.deepEqual(JSON.parse(op.body),pagamento);return sucesso('pagamento')}
 assert.equal((await enviarOperacaoFinanceira(api,'pagamento',pagamento)).pagamento_id,9)
})