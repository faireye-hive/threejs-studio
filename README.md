# Three.js Studio

Editor oficial do [Three.js](https://threejs.org/editor/) com uma ponte para API Node.js e servidor MCP experimental.

**Sem histórico do Three.js**: este repositório não é um fork. O GitHub Actions baixa uma cópia rasa do editor upstream durante o build e publica os arquivos resultantes no GitHub Pages, sem colocá-los no Git deste projeto.

## Publicação do editor
1. Em **Settings → Pages → Build and deployment**, escolha **GitHub Actions**.
2. Em **Actions**, execute **Publish Three.js Studio** se necessário.
3. Abra **https://faireye-hive.github.io/threejs-studio/**.

## Modificando o editor original (sem importar todo o Three.js)

As modificações permanentes ficam em `custom/`, não em `upstream/`, porque `upstream/` é ignorado pelo Git e baixado novamente em cada build.

No Codespaces, com o clone superficial em `upstream/`, crie uma substituição editável para qualquer arquivo do editor:

```bash
bash scripts/capture_override.sh editor/js/Viewport.js
# Agora edite custom/editor/js/Viewport.js no VS Code.
python3 scripts/build_site.py upstream public
python3 -m http.server 8000 -d public
```

A etapa de build segue esta ordem:
1. Copia os arquivos oficiais de `upstream/` para `public/`.
2. Sobrepõe os arquivos personalizados de `custom/editor/`, `custom/build/` e `custom/examples/`.
3. Injeta e preserva a integração MCP/API do Studio.

Assim, apenas **os arquivos realmente modificados** entram nos commits do projeto. É possível alterar o `index.html` original, `Viewport.js`, menus, sidebar, ferramentas e módulos do Three.js.

Se você já alterou um arquivo diretamente em `upstream/`, execute `bash scripts/capture_override.sh editor/js/NOME.js` **antes** de encerrar o Codespaces; o script copia a versão alterada para `custom/`. Caso haja um override existente, o script não o sobrescreve.

Depois de testar:
```bash
git add custom/ scripts/ README.md
git commit -m "Personalizar editor 3D"
git push
```

**Atenção:** mudanças no branch `dev` do Three.js podem exigir ajustes nos arquivos personalizados no futuro. Para desenvolvimento mais estável, podemos fixar um commit/tag específico do upstream. A ponte `studio/bridge.js` e `bridge.css` continuam sob controle próprio e são aplicadas por último.

## Controle pelo ChatGPT Work (navegador na nuvem)

Abra `https://faireye-hive.github.io/threejs-studio/control/` no Work.
Esta página é um controle REST autenticado independente, que **não abre um segundo editor**. Por isso você pode manter o Three.js Editor conectado no seu próprio navegador, no mesmo projeto `main`.

1. No navegador normal, abra o editor, clique em **API / IA** e mantenha-o **Conectado**.
2. Inicie um chat **Work** e peça para abrir a URL `/control/`.
3. Quando a página pedir o token, insira o mesmo `STUDIO_TOKEN` no formulário do navegador do Work usando a etapa segura disponível; **não envie o token no chat**.
4. Peça ao Work: "Crie uma esfera chamada Teste Work na posição 0,1,0, no projeto main. Verifique se o comando foi confirmado."
5. A página também permite modificar objetos e enviar até 30 comandos JSON validados pela API. Um único comando `build_scene` pode criar milhares de peças e malhas personalizadas de uma vez.

O Work usa sua capacidade de navegar e preencher formulários, **não** as ferramentas MCP diretamente. Para MCP remoto nativo com ações de escrita, verifique a elegibilidade do plano ChatGPT. Sem o token válido o controlador não executa comandos. O token fica somente na memória da página, sendo apagado ao desconectar; não é gravado em localStorage, URL ou arquivos.

## API no Render
Crie um Blueprint no Render usando o `render.yaml`, ou Web Service Node:
- Start command: `node server/index.mjs`
- Environment variable `STUDIO_TOKEN`: segredo aleatório longo (NUNCA publicar no Git).
- `ALLOWED_ORIGINS`: `https://faireye-hive.github.io`.
- Porta é definida por `PORT` no Render.

Abra o painel **API / IA** no editor. Informe o domínio HTTPS do serviço, o token e o nome do projeto (`main` por padrão). O token não é persistido no browser após recarregar a página. Para testar sem terminal, conecte e clique em **Criar esfera de teste**; o objeto aparecerá no viewport após a API confirmar o comando.

### Comando REST de exemplo
```bash
curl -X POST https://SEU-SERVIDOR.onrender.com/api/commands \
 -H 'Authorization: Bearer SEU_TOKEN' \
 -H 'Content-Type: application/json' \
 -d '{"project":"main","action":"create","shape":"sphere","name":"Cabeca","position":[0,2,0],"scale":[1,1,1],"color":"#edc6a7"}'
```

`GET /api/projects/main/scene` retorna inventário da cena e número de editores conectados. O navegador aplica os comandos via SSE e devolve ACK. Para alterar um objeto, use o `objectId` retornado na criação.

**MCP (experimental):** `POST https://SEU-SERVIDOR.onrender.com/mcp`, com `Authorization: Bearer <STUDIO_TOKEN>`. Expõe `get_scene`, `create_object`, `build_scene`, `transform_object`, `set_material`, `rename_object` e `delete_object`. `build_scene` aceita primitivas e malhas triangulares arbitrárias com posições, índices, normais, UVs e cores por vértice. Não oferece OAuth e não está validado no ChatGPT; a disponibilidade de ferramentas de escrita MCP depende do plano/cliente.

### Construir modelos completos por API

Envie um `build_scene` em `POST /api/commands` para criar a montagem em um único lote. Cada peça pode ser uma primitiva (`shape`) ou uma malha (`shape: "mesh"`) com arrays `positions` e `indices`; transformações, nome de grupo, cor, rugosidade e metalicidade também são aceitos. UVs e cores por vértice podem ser usados em malhas customizadas.

```json
{
  "project": "main",
  "action": "build_scene",
  "name": "Personagem",
  "objects": [
    {"shape":"sphere","name":"Cabeça","group":"Corpo","position":[0,2,0],"scale":[0.7,0.8,0.7],"color":"#e9bda5"},
    {"shape":"mesh","name":"Malha da roupa","group":"Roupa","positions":[-0.5,0,0, 0.5,0,0, 0,1,0],"indices":[0,1,2],"color":"#433866"}
  ]
}
```

Limites operacionais protegem o serviço Render: até 2.000 peças e 500.000 vértices por montagem, até 20 MiB por requisição e no máximo 100.000 vértices por malha. Isso permite enviar um modelo inteiro como uma única construção, sem dividir tudo em comandos isolados.

## Limitações atuais
- Malhas customizadas são estáticas: o endpoint aceita geometria, UVs e cores por vértice, mas ainda não aceita imagens de textura, esqueletos, pesos de skinning ou animações.
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
