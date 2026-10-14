/* V6: somente dados autorizados pelo Supabase RLS. Sem persistência local de clientes. */
const V6 = (() => {
 const DAY=86400000;
 const verses=[
  ['O Senhor é o meu pastor; nada me faltará.','Salmos 23:1'],
  ['Tudo posso naquele que me fortalece.','Filipenses 4:13'],
  ['Orai sem cessar.','1 Tessalonicenses 5:17'],
  ['Regozijai-vos sempre.','1 Tessalonicenses 5:16'],
  ['Lâmpada para os meus pés é tua palavra, e luz para o meu caminho.','Salmos 119:105'],
  ['Entrega o teu caminho ao Senhor; confia nele, e ele o fará.','Salmos 37:5'],
  ['Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.','Salmos 46:1'],
  ['O meu socorro vem do Senhor que fez o céu e a terra.','Salmos 121:2'],
  ['A resposta branda desvia o furor, mas a palavra dura suscita a ira.','Provérbios 15:1'],
  ['Todas as vossas coisas sejam feitas com amor.','1 Coríntios 16:14'],
  ['Porque andamos por fé, e não por vista.','2 Coríntios 5:7'],
  ['No princípio criou Deus os céus e a terra.','Gênesis 1:1'],
  ['O Senhor te abençoe e te guarde.','Números 6:24'],
  ['Bem-aventurados os pacificadores, porque eles serão chamados filhos de Deus.','Mateus 5:9']
 ];
 function dateKey(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
 function dayNumber(now=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const v=t=>parts.find(p=>p.type===t).value;return Math.floor(Date.UTC(+v('year'),+v('month')-1,+v('day'))/DAY);}
 function verse(now=new Date()){return verses[((dayNumber(now)%verses.length)+verses.length)%verses.length];}
 function urgency(p,now=new Date()){
  if(!p.active||p.status==='resolved')return 'closed';
  const diff=p.deadline_date?Math.round(Date.parse(p.deadline_date+'T00:00:00Z')/DAY)-dayNumber(now):null;
  if(diff!==null&&diff<0)return 'overdue';
  if(diff===0)return 'today';
  if(diff===1||['Urgente','Muito urgente'].includes(p.priority))return 'urgent';
  if(diff!==null&&diff<=3)return 'soon';
  return 'normal';
 }
 const labels={overdue:'Prazo vencido',today:'Vence hoje',urgent:'Muito urgente',soon:'Prazo próximo',normal:'No fluxo',closed:'Concluído / arquivado'};
 function duration(ms){const mins=Math.floor(Math.max(0,ms)/60000),h=Math.floor(mins/60),d=Math.floor(h/24);return d?`${d}d ${h%24}h`:`${h}h ${mins%60}min`;}
 function periods(events,now=Date.now()){
  const groups=new Map();for(const e of events){if(!groups.has(e.process_id))groups.set(e.process_id,[]);groups.get(e.process_id).push(e);}
  const rows=[];
  for(const es of groups.values()){
   es.sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at)||Number(a.id)-Number(b.id));
   es.forEach((e,i)=>{if(!e.active||e.status==='resolved')return;const end=es[i+1]?Date.parse(es[i+1].recorded_at):now;rows.push({...e,ms:Math.max(0,end-Date.parse(e.recorded_at)),open:!es[i+1],partial:es[0].kind==='baseline'});});
  }return rows;
 }
 // Uma amostra = soma dos períodos da mesma pessoa no mesmo processo/tipo.
 function averages(rows){const samples=new Map();for(const r of rows){const k=JSON.stringify([r.assignee_id,r.process_id,r.task_type]);const x=samples.get(k)||{owner:r.assignee_id,type:r.task_type||'Sem tipo',ms:0,partial:false,open:false};x.ms+=r.ms;x.partial ||=r.partial;x.open ||=r.open;samples.set(k,x);}
  const groups=new Map();for(const x of samples.values()){const k=JSON.stringify([x.owner,x.type]);const g=groups.get(k)||{owner:x.owner,type:x.type,total:0,n:0,partial:0,open:0};g.total+=x.ms;g.n++;g.partial+=Number(x.partial);g.open+=Number(x.open);groups.set(k,g);}return [...groups.values()].map(g=>({...g,mean:g.total/g.n})).sort((a,b)=>b.mean-a.mean);
 }
 return {dateKey,dayNumber,verse,urgency,labels,duration,periods,averages};
})();
if(typeof module!=='undefined')module.exports=V6;
if(typeof document!=='undefined'){
 let eventLog=[],eventError='',loadError='',busy=false;
 const verseHTML=()=>{const [text,ref]=V6.verse();return `<div class="verse"><small>VERSÍCULO DO DIA · ALMEIDA, EDIÇÃO CLÁSSICA</small><blockquote>“${esc(text)}”</blockquote><span>${esc(ref)}</span></div>`;};
 const originalNav=renderNav,originalRender=render,originalTable=renderTable,originalOpen=openProcess;
 view='dashboard';
 renderNav=function(){originalNav();$('sidebar').insertAdjacentHTML('afterbegin',`<button class="nav ${view==='dashboard'?'active':''}" onclick="go('dashboard')">Meu escritório</button><button class="nav ${view==='metrics'?'active':''}" onclick="go('metrics')">Tempos e métricas</button>`);$('mobile').insertAdjacentHTML('afterbegin',`<button onclick="go('dashboard')">Início</button><button onclick="go('metrics')">Tempos</button>`);};
 // Paginação explícita evita truncamento silencioso pelo limite da API.
 async function allRows(table,order){const rows=[];for(let from=0;;from+=500){const {data,error}=await sb.from(table).select('*').order(order).range(from,from+499);if(error)throw error;rows.push(...data);if(data.length<500)return rows;}}
 loadAll=async function(){loadError='';eventError='';const nr=await sb.rpc('generate_deadline_notifications');if(nr.error)loadError='Não foi possível atualizar os avisos. '+nr.error.message;
  try{const r=await Promise.all([sb.from('app_users').select('id,name,role,active,is_admin').order('name'),allRows('processes','id'),sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(200)]);for(const x of [r[0],r[2]])if(x.error)throw x.error;users=r[0].data;processes=r[1];notifications=r[2].data;}catch(e){loadError='Falha ao carregar dados: '+e.message;}
  try{eventLog=await allRows('responsibility_events','id');}catch(e){eventLog=[];eventError='Rastreamento V6 indisponível. A migração precisa estar instalada; nenhum tempo será estimado.';}
 };
 function badge(p){const u=V6.urgency(p);return `<span class="pill urgency-${u}">${V6.labels[u]}</span>`;}
 function summary(list){const count=u=>list.filter(p=>V6.urgency(p)===u).length;return `<div class="stats">${[['overdue','Vencidos'],['today','Hoje'],['urgent','Muito urgentes'],['soon','Em até 3 dias']].map(([u,l])=>`<div class="card stat urgency-${u}"><span>${l}</span><b>${count(u)}</b></div>`).join('')}<div class="card stat"><span>Minha fila ativa</span><b>${list.filter(p=>p.active&&p.status!=='resolved').length}</b></div></div>`;}
 function dashboard(){const own=processes.filter(p=>p.assignee_id===me.id&&p.active&&p.status!=='resolved');const scope=me.role==='supervisora'?processes.filter(p=>p.active&&p.status!=='resolved'):own;const order={overdue:0,today:1,urgent:2,soon:3,normal:4};const urgent=scope.filter(p=>['overdue','today','urgent','soon'].includes(V6.urgency(p))).sort((a,b)=>order[V6.urgency(a)]-order[V6.urgency(b)]||String(a.deadline_date||'9999').localeCompare(b.deadline_date||'9999'));const area=me.role==='supervisora'?'Correção e supervisão':me.role==='administrativo'?'Administrativo / INSS':'Judicial';
  $('main').innerHTML=`<div class="row between"><div><small class="eyebrow">ESCRITÓRIO ONLINE · ${esc(area)}</small><h1>Olá, ${esc(me.name)}</h1><p class="muted">Seus prazos, responsabilidades e próximos passos.</p></div><button class="btn" onclick="openProcess()">+ Nova atribuição</button></div>${verseHTML()}${loadError?`<div role="alert" class="notice error">${esc(loadError)}</div>`:''}${summary(own)}${me.role==='supervisora'?`<div class="notice">Visão do escritório: ${scope.filter(p=>p.status==='correction').length} em correção · ${scope.filter(p=>V6.urgency(p)==='overdue').length} vencidos. O tempo da supervisão entra nas mesmas métricas.</div>`:''}${own.some(p=>V6.urgency(p)==='overdue')?'<div class="deadline-meme" role="alert"><span aria-hidden="true">⏰ 👀</span><div><b>O prazo correu mais que a gente!</b><p>Respira, abre a fila e vamos organizar o próximo passo. Sem caça aos culpados.</p></div></div>':''}<div class="card"><h2>Prioridades ${me.role==='supervisora'?'do escritório':'da minha fila'}</h2>${urgent.map(p=>`<div class="priority-row"><div>${badge(p)} <b>${esc(p.client_name)}</b><p>${esc(p.task_type||'')} · ${esc(userName(p.assignee_id))} · ${p.deadline_date?fmt(p.deadline_date):'Sem prazo definido'}</p></div><button class="btn gray" onclick="openProcess('${p.id}')">Abrir</button></div>`).join('')||'<p class="muted">Nenhum prazo próximo ou urgente.</p>'}<button class="btn" onclick="go('my')">Abrir minha fila completa</button></div>`;
 }
 function metrics(){const rows=V6.periods(eventLog),groups=V6.averages(rows),people=users.map(u=>{const samples=new Map();for(const r of rows.filter(r=>r.assignee_id===u.id))samples.set(r.process_id,(samples.get(r.process_id)||0)+r.ms);const total=[...samples.values()].reduce((a,b)=>a+b,0);return {...u,n:samples.size,total,mean:samples.size?total/samples.size:null};}).sort((a,b)=>(b.mean??-1)-(a.mean??-1));
  const completed=[];const byProcess=new Map();for(const e of eventLog){if(!byProcess.has(e.process_id))byProcess.set(e.process_id,[]);byProcess.get(e.process_id).push(e);}for(const es of byProcess.values()){es.sort((a,b)=>Number(a.id)-Number(b.id));if(es[0].kind!=='created')continue;const end=es.find(e=>e.status==='resolved');if(end)completed.push(Date.parse(end.recorded_at)-Date.parse(es[0].recorded_at));}
  $('main').innerHTML=`<h1>Tempos e métricas</h1><div class="notice">Tempo de posse = tempo corrido sob responsabilidade, incluindo noites, fins de semana, espera e revisão. Não mede horas trabalhadas nem produtividade. Compare tipos e volume semelhantes. Todos participam, inclusive Dra. Kleíne.</div>${eventError?`<div class="notice error">${esc(eventError)}</div>`:''}<div class="card"><h2>Entrada até primeira conclusão</h2><p>${completed.length?V6.duration(completed.reduce((a,b)=>a+b,0)/completed.length):'Sem amostras completas'} · ${completed.length} tarefa(s) criadas após ativação. Processos antigos não entram nesta média.</p></div><div class="card"><h2>Ranking por média de posse observada por processo</h2><p class="muted">Maior média primeiro; inclui períodos abertos e observação parcial de processos antigos. Não é ranking de eficiência.</p><div class="tablewrap"><table class="table"><thead><tr><th>Pessoa</th><th>Processos observados</th><th>Total de posse</th><th>Média por processo</th></tr></thead><tbody>${people.map(u=>`<tr><td>${esc(u.name)}</td><td>${u.n}</td><td>${V6.duration(u.total)}</td><td>${u.mean===null?'Sem amostras':V6.duration(u.mean)}</td></tr>`).join('')}</tbody></table></div></div><div class="card"><h2>Média por pessoa e tipo de tarefa</h2><div class="tablewrap"><table class="table"><thead><tr><th>Pessoa</th><th>Tipo</th><th>Processos</th><th>Média</th><th>Abertos</th><th>Histórico parcial</th></tr></thead><tbody>${groups.map(g=>`<tr><td>${esc(userName(g.owner))}</td><td>${esc(g.type)}</td><td>${g.n}</td><td>${V6.duration(g.mean)}</td><td>${g.open}</td><td>${g.partial}</td></tr>`).join('')||'<tr><td colspan="6">Sem dados observados.</td></tr>'}</tbody></table></div></div>`;
 }
 render=function(){if(!me)return;if(view==='dashboard')return dashboard();if(view==='metrics')return metrics();originalRender();if($('main')&&loadError)$('main').insertAdjacentHTML('afterbegin',`<div class="notice error">${esc(loadError)}</div>`);};
 renderTable=function(){originalTable();for(const row of $('tbl').querySelectorAll('tbody tr')){const button=row.querySelector('button');if(!button)continue;const id=button.getAttribute('onclick').match(/'([^']+)'/)?.[1];const p=processes.find(x=>x.id===id);if(p)row.children[5].insertAdjacentHTML('beforeend',`<br>${badge(p)}`);}};
 openProcess=function(id=''){originalOpen(id);const p=editing;$('fOwner').innerHTML=users.filter(u=>u.active||u.id===p?.assignee_id).map(u=>`<option value="${u.id}" ${u.id===p?.assignee_id?'selected':''}>${esc(u.name)}</option>`).join('');autoRoute();$('fDeadline').closest('.field').insertAdjacentHTML('afterend',`<div class="field"><label for="fPriority">Prioridade</label><select id="fPriority"><option>Normal</option><option>Urgente</option><option>Muito urgente</option></select></div>`);$('fPriority').value=p?.priority||'Normal';if(p)showTimeline(p.id);};
 async function showTimeline(id){const box=document.createElement('section');box.className='card';$('processForm').appendChild(box);const es=eventLog.filter(e=>e.process_id===id);const rows=V6.periods(es);const total=rows.reduce((a,b)=>a+b.ms,0);box.innerHTML=`<h3>Histórico auditável V6</h3>${eventError?`<p>${esc(eventError)}</p>`:`<p>Posse observada: ${V6.duration(total)}. ${es[0]?.kind==='baseline'?'Processo anterior à V6: observação parcial, sem reconstrução do passado.':''}</p><ol>${es.map(e=>`<li>${new Date(e.recorded_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} · ${e.kind==='baseline'?'Início da observação':e.kind==='created'?'Entrada':'Alteração'} · ${esc(userName(e.assignee_id))} · ${esc(statusLabel(e.status))} · ${esc(e.task_type||'')} · registrado por ${esc(e.actor_id?userName(e.actor_id):'sistema')}</li>`).join('')}</ol>`}`;
  const byOwner=new Map();for(const r of rows)byOwner.set(r.assignee_id,(byOwner.get(r.assignee_id)||0)+r.ms);
  box.insertAdjacentHTML('beforeend',`<h3>Posse observada por pessoa</h3><ul>${[...byOwner].map(([owner,ms])=>`<li>${esc(userName(owner))}: ${V6.duration(ms)}</li>`).join('')||'<li>Sem períodos observados.</li>'}</ul><p class="muted">Tempo corrido; não representa trabalho efetivo. Períodos sem responsável aparecem como “—”.</p>`);
  const {data,error}=await sb.from('activities').select('action,created_at,actor_id').eq('process_id',id).order('created_at');if(!box.isConnected)return;if(error)box.insertAdjacentHTML('beforeend','<p>Não foi possível carregar o histórico anterior.</p>');else box.insertAdjacentHTML('beforeend',`<h3>Histórico anterior / operacional</h3><ul>${(data||[]).map(e=>`<li>${new Date(e.created_at).toLocaleString('pt-BR')} · ${esc(e.action)} · ${esc(userName(e.actor_id))}</li>`).join('')||'<li>Sem registros.</li>'}</ul>`);
 }
 // Bloqueia cliques duplicados; o formulário base usa updated_at para detectar concorrência.
 const originalSave=saveProcess,originalReturn=returnResponsibility;
 returnResponsibility=async function(){if(busy)return;busy=true;try{await originalReturn();}finally{busy=false;}};
 saveProcess=async function(){if(busy)return;busy=true;try{await originalSave();}catch(e){if($('formMsg'))msg('formMsg',e.message,'error');}finally{busy=false;}};
 setupRealtime=function(){if(realtime)sb.removeChannel(realtime);realtime=sb.channel('fluxo-v6').on('postgres_changes',{event:'*',schema:'public',table:'processes'},async()=>{await loadAll();renderNav();render();}).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${me.id}`},p=>{notifications.unshift(p.new);renderNav();if('Notification'in window&&Notification.permission==='granted')try{new Notification('Aviso do escritório',{body:'Entre no Fluxo Jurídico para consultar sua fila.'});}catch(e){}if(view==='notifications')render();}).subscribe();};
 $('auth').querySelector('.loginbox').insertAdjacentHTML('afterbegin','<img class="office-logo" src="logo.png" alt="Ana Kleíne Soares Pereira — Advogada">');
 $('auth').querySelector('.muted').insertAdjacentHTML('afterend',verseHTML()+'<div class="notice">Prazos e urgências estão disponíveis após entrar. Informações do escritório são restritas à equipe.</div>');
 $('app').querySelector('.brand').innerHTML='<img class="header-logo" src="logo.png" alt="Ana Kleíne Soares Pereira"><span>Fluxo Jurídico <small>V6</small></span>';
 $('app').querySelector('[onclick="requestNotifPermission()"]').textContent='Avisos neste navegador';
 let lastDay=V6.dayNumber();setInterval(async()=>{const day=V6.dayNumber();if(day!==lastDay){lastDay=day;if(me){await loadAll();render();}else location.reload();}else if(me&&['dashboard','metrics'].includes(view)&&!$('processModal').classList.contains('show'))render();},60000);
 document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&me){await loadAll();renderNav();render();}});
}
