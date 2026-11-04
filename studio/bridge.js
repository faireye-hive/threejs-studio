/** Authenticated command bridge for the official three.js Editor. No remote eval. */
import * as THREE from 'three';
import { AddObjectCommand } from './js/commands/AddObjectCommand.js';
import { RemoveObjectCommand } from './js/commands/RemoveObjectCommand.js';
import { SetPositionCommand } from './js/commands/SetPositionCommand.js';
import { SetRotationCommand } from './js/commands/SetRotationCommand.js';
import { SetScaleCommand } from './js/commands/SetScaleCommand.js';
import { SetValueCommand } from './js/commands/SetValueCommand.js';
import { SetMaterialColorCommand } from './js/commands/SetMaterialColorCommand.js';
import { SetMaterialValueCommand } from './js/commands/SetMaterialValueCommand.js';

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
let editor;
for (let i = 0; i < 300; i++) {
  if (window.editor?.scene && document.getElementById('viewport')) { editor = window.editor; break; }
  await delay(100);
}
if (!editor) throw new Error('Editor Three.js not ready');
const panel = document.createElement('aside');
panel.id = 'studio-panel';
panel.innerHTML = `
 <button type="button" id="studio-toggle" aria-expanded="false">◈ API / IA <span id="studio-led">●</span></button>
 <section id="studio-config" hidden>
  <strong>Three.js Studio · Edição remota</strong>
  <label>URL HTTPS da API<input id="studio-url" type="url" placeholder="https://nome.onrender.com" autocomplete="off"></label>
  <label>STUDIO_TOKEN<input id="studio-token" type="password" autocomplete="off" spellcheck="false"></label>
  <label>Projeto<input id="studio-project" type="text" value="main" maxlength="64"></label>
  <nav><button id="studio-connect" type="button">Conectar</button><button id="studio-disconnect" type="button" disabled>Desconectar</button></nav>
  <nav><button id="studio-test" type="button" disabled>Criar esfera de teste</button></nav>
  <p id="studio-status" role="status">Desconectado.</p>
  <small>O token permite editar sua cena. Não divulgue nem insira no código público.</small>
 </section>`;
document.body.append(panel);
const $ = id => panel.querySelector('#' + id);
const toggle = $('studio-toggle'), config = $('studio-config'), status = $('studio-status');
const url = $('studio-url'), token = $('studio-token'), project = $('studio-project');
const connectBtn = $('studio-connect'), disconnectBtn = $('studio-disconnect'), testBtn = $('studio-test'), led = $('studio-led');
try {
  const saved = JSON.parse(sessionStorage.getItem('threejs-studio') || '{}');
  url.value = saved.url || 'https://threejs-studio-api.onrender.com';
  project.value = saved.project || 'main';
} catch {}
toggle.addEventListener('click', () => {
  config.hidden = !config.hidden;
  toggle.setAttribute('aria-expanded', String(!config.hidden));
});
let connection = null, syncTimeout, syncing = false;
const applied = new Set();
function note(msg, online = false) {
  status.textContent = msg;
  led.classList.toggle('connected', online);
}
function inventory() {
  const result = [];
  editor.scene.traverse(o => {
    if (o === editor.scene || result.length >= 3000) return;
    const material = Array.isArray(o.material) ? o.material[0] : o.material;
    result.push({
      id: o.uuid, name: o.name || '', type: o.type,
      position: o.position.toArray(), rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
      scale: o.scale.toArray(),
      color: material?.color?.getHexString ? '#' + material.color.getHexString() : null
    });
  });
  return result;
}
async function call(c, path, method = 'GET', data, signal) {
  const r = await fetch(c.url + path, {
    method,
    headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/json, text/event-stream',
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    ...(signal ? { signal } : {})
  });
  if (!r.ok) throw Error('HTTP ' + r.status + ': ' + (await r.text()).slice(0, 150));
  return r;
}
async function sync(c) {
  if (c !== connection || !c.connected || syncing) return;
  syncing = true;
  try { await call(c, '/api/projects/' + c.project + '/scene', 'POST', { objects: inventory() }); }
  catch (e) { note('Erro ao sincronizar: ' + e.message); }
  finally { syncing = false; }
}
function syncSoon() {
  if (!connection?.connected) return;
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => sync(connection), 700);
}
for (const name of ['objectAdded', 'objectChanged', 'objectRemoved', 'materialChanged',
  'geometryChanged', 'sceneGraphChanged', 'editorCleared']) editor.signals[name]?.add(syncSoon);
function getObject(id) {
  const obj = editor.objectByUuid(id);
  return obj && obj !== editor.scene ? obj : null;
}
function primitive(shape) {
  switch (shape) {
    case 'box': return new THREE.BoxGeometry(1, 1, 1);
    case 'sphere': return new THREE.SphereGeometry(.5, 32, 24);
    case 'cylinder': return new THREE.CylinderGeometry(.5, .5, 1, 32);
    case 'cone': return new THREE.ConeGeometry(.5, 1, 32);
    case 'plane': return new THREE.PlaneGeometry(1, 1);
    case 'torus': return new THREE.TorusGeometry(.5, .15, 12, 48);
    case 'capsule': return new THREE.CapsuleGeometry(.35, .7, 6, 16);
    case 'icosahedron': return new THREE.IcosahedronGeometry(.5, 1);
    case 'octahedron': return new THREE.OctahedronGeometry(.5, 0);
    case 'tetrahedron': return new THREE.TetrahedronGeometry(.5, 0);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(.5, 0);
    case 'ring': return new THREE.RingGeometry(.25, .5, 32);
    case 'circle': return new THREE.CircleGeometry(.5, 32);
    default: throw Error('Unknown shape');
  }
}
function customGeometry(item) {
  if (item.shape !== 'mesh') return primitive(item.shape);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(item.positions, 3));
  if (item.indices) geometry.setIndex(item.indices);
  if (item.normals) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(item.normals, 3));
  else geometry.computeVertexNormals();
  if (item.uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(item.uvs, 2));
  if (item.colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(item.colors, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
function buildScene(cmd) {
  const root = new THREE.Group(); root.uuid = cmd.objectId; root.name = cmd.name;
  const groups = new Map();
  for (const item of cmd.objects) {
    let parent = root;
    if (item.group) {
      if (!groups.has(item.group)) { const group = new THREE.Group(); group.name = item.group; groups.set(item.group, group); root.add(group); }
      parent = groups.get(item.group);
    }
    const material = new THREE.MeshStandardMaterial({ color:item.color, roughness:item.roughness ?? .7,
      metalness:item.metalness ?? .05, vertexColors:!!item.colors,
      side:['plane','ring','circle'].includes(item.shape) ? THREE.DoubleSide : THREE.FrontSide });
    const mesh = new THREE.Mesh(customGeometry(item), material);
    mesh.uuid = item.objectId; mesh.name = item.name;
    mesh.position.fromArray(item.position); mesh.rotation.fromArray(item.rotation); mesh.scale.fromArray(item.scale);
    parent.add(mesh);
  }
  return root;
}
function apply(cmd) {
  if (cmd.action === 'build_scene') {
    if (!getObject(cmd.objectId)) editor.execute(new AddObjectCommand(editor, buildScene(cmd)));
    return;
  }
  if (cmd.action === 'create') {
    if (getObject(cmd.objectId)) return;
    const geo = primitive(cmd.shape);
    const mat = new THREE.MeshStandardMaterial({ color: cmd.color, roughness: .7, metalness: .05,
      side: cmd.shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.uuid = cmd.objectId; mesh.name = cmd.name;
    mesh.position.fromArray(cmd.position); mesh.scale.fromArray(cmd.scale);
    editor.execute(new AddObjectCommand(editor, mesh));
    return;
  }
  const o = getObject(cmd.objectId);
  if (!o) { if (cmd.action === 'delete') return; throw Error('Objeto não encontrado: ' + cmd.objectId); }
  if (cmd.action === 'transform') {
    if (cmd.position) editor.execute(new SetPositionCommand(editor, o, new THREE.Vector3(...cmd.position)));
    if (cmd.rotation) editor.execute(new SetRotationCommand(editor, o, new THREE.Euler(...cmd.rotation)));
    if (cmd.scale) editor.execute(new SetScaleCommand(editor, o, new THREE.Vector3(...cmd.scale)));
  } else if (cmd.action === 'material') {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) throw Error('Sem material de malha simples');
    if (cmd.color) editor.execute(new SetMaterialColorCommand(editor, o, 'color', parseInt(cmd.color.slice(1), 16)));
    if (cmd.roughness !== undefined) editor.execute(new SetMaterialValueCommand(editor, o, 'roughness', cmd.roughness));
    if (cmd.metalness !== undefined) editor.execute(new SetMaterialValueCommand(editor, o, 'metalness', cmd.metalness));
  } else if (cmd.action === 'rename') {
    editor.execute(new SetValueCommand(editor, o, 'name', cmd.name));
    editor.signals.sceneGraphChanged.dispatch();
  } else if (cmd.action === 'delete') {
    editor.execute(new RemoveObjectCommand(editor, o));
  } else throw Error('Ação desconhecida');
}
async function handle(c, cmd) {
  if (connection !== c) return;
  const key = c.project + ':' + cmd.id;
  let state = 'ok', error = '';
  try {
    if (!applied.has(key)) { apply(cmd); applied.add(key); syncSoon(); }
    note('Comando aplicado: ' + cmd.action, true);
  } catch (e) {
    state = 'error'; error = String(e.message || e); note('Erro: ' + error);
  }
  try { await call(c, '/api/projects/' + c.project + '/ack', 'POST', { id: cmd.id, status: state, error }); }
  catch { /* replay on reconnect */ }
}
async function stream(c) {
  const response = await call(c, '/api/projects/' + c.project + '/events', 'GET', undefined, c.controller.signal);
  if (!response.body) throw Error('SSE indisponível');
  c.connected = true; testBtn.disabled = false; note('Conectado à API.', true); syncSoon();
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buf = '';
  while (connection === c && !c.controller.signal.aborted) {
    const { value, done } = await reader.read();
    if (done) throw Error('Stream encerrado');
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    const packets = buf.split('\n\n'); buf = packets.pop() || '';
    for (const packet of packets) {
      let event, data = '';
      for (const line of packet.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data += line.slice(5).trimStart();
      }
      if (event === 'command' && data) await handle(c, JSON.parse(data));
    }
  }
}
function disconnect() {
  connection?.controller.abort(); connection = null;
  clearTimeout(syncTimeout); connectBtn.disabled = false; disconnectBtn.disabled = true; testBtn.disabled = true;
  note('Desconectado.');
}
async function connect() {
  if (connection) disconnect();
  try {
    const base = new URL(url.value.trim());
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) throw Error('Use HTTPS ou localhost');
    if (base.username || base.password || base.search || base.hash) throw Error('URL deve conter somente o domínio');
    const t = token.value.trim(), p = project.value.trim();
    if (t.length < 8) throw Error('Informe o STUDIO_TOKEN');
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(p)) throw Error('Projeto inválido');
    try { sessionStorage.setItem('threejs-studio', JSON.stringify({ url: base.origin, project: p })); } catch {}
    const c = { url: base.origin, token: t, project: p, controller: new AbortController(), connected: false };
    connection = c; connectBtn.disabled = true; disconnectBtn.disabled = false;
    let retry = 1500;
    while (connection === c && !c.controller.signal.aborted) {
      try { await stream(c); retry = 1500; }
      catch (e) {
        if (c.controller.signal.aborted) break;
        c.connected = false; testBtn.disabled = true; note('Conexão: ' + e.message);
        if (/HTTP 401|HTTP 403/.test(e.message)) break;
      }
      if (c.controller.signal.aborted) break;
      await delay(retry); retry = Math.min(retry * 2, 20000);
    }
    if (connection === c) disconnect();
  } catch (e) { note(e.message); connectBtn.disabled = false; }
}
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
testBtn.addEventListener('click', async () => {
  const c = connection;
  if (!c?.connected) return;
  testBtn.disabled = true;
  try {
    const response = await call(c, '/api/commands', 'POST', {
      project: c.project,
      action: 'create',
      shape: 'sphere',
      name: 'Esfera de teste (API)',
      position: [0, 1, 0],
      scale: [1, 1, 1],
      color: '#5fc4ee'
    });
    const result = await response.json();
    note('Comando enviado: ' + result.commandId.slice(0, 8) + '. Aguardando aplicação...', true);
  } catch (e) {
    note('Falha ao criar esfera: ' + e.message);
  } finally { testBtn.disabled = !c.connected || connection !== c; }
});
window.threejsStudio = { inventory, isConnected: () => !!connection?.connected };
