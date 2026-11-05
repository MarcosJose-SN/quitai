import test from 'node:test'
import assert from 'node:assert/strict'
import { dataLocalISO, centavosValidos, quantidadeValida, criarTravaOperacoes } from '../src/utils/validacaoRevendedora.js'
import { fetchAutenticado, chaveDaConta, lerListaLocal } from '../src/services/sessaoRevendedora.js'

test('data financeira usa o calendario local, inclusive perto da meia-noite', () => {
  assert.equal(dataLocalISO(new Date(2026, 10, 4, 23, 59)), '2026-11-04')
  assert.equal(dataLocalISO(new Date(2026, 0, 1, 0, 1)), '2026-01-01')
})
test('pagamentos aceitam centavos e rejeitam fracao de centavo/NaN/infinito', () => {
  for (const [valor, esperado] of [['10.20',1020],['0.01',1],[0.1+0.2,30],['1.001',null],['',null],[Infinity,null],['abc',null]]) assert.equal(centavosValidos(valor),esperado)
})
test('quantidade e estoque seguem inteiros positivos/nao negativos do PostgreSQL', () => {
  assert.equal(quantidadeValida('1.5'),false)
  assert.equal(quantidadeValida('0'),false)
  assert.equal(quantidadeValida('0',true),true)
  assert.equal(quantidadeValida('2'),true)
  assert.equal(quantidadeValida('2147483648'),false)
})
test('dois submits concorrentes executam a mutacao uma unica vez; erros liberam nova tentativa', async () => {
  const executar=criarTravaOperacoes();let liberar, chamadas=0
  const espera=new Promise(r=>liberar=r)
  const primeira=executar('pagamento',async()=>{chamadas++;await espera})
  await executar('pagamento',async()=>chamadas++)
  assert.equal(chamadas,1);liberar();await primeira
  await assert.rejects(executar('pagamento',async()=>{throw Error('falha simulada')}))
  await executar('pagamento',async()=>chamadas++)
  assert.equal(chamadas,2)
})
function storage(){const dados=new Map();return {getItem:k=>dados.get(k)??null,setItem:(k,v)=>dados.set(k,String(v)),removeItem:k=>dados.delete(k)}}
function ambiente(){
 globalThis.localStorage=storage();globalThis.sessionStorage=storage()
 let encerramentos=0;globalThis.window={location:{origin:'http://localhost:5174'},dispatchEvent:()=>{encerramentos++}}
 return ()=>encerramentos
}
test('rascunhos e notificacoes sao separados por conta e API; legado nao e atribuido', () => {
 ambiente();localStorage.setItem('quitai_suporte_rascunhos',JSON.stringify([{assunto:'legado'}]))
 localStorage.setItem('quitai_usuario',JSON.stringify({id:11}))
 const primeira=chaveDaConta('quitai_suporte_rascunhos','http://localhost:8082')
 localStorage.setItem(primeira,JSON.stringify([{assunto:'conta A'}]))
 localStorage.setItem('quitai_usuario',JSON.stringify({id:12}))
 const segunda=chaveDaConta('quitai_suporte_rascunhos','http://localhost:8082')
 assert.notEqual(primeira,segunda);assert.deepEqual(lerListaLocal(segunda),[])
 assert.notEqual(segunda,chaveDaConta('quitai_suporte_rascunhos','https://api.example.invalid'))
 assert.equal(JSON.parse(localStorage.getItem('quitai_suporte_rascunhos'))[0].assunto,'legado')
})
test('JSON invalido ou valor que nao e lista nao derruba a interface',()=>{
 ambiente();localStorage.setItem('dados','{}');assert.deepEqual(lerListaLocal('dados'),[])
 localStorage.setItem('dados','invalido');assert.deepEqual(lerListaLocal('dados'),[])
 assert.deepEqual(lerListaLocal(null),[])
})
test('401/403 removem a sessao e notificam a interface sem entregar dados antigos',async()=>{
 for(const status of [401,403]){
  const encerramentos=ambiente();localStorage.setItem('quitai_token','fixture-invalida');localStorage.setItem('quitai_usuario','{}')
  globalThis.fetch=async()=>new Response('{}',{status})
  await assert.rejects(fetchAutenticado('/clientes/listar'),/sessão/)
  assert.equal(localStorage.getItem('quitai_token'),null);assert.equal(encerramentos(),1)
 }
})
test('resposta atrasada de outra sessao e descartada sem encerrar a sessao nova',async()=>{
 const encerramentos=ambiente();sessionStorage.setItem('quitai_token','fixture-a')
 globalThis.fetch=async()=>{sessionStorage.setItem('quitai_token','fixture-b');return new Response('[]')}
 await assert.rejects(fetchAutenticado('/clientes/listar'),{name:'AbortError'})
 assert.equal(sessionStorage.getItem('quitai_token'),'fixture-b');assert.equal(encerramentos(),0)
})
test('500/404 preservam sessao e resposta para o tratamento funcional',async()=>{
 for(const status of [500,404]){
  const encerramentos=ambiente();sessionStorage.setItem('quitai_token','fixture')
  globalThis.fetch=async(_url,opcoes)=>{assert.equal(opcoes.headers.get('Authorization'),'Bearer fixture');return new Response('falha',{status})}
  const resposta=await fetchAutenticado('/suporte/1');assert.equal(resposta.status,status)
  assert.equal(sessionStorage.getItem('quitai_token'),'fixture');assert.equal(encerramentos(),0)
 }
})
test('senha atual incorreta conserva sessao e corpo da resposta para o formulario', async()=>{
 const encerramentos=ambiente();sessionStorage.setItem('quitai_token','fixture')
 globalThis.fetch=async()=>new Response(JSON.stringify({mensagem:'Senha atual incorreta.'}),{status:401})
 const resposta=await fetchAutenticado('http://localhost:8082/minha-conta/senha',{method:'PUT'})
 assert.equal((await resposta.json()).mensagem,'Senha atual incorreta.')
 assert.equal(sessionStorage.getItem('quitai_token'),'fixture');assert.equal(encerramentos(),0)
})
test('JWT expirado na troca de senha ainda encerra a sessao',async()=>{
 const encerramentos=ambiente();sessionStorage.setItem('quitai_token','fixture')
 globalThis.fetch=async()=>new Response(JSON.stringify({mensagem:'Sessao invalida ou expirada.'}),{status:401})
 await assert.rejects(fetchAutenticado('http://localhost:8082/minha-conta/senha',{method:'PUT'}))
 assert.equal(encerramentos(),1);assert.equal(sessionStorage.getItem('quitai_token'),null)
})
