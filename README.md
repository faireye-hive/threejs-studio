# Three.js Studio

Editor oficial do [Three.js](https://threejs.org/editor/) com uma ponte para API Node.js e servidor MCP experimental.

**Sem histórico do Three.js**: este repositório não é um fork. O GitHub Actions baixa uma cópia rasa do editor upstream durante o build e publica os arquivos resultantes no GitHub Pages, sem colocá-los no Git deste projeto.

## Publicação do editor
1. Em **Settings → Pages → Build and deployment**, escolha **GitHub Actions**.
2. Em **Actions**, execute **Publish Three.js Studio** se necessário.
3. Abra **https://faireye-hive.github.io/threejs-studio/**.

## API no Render
Crie um Blueprint no Render usando o `render.yaml`, ou Web Service Node:
- Start command: `node server/index.mjs`
- Environment variable `STUDIO_TOKEN`: segredo aleatório longo (NUNCA publicar no Git).
- `ALLOWED_ORIGINS`: `https://faireye-hive.github.io`.
- Porta é definida por `PORT` no Render.

Abra o painel **API / IA** no editor. Informe o domínio HTTPS do serviço, o token e o nome do projeto (`main` por padrão). O token não é persistido no browser após recarregar a página.

### Comando REST de exemplo
```bash
curl -X POST https://SEU-SERVIDOR.onrender.com/api/commands \
 -H 'Authorization: Bearer SEU_TOKEN' \
 -H 'Content-Type: application/json' \
 -d '{"project":"main","action":"create","shape":"sphere","name":"Cabeca","position":[0,2,0],"scale":[1,1,1],"color":"#edc6a7"}'
```

`GET /api/projects/main/scene` retorna inventário da cena e número de editores conectados. O navegador aplica os comandos via SSE e devolve ACK. Para alterar um objeto, use o `objectId` retornado na criação.

**MCP (experimental):** `POST https://SEU-SERVIDOR.onrender.com/mcp`, com `Authorization: Bearer <STUDIO_TOKEN>`. Expõe `get_scene`, `create_object`, `transform_object`, `set_material`, `rename_object` e `delete_object`. Não oferece OAuth e não está validado no ChatGPT; a disponibilidade de ferramentas de escrita MCP depende do plano/cliente.

## Limitações do MVP
- Comandos remotos: primitivas, transformação, materiais simples, renomeação e exclusão. **Não** há edição remota de vértices, rigging ou captura automática.
- A API mantém dados e comandos pendentes apenas em memória. Ao reiniciar o Render, eles são perdidos. O salvamento do editor original permanece no navegador; exporte os projetos antes de limpar os dados locais.
- Use o mesmo projeto em apenas um editor por vez nesta versão. Não há bloqueio de edição concorrente.
- O upstream usado no build é o branch `dev`; mudanças futuras no editor podem exigir atualizar a ponte.

## Desenvolvimento local
```bash
cd server
STUDIO_TOKEN=segredo-de-desenvolvimento ALLOWED_ORIGINS=http://localhost:8000 node index.mjs
# Publique os arquivos gerados em public/ com python -m http.server
```

## Licenças
Integrações deste repositório sob MIT. O Three.js original também usa MIT e sua licença é copiada para o artefato de publicação (`THREEJS_LICENSE.txt`).
