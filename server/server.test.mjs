import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStudioServer, validateCommand } from './index.mjs';

test('command validation', () => {
  const c = validateCommand({action:'create', shape:'sphere',name:'Hero'});
  assert.equal(c.shape,'sphere');
  assert.match(c.objectId,/^[a-f0-9-]{36}$/);
  assert.throws(() => validateCommand({action:'create',shape:'anything'}));
  assert.throws(() => validateCommand({action:'material',objectId:c.objectId,color:'bad'}));
});
test('HTTP REST and MCP transport', async () => {
  const server = createStudioServer({token:'very-secret-token',allowedOrigins:['http://localhost:8000']});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { Authorization:'Bearer very-secret-token','Content-Type':'application/json' };
  try {
    let r = await fetch(base+'/health');
    assert.equal(r.status,200);
    r = await fetch(base+'/api/projects/main/scene');
    assert.equal(r.status,401);
    r = await fetch(base+'/api/commands',{method:'POST',headers,body:JSON.stringify({project:'main',action:'create',shape:'box',name:'Wall'})});
    assert.equal(r.status,202);
    const command = await r.json();
    assert.ok(command.objectId);
    r = await fetch(base+'/api/projects/main/scene',{headers});
    assert.equal((await r.json()).pendingCommands,1);
    r = await fetch(base+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
    assert.equal(r.status,200);
    const tools = (await r.json()).result.tools;
    assert.ok(tools.some(t=>t.name==='create_object'));
    r = await fetch(base+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_scene',arguments:{project:'main'}}})});
    assert.equal(r.status,200);
    assert.ok((await r.json()).result.content[0].text.includes('pendingCommands'));
    r = await fetch(base+'/api/projects/main/ack',{method:'POST',headers,body:JSON.stringify({id:command.commandId,status:'ok'})});
    assert.equal(r.status,200);
    r = await fetch(base+'/api/projects/main/scene',{headers});
    assert.equal((await r.json()).pendingCommands,0);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
