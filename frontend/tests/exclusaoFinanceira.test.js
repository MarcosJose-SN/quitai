import test from 'node:test'
import assert from 'node:assert/strict'
import { capturarContextoExclusao, excluirVendaNoAmbiente } from '../src/services/sessaoRevendedora.js'

const api='http://localhost:8082'
function preparar() {
 const dados=new Map()
 globalThis.localStorage={getItem:k=>dados.get(k)??null,setItem:(k,v)=>dados.set(k,String(v)),removeItem:k=>dados.delete(k)}
 globalThis.sessionStorage={getItem:()=>null,removeItem:()=>{}}
 globalThis.window={location:{origin:'http://localhost:5174'},dispatchEvent:()=>{}}
 conta();globalThis.fetch=async()=>{throw new Error('HTTP inesperado')}
}
function conta(id=1, ambiente='fixture-env-A',token='token-A') {
 localStorage.setItem('quitai_token',token)
 localStorage.setItem('quitai_usuario',JSON.stringify({id,ambiente_financeiro:ambiente}))
}
test('DELETE valido envia ambiente original e nao exige Idempotency-Key',async()=>{
 preparar();const contexto=capturarContextoExclusao(api,9)
 assert.ok(Object.isFrozen(contexto))
 let chamadas=0
 globalThis.fetch=async(url,op)=>{
  chamadas++;assert.equal(url,api+'/vendas/9');assert.equal(op.method,'DELETE')
  assert.equal(op.headers.get('X-Financial-Environment'),'fixture-env-A')
  assert.equal(op.headers.get('Idempotency-Key'),null)
  assert.equal(op.headers.get('Authorization'),'Bearer token-A')
  return new Response(null,{status:204})
 }
 assert.equal((await excluirVendaNoAmbiente(api,9,contexto)).status,204);assert.equal(chamadas,1)
})
for(const tipo of ['ambiente','usuario','token','ambiente-ausente','venda','api']) test(`contexto ${tipo} alterado bloqueia DELETE sem HTTP`,async()=>{
 preparar();const ctx=capturarContextoExclusao(api,9);let n=0
 globalThis.fetch=async()=>{n++;return new Response(null,{status:204})}
 if(tipo==='ambiente')conta(1,'fixture-env-B')
 if(tipo==='usuario')conta(2)
 if(tipo==='token')conta(1,'fixture-env-A','token-B')
 if(tipo==='ambiente-ausente')conta(1,'')
 await assert.rejects(excluirVendaNoAmbiente(tipo==='api'?api+'/outra':api,tipo==='venda'?10:9,ctx))
 assert.equal(n,0)
})
test('sem ambiente validado nao abre confirmacao',()=>{
 preparar();conta(1,'');assert.throws(()=>capturarContextoExclusao(api,9),/Ambiente/)
})
for(const tipo of ['ambiente','usuario','token'])test(`resposta atrasada apos troca de ${tipo} nao e aceita`,async()=>{
 preparar();const ctx=capturarContextoExclusao(api,9);let resolver,iniciou
 const pronto=new Promise(r=>iniciou=r)
 globalThis.fetch=async()=>{iniciou();return new Promise(r=>resolver=r)}
 const envio=excluirVendaNoAmbiente(api,9,ctx);await pronto
 if(tipo==='ambiente')conta(1,'fixture-env-B')
 if(tipo==='usuario')conta(2)
 if(tipo==='token')conta(1,'fixture-env-A','token-B')
 resolver(new Response(null,{status:204}));await assert.rejects(envio)
})
test('troca de ambiente durante leitura do erro nao devolve resposta antiga',async()=>{
 preparar();const ctx=capturarContextoExclusao(api,9)
 globalThis.fetch=async()=>({status:400,ok:false,text:async()=>{conta(1,'fixture-env-B');return 'erro antigo'}})
 await assert.rejects(excluirVendaNoAmbiente(api,9,ctx),/Sessao ou ambiente alterado/)
})
