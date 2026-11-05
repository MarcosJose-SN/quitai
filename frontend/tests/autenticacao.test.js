import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAutenticado, encerrarSessaoServidor } from '../src/services/sessaoRevendedora.js'
import { enviarOperacaoFinanceira, obterOperacaoPendente } from '../src/services/operacoesFinanceiras.js'
import { conectarEventosSuporte } from '../src/services/suporteEventos.js'
function storage() { const d = new Map(); return { getItem:k=>d.get(k)??null, setItem:(k,v)=>d.set(k,String(v)), removeItem:k=>d.delete(k) } }
function preparar() { globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.window={location:{origin:'http://localhost:5174'},dispatchEvent:()=>{}};sessionStorage.setItem('quitai_token','fixture-A');sessionStorage.setItem('quitai_usuario',JSON.stringify({id:1})) }
const api='http://localhost:8082'
test('logout confirma revogacao no servidor antes de limpar sessao e preserva pendencias',async()=>{
 preparar();localStorage.setItem('pendencia-financeira-fixture','preservar')
 globalThis.fetch=async(url,op)=>{assert.equal(url,api+'/auth/logout');assert.equal(op.method,'POST');assert.equal(op.headers.Authorization,'Bearer fixture-A');return new Response(null,{status:204})}
 await encerrarSessaoServidor(api);assert.equal(sessionStorage.getItem('quitai_token'),null);assert.equal(localStorage.getItem('pendencia-financeira-fixture'),'preservar')
})
test('falha no logout nao declara sessao revogada nem descarta token',async()=>{
 preparar();globalThis.fetch=async()=>new Response('{}',{status:503})
 await assert.rejects(encerrarSessaoServidor(api));assert.equal(sessionStorage.getItem('quitai_token'),'fixture-A')
})
test('senha incorreta no perfil admin nao equivale a JWT revogado',async()=>{
 preparar();globalThis.fetch=async()=>new Response(JSON.stringify({codigo:'senha_atual_incorreta'}),{status:401})
 assert.equal((await fetchAutenticado(api+'/admin/minha-conta',{method:'PUT'})).status,401);assert.equal(sessionStorage.getItem('quitai_token'),'fixture-A')
 globalThis.fetch=async()=>new Response(JSON.stringify({mensagem:'Sessao revogada.'}),{status:401})
 await assert.rejects(fetchAutenticado(api+'/admin/minha-conta'));assert.equal(sessionStorage.getItem('quitai_token'),null)
})
for (const tipo of ['venda_completa','pagamento']) test(`${tipo}: commit seguido de encerramento da sessao preserva chave e pedido apos novo login`,async()=>{
 preparar();const pedido=tipo==='pagamento'?{venda_id:1,valor:10,forma_pagamento:'PIX'}:{cliente_id:1,itens:[{produto_id:1,quantidade:1}]};let chave;let efeitos=0
 globalThis.fetch=async(_url,op)=>{chave=op.headers.get('Idempotency-Key');efeitos++;sessionStorage.removeItem('quitai_token');return new Response(JSON.stringify(tipo==='pagamento'?{pagamento_id:9}:{id:9}),{status:201})}
 await assert.rejects(enviarOperacaoFinanceira(api,tipo,pedido));assert.equal(efeitos,1)
 sessionStorage.setItem('quitai_token','fixture-B');sessionStorage.setItem('quitai_usuario',JSON.stringify({id:1}));assert.equal(obterOperacaoPendente(api,tipo).chave,chave)
 globalThis.fetch=async(_url,op)=>{assert.equal(op.headers.get('Idempotency-Key'),chave);assert.deepEqual(JSON.parse(op.body),pedido);return new Response(JSON.stringify(tipo==='pagamento'?{pagamento_id:9}:{id:9}),{status:201})}
 await enviarOperacaoFinanceira(api,tipo,pedido);assert.equal(efeitos,1);assert.equal(obterOperacaoPendente(api,tipo),null)
})
test('401 durante operacao financeira preserva intencao para mesma conta',async()=>{
 preparar();const pedido={venda_id:1,valor:10};globalThis.fetch=async()=>new Response('{}',{status:401})
 await assert.rejects(enviarOperacaoFinanceira(api,'pagamento',pedido));assert.equal(sessionStorage.getItem('quitai_token'),null)
 sessionStorage.setItem('quitai_token','novo-fixture');sessionStorage.setItem('quitai_usuario',JSON.stringify({id:1}));assert.deepEqual(obterOperacaoPendente(api,'pagamento').pedido,pedido)
})
test('SSE interrompe reconexao quando JWT e rejeitado',async()=>{
 preparar();let chamadas=0;globalThis.fetch=async()=>{chamadas++;return new Response('{}',{status:401})}
 const encerrar=conectarEventosSuporte('/admin/suporte/eventos',()=>{});await new Promise(r=>setTimeout(r,1700));encerrar();assert.equal(chamadas,1);assert.equal(sessionStorage.getItem('quitai_token'),null)
})
