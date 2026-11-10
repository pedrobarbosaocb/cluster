# 🤘 Moodboard da FlatHead

Moodboard colaborativo com estética punk.

| | |
|---|---|
| ⬆️ **Sobe** | arrasta um lote de imagens (ou Ctrl+V) |
| 🃏 **Julga** | cada pessoa joga as cartas numa das 5 fichas |
| 🧩 **Cola** | as imagens viram clusters por paleta de cor, com tamanho pela nota |

## Fichas (pesos estilo planning poker)

| ficha | peso | atalho |
|---|---|---|
| 🍅💀 Tomate podre | 1 | `1` |
| 🍅 Tomate | 2 | `2` |
| 📰 Fanzine | 3 | `3` |
| 💿 Vinil | 5 | `4` |
| 👑 Coroa | 8 | `5` |

Escala Fibonacci: a diferença entre "curti" e "é a cara da banda" pesa mais que entre "ruim" e "meh".
A nota de cada imagem é uma média bayesiana (poucas avaliações puxam para a média geral), normalizada no board.
Arrastar a carta para a esquerda pula; `Z` desfaz. Cada dispositivo tem uma identidade anônima: um voto por pessoa por imagem, que pode ser trocado.

## Dono, PIN e moderação

- Quem **cria o board é o dono**: o navegador guarda uma chave secreta (o servidor só guarda o hash).
- 🔑 **Painel do dono** (`#/b/<id>/admin`): trancar com **PIN** de 4–8 dígitos, copiar a chave para usar em outro aparelho, **apagar imagens** (as piores aparecem primeiro). A lixeira também aparece no zoom da imagem.
- Board com PIN: ver, subir e votar pedem o código (o dono passa direto). Após 8 erros em 10 min o IP fica bloqueado naquele board.
- Ações destrutivas pedem **dois toques** (o botão fica vermelho com ✓).
- `ADMIN_TOKEN` (variável do servidor, ≥ 16 caracteres) vale como chave de dono de **qualquer** board — use para recuperar uma chave perdida ou assumir boards criados antes desse recurso (cole no painel 🔑).
- Os arquivos de imagem (`/uploads/*`) não pedem PIN: os nomes são aleatórios e não aparecem sem acesso ao board, mas quem tiver o link direto de uma imagem consegue abri-la.
- No modo GitHub Pages (local) não há PIN: os dados nem saem do navegador, e quem usa é sempre o dono.

## Tempo real

- O board e a votação se atualizam na hora (⚡ amarelo no cabeçalho = conectado): votos, uploads e exclusões de outras pessoas aparecem em menos de 1 s.
- Funciona por Server-Sent Events em `GET /api/boards/<id>/events`, lido via `fetch` para mandar o PIN no header (nunca na URL). Reconecta sozinho (1 s → 15 s); se cair de vez, o board ainda recarrega a cada 60 s.
- Na votação, imagens novas entram no fim da fila sem trocar a carta atual; apagadas saem da fila.
- Trocar o PIN derruba as conexões abertas: quem está com o board aberto cai na tela de PIN.
- No modo GitHub Pages, sincroniza só entre abas do mesmo navegador (`BroadcastChannel`).

## Como funciona o agrupamento

1. **Paleta**: no upload, o navegador reduz a imagem e roda k-means++ no espaço de cor Lab → 5 cores dominantes com peso.
2. **Distância entre imagens**: para cada cor de A, a menor ΔE até B, ponderada pelo peso (e vice-versa).
3. **Clusters**: aglomerativo average-linkage, corta quando a distância média passa de ΔE 22.
4. **Colagem**: cada cluster é empacotado numa grade; nota maior → mais células.

## Rodando

Requer Node ≥ 22.18 (roda TypeScript direto, sem build no servidor).

```bash
npm ci
npm run build        # front em dist/
npm start            # servidor em http://localhost:8787 (dados em ./data)
npm run seed         # (opcional) cria um board de exemplo
```

Desenvolvimento com hot reload: `npm run dev:server` e, em outro terminal, `npm run dev` (Vite faz proxy de `/api` e `/uploads`).

> Rede corporativa com inspeção de TLS? Use `NODE_OPTIONS=--use-system-ca npm ci`.

### Servidor privado (Docker)

```bash
docker compose up -d --build    # http://SEU_SERVIDOR:8787
```

Os dados (JSON + imagens) ficam no volume `moodboard-data`. Variáveis: `PORT`, `HOST`, `DATA_DIR`, `STATIC_DIR`, `CORS_ORIGIN`, `ADMIN_TOKEN` (no compose: `ADMIN_TOKEN=... docker compose up -d`).
Para expor na internet, coloque atrás de um proxy com HTTPS (Caddy/Nginx). No Nginx, para o tempo real, use `proxy_buffering off;` e `proxy_read_timeout 1h;` no `location /api/` (o servidor já manda `X-Accel-Buffering: no` e um ping a cada 25 s).

### GitHub Pages (modo local)

O workflow **Deploy GitHub Pages** (manual, em *Actions*) publica o build com `VITE_BACKEND=local`: tudo fica no IndexedDB do navegador — bom para demo, mas sem colaboração entre pessoas. Requer repositório público (ou plano pago) e *Settings → Pages → Source: GitHub Actions*. A colaboração real no Pages é a issue #21 (backend hospedado).

Para apontar o front publicado no Pages para o seu servidor: build com `VITE_API_URL=https://seu-servidor` e rode o servidor com `CORS_ORIGIN=https://<usuario>.github.io`.

## Fluxo de desenvolvimento

- Épicos e features em *Issues* (milestones **MVP** e **Pós-MVP**).
- Uma branch por feature (`feat/<issues>-<nome>`), PR para `main`.
- CI em todo PR: lint → typecheck → testes → build, + build/smoke test da imagem Docker.

```
src/core     algoritmos puros (cor, paleta, cluster, votos, layout) — com testes unitários
src/data     adaptadores de dados (HTTP / IndexedDB)
src/media    processamento de imagem no navegador
src/ui       tema, ícones, shell, router
src/views    telas
server       API Node sem dependências
```
