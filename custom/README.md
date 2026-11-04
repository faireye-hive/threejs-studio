# Arquivos personalizados do editor

Coloque aqui somente arquivos que deseja modificar, mantendo a mesma estrutura de caminhos usada pelo Three.js.

Exemplos:
- `custom/editor/js/Viewport.js` substitui `upstream/editor/js/Viewport.js`
- `custom/editor/index.html` substitui `upstream/editor/index.html`
- `custom/editor/css/main.css` substitui `upstream/editor/css/main.css`

Use `bash scripts/capture_override.sh editor/js/Viewport.js` para copiar com segurança um arquivo do clone original.
O build aplica os arquivos personalizados **depois** de copiar a versão original.

Não coloque tokens ou segredos neste diretório: ele é público.
