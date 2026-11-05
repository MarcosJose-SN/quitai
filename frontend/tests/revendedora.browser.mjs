import fs from 'node:fs';
import path from 'node:path';
const out=process.argv[2];
if(!out||!fs.existsSync(out))throw Error('Informe um diretorio existente para as evidencias. Requer Chrome isolado na porta 9223.');
const targets=await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page=await (await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let serial=0;const pending=new Map();const logs=[];const calls=[];let statusOverride=0;let failRefresh=false;let afterPayment=false;let rejectCustomer=false;let malformedProducts=false;let detailFailure=false;let perderVendaUmaVez=false;const vendasMock=new Map();const pedidosFinanceiros=[];let perderPagamentoUmaVez=false;let pagamentoQuitado=false;const pagamentosMock=new Map();const pedidosPagamentos=[];
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
 if(request.method==='POST')await new Promise(r=>setTimeout(r,200));
 if(u.pathname==='/suporte/1')await new Promise(r=>setTimeout(r,350));
 if(u.pathname==='/suporte/2')await new Promise(r=>setTimeout(r,20));
 if(statusOverride&&Object.keys(request.headers).some(k=>k.toLowerCase()==='authorization')){code=statusOverride;data={mensagem:'Sessao expirada'};}
 else if(/^\/vendas\/\d+$/.test(u.pathname)&&pagamentoQuitado)data={...detail,venda:{...sale,valor_pago:sale.total,saldo:0,status:'QUITADO'},parcelas:detail.parcelas.map(p=>({...p,valor_pago:p.valor,status:'QUITADO'}))};
 else if(u.pathname==='/sistema/publico')data={manutencao:false,avisos:[]};
 else if(u.pathname==='/auth/me'||u.pathname==='/minha-conta')data=user;
 else if(u.pathname==='/auth/login')data={token:'fixture-only-not-a-real-token',usuario:user};
 else if(u.pathname==='/clientes'&&request.method==='POST'&&rejectCustomer){code=409;data={mensagem:'Cliente duplicado: fixture de conflito'};}
 else if(u.pathname==='/produtos/listar'&&malformedProducts)data={invalido:true};
 else if(/^\/vendas\/\d+$/.test(u.pathname)&&(detailFailure||(failRefresh&&afterPayment))){code=500;data={mensagem:'Falha simulada no detalhe'};}
 else if(u.pathname==='/clientes/listar')data=clients;
 else if(u.pathname==='/produtos/listar')data=products;
 else if(u.pathname==='/vendas/listar')data=[sale];
 else if(/^\/vendas\/\d+$/.test(u.pathname))data=detail;
 else if(u.pathname==='/pagamentos')data=request.method==='GET'?[{id:1,valor:10.2,data_pagamento:'2026-10-01',forma_pagamento:'PIX'}]:{pagamento_id:900,mensagem:'Pagamento registrado'};
 else if(u.pathname==='/suporte')data=request.method==='GET'?tickets:{id:3};
 else if(/^\/suporte\/\d+$/.test(u.pathname)){const t=tickets.find(t=>t.id===Number(u.pathname.split('/')[2]));data={...t,mensagens:[{id:t.id,mensagem:'Mensagem de teste '+t.id,autor_perfil:'revendedora',criado_em:'2026-11-04T15:00:00Z'}]};}
 else if(request.method!=='GET')data={id:999,mensagem:'Operacao simulada'};
 else {code=404;data={mensagem:'Fixture ausente'};}

 if(u.pathname==='/vendas/completa'&&request.method==='POST'&&code===200){
  const key=Object.entries(request.headers).find(([k])=>k.toLowerCase()==='idempotency-key')?.[1];
  pedidosFinanceiros.push({chave:key,pedido:JSON.parse(request.postData)});
  if(!vendasMock.has(key))vendasMock.set(key,{id:999,mensagem:'Venda atomica simulada'});
  data=vendasMock.get(key);
  if(perderVendaUmaVez){perderVendaUmaVez=false;await send('Fetch.failRequest',{requestId,errorReason:'Failed'});return;}
 }

 if(u.pathname==='/pagamentos'&&request.method==='POST'&&code===200){
  const key=Object.entries(request.headers).find(([k])=>k.toLowerCase()==='idempotency-key')?.[1];
  pedidosPagamentos.push({chave:key,pedido:JSON.parse(request.postData)});
  if(!pagamentosMock.has(key))pagamentosMock.set(key,{pagamento_id:900,mensagem:'Pagamento confirmado'});
  data=pagamentosMock.get(key);
  if(perderPagamentoUmaVez){perderPagamentoUmaVez=false;pagamentoQuitado=true;await send('Fetch.failRequest',{requestId,errorReason:'Failed'});return;}
 }
 if(u.pathname==='/pagamentos'&&request.method==='POST'&&code===200)afterPayment=true;
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
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,`${width}-${name}.png`),Buffer.from(shot.data,'base64'));return {tela:name,...metrics};
}
async function waitFor(expression){for(let i=0;i<200;i++){if(await evaluate(expression))return;await pause(50)}throw Error('Tempo excedido aguardando estado do teste')}
const checks=[];
function verify(name,condition){checks.push({name,aprovado:!!condition});if(!condition)throw Error('Regressao: '+name);}
const has=async text=>evaluate(`document.body.textContent.includes(${JSON.stringify(text)})`);
const postCount=p=>calls.filter(c=>c.path===p&&c.method==='POST').length;
async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Campo ausente');const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause(40);}
async function submitTwice(){await evaluate(`(()=>{const f=document.querySelector('form.formulario-produto');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})()`);await pause(450);}
async function home(){await send('Page.navigate',{url:'http://localhost:5174/'});await waitFor("!!document.querySelector('.nav-item')||!!document.querySelector('.login-pagina')");await pause(250);}
try{
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});await home();
 await waitFor("document.body.textContent.includes('VENCIDO')");
 verify('venda vencida no inicio conserva status do backend',await has('VENCIDO'));
 await click('Nova venda');await fill('select[name="cliente_id"]','1');await fill('input[name="data_vencimento"]','2026-12-31');await fill('select[name="produto_id"]','1');await fill('input[name="quantidade"]','2');await click('+ Adicionar');
 perderVendaUmaVez=true;await submitTwice();
 verify('falha de rede preserva a intencao de venda',await evaluate("Object.keys(localStorage).some(k=>k.startsWith('quitai_financeiro_pendente:venda_completa:'))"));
 await home();await click('Nova venda');
 verify('reabrir formulario restaura cliente e produtos da operacao incerta',await evaluate("document.querySelector('select[name=cliente_id]').value==='1'"));
 detailFailure=true;await submitTwice();
 verify('venda confirmada continua visivel quando o GET de atualizacao falha',await has('Venda #999 confirmada'));detailFailure=false;
 verify('retry de venda reutiliza a mesma chave e o mesmo pedido apos recarregar',pedidosFinanceiros.length===2&&pedidosFinanceiros[0].chave===pedidosFinanceiros[1].chave&&JSON.stringify(pedidosFinanceiros[0].pedido)===JSON.stringify(pedidosFinanceiros[1].pedido));
 verify('uma unica venda confirmada na simulacao de perda de resposta',vendasMock.size===1);
 verify('frontend nao utiliza mais as escritas antigas',!calls.some(c=>c.method==='POST'&&(c.path==='/vendas'||c.path==='/vendas/itens')));
 await home();

 await nav(2);await click('+ Novo');await fill('input[name="nome"]','Cliente sintetico');
 rejectCustomer=true;const c0=postCount('/clientes');await submitTwice();
 verify('submit duplo de cliente gera somente um POST',postCount('/clientes')===c0+1);
 verify('conflito 409 do backend aparece no formulario',await has('Cliente duplicado: fixture de conflito'));
 rejectCustomer=false;await submitTwice();verify('sucesso fecha formulario de cliente',!(await evaluate("!!document.querySelector('form.formulario-produto')")));
 await nav(3);await click('+ Novo');
 for(const [name,value] of Object.entries({nome:'Produto sintetico',codigo:'TESTE-VALIDACAO',preco_custo:'1.00',preco_venda:'10.20',estoque:'1.5'}))await fill(`input[name="${name}"]`,value);
 const p0=postCount('/produtos');await submitTwice();verify('estoque fracionario nao chega a API',postCount('/produtos')===p0);
 await fill('input[name="estoque"]','3');await submitTwice();verify('produto valido com submit duplo gera um POST',postCount('/produtos')===p0+1);
 malformedProducts=true;await nav(2);await nav(3);verify('resposta de lista malformada mostra erro sem tela branca',await has('Não foi possível carregar os produtos.'));malformedProducts=false;
 await nav(0);await click('Nova venda');
 verify('data padrao segue calendario de Sao Paulo',await evaluate("document.querySelector('input[name=data_compra]').value===`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`"));
 await fill('select[name="produto_id"]','1');await fill('input[name="quantidade"]','1.5');await click('+ Adicionar');
 verify('quantidade fracionaria e rejeitada antes de criar venda',await has('Informe uma quantidade válida.'));
 await evaluate("document.querySelector('.modal-fechar').click()");
 await nav(4);await click('Central de Suporte');
 await waitFor("document.querySelectorAll('.qa-ticket-open').length===2");
 await evaluate("(()=>{const b=document.querySelectorAll('.qa-ticket-open');b[0].click();b[1].click()})()");await pause(550);
 verify('conversa lenta A nao sobrescreve conversa B',await evaluate("document.querySelector('.qa-chat-subject')?.textContent==='Chamado sintetico B'"));
 await fill('.suporte-formulario input','Rascunho privado conta A');await fill('.suporte-formulario textarea','Descricao sintetica privada da conta A.');await click('Salvar como rascunho');
 verify('rascunho salvo em chave por conta e API',await evaluate("Object.keys(localStorage).some(k=>k.startsWith('quitai_suporte_rascunhos:')&&k.endsWith(':11'))"));
 await nav(2);const suporteAntes=calls.filter(c=>c.path==='/suporte'&&c.method==='GET').length;await evaluate("window.dispatchEvent(new Event('focus'))");await pause(150);
 verify('suporte nao sincroniza quando a tela esta inativa',calls.filter(c=>c.path==='/suporte'&&c.method==='GET').length===suporteAntes);
 user.id=12;await evaluate(`sessionStorage.setItem('quitai_usuario',${JSON.stringify(JSON.stringify(user))})`);await home();await nav(4);await click('Central de Suporte');
 verify('segunda conta nao ve rascunho da primeira',!(await has('Rascunho privado conta A')));
 user.id=11;await evaluate(`sessionStorage.setItem('quitai_usuario',${JSON.stringify(JSON.stringify(user))})`);await home();

 await click(clients[0].nome);await click('Registrar pagamento');await fill('input[name="valor"]','10.20');
 perderPagamentoUmaVez=true;await submitTwice();await home();await click(clients[0].nome);await click('Registrar pagamento');
 verify('pagamento pendente quitado pode ser retomado pelo formulario',await evaluate("document.querySelector('input[name=valor]').value==='10.2'&&document.querySelector('form.formulario-produto').checkValidity()"));
 await submitTwice();
 verify('pagamento quitado repete a chave original apos resposta perdida',pedidosPagamentos.length===2&&pedidosPagamentos[0].chave===pedidosPagamentos[1].chave&&JSON.stringify(pedidosPagamentos[0].pedido)===JSON.stringify(pedidosPagamentos[1].pedido));
 pagamentoQuitado=false;afterPayment=false;await home();
 await click(clients[0].nome);await click('Registrar pagamento');await fill('input[name="valor"]','1.001');
 const pay0=postCount('/pagamentos');await submitTwice();verify('fracao de centavo nao chega a API',postCount('/pagamentos')===pay0);
 await fill('input[name="valor"]','1.00');failRefresh=true;await submitTwice();
 verify('pagamento duplicado simultaneo gera somente um POST',postCount('/pagamentos')===pay0+1);
 verify('falha apos pagamento confirmado exibe aviso na tela visivel',await has('Pagamento registrado. Não envie novamente'));
 verify('dados antigos de pagamento nao ficam disponiveis para novo envio',!(await evaluate("!!document.querySelector('input[name=valor]')")));
 failRefresh=false;afterPayment=false;await home();detailFailure=true;await click(clients[0].nome);
 verify('falha no detalhe e visivel e nao fica carregando',await has('Não foi possível carregar os detalhes da venda.'));detailFailure=false;
 statusOverride=500;await home();verify('falha inicial de validacao nao libera painel',await evaluate("!!document.querySelector('.login-pagina')"));statusOverride=0;
 await home();statusOverride=401;await nav(2);await pause(500);
 verify('sessao expirada retorna ao login',await evaluate("!!document.querySelector('.login-pagina')"));
 verify('sessao expirada remove token e dados da sessao',await evaluate("!sessionStorage.getItem('quitai_token')&&!localStorage.getItem('quitai_token')"));statusOverride=0;
 await fill('#email','fixture@example.invalid');await fill('#senha','senha-sintetica-nao-real');
 const login0=postCount('/auth/login');await evaluate("(()=>{const f=document.querySelector('.login-formulario');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})()");await pause(750);
 verify('login duplo gera somente uma requisicao',postCount('/auth/login')===login0+1);
 await nav(4);await click('Sair da conta');await click('Sim, sair');await pause(400);
 verify('logout elimina estado anterior e volta ao login',await evaluate("!!document.querySelector('.login-pagina')&&!sessionStorage.getItem('quitai_token')"));
 verify('nenhuma excecao React durante os cenarios',!logs.some(l=>l.tipo==='exception'));
 verify('nenhum log de payload de negocio',!logs.some(l=>l.tipo==='log'));
 fs.writeFileSync(path.join(out,'regressoes-browser.json'),JSON.stringify({checks,calls,logs},null,2));
 console.log(JSON.stringify({aprovados:checks.length,checks},null,2));
}catch(error){
 fs.writeFileSync(path.join(out,'regressoes-browser.json'),JSON.stringify({checks,calls,logs,erro:String(error)},null,2));
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'falha-regressao.png'),Buffer.from(shot.data,'base64'));
 console.error(String(error));process.exitCode=1;
}finally{await send('Page.close');ws.close();}