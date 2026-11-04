const API = 'https://threejs-studio-api.onrender.com';
const $ = id => document.getElementById(id);
let session = null;
let pollTimer = null;
let loading = false;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const projectPattern = /^[a-zA-Z0-9_-]{1,64}$/;
function message(text, kind = '') {
  $('status').textContent = text;
  $('status').className = 'status ' + kind;
}
function commandOutput(value) { $('command-output').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function connected(value) {
  for (const el of document.querySelectorAll('.action')) el.disabled = !value;
  $('refresh').disabled = !value;
  $('disconnect').disabled = !value;
  $('login-form').querySelector('button[type=submit]').disabled = value;
  $('project').disabled = value;
  $('token').disabled = value;
}
function path() { return '/api/projects/' + encodeURIComponent(session.project) + '/scene'; }
async function request(route, method = 'GET', payload) {
  if (!session) throw Error('Conecte-se primeiro.');
  const response = await fetch(API + route, {
    method,
    headers: { 'Authorization': 'Bearer ' + session.token,
      ...(payload === undefined ? {} : {'Content-Type':'application/json'}) },
    ...(payload === undefined ? {} : {body: JSON.stringify(payload)}),
    cache: 'no-store'
  });
  if (!response.ok) {
    let body = '';
    try { body = (await response.json()).error || ''; } catch {}
    throw Error('HTTP ' + response.status + (body ? ': ' + body : ''));
  }
  return response.json();
}
function parseVec(value, label) {
  const nums = value.split(',').map(s => Number(s.trim()));
  if (nums.length !== 3 || nums.some(n => !Number.isFinite(n))) throw Error(label + ': use três números separados por vírgulas.');
  return nums;
}
function parseOptionalVec(id, label) {
  const text = $(id).value.trim();
  return text ? parseVec(text, label) : undefined;
}
function selectedId() {
  const id = $('object-id').value.trim();
  if (!uuidPattern.test(id)) throw Error('Selecione um objeto da cena ou informe UUID válido.');
  return id;
}
function projectStatus(data) {
  $('online').textContent = String(data.connectedEditors ?? '—');
  $('count').textContent = String(data.objects?.length ?? 0);
  $('pending').textContent = String(data.pendingCommands ?? 0);
  const a = data.lastAck;
  $('ack').textContent = a ? 'Última confirmação: ' + a.status + (a.error ? ' — ' + a.error : '') + ' (' + a.id.slice(0,8) + ')' : 'Última confirmação: —';
}
function showObjects(objects) {
  const wrap = $('objects');
  wrap.replaceChildren();
  if (!objects.length) {
    const empty = document.createElement('p');
    empty.className = 'muted'; empty.style.padding = '12px';
    empty.textContent = 'Nenhum objeto recebido. Mantenha o editor 3D conectado.';
    wrap.append(empty); return;
  }
  for (const o of objects.slice(0,300)) {
    const row = document.createElement('div'); row.className = 'object-row';
    const content = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = o.name || o.type || 'Objeto';
    const id = document.createElement('code'); id.textContent = o.id || '';
    const detail = document.createElement('small');
    detail.textContent = (o.type || '') + (Array.isArray(o.position) ? ' • posição ' + o.position.join(', ') : '');
    content.append(title,id,detail);
    const btn = document.createElement('button'); btn.className='secondary'; btn.type='button';
    btn.textContent='Selecionar'; btn.addEventListener('click', () => {
      $('object-id').value = o.id || '';
      $('new-position').value = Array.isArray(o.position) ? o.position.join(', ') : '';
      $('new-scale').value = Array.isArray(o.scale) ? o.scale.join(', ') : '';
      $('new-rotation').value = '';
      $('new-name').value = o.name || '';
      $('new-color').value = o.color || '';
      message('Objeto selecionado: ' + (o.name || o.type) + '.', 'ok');
    });
    row.append(content,btn); wrap.append(row);
  }
  if (objects.length > 300) {
    const p=document.createElement('p');p.className='muted';p.textContent='Exibindo 300 de '+objects.length+' objetos.';wrap.append(p);
  }
}
async function refresh(silent = false) {
  if (!session || loading) return;
  loading = true;
  try {
    const result = await request(path());
    projectStatus(result);
    showObjects(result.objects || []);
    if (!silent) message('Cena atualizada. Editores conectados: ' + result.connectedEditors, 'ok');
  } catch (e) {
    if (!silent) message('Falha ao consultar cena: ' + e.message, 'error');
  } finally { loading = false; }
}
async function send(cmd) {
  if (!session) throw Error('Não conectado.');
  const result = await request('/api/commands', 'POST', {...cmd, project:session.project});
  commandOutput(result);
  message('Comando enviado à API. ' + (result.connectedEditors ? 'Aguardando o editor aplicar.' : 'Nenhum editor conectado; comando ficou na fila.'), 'ok');
  setTimeout(() => refresh(true), 1000);
  return result;
}
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (session) return;
  const token = $('token').value.trim(), project = $('project').value.trim();
  if (token.length < 8 || !projectPattern.test(project)) {message('Token ou nome do projeto inválido.', 'error');return;}
  session = {token,project}; $('login-form').querySelector('button[type=submit]').disabled = true;
  try {
    const data = await request(path());
    connected(true); projectStatus(data); showObjects(data.objects || []);
    message('Conectado à API. ' + data.connectedEditors + ' editor(es) na cena.', 'ok');
    pollTimer=setInterval(() => refresh(true), 6000);
  } catch (err) {
    session=null;connected(false);
    message('Falha na conexão: ' + err.message, 'error');
  }
});
$('disconnect').addEventListener('click', () => {
  clearInterval(pollTimer);pollTimer=null;session=null;$('token').value='';
  connected(false);message('Desconectado. O token foi descartado da memória desta página.');
  $('objects').replaceChildren();$('online').textContent=$('count').textContent=$('pending').textContent='—';
});
$('refresh').addEventListener('click', () => refresh());
$('create-form').addEventListener('submit',async e => {
  e.preventDefault();
  try {
    await send({
      action:'create', shape:$('shape').value, name:$('object-name').value.trim(),
      position:parseVec($('position').value,'Posição'), scale:parseVec($('scale').value,'Escala'),
      color:$('color').value
    });
  } catch(e) { message(e.message,'error'); }
});
$('transform').addEventListener('click', async () => {
  try {
    const cmd={action:'transform',objectId:selectedId()};
    for (const [field,id] of [['position','new-position'],['rotation','new-rotation'],['scale','new-scale']]) {
      const value=parseOptionalVec(id,field); if(value) cmd[field]=value;
    }
    if(!cmd.position && !cmd.rotation && !cmd.scale) throw Error('Preencha posição, rotação ou escala.');
    await send(cmd);
  } catch(e) { message(e.message,'error'); }
});
$('rename').addEventListener('click', async () => {
  try {
    const name=$('new-name').value.trim();if(!name)throw Error('Preencha o novo nome.');
    await send({action:'rename',objectId:selectedId(),name});
  }catch(e){message(e.message,'error');}
});
$('recolor').addEventListener('click', async () => {
  try {
    const color=$('new-color').value.trim();
    if(!/^#[a-f0-9]{6}$/i.test(color))throw Error('Informe cor no formato #aabbcc.');
    await send({action:'material',objectId:selectedId(),color});
  } catch(e){message(e.message,'error');}
});
$('delete').addEventListener('click', async () => {
  try {
    const objectId=selectedId();
    if(!confirm('Excluir o objeto ' + objectId + '?')) return;
    await send({action:'delete',objectId});
  }catch(e){message(e.message,'error');}
});
$('submit-scene-file').addEventListener('click', async () => {
  try {
    const file=$('scene-file').files?.[0];
    if(!file) throw Error('Escolha um arquivo JSON de construção.');
    if(file.size>19*1024*1024) throw Error('O arquivo precisa ter menos de 19 MiB.');
    const command=JSON.parse(await file.text());
    if(!command||Array.isArray(command)||command.action!=='build_scene'||!Array.isArray(command.objects))
      throw Error('O JSON precisa conter action: "build_scene" e uma lista objects.');
    const result=await request('/api/commands','POST',{...command,project:session.project});
    commandOutput(result);
    message('Cena enviada: '+result.objectsCreated+' peças, '+result.vertexCount+' vértices. Aguardando o editor.','ok');
    setTimeout(()=>refresh(true),1500);
  }catch(e){message('Falha ao construir cena: '+e.message,'error');}
});
$('submit-json').addEventListener('click', async () => {
  try {
    const parsed=JSON.parse($('commands-json').value);
    const cmds=Array.isArray(parsed)?parsed:[parsed];
    if(!cmds.length || cmds.length>30)throw Error('Informe entre 1 e 30 comandos.');
    for(const c of cmds) {
      if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.action!=='string')
        throw Error('Cada comando precisa ser um objeto com action.');
    }
    const results=[]; for(let i=0;i<cmds.length;i++){
      results.push(await request('/api/commands','POST',{...cmds[i],project:session.project}));
    }
    commandOutput({sent:results.length,results});
    message(results.length+' comando(s) enviado(s). Confira a cena no editor.','ok');
    setTimeout(()=>refresh(true),1200);
  }catch(e){message('Falha ao enviar comandos JSON: '+e.message,'error');}
});
