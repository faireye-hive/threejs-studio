import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const actions = ['create', 'build_scene', 'transform', 'material', 'rename', 'delete'];
const shapes = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'capsule', 'icosahedron', 'octahedron', 'tetrahedron', 'dodecahedron', 'ring', 'circle'];
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const MAX_SCENE_OBJECTS = 2000;
const MAX_SCENE_VERTICES = 500000;
const MAX_MESH_VERTICES = 100000;
const MAX_MESH_INDICES = 600000;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const projectId = /^[a-z0-9_-]{1,64}$/i;
const hex = /^#[0-9a-f]{6}$/i;
function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }
function vector(value, name, limit = 10000) {
  if (!Array.isArray(value) || value.length !== 3 ||
    !value.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit)) invalid('Invalid ' + name);
  return [...value];
}
function safeString(v, name) {
  if (typeof v !== 'string' || !v.length || v.length > 80) invalid('Invalid ' + name);
  return v;
}
function finiteArray(value, name, expectedLength, maxAbs = 100000) {
  if (!Array.isArray(value) || (expectedLength !== undefined && value.length !== expectedLength) ||
    !value.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= maxAbs)) invalid('Invalid ' + name);
  return [...value];
}
function validateSceneObject(input, index, tally) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid scene object ' + index);
  const shape = input.shape ?? 'mesh';
  if (shape !== 'mesh' && !shapes.includes(shape)) invalid('Invalid scene shape at ' + index);
  const object = {
    objectId: crypto.randomUUID(), shape,
    name: input.name === undefined ? 'Part ' + (index + 1) : safeString(input.name, 'object name'),
    position: input.position === undefined ? [0,0,0] : vector(input.position, 'position'),
    rotation: input.rotation === undefined ? [0,0,0] : vector(input.rotation, 'rotation'),
    scale: input.scale === undefined ? [1,1,1] : vector(input.scale, 'scale', 1000)
  };
  if (input.group !== undefined) object.group = safeString(input.group, 'group');
  if (input.color !== undefined) {
    if (typeof input.color !== 'string' || !hex.test(input.color)) invalid('Invalid color');
    object.color = input.color;
  } else object.color = '#86b6ed';
  for (const field of ['roughness','metalness']) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== 'number' || !Number.isFinite(input[field]) || input[field] < 0 || input[field] > 1) invalid('Invalid ' + field);
      object[field] = input[field];
    }
  }
  if (shape === 'mesh') {
    const positions = finiteArray(input.positions, 'positions');
    if (positions.length < 9 || positions.length % 3) invalid('Mesh positions must contain at least three vertices');
    const vertexCount = positions.length / 3;
    if (vertexCount > MAX_MESH_VERTICES) invalid('Mesh vertex limit exceeded');
    tally.vertices += vertexCount;
    if (tally.vertices > MAX_SCENE_VERTICES) invalid('Scene vertex limit exceeded');
    object.positions = positions;
    if (input.indices !== undefined) {
      if (!Array.isArray(input.indices) || input.indices.length < 3 || input.indices.length % 3 || input.indices.length > MAX_MESH_INDICES ||
        !input.indices.every(i => Number.isInteger(i) && i >= 0 && i < vertexCount)) invalid('Invalid mesh indices');
      object.indices = [...input.indices];
    } else if (vertexCount % 3) invalid('Non-indexed mesh vertices must be triangles');
    if (input.normals !== undefined) object.normals = finiteArray(input.normals, 'normals', positions.length, 1);
    if (input.uvs !== undefined) object.uvs = finiteArray(input.uvs, 'uvs', vertexCount * 2, 100000);
    if (input.colors !== undefined) object.colors = finiteArray(input.colors, 'colors', positions.length, 1);
  }
  return object;
}
export function validateCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !actions.includes(input.action)) invalid('Invalid action');
  const c = { action: input.action };
  if (c.action === 'create') {
    if (!shapes.includes(input.shape)) invalid('Invalid shape');
    Object.assign(c, {
      shape: input.shape, objectId: crypto.randomUUID(),
      name: input.name === undefined ? 'AI ' + input.shape : safeString(input.name, 'name'),
      position: input.position === undefined ? [0,0,0] : vector(input.position, 'position'),
      scale: input.scale === undefined ? [1,1,1] : vector(input.scale, 'scale', 1000),
      color: input.color === undefined ? '#86b6ed' : input.color
    });
    if (!hex.test(c.color)) invalid('Invalid color');
    return c;
  }
  if (c.action === 'build_scene') {
    if (!Array.isArray(input.objects) || input.objects.length < 1 || input.objects.length > MAX_SCENE_OBJECTS) invalid('Invalid scene objects');
    c.objectId = crypto.randomUUID();
    c.name = input.name === undefined ? 'Imported Scene' : safeString(input.name, 'scene name');
    const tally = { vertices: 0 };
    c.objects = input.objects.map((o, i) => validateSceneObject(o, i, tally));
    c.objectsCreated = c.objects.length;
    c.vertexCount = tally.vertices;
    return c;
  }
  if (typeof input.objectId !== 'string' || !uuid.test(input.objectId)) invalid('Invalid objectId');
  c.objectId = input.objectId;
  if (c.action === 'transform') {
    for (const field of ['position','rotation','scale']) if (input[field] !== undefined) c[field] = vector(input[field], field, field === 'scale' ? 1000 : 10000);
    if (!c.position && !c.rotation && !c.scale) invalid('No transform provided');
  } else if (c.action === 'material') {
    if (input.color !== undefined) { if (!hex.test(input.color)) invalid('Invalid color'); c.color = input.color; }
    for (const field of ['roughness','metalness']) if (input[field] !== undefined) {
      if (typeof input[field] !== 'number' || !Number.isFinite(input[field]) || input[field] < 0 || input[field] > 1) invalid('Invalid ' + field);
      c[field] = input[field];
    }
    if (c.color === undefined && c.roughness === undefined && c.metalness === undefined) invalid('No material changes');
  } else if (c.action === 'rename') c.name = safeString(input.name, 'name');
  return c;
}
function schema(name, description, properties, required = []) {
  return { name, description, inputSchema: { type:'object', properties, required, additionalProperties:false } };
}
const str = { type: 'string' }, vec = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const mcpTools = [
  schema('get_scene','Get latest object inventory from connected editor; may be stale if editor offline.',{project:str}),
  schema('create_object','Queue a 3D primitive in the live editor.',{project:str,shape:{type:'string',enum:shapes},name:str,position:vec,scale:vec,color:str},['shape']),
  schema('build_scene','Build a complete model from named primitives or custom triangle meshes. Mesh positions, indices, normals, UVs, and vertex colors are supported.',{project:str,name:str,objects:{type:'array',minItems:1,maxItems:MAX_SCENE_OBJECTS,items:{type:'object'}}},['objects']),
  schema('transform_object','Set position, rotation (radians), or scale.',{project:str,objectId:str,position:vec,rotation:vec,scale:vec},['objectId']),
  schema('set_material','Change mesh material.',{project:str,objectId:str,color:str,roughness:{type:'number'},metalness:{type:'number'}},['objectId']),
  schema('rename_object','Rename object.',{project:str,objectId:str,name:str},['objectId','name']),
  schema('delete_object','Remove object.',{project:str,objectId:str},['objectId'])
];
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function parse(req) {
  const parts = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw Object.assign(new Error('Body too large (20 MiB maximum)'), {status:413});
    parts.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { invalid('Invalid JSON body'); }
}
function auth(req, secret) {
  const got = Buffer.from(req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] || '');
  const expected = Buffer.from(secret);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}
export function createStudioServer({ token = process.env.STUDIO_TOKEN,
  allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8000').split(',').map(s => s.trim()) } = {}) {
  if (!token || token.length < 8) throw Error('STUDIO_TOKEN required (8+ characters)');
  const rooms = new Map();
  function room(id) {
    if (!projectId.test(id)) invalid('Invalid project');
    if (!rooms.has(id)) rooms.set(id, { objects:[], updatedAt:null, clients:new Set(), pending:new Map(), pendingBytes:0, lastAck:null });
    return rooms.get(id);
  }
  function sendEvent(res, event, data) { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); }
  function queue(project, params) {
    const r = room(project), cmd = { id:crypto.randomUUID(), ...validateCommand(params) };
    const cmdBytes = Buffer.byteLength(JSON.stringify(cmd));
    if (cmdBytes > MAX_REQUEST_BYTES) throw Object.assign(Error('Command too large'), {status:413});
    if (r.pending.size >= 300 || r.pendingBytes + cmdBytes > 40 * 1024 * 1024) throw Object.assign(Error('Pending command capacity reached'), {status:429});
    r.pending.set(cmd.id, cmd); r.pendingBytes += cmdBytes;
    for (const client of r.clients) sendEvent(client, 'command', cmd);
    return { status:'queued', project, commandId:cmd.id, objectId:cmd.objectId,
      ...(cmd.action === 'build_scene' ? { objectsCreated:cmd.objectsCreated, vertexCount:cmd.vertexCount } : {}),
      connectedEditors:r.clients.size };
  }
  function toolCall(name, args = {}) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) invalid('Invalid tool args');
    const project = args.project ?? 'main';
    if (name === 'get_scene') {
      const r = room(project);
      return {project,objects:r.objects,updatedAt:r.updatedAt,connectedEditors:r.clients.size,pendingCommands:r.pending.size};
    }
    const mapping = {create_object:'create',build_scene:'build_scene',transform_object:'transform',set_material:'material',rename_object:'rename',delete_object:'delete'};
    if (!mapping[name]) invalid('Unknown MCP tool');
    return queue(project, {...args,action:mapping[name]});
  }
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, MCP-Protocol-Version');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return origin && allowedOrigins.includes(origin) ? res.writeHead(204).end() : json(res,403,{error:'Origin rejected'});
    if (origin && !allowedOrigins.includes(origin)) return json(res,403,{error:'Origin rejected'});
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { return json(res,400,{error:'Invalid URL'}); }
    if (req.method === 'GET' && pathname === '/health') return json(res,200,{status:'ok',service:'threejs-studio'});
    if (!auth(req, token)) return json(res,401,{error:'Unauthorized'});
    try {
      if (req.method === 'POST' && pathname === '/api/commands') {
        const data = await parse(req);
        return json(res,202,queue(data.project ?? 'main', data));
      }
      const match = pathname.match(/^\/api\/projects\/([^/]+)\/(scene|events|ack)$/);
      if (match) {
        const p = match[1], action = match[2], r = room(p);
        if (action === 'scene' && req.method === 'GET') return json(res,200,{project:p,objects:r.objects,updatedAt:r.updatedAt,connectedEditors:r.clients.size,pendingCommands:r.pending.size,lastAck:r.lastAck});
        if (action === 'scene' && req.method === 'POST') {
          const data = await parse(req);
          if (!Array.isArray(data.objects) || data.objects.length > 3000) invalid('Invalid object list');
          r.objects = data.objects.map(o => ({
            id:String(o.id ?? '').slice(0,80),name:String(o.name ?? '').slice(0,80),type:String(o.type ?? '').slice(0,40),
            position:Array.isArray(o.position) ? o.position.slice(0,3) : [],
            rotation:Array.isArray(o.rotation) ? o.rotation.slice(0,3) : [],
            scale:Array.isArray(o.scale) ? o.scale.slice(0,3) : [],
            color:typeof o.color === 'string' ? o.color.slice(0,16) : null
          }));
          r.updatedAt = new Date().toISOString();
          return json(res,200,{ok:true,objects:r.objects.length});
        }
        if (action === 'ack' && req.method === 'POST') {
          const data = await parse(req);
          if (!uuid.test(data.id ?? '') || !['ok','error'].includes(data.status)) invalid('Invalid ack');
          if (!r.pending.has(data.id)) return json(res,404,{error:'Unknown command'});
          const pending = r.pending.get(data.id);
          r.pendingBytes = Math.max(0, r.pendingBytes - Buffer.byteLength(JSON.stringify(pending)));
          r.pending.delete(data.id);
          r.lastAck = {id:data.id,status:data.status,error:String(data.error || '').slice(0,160),at:new Date().toISOString()};
          return json(res,200,{ok:true});
        }
        if (action === 'events' && req.method === 'GET') {
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
          r.clients.add(res);
          sendEvent(res,'ready',{project:p,pending:r.pending.size});
          for (const cmd of r.pending.values()) sendEvent(res,'command',cmd);
          const heartbeat = setInterval(() => res.write(': heartbeat\n\n'),20000);
          req.on('close',() => {clearInterval(heartbeat);r.clients.delete(res);});
          return;
        }
      }
      if (pathname === '/mcp' && req.method === 'POST') {
        const data = await parse(req);
        if (!data || data.jsonrpc !== '2.0' || typeof data.method !== 'string') return json(res,400,{jsonrpc:'2.0',id:data?.id ?? null,error:{code:-32600,message:'Invalid Request'}});
        if (data.id === undefined) return res.writeHead(202).end();
        let result;
        if (data.method === 'initialize') result = {protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'threejs-studio',version:'0.1.0'}};
        else if (data.method === 'tools/list') result = {tools:mcpTools};
        else if (data.method === 'ping') result = {};
        else if (data.method === 'tools/call') {
          try { result = {content:[{type:'text',text:JSON.stringify(toolCall(data.params?.name,data.params?.arguments ?? {}))}]}; }
          catch (e) { result = {isError:true,content:[{type:'text',text:e.message}]}; }
        }
        else return json(res,200,{jsonrpc:'2.0',id:data.id,error:{code:-32601,message:'Method not found'}});
        res.setHeader('MCP-Protocol-Version','2025-06-18');
        return json(res,200,{jsonrpc:'2.0',id:data.id,result});
      }
      if (pathname === '/mcp' && req.method === 'GET') {
        res.setHeader('Allow','POST');
        return json(res,405,{error:'MCP is stateless POST only'});
      }
      return json(res,404,{error:'Not found'});
    } catch(e) { return json(res,e.status ?? 400,{error:e.message || 'Invalid request'}); }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 4000);
  createStudioServer().listen(port,'0.0.0.0',() => console.log('Three.js Studio API on port ' + port));
}
