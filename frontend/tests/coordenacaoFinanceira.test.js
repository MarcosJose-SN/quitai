import test from 'node:test'
import assert from 'node:assert/strict'
import { instalarWebLocks } from './fixtures/webLocks.js'
import { prepararIntencaoFinanceira as abrir, enviarOperacaoFinanceira as enviar, obterOperacaoPendente as pendente } from '../src/services/operacoesFinanceiras.js'
const api='http://localhost:8082', tipo='venda_completa', pedido={cliente_id:1,itens:[{produto_id:2,quantidade:1}]}
function preparar() {
  const dados=new Map()
  globalThis.localStorage={getItem:k=>dados.get(k)??null,setItem:(k,v)=>dados.set(k,String(v)),removeItem:k=>dados.delete(k)}
  globalThis.sessionStorage={getItem:()=>null,removeItem:()=>{}}
  localStorage.setItem('quitai_token','fixture-A');localStorage.setItem('quitai_usuario',JSON.stringify({id:1}))
  globalThis.window={location:{origin:'http://localhost:5174'},dispatchEvent:()=>{}}
  instalarWebLocks()
  globalThis.fetch=async()=>{throw new Error('UNEXPECTED_HTTP')}
  return dados
}
const sucesso=()=>new Response(JSON.stringify({id:7}),{status:201})

test('quatro geracoes e duas abas conservam prova do primeiro espelho sob quota persistente',async()=>{
 preparar();const primeira=await abrir(api,tipo);const espelho=localStorage.getItem(primeira.escopo)
 localStorage.setItem=()=>{throw new Error('quota')};const chaves=[]
 globalThis.fetch=async(_u,o)=>{chaves.push(o.headers.get('Idempotency-Key'));return sucesso()}
 let atual=primeira
 for(let i=0;i<4;i++) {
  const outra=await abrir(api,tipo);assert.equal(outra.id,atual.id)
  await Promise.all([enviar(api,tipo,pedido,atual),enviar(api,tipo,pedido,outra)])
  assert.equal(await pendente(api,tipo),null);assert.equal(localStorage.getItem(primeira.escopo),espelho)
  if(i<3)atual=await abrir(api,tipo)
 }
 assert.equal(new Set(chaves).size,4)
 // Matching identity alone is not enough: another payload remains a conflict.
 const independente={...JSON.parse(espelho),estado:'pendente',pedido:{cliente_id:99}}
 const get=localStorage.getItem.bind(localStorage)
 localStorage.getItem=k=>k===primeira.escopo?JSON.stringify(independente):get(k)
 const commits=navigator.locks.persistencia.commits.length
 await assert.rejects(abrir(api,tipo),/intencoes financeiras diferentes/)
 assert.equal(navigator.locks.persistencia.commits.length,commits)
})

test('abertura abortada nao muda identidade; falha apos COMMIT permite recuperar reserva',async()=>{
 preparar();const a=await abrir(api,tipo);globalThis.fetch=async()=>sucesso();await enviar(api,tipo,pedido,a)
 const controle=navigator.locks.persistencia
 controle.falharCommit=r=>r.estado==='preparada'?'abort':null
 await assert.rejects(abrir(api,tipo),/persistir/)
 assert.equal((await abrir(api,tipo,{somenteRecuperar:true})).id,a.id)
 controle.falharCommit=null
 const get=localStorage.getItem.bind(localStorage);let falhou=false
 localStorage.getItem=k=>{
  if(k===a.escopo && !falhou && controle.commits.at(-1)?.estado==='preparada') {falhou=true;throw new Error('leitura apos commit')}
  return get(k)
 }
 await assert.rejects(abrir(api,tipo),/Armazenamento local/)
 localStorage.getItem=get
 const gravada=controle.commits.at(-1),recuperada=await abrir(api,tipo)
 assert.equal(recuperada.id,gravada.id);assert.notEqual(recuperada.id,a.id)
 globalThis.fetch=async()=>{throw new TypeError('resultado incerto')}
 await assert.rejects(enviar(api,tipo,pedido,recuperada))
 assert.equal((await abrir(api,tipo)).id,recuperada.id);assert.deepEqual((await pendente(api,tipo)).pedido,pedido)
})
test('submit sem abertura explicita nao envia HTTP',async()=>{preparar();await assert.rejects(enviar(api,tipo,pedido),/explicitamente/)})
test('comprovante impede novo envio do mesmo formulario; nova abertura gera nova identidade',async()=>{
 preparar();let n=0;const chaves=[];globalThis.fetch=async(_u,o)=>{n++;chaves.push(o.headers.get('Idempotency-Key'));return sucesso()}
 const a=await abrir(api,tipo);await enviar(api,tipo,pedido,a);await enviar(api,tipo,pedido,a);assert.equal(n,1)
 const b=await abrir(api,tipo);assert.notEqual(a.id,b.id);await assert.rejects(enviar(api,tipo,pedido,a),/substituida/)
 await enviar(api,tipo,pedido,b);assert.equal(n,2);assert.notEqual(chaves[0],chaves[1])
})
test('pedido capturado antes da espera nao muda quando o formulario e editado',async()=>{
 preparar();const a=await abrir(api,tipo);const editavel=structuredClone(pedido)
 globalThis.fetch=async(_u,o)=>{assert.equal(JSON.parse(o.body).cliente_id,1);return sucesso()}
 const envio=enviar(api,tipo,editavel,a);editavel.cliente_id=99;await envio
})
test('reserva e conclusao sao curtas: HTTP ocorre sem Web Lock retido',async()=>{
 preparar();const a=await abrir(api,tipo);let ativo=false;const request=navigator.locks.request.bind(navigator.locks)
 navigator.locks.request=(n,o,f)=>request(n,o,lock=>{assert.equal(ativo,false);ativo=true;try{return f(lock)}finally{ativo=false}})
 globalThis.fetch=async()=>{assert.equal(ativo,false);return sucesso()};await enviar(api,tipo,pedido,a)
})
test('sem Web Locks bloqueia envio e conserva legado byte a byte',async()=>{
 preparar();const key='quitai_financeiro_pendente:venda_completa:'+encodeURIComponent(api)+':1';const texto=JSON.stringify({chave:'chave-legada-fixture-123',pedido});localStorage.setItem(key,texto)
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}})
 await assert.rejects(abrir(api,tipo),/Web Locks/);assert.equal(localStorage.getItem(key),texto)
})
test('recuperacao legada conserva chave e pedido e persiste versao',async()=>{
 preparar();const key='quitai_financeiro_pendente:venda_completa:'+encodeURIComponent(api)+':1';localStorage.setItem(key,JSON.stringify({chave:'chave-legada-fixture-123',pedido}))
 const a=await abrir(api,tipo);assert.deepEqual(a.pendente,{chave:'chave-legada-fixture-123',pedido});assert.equal(JSON.parse(localStorage.getItem(key)).versao,1)
 globalThis.fetch=async(_u,o)=>{assert.equal(o.headers.get('Idempotency-Key'),'chave-legada-fixture-123');return sucesso()};await enviar(api,tipo,pedido,a)
})
test('registros corrompidos ou de versao desconhecida nunca sao substituidos',async()=>{
 for(const texto of ['{','null',JSON.stringify({versao:99,chave:'chave-legada-fixture-123',pedido})]) {
  preparar();const key='quitai_financeiro_pendente:venda_completa:'+encodeURIComponent(api)+':1';localStorage.setItem(key,texto)
  await assert.rejects(abrir(api,tipo),/invalido/);assert.equal(localStorage.getItem(key),texto)
 }
})
test('falha de leitura bloqueia; falha do espelho nao elimina intencao no IndexedDB',async()=>{
 preparar();localStorage.getItem=()=>{throw new Error('fixture')};await assert.rejects(abrir(api,tipo))
 preparar();localStorage.setItem=()=>{};const a=await abrir(api,tipo);assert.ok(a.id)
 globalThis.fetch=async()=>{throw new TypeError('rede fixture')};await assert.rejects(enviar(api,tipo,pedido,a))
 assert.deepEqual((await pendente(api,tipo)).pedido,pedido)
})

test('sessao trocada enquanto aguarda lock impede reserva e HTTP',async()=>{
 preparar();let liberar;const espera=new Promise(r=>liberar=r);const request=navigator.locks.request.bind(navigator.locks)
 navigator.locks.request=async(n,o,f)=>{await espera;return request(n,o,f)}
 const abertura=abrir(api,tipo);localStorage.setItem('quitai_token','fixture-B');liberar();await assert.rejects(abertura,/Sessao alterada/)
})
test('todas as respostas negativas ainda deixam resultado remoto desconhecido',async()=>{
 const dados=preparar();const a=await abrir(api,tipo);const b=await abrir(api,tipo)
 globalThis.fetch=async()=>new Response(JSON.stringify({resultado:'nao_confirmado'}),{status:400})
 const respostas=await Promise.allSettled([enviar(api,tipo,pedido,a),enviar(api,tipo,pedido,b)])
 assert.ok(respostas.every(r=>r.status==='rejected'));assert.ok((await pendente(api,tipo)))
 assert.ok([...dados.values()].some(x=>x.includes('"resultado_remoto":"desconhecido"')))
 const recuperada=await abrir(api,tipo);assert.equal(recuperada.id,a.id)
 await assert.rejects(enviar(api,tipo,{...pedido,cliente_id:99},recuperada),/outro pedido/)
})

test('quota do espelho durante conclusao nao apaga confirmacao IndexedDB',async()=>{
 preparar();const a=await abrir(api,tipo);const set=localStorage.setItem.bind(localStorage)
 localStorage.setItem=(k,v)=>{if(v.includes('"estado":"confirmada"'))throw new Error('quota');set(k,v)}
 globalThis.fetch=async()=>sucesso();assert.equal((await enviar(api,tipo,pedido,a)).id,7);assert.equal(await pendente(api,tipo),null)
})

test('IndexedDB ausente ou bloqueado nunca permite envio sem persistencia',async()=>{
 preparar();Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:undefined});await assert.rejects(abrir(api,tipo),/IndexedDB/)
 preparar();indexedDB.open=()=>{throw new Error('blocked fixture')};await assert.rejects(abrir(api,tipo),/persistir/)
})
test('erro IndexedDB antes do commit nao publica espelho nem envia HTTP',async()=>{
 preparar();const original=indexedDB.open.bind(indexedDB)
 indexedDB.open=(...args)=>{const req=original(...args);let handler
  Object.defineProperty(req,'onsuccess',{set(fn){handler=fn},get(){return()=>{
   const transaction=req.result.transaction.bind(req.result)
   req.result.transaction=(...op)=>{const tx=transaction(...op),store=tx.objectStore.bind(tx)
    tx.objectStore=(...scope)=>{const obj=store(...scope);obj.put=()=>{throw new Error('disk fixture')};return obj};return tx}
   handler()
  }}});return req}
 await assert.rejects(abrir(api,tipo));const key='quitai_financeiro_pendente:venda_completa:'+encodeURIComponent(api)+':1'
 assert.equal(localStorage.getItem(key),null)
 indexedDB.open=original;assert.ok((await abrir(api,tipo)).id)
})

test('legado conflitante de outra versao nao e sobrescrito pelo registro IndexedDB',async()=>{
 preparar();const a=await abrir(api,tipo);globalThis.fetch=async()=>{throw new TypeError('fixture')}
 await assert.rejects(enviar(api,tipo,pedido,a))
 const legado=JSON.stringify({chave:'outra-chave-legada-123',pedido:{cliente_id:99}})
 localStorage.setItem(a.escopo,legado)
 await assert.rejects(abrir(api,tipo),/intencoes financeiras diferentes/)
 assert.equal(localStorage.getItem(a.escopo),legado)
})

for (const operacao of ['venda_completa','pagamento']) test(`${operacao}: negativo primeiro nao libera identidade enquanto outra tentativa confirma`,async()=>{
 preparar();const payload=operacao==='pagamento'?{venda_id:1,parcela_id:2,valor:10}:pedido
 const a=await abrir(api,operacao),b=await abrir(api,operacao);let completar,avisar;const iniciou=new Promise(r=>avisar=r);let n=0
 globalThis.fetch=async()=>{n++;if(n===1)return new Response(JSON.stringify({resultado:'nao_confirmado'}),{status:409});avisar();return new Promise(r=>completar=r)}
 const primeira=enviar(api,operacao,payload,a);const primeiraRejeitada=assert.rejects(primeira,/continua pendente/)
 const segunda=enviar(api,operacao,payload,b);await iniciou;await primeiraRejeitada
 const recuperada=await abrir(api,operacao);assert.equal(recuperada.id,a.id)
 await assert.rejects(enviar(api,operacao,{...payload,valor:99,cliente_id:99},recuperada),/outro pedido/);assert.equal(n,2)
 completar(new Response(JSON.stringify(operacao==='pagamento'?{pagamento_id:8}:{id:8}),{status:201}));await segunda
 const recibo=await enviar(api,operacao,payload,a);assert.equal(operacao==='pagamento'?recibo.pagamento_id:recibo.id,8);assert.equal(n,2)
 const nova=await abrir(api,operacao);assert.notEqual(nova.id,a.id)
})
test('registro nao_confirmada do protocolo anterior e recuperado sem substituir chave ou pedido',async()=>{
 preparar();const key='quitai_financeiro_pendente:venda_completa:'+encodeURIComponent(api)+':1'
 const original={versao:1,id:'identidade-anterior-123',chave:'chave-anterior-123456',estado:'nao_confirmada',pedido}
 localStorage.setItem(key,JSON.stringify(original));const a=await abrir(api,tipo)
 assert.equal(a.id,original.id);assert.deepEqual(a.pendente,{chave:original.chave,pedido})
 const armazenado=JSON.parse(localStorage.getItem(key));assert.equal(armazenado.estado,'pendente');assert.equal(armazenado.resultado_remoto,'desconhecido')
 await assert.rejects(enviar(api,tipo,{...pedido,cliente_id:99},a),/outro pedido/)
})

for (const modo of ['abort','error']) test(`COMMIT assincrono ${modo}: nao publica confirmacao e conserva replay`,async()=>{
 preparar();const a=await abrir(api,tipo);const controle=navigator.locks.persistencia;const chaves=[];let efeitos=0;const confirmadas=new Set()
 globalThis.fetch=async(_u,o)=>{const chave=o.headers.get('Idempotency-Key');chaves.push(chave);if(!confirmadas.has(chave)){confirmadas.add(chave);efeitos++}return sucesso()}
 controle.falharCommit=r=>r.estado==='confirmada'?modo:null
 await assert.rejects(enviar(api,tipo,pedido,a),/persistir/)
 const espelho=JSON.parse(localStorage.getItem(a.escopo));assert.equal(espelho.estado,'pendente');assert.deepEqual(espelho.pedido,pedido)
 controle.falharCommit=null;const recuperada=await abrir(api,tipo);assert.equal(recuperada.id,a.id);assert.equal(recuperada.pendente.chave,chaves[0])
 await enviar(api,tipo,pedido,recuperada);assert.equal(efeitos,1);assert.equal(chaves[0],chaves[1]);assert.equal(await pendente(api,tipo),null)
})
test('espelho so recebe confirmacao depois de oncomplete IndexedDB',async()=>{
 preparar();const a=await abrir(api,tipo);const set=localStorage.setItem.bind(localStorage)
 localStorage.setItem=(k,v)=>{if(JSON.parse(v).estado==='confirmada')assert.ok(navigator.locks.persistencia.commits.some(r=>r.id===a.id && r.estado==='confirmada'));set(k,v)}
 globalThis.fetch=async()=>sucesso();await enviar(api,tipo,pedido,a)
})
test('espelho confirmado nao mascara pendencia IndexedDB nem libera nova chave',async()=>{
 preparar();const a=await abrir(api,tipo);globalThis.fetch=async()=>{throw new TypeError('fixture')};await assert.rejects(enviar(api,tipo,pedido,a))
 const real=JSON.parse(localStorage.getItem(a.escopo));localStorage.setItem(a.escopo,JSON.stringify({...real,estado:'confirmada',comprovante:{id:7}}))
 assert.equal((await pendente(api,tipo)).chave,real.chave);assert.equal(JSON.parse(localStorage.getItem(a.escopo)).estado,'pendente')
 assert.equal((await abrir(api,tipo)).id,a.id)
})
test('IndexedDB confirmado repara espelho pendente sem novo HTTP',async()=>{
 preparar();const a=await abrir(api,tipo);let n=0;globalThis.fetch=async()=>{n++;return sucesso()}
 await enviar(api,tipo,pedido,a);const r=JSON.parse(localStorage.getItem(a.escopo));localStorage.setItem(a.escopo,JSON.stringify({...r,estado:'pendente'}))
 assert.equal(await pendente(api,tipo),null);assert.equal(JSON.parse(localStorage.getItem(a.escopo)).estado,'confirmada')
 const recuperada=await abrir(api,tipo,{somenteRecuperar:true});assert.equal(recuperada.id,a.id);assert.equal(recuperada.confirmada,true)
 await enviar(api,tipo,pedido,recuperada);assert.equal(n,1)
})
test('confirmacao existente apenas no espelho exige comprovacao do backend com mesma chave',async()=>{
 preparar();const key='quitai_financeiro_pendente:venda_completa:'+encodeURIComponent(api)+':1'
 localStorage.setItem(key,JSON.stringify({versao:1,id:'intencao-confirmada-local',chave:'chave-confirmada-local',estado:'confirmada',pedido,comprovante:{id:999}}))
 const a=await abrir(api,tipo);assert.equal(a.id,'intencao-confirmada-local');assert.equal(a.pendente.chave,'chave-confirmada-local')
 globalThis.fetch=async(_u,o)=>{assert.equal(o.headers.get('Idempotency-Key'),'chave-confirmada-local');return sucesso()};assert.equal((await enviar(api,tipo,pedido,a)).id,7)
})
