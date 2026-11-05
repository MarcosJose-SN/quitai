import fs from 'node:fs'
import path from 'node:path'
const out=process.argv[2];if(!out||!fs.existsSync(out))throw Error('Informe diretorio de evidencias; Chrome isolado 9223.')
const page=await(await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'})).json()
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
let serial=0;const pending=new Map(),checks=[],exceptions=[],harnessWarnings=[];let rejeitar=0,emailRequests=0,sse=0
const user={id:3,nome:'Admin Sintetico',email:'admin@example.invalid',perfil:'admin',ativo:true}
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}
ws.addEventListener('message',async e=>{
 const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)(m.error?p.reject(m.error):p.resolve(m.result));return}
 if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text)
 if(m.method!=='Fetch.requestPaused')return
 const {requestId,request}=m.params,u=new URL(request.url)
 try{
  if(u.origin==='http://localhost:5174'){await send('Fetch.continueRequest',{requestId});return}
  if(u.origin!=='http://localhost:8082'){await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});return}
  const headers=[{name:'Access-Control-Allow-Origin',value:'http://localhost:5174'},{name:'Access-Control-Allow-Headers',value:'Authorization,Content-Type,Idempotency-Key'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,PATCH,OPTIONS'},{name:'Content-Type',value:'application/json'}]
  if(request.method==='OPTIONS'){await send('Fetch.fulfillRequest',{requestId,responseCode:204,responseHeaders:headers});return}
  if(u.pathname.endsWith('/eventos')){sse++;if(!rejeitar)return}
  let code=rejeitar||200,data=rejeitar?{mensagem:'Sessao revogada.'}:{}
  if(!rejeitar){
   if(u.pathname==='/auth/me')data=user
   if(u.pathname==='/admin/dashboard')data={total_revendedoras:1,contas_ativas:1,contas_bloqueadas:0,novos_cadastros_30_dias:1}
   if(u.pathname==='/admin/perfil/foto'){code=404;data={mensagem:'Sem foto.'}}
   if(u.pathname==='/admin/suporte')data=[{id:1,revendedora_nome:'Revendedora Sintetica',revendedora_email:'rev@example.invalid',assunto:'Chamado Sintetico',categoria:'Duvidas',status:'aberto',atualizado_em:'2026-11-05T10:00:00Z'}]
   if(u.pathname==='/admin/suporte/1')data={id:1,revendedora_nome:'Revendedora Sintetica',assunto:'Chamado Sintetico',status:'aberto',mensagens:[]}
   if(u.pathname==='/admin/minha-conta'&&request.method==='PUT'){
    emailRequests++;const b=JSON.parse(request.postData)
    if(b.senha_atual!=='SenhaSintetica123!'){code=401;data={codigo:'senha_atual_incorreta',mensagem:'Senha atual incorreta.'}}
    else if(!b.codigo_email){code=202;data={email_pendente:true,mensagem:'Confirme o codigo no novo endereco.'}}
    else data={codigo:'reautenticar',mensagem:'Email confirmado.'}
   }
  }
  await send('Fetch.fulfillRequest',{requestId,responseCode:code,responseHeaders:headers,body:Buffer.from(JSON.stringify(data)).toString('base64')})
 }catch(err){harnessWarnings.push({code:err.code,message:err.message});if(![-32000,-32602].includes(err.code))exceptions.push('Falha inesperada no harness')}
})
await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(100)}throw Error('Condicao de navegador nao atingida: '+expression)}
function verify(name,value){checks.push({name,aprovado:!!value});if(!value)throw Error(name)}
async function click(text){await until(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes(${JSON.stringify(text)}))`);await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`);await pause(150)}
async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`)}
await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(!sessionStorage.getItem('auth-fixture-inicializada')){sessionStorage.setItem('auth-fixture-inicializada','1');sessionStorage.setItem('quitai_token','fixture-invalida-fora-dos-mocks');sessionStorage.setItem('quitai_usuario',${JSON.stringify(JSON.stringify(user))})}`})
try{
 await send('Page.navigate',{url:'http://localhost:5174/admin'});await until(`!!document.querySelector('.admin-nav-item')`)
 verify('administrador autenticado abre painel',await evaluate(`document.body.innerText.includes('Admin Sintetico')`))
 await click('Central de Suporte');await until(`document.body.innerText.includes('Chamado Sintetico')`);verify('Central de Suporte preservada',true)
 await click('Minha conta');await click('Editar nome e e-mail');await until(`!!document.querySelector('input[type=email]')`)
 await fill('input[type=email]','novo@example.invalid');await until(`!!document.querySelector('input[autocomplete=current-password]')`)
 await click('Salvar altera');verify('alteracao de email exige senha antes do envio',emailRequests===0)
 await fill('input[autocomplete=current-password]','errada');await click('Salvar altera');await until(`document.body.innerText.includes('Senha atual incorreta.')`)
 verify('senha incorreta nao encerra sessao administrativa',await evaluate(`!!sessionStorage.getItem('quitai_token')&&!!document.querySelector('.admin-nav-item')`))
 await fill('input[autocomplete=current-password]','SenhaSintetica123!');await click('Salvar altera');await until(`document.body.innerText.includes('Confirme o codigo')`)
 verify('confirmacao pendente preserva sessao e email anterior',await evaluate(`JSON.parse(sessionStorage.getItem('quitai_usuario')).email==='admin@example.invalid'`))
 await fill('input[autocomplete=one-time-code]','123456');await click('Salvar altera');await until(`!!document.querySelector('.login-pagina')`)
 verify('email confirmado exige novo login e limpa dados administrativos',await evaluate(`!sessionStorage.getItem('quitai_token')&&!document.querySelector('.admin-shell')`))
 await evaluate(`sessionStorage.setItem('quitai_token','fixture-invalida-fora-dos-mocks');sessionStorage.setItem('quitai_usuario',${JSON.stringify(JSON.stringify(user))})`)
 await send('Page.navigate',{url:'http://localhost:5174/admin'});await until(`!!document.querySelector('.admin-nav-item')`);await pause(600);rejeitar=401
 await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Central de Suporte'));if(b)b.click()})()`);await until(`!!document.querySelector('.login-pagina')`)
 verify('revogacao detectada no suporte remove painel e token',await evaluate(`!sessionStorage.getItem('quitai_token')&&!document.querySelector('.admin-shell')`))
 verify('nenhuma excecao React',exceptions.length===0)
 fs.writeFileSync(path.join(out,'admin-autenticacao.json'),JSON.stringify({checks,exceptions,harnessWarnings},null,2));console.log(JSON.stringify({aprovados:checks.length,checks},null,2))
}catch(err){fs.writeFileSync(path.join(out,'admin-autenticacao.json'),JSON.stringify({checks,exceptions,harnessWarnings,erro:String(err)},null,2));throw err}
finally{await send('Page.close');ws.close()}
