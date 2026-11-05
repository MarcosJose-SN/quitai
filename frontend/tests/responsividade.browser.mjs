import fs from 'node:fs';
import path from 'node:path';
const out=process.argv[2];
if(!out||!fs.existsSync(out))throw Error('Informe um diretorio existente para evidencias. Requer Chrome isolado na porta 9223.');
const targets=await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page=await (await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let serial=0;const pending=new Map();const logs=[];const calls=[];let statusOverride=0;
const user={id:11,nome:'Revendedora de Auditoria',email:'revendedora@example.invalid',perfil:'revendedora',ativo:true};
const clients=[{id:1,nome:'Cliente de teste com nome longo para verificar a quebra de linha',telefone:'11999990000',observacoes:'Dados sinteticos de auditoria'}];
const products=[{id:1,nome:'Produto de teste com descricao longa para verificacao de responsividade',codigo:'TESTE-001',categoria:'Perfume',preco_custo:5.1,preco_venda:10.2,estoque:10}];
const sale={id:101,cliente_id:1,cliente_nome:clients[0].nome,data_compra:'2026-10-01',vencimento:'2026-11-01',total:20.4,valor_pago:10.2,saldo:10.2,total_parcelas:2,status:'VENCIDO'};
const detail={venda:sale,itens:[{id:1,produto_id:1,produto_nome:products[0].nome,quantidade:2,preco_unitario:10.2,subtotal:20.4}],parcelas:[{id:201,venda_id:101,numero_parcela:1,total_parcelas:2,valor:10.2,valor_pago:10.2,vencimento:'2026-10-01',status:'QUITADO'},{id:202,venda_id:101,numero_parcela:2,total_parcelas:2,valor:10.2,valor_pago:0,vencimento:'2026-11-01',status:'EM_ABERTO'}]};
const tickets=[{id:1,assunto:'Chamado sintetico A',categoria:'Duvidas gerais',status:'aberto',atualizado_em:'2026-11-04T15:00:00Z'},{id:2,assunto:'Chamado sintetico B',categoria:'Duvidas gerais',status:'aberto',atualizado_em:'2026-11-04T15:00:00Z'}];
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
ws.addEventListener('message',async e=>{
 const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)(m.error?p.reject(m.error):p.resolve(m.result));return;}
 if(m.method==='Runtime.exceptionThrown')logs.push({tipo:'exception',texto:m.params.exceptionDetails.text});
 if(m.method==='Runtime.consoleAPICalled')logs.push({tipo:m.params.type,argumentos:m.params.args.length});
 if(m.method!=='Fetch.requestPaused')return;
 const {requestId,request}=m.params;const u=new URL(request.url);
 try{
 if(u.origin==='http://localhost:5174'){await send('Fetch.continueRequest',{requestId});return;}
 if(u.origin!=='http://localhost:8082'){await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});return;}
 calls.push({path:u.pathname,method:request.method});if(request.method==='OPTIONS'){await send('Fetch.fulfillRequest',{requestId,responseCode:204,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'http://localhost:5174'},{name:'Access-Control-Allow-Headers',value:'Authorization, Content-Type, Idempotency-Key'},{name:'Access-Control-Allow-Methods',value:'GET, POST, PUT, PATCH, DELETE, OPTIONS'}]});return;}if(u.pathname.endsWith('/eventos'))return;
 let data={},code=200;
 if(statusOverride&&request.headers.Authorization){code=statusOverride;data={mensagem:'Sessao expirada'};}
 else if(u.pathname==='/sistema/publico')data={manutencao:false,avisos:[]};
 else if(u.pathname==='/auth/me'||u.pathname==='/minha-conta')data=user;
 else if(u.pathname==='/auth/login')data={token:'fixture-only-not-a-real-token',usuario:user};
 else if(u.pathname==='/clientes/listar')data=clients;
 else if(u.pathname==='/produtos/listar')data=products;
 else if(u.pathname==='/vendas/listar')data=[sale];
 else if(/^\/vendas\/\d+$/.test(u.pathname))data=detail;
 else if(u.pathname==='/pagamentos')data=request.method==='GET'?[{id:1,valor:10.2,data_pagamento:'2026-10-01',forma_pagamento:'PIX'}]:{pagamento_id:900,mensagem:'Pagamento registrado'};
 else if(u.pathname==='/suporte')data=request.method==='GET'?tickets:{id:3};
 else if(/^\/suporte\/\d+$/.test(u.pathname)){const t=tickets.find(t=>t.id===Number(u.pathname.split('/')[2]));data={...t,mensagens:[{id:t.id,mensagem:'Mensagem de teste '+t.id,autor_perfil:'revendedora',criado_em:'2026-11-04T15:00:00Z'}]};}
 else if(request.method!=='GET')data={id:999,mensagem:'Operacao simulada'};
 else {code=404;data={mensagem:'Fixture ausente'};}
 if(request.method==='POST'&&(u.pathname==='/pagamentos'||u.pathname==='/vendas/completa')&&code===200)code=201;
 await send('Fetch.fulfillRequest',{requestId,responseCode:code,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'http://localhost:5174'}],body:Buffer.from(JSON.stringify(data)).toString('base64')});
 }catch(err){logs.push({tipo:'harness',texto:String(err)});}
});
await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
await send('Emulation.setTimezoneOverride',{timezoneId:'America/Sao_Paulo'});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(!sessionStorage.getItem('auditoria-iniciada')){sessionStorage.setItem('auditoria-iniciada','1');sessionStorage.setItem('quitai_token','fixture-only-not-a-real-token');sessionStorage.setItem('quitai_usuario',${JSON.stringify(JSON.stringify(user))});}`});
async function click(text){const ok=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`);if(!ok)throw Error('Botao nao encontrado: '+text);await pause(160);}
async function nav(index){await evaluate(`document.querySelectorAll('.nav-item')[${index}].click()`);await pause(180);}
async function snapshot(name,width){
 const metrics=await evaluate(`(()=>{const vw=innerWidth;return {width:vw,scroll:document.documentElement.scrollWidth,overflows:[...document.querySelectorAll('main,section,form,input,select,textarea,button,table,[role="dialog"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>vw+2||r.left< -2)}).slice(0,8).map(e=>({tag:e.tagName,classe:e.className,texto:e.textContent.trim().slice(0,45)}))}})()`);
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,`${width}-${name}.png`),Buffer.from(shot.data,'base64'));if(name.endsWith('-modal')) {
  const action=await evaluate(`(()=>{const buttons=[...document.querySelectorAll('form button[type="submit"]')];const e=buttons.at(-1);if(!e)return {encontrado:false};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {encontrado:true,visivel:r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1,semSobreposicao:hit===e||e.contains(hit)}})()`);
  actions.push({width,tela:name,...action});
 }return {tela:name,...metrics};
}
const actions=[];const results=[];
for(const width of [320,375,390,430,768,1024,1440]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
 await send('Page.navigate',{url:'http://localhost:5174/'});await pause(700);
 results.push(await snapshot('inicio',width));
 for(const [i,name] of [[1,'vendas'],[2,'clientes'],[3,'produtos'],[4,'mais']]){await nav(i);results.push(await snapshot(name,width));}
 await click('Central de Suporte');results.push(await snapshot('suporte',width));
 await click('← Mais opções');await click('Minha conta');results.push(await snapshot('conta',width));
 await nav(2);await click('+ Novo');results.push(await snapshot('cliente-modal',width));await evaluate("document.querySelector('.modal-fechar').click()");
 await nav(3);await click('+ Novo');results.push(await snapshot('produto-modal',width));await evaluate("document.querySelector('.modal-fechar').click()");
 await nav(0);await click('Nova venda');results.push(await snapshot('venda-modal',width));await evaluate("document.querySelector('.modal-fechar').click()");
 await nav(0);await click(clients[0].nome);results.push(await snapshot('detalhes',width));
 await click('Registrar pagamento');results.push(await snapshot('pagamento-modal',width));await evaluate("document.querySelector('.modal-fechar').click()");
 await nav(4);await evaluate("document.querySelector('.conta-voltar')?.click()");await pause(100);await click('Configura\u00e7\u00f5es');results.push(await snapshot('configuracoes',width));
 await evaluate("sessionStorage.removeItem('quitai_token');sessionStorage.removeItem('quitai_usuario')");await send('Page.navigate',{url:'http://localhost:5174/'});await pause(400);results.push(await snapshot('login',width));
 await evaluate(`sessionStorage.setItem('quitai_token','fixture-only-not-a-real-token');sessionStorage.setItem('quitai_usuario',${JSON.stringify(JSON.stringify(user))})`);

}
fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify({results,actions,logs,calls},null,2));
console.log(JSON.stringify({telas:results.length,overflow:results.filter(r=>r.scroll>r.width+2),excecoes:logs.filter(l=>l.tipo==='exception'),logsDeDados:logs.filter(l=>l.tipo==='log').length,acoesInacessiveis:actions.filter(a=>!a.encontrado||!a.visivel||!a.semSobreposicao)},null,2));
await send('Page.close');ws.close();