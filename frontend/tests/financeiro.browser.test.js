import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile, mkdtemp, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const root=fileURLToPath(new URL('../',import.meta.url))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function esperar(condicao) {
 const prazo=Date.now()+10000
 while(!await condicao()){if(Date.now()>prazo)throw new Error('Prazo do teste excedido');await sleep(15)}
}

test('Web Locks reais: duas abas compartilham intencoes sem bancos externos', {timeout:120000}, async t=>{
 const candidatos=[process.env.CHROME_BIN,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean)
 let executavel
 for(const p of candidatos){try{await access(p);executavel=p;break}catch{}}
 assert.ok(executavel,'Chrome/Chromium/Edge necessario para testar abas reais')
 const perfil=await mkdtemp(path.join(tmpdir(),'quitai-financeiro-test-'))
 const artefatos=await mkdtemp(path.join(tmpdir(),'quitai-react-test-'))
 await build({root,configFile:false,plugins:[react()],define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},build:{outDir:artefatos},logLevel:'silent'})
 const requisicoes=[], efeitos=new Map(), retidas=[]
 let modo='normal', proximoId=1
 function responder(res,dados,status=201){if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(dados))}}
 const server=http.createServer(async(req,res)=>{
  try{
   const arquivos={'/services/operacoesFinanceiras.js':'src/services/operacoesFinanceiras.js','/services/sessaoRevendedora.js':'src/services/sessaoRevendedora.js','/services/intencoesFinanceirasStore.js':'src/services/intencoesFinanceirasStore.js'}
   if(arquivos[req.url]){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(path.join(root,arquivos[req.url])));return}
   if(req.url==='/' && req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><script>window.fixtureErrors=[];addEventListener("error",e=>fixtureErrors.push(e.message));addEventListener("unhandledrejection",e=>fixtureErrors.push(String(e.reason)));</script><script type="module">import * as fin from "/services/operacoesFinanceiras.js"; window.fin=fin;</script>');return}
   if(req.url==='/app') {res.writeHead(200,{'Content-Type':'text/html'});res.end(await readFile(path.join(artefatos,'index.html')));return}
   if(req.url.startsWith('/assets/')) {const nome=path.basename(req.url);res.writeHead(200,{'Content-Type':nome.endsWith('.css')?'text/css':nome.endsWith('.svg')?'image/svg+xml':'text/javascript'});res.end(await readFile(path.join(artefatos,'assets',nome)));return}
   if(req.method==='GET' && req.url.startsWith('/api/')) {
    if(req.url.includes('/eventos')) {res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': fixture\n\n');return}
    const venda={id:3,cliente_id:1,cliente_nome:'Cliente de teste',data_compra:'2026-01-01',data_vencimento:'2026-01-31',vencimento:'2026-01-31',total:10,valor_pago:10,saldo:0,total_parcelas:1,status:'QUITADO'}
    let dados=[]
    if(req.url==='/api/auth/me') dados={id:1,nome:'Conta de teste',email:'fixture@example.invalid',perfil:'revendedora',ativo:true}
    if(req.url==='/api/sistema/publico') dados={manutencao:false,mensagem_manutencao:'',avisos:[]}
    if(req.url==='/api/vendas/listar') dados=[venda]
    if(req.url==='/api/vendas/3') dados={venda,itens:[{id:1,produto_nome:'Produto de teste',quantidade:1,preco_unitario:10,subtotal:10}],parcelas:[{id:4,venda_id:3,numero_parcela:1,valor:10,valor_pago:10,vencimento:'2026-01-31',status:'QUITADO'}]}
    responder(res,dados,200);return
   }
   if(req.method!=='POST' || !['/api/vendas/completa','/api/pagamentos'].includes(req.url)){res.writeHead(404);res.end();return}
   assert.equal(req.headers.authorization,'Bearer fixture-browser')
   let body='';for await(const chunk of req)body+=chunk
   const chave=req.headers['idempotency-key'];const registro={chave,body,url:req.url};requisicoes.push(registro)
   if(modo==='terminal'){responder(res,{resultado:'nao_confirmado'},400);return}
   if(modo==='decidir'){retidas.push({res,registro});return}
   if(modo==='incompleta'){responder(res,{},201);return}
   if(modo==='incerto'){responder(res,{resultado:'incerto'},503);return}
   let efeito=efeitos.get(chave)
   if(efeito && efeito.body!==body){responder(res,{resultado:'conflito'},409);return}
   if(!efeito){efeito={body,dados:req.url.endsWith('pagamentos')?{pagamento_id:proximoId++}:{id:proximoId++}};efeitos.set(chave,efeito)}
   if(modo==='perder'){req.socket.destroy();return}
   if(modo==='reter'){retidas.push({res,dados:efeito.dados});return}
   responder(res,efeito.dados)
  }catch{res.writeHead(500);res.end()}
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const base=`http://127.0.0.1:${server.address().port}`, api=base+'/api'
 let chrome,ws,contador=0;const aguardando=new Map()
 async function cdp(method,params={},sessionId){
  const id=++contador
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{aguardando.delete(id);reject(new Error('CDP timeout: '+method))},12000)
   aguardando.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))
  })
 }
 async function avaliar(tab,expression){
  const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},tab.session)
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
 }
 async function aba(){
  const {targetId}=await cdp('Target.createTarget',{url:base+'/'})
  const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true})
  const tab={targetId,session:sessionId}
  try { await esperar(async()=>{try{return await avaliar(tab,'Boolean(window.fin)')}catch{return false}}) }
  catch { throw new Error('Fixture de navegador indisponivel: '+JSON.stringify(await avaliar(tab,'({url:location.href,estado:document.readyState,erros:window.fixtureErrors,modulos:performance.getEntriesByType("resource").map(x=>({name:x.name,status:x.responseStatus}))})'))) }
  await avaliar(tab,`sessionStorage.setItem('quitai_token','fixture-browser');sessionStorage.setItem('quitai_usuario',JSON.stringify({id:1}));window.api=${JSON.stringify(api)};window.tipo='venda_completa';window.pedido={cliente_id:1,itens:[{produto_id:2,quantidade:1}]};true`)
  return tab
 }
 async function abrir(tab){return avaliar(tab,'fin.prepararIntencaoFinanceira(api,tipo).then(x=>(window.ticket=x,x))')}
 async function enviar(tab){return avaliar(tab,'fin.enviarOperacaoFinanceira(api,tipo,pedido,ticket).then(dados=>({ok:true,dados}),e=>({ok:false,mensagem:e.message}))')}
 async function iniciar(tab){await avaliar(tab,'window.envio=fin.enviarOperacaoFinanceira(api,tipo,pedido,ticket).then(dados=>({ok:true,dados}),e=>({ok:false,mensagem:e.message}));true')}
 async function reset(a,b){
  assert.equal(retidas.length,0);modo='normal';requisicoes.length=0;efeitos.clear()
  await avaliar(a,`new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('quitai-intencoes-financeiras');r.onsuccess=()=>{localStorage.clear();resolve(true)};r.onerror=()=>reject(new Error('fixture reset'));r.onblocked=()=>reject(new Error('fixture blocked'))})`)
  for(const tab of [a,b])await avaliar(tab,`window.api=${JSON.stringify(api)};`+"sessionStorage.setItem('quitai_token','fixture-browser');sessionStorage.setItem('quitai_usuario',JSON.stringify({id:1}));window.tipo='venda_completa';window.pedido={cliente_id:1,itens:[{produto_id:2,quantidade:1}]};window.ticket=null;true")
 }
 async function iniciarChrome(){
  chrome=spawn(executavel,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${perfil}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
  const endpoint=await new Promise((resolve,reject)=>{
   let texto='';const timer=setTimeout(()=>reject(new Error('Chrome nao iniciou CDP')),15000)
   chrome.once('error',e=>{clearTimeout(timer);reject(e)})
   chrome.stderr.on('data',b=>{texto+=b.toString();const m=texto.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1])}})
  })
  ws=new WebSocket(endpoint)
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);const p=aguardando.get(r.id);if(p){clearTimeout(p.timer);aguardando.delete(r.id);if(r.error)p.reject(new Error(r.error.message));else p.resolve(r.result)}})
 }
 try{
  await iniciarChrome()
  const a=await aba(),b=await aba()
  assert.equal(await avaliar(a,'isSecureContext && Boolean(navigator.locks)'),true)

  await t.test('mesmo pedido simultaneo compartilha chave e um unico efeito',async()=>{
   await reset(a,b);const [ta,tb]=await Promise.all([abrir(a),abrir(b)]);assert.equal(ta.id,tb.id)
   const [ra,rb]=await Promise.all([enviar(a),enviar(b)]);assert.ok(ra.ok && rb.ok);assert.equal(ra.dados.id,rb.dados.id)
   assert.equal(new Set(requisicoes.map(x=>x.chave)).size,1);assert.equal(efeitos.size,1)
  })
  await t.test('pedidos diferentes nao sobrescrevem a reserva concorrente',async()=>{
   await reset(a,b);await Promise.all([abrir(a),abrir(b)]);await avaliar(b,'pedido.cliente_id=2;true')
   const r=await Promise.all([enviar(a),enviar(b)]);assert.equal(r.filter(x=>x.ok).length,1);assert.equal(requisicoes.length,1);assert.equal(efeitos.size,1)
  })
  await t.test('confirmacao antes do submit atrasado conserva comprovante e nao cria chave',async()=>{
   await reset(a,b);await Promise.all([abrir(a),abrir(b)]);assert.ok((await enviar(a)).ok)
   const antes=requisicoes.length;assert.ok((await enviar(b)).ok);assert.equal(requisicoes.length,antes)
   assert.ok(await avaliar(a,"Object.values(localStorage).some(x=>x.includes('confirmada'))"))
  })
  await t.test('resposta perdida depois do efeito e recuperada por outra aba com mesma chave',async()=>{
   await reset(a,b);await abrir(a);modo='perder';assert.equal((await enviar(a)).ok,false);assert.equal(efeitos.size,1)
   const chave=requisicoes[0].chave;modo='normal';await abrir(b);assert.ok((await enviar(b)).ok);assert.equal(requisicoes[1].chave,chave);assert.equal(efeitos.size,1)
  })
  await t.test('timeout de transporte conserva chave e pedido para repeticao',async()=>{
   await reset(a,b);await abrir(a);modo='reter'
   await avaliar(a,'window.timerOriginal=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timerOriginal(fn,ms===30000?40:ms,...args);true')
   const r=await enviar(a);assert.equal(r.ok,false);assert.match(r.mensagem,/preservados/)
   await avaliar(a,'window.setTimeout=timerOriginal;true');const chave=requisicoes[0].chave
   retidas.splice(0).forEach(x=>x.res.destroy());modo='normal';await abrir(b);assert.ok((await enviar(b)).ok);assert.equal(requisicoes[1].chave,chave);assert.equal(efeitos.size,1)
  })
  await t.test('recarga e novo login recuperam pedido e chave pendentes',async()=>{
   await reset(a,b);await abrir(a);modo='incerto';assert.equal((await enviar(a)).ok,false);const chave=requisicoes[0].chave
   await cdp('Page.navigate',{url:base+'/'},a.session);await esperar(async()=>{try{return await avaliar(a,'Boolean(window.fin) && !window.api')}catch{return false}})
   await avaliar(a,`window.api=${JSON.stringify(api)};window.tipo='venda_completa';window.pedido={cliente_id:1,itens:[{produto_id:2,quantidade:1}]};sessionStorage.setItem('quitai_token','fixture-browser');true`)
   const ticket=await abrir(a);assert.equal(ticket.pendente.chave,chave);modo='normal';assert.ok((await enviar(a)).ok);assert.equal(requisicoes[1].chave,chave)
  })
  await t.test('fechar aba apos reserva nao perde a chave mesmo com HTTP pendente',async()=>{
   await reset(a,b);const c=await aba();await abrir(c);modo='reter';await iniciar(c);await esperar(()=>retidas.length===1);const chave=requisicoes[0].chave
   await cdp('Target.closeTarget',{targetId:c.targetId});retidas.splice(0).forEach(x=>x.res.destroy());modo='normal'
   const ticket=await abrir(b);assert.equal(ticket.pendente.chave,chave);assert.ok((await enviar(b)).ok);assert.equal(efeitos.size,1)
  })
  for(const operacao of ['venda_completa','pagamento']) await t.test(`${operacao}: nao_confirmado primeiro nao libera chave enquanto outra aba confirma`,async()=>{
   await reset(a,b)
   for(const tab of [a,b])await avaliar(tab,`window.tipo=${JSON.stringify(operacao)};window.pedido=${JSON.stringify(operacao==='pagamento'?{venda_id:3,parcela_id:4,valor:10,data_pagamento:'2026-01-01',forma_pagamento:'PIX'}:{cliente_id:1,itens:[{produto_id:2,quantidade:1}]})};true`)
   const [ta,tb]=await Promise.all([abrir(a),abrir(b)]);assert.equal(ta.id,tb.id)
   modo='decidir';await iniciar(a);await esperar(()=>retidas.length===1);await iniciar(b);await esperar(()=>retidas.length===2)
   const [primeira,segunda]=retidas.splice(0);assert.equal(efeitos.size,0)
   responder(primeira.res,{resultado:'nao_confirmado',mensagem:'Tentativa rejeitada'},409)
   const negativa=await avaliar(a,'window.envio');assert.equal(negativa.ok,false);assert.match(negativa.mensagem,/continua pendente/)
   const recuperada=await abrir(a);assert.equal(recuperada.id,ta.id);assert.equal(recuperada.pendente.chave,segunda.registro.chave)
   await avaliar(a,"window.pedido={...pedido,cliente_id:99,valor:99};true");assert.equal((await enviar(a)).ok,false);assert.equal(requisicoes.length,2)
   // Only this second attempt commits; the first had no simulated effect.
   const dados=operacao==='pagamento'?{pagamento_id:proximoId++}:{id:proximoId++}
   efeitos.set(segunda.registro.chave,{body:segunda.registro.body,dados});responder(segunda.res,dados)
   assert.ok((await avaliar(b,'window.envio')).ok)
   await avaliar(a,`window.pedido=${segunda.registro.body};true`);assert.ok((await enviar(a)).ok);assert.equal(requisicoes.length,2);assert.equal(efeitos.size,1)
   const nova=await abrir(b);assert.notEqual(nova.id,ta.id)
  })
  await t.test('nao_confirmada persistida pela versao anterior e importada como pendente',async()=>{
   await reset(a,b)
   const original=await avaliar(a,`(async()=>{
    const original={versao:1,id:'intencao-anterior-browser-123',chave:'chave-anterior-browser-123',estado:'nao_confirmada',pedido};
    const key='quitai_financeiro_pendente:venda_completa:'+encodeURIComponent(api)+':1';
    const store=await import('/services/intencoesFinanceirasStore.js');
    await store.transacionarIntencao(key,(_r,salvar)=>{salvar(original)});
    localStorage.setItem(key,JSON.stringify(original));return original;
   })()`)
   const recuperada=await abrir(b);assert.equal(recuperada.id,original.id);assert.equal(recuperada.pendente.chave,original.chave);assert.deepEqual(recuperada.pendente.pedido,original.pedido)
   await avaliar(b,'window.pedido.cliente_id=99;true');assert.equal((await enviar(b)).ok,false);assert.equal(requisicoes.length,0)
   await avaliar(b,`window.pedido=${JSON.stringify(original.pedido)};true`);assert.ok((await enviar(b)).ok)
   assert.equal(requisicoes[0].chave,original.chave);assert.equal(efeitos.size,1)
  })
  await t.test('negativa e fechamento da outra aba nao provam ausencia de COMMIT remoto',async()=>{
   await reset(a,b);const c=await aba();await Promise.all([abrir(a),abrir(c)])
   modo='decidir';await iniciar(a);await esperar(()=>retidas.length===1);await iniciar(c);await esperar(()=>retidas.length===2)
   const [primeira,segunda]=retidas.splice(0)
   responder(primeira.res,{resultado:'nao_confirmado'},400);assert.equal((await avaliar(a,'window.envio')).ok,false)
   await cdp('Target.closeTarget',{targetId:c.targetId})
   // The server can commit even after its caller is gone. Do not infer failure.
   const dados={id:proximoId++};efeitos.set(segunda.registro.chave,{body:segunda.registro.body,dados});responder(segunda.res,dados)
   const recuperada=await abrir(a);assert.equal(recuperada.pendente.chave,segunda.registro.chave)
   await avaliar(a,'window.pedido.cliente_id=99;true');assert.equal((await enviar(a)).ok,false);assert.equal(requisicoes.length,2)
   await avaliar(a,`window.pedido=${segunda.registro.body};true`);modo='normal';assert.ok((await enviar(a)).ok)
   assert.equal(requisicoes[2].chave,segunda.registro.chave);assert.equal(efeitos.size,1)
  })
  await t.test('nenhuma requisicao local ativa nao libera intencao sem confirmacao remota',async()=>{
   await reset(a,b);const ta=await abrir(a);modo='terminal';assert.equal((await enviar(a)).ok,false)
   const chave=requisicoes[0].chave
   // Both responses have completed, yet a former caller elsewhere is not ruled out.
   await abrir(b);assert.equal((await enviar(b)).ok,false)
   const recuperada=await abrir(a);assert.equal(recuperada.id,ta.id);assert.equal(recuperada.pendente.chave,chave)
   await avaliar(a,'window.pedido.cliente_id=2;true');assert.equal((await enviar(a)).ok,false);assert.equal(requisicoes.length,2)
   await avaliar(a,'window.pedido.cliente_id=1;true');modo='normal';assert.ok((await enviar(a)).ok)
   assert.equal(requisicoes[2].chave,chave);assert.equal(efeitos.size,1)
   const nova=await abrir(a);assert.notEqual(nova.id,ta.id)
  })
  await t.test('falha tardia nao rebaixa resultado confirmado por outra aba',async()=>{
   await reset(a,b);await Promise.all([abrir(a),abrir(b)]);modo='reter';await iniciar(a);await iniciar(b);await esperar(()=>retidas.length===2)
   const [primeira,segunda]=retidas.splice(0);responder(segunda.res,segunda.dados);assert.ok((await avaliar(b,'window.envio')).ok)
   responder(primeira.res,{resultado:'nao_confirmado'},400);assert.ok((await avaliar(a,'window.envio')).ok);assert.equal(efeitos.size,1)
  })
  await t.test('resposta antiga nao modifica a nova intencao explicita',async()=>{
   await reset(a,b);await Promise.all([abrir(a),abrir(b)]);modo='reter';await iniciar(a);await iniciar(b);await esperar(()=>retidas.length===2)
   const [primeira,segunda]=retidas.splice(0);responder(segunda.res,segunda.dados);assert.ok((await avaliar(b,'window.envio')).ok)
   const nova=await abrir(b);const antes=await avaliar(b,'localStorage.getItem(ticket.escopo)')
   responder(primeira.res,primeira.dados);assert.equal((await avaliar(a,'window.envio')).ok,false)
   assert.equal(await avaliar(b,'localStorage.getItem(ticket.escopo)'),antes);assert.equal((await avaliar(b,'window.ticket')).id,nova.id)
  })
  await t.test('sem Web Locks nenhum envio ocorre e legado permanece intacto',async()=>{
   await reset(a,b);const c=await aba()
   await avaliar(c,`localStorage.setItem('quitai_financeiro_pendente:venda_completa:'+encodeURIComponent(api)+':1',JSON.stringify({chave:'chave-legada-browser-123',pedido}));Object.defineProperty(navigator,'locks',{value:undefined,configurable:true});true`)
   const antes=await avaliar(c,'JSON.stringify(localStorage)')
   const r=await avaliar(c,"fin.prepararIntencaoFinanceira(api,tipo).then(()=>false,e=>e.message.includes('Web Locks'))")
   assert.equal(r,true);assert.equal(await avaliar(c,'JSON.stringify(localStorage)'),antes);assert.equal(requisicoes.length,0)
   await cdp('Target.closeTarget',{targetId:c.targetId})
  })
  await t.test('IndexedDB indisponivel bloqueia navegador sem apagar o legado',async()=>{
   await reset(a,b);const c=await aba()
   await avaliar(c,`localStorage.setItem('quitai_financeiro_pendente:venda_completa:'+encodeURIComponent(api)+':1',JSON.stringify({chave:'chave-legada-browser-456',pedido}));Object.defineProperty(window,'indexedDB',{value:undefined,configurable:true});true`)
   const antes=await avaliar(c,'JSON.stringify(localStorage)')
   const r=await avaliar(c,"fin.prepararIntencaoFinanceira(api,tipo).then(()=>false,e=>e.message.includes('IndexedDB'))")
   assert.equal(r,true);assert.equal(await avaliar(c,'JSON.stringify(localStorage)'),antes);assert.equal(requisicoes.length,0)
   await cdp('Target.closeTarget',{targetId:c.targetId})
  })
  await t.test('contas, APIs e tipos possuem reservas independentes',async()=>{
   await reset(a,b);const ta=await abrir(a)
   await avaliar(b,"sessionStorage.setItem('quitai_usuario',JSON.stringify({id:2}));true");const tb=await abrir(b);assert.notEqual(ta.escopo,tb.escopo)
   await avaliar(b,"sessionStorage.setItem('quitai_usuario',JSON.stringify({id:1}));window.tipo='pagamento';true");const tp=await abrir(b);assert.notEqual(ta.escopo,tp.escopo)
   await avaliar(b,"window.tipo='venda_completa';window.api+='/ambiente-isolado';true");const te=await abrir(b);assert.notEqual(ta.escopo,te.escopo)
   await avaliar(b,`window.api=${JSON.stringify(api)};true`)
  })
  await t.test('nova operacao explicita com mesmos dados recebe nova chave',async()=>{
   await reset(a,b);const ta=await abrir(a);assert.ok((await enviar(a)).ok);const chave=requisicoes[0].chave
   const tb=await abrir(a);assert.notEqual(ta.id,tb.id);assert.ok((await enviar(a)).ok);assert.notEqual(requisicoes[1].chave,chave);assert.equal(efeitos.size,2)
  })
  await t.test('pagamentos simultaneos: 80 interleavings com mesma chave e resultado',async()=>{
   for(let tentativa=0;tentativa<80;tentativa++) {
    await reset(a,b)
    for(const tab of [a,b])await avaliar(tab,"window.tipo='pagamento';window.pedido={venda_id:3,parcela_id:4,valor:10,data_pagamento:'2026-01-01',forma_pagamento:'PIX'};true")
    const tickets=await Promise.all([abrir(a),abrir(b)]);assert.equal(tickets[0].id,tickets[1].id,JSON.stringify({tentativa,tickets}));const r=await Promise.all([enviar(a),enviar(b)])
    assert.ok(r.every(x=>x.ok),JSON.stringify({tentativa,resultados:r,requisicoes}));assert.equal(r[0].dados.pagamento_id,r[1].dados.pagamento_id);assert.equal(efeitos.size,1)
   }
  })
  await t.test('duas abas nativas completam quatro geracoes com espelho inicial e quota persistente',async()=>{
   await reset(a,b);await abrir(a)
   const original=await avaliar(a,'localStorage.getItem(ticket.escopo)')
   for(const tab of [a,b]) await avaliar(tab,"window.setOriginal=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('quitai_financeiro_pendente:'))throw new DOMException('quota simulada','QuotaExceededError');return window.setOriginal.call(this,k,v)};true")
   try {
    for(let i=0;i<4;i++) {
     const [ta,tb]=await Promise.all([abrir(a),abrir(b)]);assert.equal(ta.id,tb.id)
     const resultados=await Promise.all([enviar(a),enviar(b)]);assert.ok(resultados.every(x=>x.ok))
     assert.equal(efeitos.size,i+1);assert.equal(await avaliar(a,'localStorage.getItem(ticket.escopo)'),original)
     assert.equal(await avaliar(b,'fin.obterOperacaoPendente(api,tipo)'),null)
    }
   } finally { for(const tab of [a,b]) await avaliar(tab,'Storage.prototype.setItem=window.setOriginal;true') }
  })
  await t.test('abort nativo apos put conserva pendencia; recarga e reconciliacao entre abas recuperam mesma chave',async()=>{
   await reset(a,b);await abrir(a)
   await avaliar(a,"window.putOriginal=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){const req=window.putOriginal.call(this,value,...args);if(value?.estado==='confirmada'){const tx=this.transaction;req.addEventListener('success',()=>tx.abort(),{once:true})}return req};true")
   try {
    assert.equal((await enviar(a)).ok,false);const chave=requisicoes[0].chave
    assert.equal(await avaliar(a,"JSON.parse(localStorage.getItem(ticket.escopo)).estado"),'pendente')
    await cdp('Page.navigate',{url:base+'/'},a.session);await esperar(async()=>{try{return await avaliar(a,'Boolean(window.fin) && !window.api')}catch{return false}})
    await avaliar(a,`window.api=${JSON.stringify(api)};window.tipo='venda_completa';window.pedido={cliente_id:1,itens:[{produto_id:2,quantidade:1}]};true`)
    assert.equal((await abrir(a)).pendente.chave,chave)
    await avaliar(a,"(()=>{const r=JSON.parse(localStorage.getItem(ticket.escopo));localStorage.setItem(ticket.escopo,JSON.stringify({...r,estado:'confirmada',comprovante:{id:999}}));return true})()")
    const [recuperada,concluida]=await Promise.all([abrir(b),enviar(a)])
    assert.ok(concluida.ok);assert.equal(recuperada.id,await avaliar(a,'ticket.id'))
    assert.equal(requisicoes.at(-1).chave,chave);assert.equal(efeitos.size,1)
    await avaliar(a,"(()=>{const r=JSON.parse(localStorage.getItem(ticket.escopo));localStorage.setItem(ticket.escopo,JSON.stringify({...r,estado:'pendente'}));return true})()")
    assert.equal(await avaliar(b,"fin.obterOperacaoPendente(api,tipo)"),null)
    assert.equal(await avaliar(a,"JSON.parse(localStorage.getItem(ticket.escopo)).estado"),'confirmada')
   } finally { await avaliar(a,"if(window.putOriginal)IDBObjectStore.prototype.put=window.putOriginal;true") }
  })
  await t.test('React completo recupera pagamento de venda quitada usando IndexedDB, nao o espelho',async()=>{
   await reset(a,b)
   for(const tab of [a,b]) await avaliar(tab,"window.api='/api';window.tipo='pagamento';window.pedido={venda_id:3,parcela_id:4,valor:10,data_pagamento:'2026-01-01',forma_pagamento:'PIX'};true")
   await abrir(a);modo='perder';assert.equal((await enviar(a)).ok,false);const chave=requisicoes[0].chave
   await avaliar(a,"const r=JSON.parse(localStorage.getItem(ticket.escopo));localStorage.setItem(ticket.escopo,JSON.stringify({...r,estado:'confirmada',comprovante:{pagamento_id:999}}));true")
   modo='normal';await cdp('Page.navigate',{url:base+'/app'},b.session)
   await esperar(()=>avaliar(b,"Boolean(document.querySelector('.app')) && [...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Vendas')"))
   await avaliar(b,"[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Vendas').click();true")
   await esperar(()=>avaliar(b,"[...document.querySelectorAll('button')].some(x=>/Quitadas/i.test(x.textContent))"))
   await avaliar(b,"[...document.querySelectorAll('button')].find(x=>/Quitadas/i.test(x.textContent)).click();true")
   await esperar(()=>avaliar(b,"document.body.textContent.includes('Cliente de teste')"))
   // Click the visible sale card, not an internal React function.
   const abriu=await avaliar(b,"(()=>{const x=[...document.querySelectorAll('button')].find(x=>/Detalhes|Ver venda/i.test(x.textContent));if(x){x.click();return true}const y=[...document.querySelectorAll('button,[role=button],article')].find(x=>x.textContent.includes('Cliente de teste'));if(y){y.click();return true}return false})()")
   assert.ok(abriu,await avaliar(b,"[...document.querySelectorAll('button')].map(x=>x.textContent.trim()).join('|')"))
   await esperar(()=>avaliar(b,"[...document.querySelectorAll('button')].some(x=>x.textContent.includes('Recuperar pagamento pendente') && !x.disabled)"))
   await avaliar(b,"[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Recuperar pagamento pendente')).click();true")
   await esperar(()=>avaliar(b,"Boolean(document.querySelector('form button[type=submit]')) && document.body.textContent.includes('pagamento pendente')"))
   const antesEnvio=requisicoes.length
   await avaliar(b,"const f=[...document.querySelectorAll('form')].find(f=>f.querySelector('[name=valor]'));if(!f)throw new Error('formulario nao encontrado');f.requestSubmit();true")
   await esperar(()=>requisicoes.length>antesEnvio)
   await esperar(()=>avaliar(b,"!document.body.textContent.includes('Existe um pagamento pendente.')"))
   assert.equal(requisicoes.at(-1).chave,chave);assert.equal(efeitos.size,1)
   await cdp('Page.navigate',{url:base+'/'},b.session);await esperar(()=>avaliar(b,'Boolean(window.fin)'))
   await avaliar(b,`window.api=${JSON.stringify(api)};window.tipo='venda_completa';window.pedido={cliente_id:1,itens:[{produto_id:2,quantidade:1}]};true`)
   await avaliar(a,`window.api=${JSON.stringify(api)};true`)
  })
  await t.test('todas as abas fechadas e navegador reiniciado conservam intencao no mesmo perfil',async()=>{
   await reset(a,b);await abrir(a);modo='perder';assert.equal((await enviar(a)).ok,false);const chave=requisicoes[0].chave
   const anterior=chrome;await cdp('Browser.close');ws.close()
   await Promise.race([new Promise(r=>anterior.once('exit',r)),sleep(5000)]);assert.notEqual(anterior.exitCode,null)
   await iniciarChrome();const nova=await aba();const ticket=await abrir(nova);assert.equal(ticket.pendente.chave,chave)
   modo='normal';assert.ok((await enviar(nova)).ok);assert.equal(requisicoes[1].chave,chave);assert.equal(efeitos.size,1)
  })

 }finally{
  retidas.splice(0).forEach(x=>x.res.destroy())
  for(const p of aguardando.values()){clearTimeout(p.timer);p.reject(new Error('Test finished'))}aguardando.clear()
  if(ws && ws.readyState===WebSocket.OPEN){try{await cdp('Browser.close')}catch{}}
  ws?.close()
  if(chrome && chrome.exitCode===null){await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill()}
  server.closeAllConnections();await new Promise(r=>server.close(r))
  const destino=path.resolve(perfil),temporario=path.resolve(tmpdir())
  assert.equal(path.dirname(destino),temporario);assert.ok(path.basename(destino).startsWith('quitai-financeiro-test-'))
  await rm(destino,{recursive:true,force:true,maxRetries:5,retryDelay:200})
  const buildPath=path.resolve(artefatos);assert.equal(path.dirname(buildPath),temporario);assert.ok(path.basename(buildPath).startsWith('quitai-react-test-'));await rm(buildPath,{recursive:true,force:true,maxRetries:5,retryDelay:200})
 }
})
