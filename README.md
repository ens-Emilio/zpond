# zpond — a lagoa do zfrog

> `zfrog` captura. `zpond` guarda, cura e aplica.

Hub unificado local que orquestra **REA** (engenharia reversa de bundles/electron/apk/HAR) +
**zfrog** (captura web) + **todos os CLIs do PC** (`pi`/`omp`/`opencode`/…).

Tudo local. O front não analisa nada — só chama `rea --json` / `zfrog --json` via `localhost:3333`.

```
[ pi / omp / opencode / ... ] --\
[ Chrome tabs / pastas / .asar ] ---> [ REA + zfrog ] --> Evidence JSON --> [ Hub API :3333 ] --> SQLite ~/.zpond/hub.db
                                                                            |-> extractions / packages / pond
                                                                     [ Front Web :3000 ]  [ Front Electron (Tauri) ]
```

## Stack

- **Hub API** `hub-api/` — Node 24, `node:sqlite` (sem nativo), MCP `hub-api/dist/mcp-server.js`, zfrog probe, `vendor/rea` submodule
- **Dashboard** `dashboard/` — Vite 7 + React 19 + TanStack Router (manual) + Tailwind 4 — `/` Alvos, `/e/$id` Viewer com curadoria, `/pond`
- **Desktop** `src-tauri/` — Tauri 2, mesma SPA, `devUrl http://localhost:3067`

## Quick start

```bash
git clone --recurse-submodules https://github.com/ens-Emilio/zpond.git
cd zpond
npm install
npm run build --workspace=hub-api && npm run build --workspace=dashboard
# vendor/rea: build do REA (precisa Node 22+/24)
npm ci --prefix vendor/rea && npm run build:cached --prefix vendor/rea
npm run dev          # api :3333 + web :3067
npm run desktop:dev  # Tauri (precisa Rust)
```

## REA — fork contabilizado

- **Fork próprio:** `https://github.com/ens-Emilio/rea` (parent `morluto/rea`)
- **No `zpond`:** `vendor/rea` como **git submodule** (`62bf098` — `git clone --recurse-submodules` já traz)
- **`upstream`:** `zpond/.git` tem `upstream https://github.com/morluto/rea.git` pra `git fetch upstream` sem poluir histórico do `zpond`
- **`REA_BIN`:** `hub-api/src/index.ts` usa `vendor/rea/scripts/rea.mjs` por padrão (`process.env.REA_BIN` sobrescreve); fallback é `npx rea-agents` se não existir
- **`POST /analyze`:**
  - `{"url":"https://site.com"}` → `zfrog jump` → `engine:zfrog`
  - `{"url":"/path/local/app"}` → REA `analyze-javascript-application` → `engine:rea-js`
  - `{"url":"/path/arquivo.bin"}` → REA `inspect-artifact` → `engine:rea-artifact`

Não ignoramos o vendor: submodule contabiliza no repo (sha pinado), não entra 90M de histórico do REA no `zpond` nem fica volátil em `/tmp`.

## Pacote

`output/<id>/` filtrado curado:

```
pacote-xyz/
  prompt.md           # pronto pro pi/omp aplicar
  evidence.json       # Evidence filtrado
  design-tokens.json/.md
  archive.zip + screenshots/
  meta.json
```

Destino: qualquer `path` local ou `git clone <url>`.

## Busca (pond)

```
GET /pond?tag=&color=&site=&search=&limit=20   # search rank cosine sobre card_embeddings
POST /catalog/reindex                          # hash-128 por padrão; com ZPOND_EMBEDDING_URL vira modelo remoto
```

- Default: `hash-128` (bag-of-words 128d normalizado, `describeCard` port de `zfrog/visual_search.py` — sem rede, sem dependência, rank cosine + fallback lexical) — smoke `indexed:11 total:11`
- Remoto: `ZPOND_EMBEDDING_URL=https://…/v1/embeddings ZPOND_EMBEDDING_MODEL=nomic-embed-text npm start` → `reindex` e `pond?search=` usam OpenAI-compatible embeddings (5s timeout, fallback offline se falhar)

Tabelas: `cards`, `card_tags`, `card_colors`, `card_embeddings` (igual `zfrog/catalog.py`).

## Docs

- `PLANO.md` — fases 0-5 + next steps 8/8
- `INVENTARIO.md` — agents reais + nota vetorial + REA contabilizado
