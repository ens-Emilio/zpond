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

- **Hub API** `hub-api/` — Node 24, `node:sqlite` (sem nativo), MCP `hub-api/dist/mcp-server.js`, zfrog probe
- **Dashboard** `dashboard/` — Vite 7 + React 19 + TanStack Router (manual) + Tailwind 4 — `/` Alvos, `/e/$id` Viewer com curadoria, `/pond`
- **Desktop** `src-tauri/` — Tauri 2, mesma SPA, `devUrl http://localhost:3067`

## Quick start

```bash
npm install
npm run dev          # api :3333 + web :3067
npm run desktop:dev  # Tauri (precisa Rust)
```

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
GET /pond?tag=&color=&site=&search=&limit=20
POST /catalog/reindex   # vetorial, 0 se sem modelo
```

Tabelas: `cards`, `card_tags`, `card_colors`, `card_embeddings` (igual `zfrog/catalog.py`).

## Docs

- `PLANO.md` — fases 0-5
- `INVENTARIO.md` — agents reais deste PC
