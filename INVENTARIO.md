# INVENTARIO — zpond Fase 0 — 2026-10-14

## Agents encontrados

| Agent | Bin | Config | MCP | Status |
|---|---|---|---|---|
| **pi** | `~/.nvm/versions/node/v24.19.0/bin/pi` (ext. ponytail + anti-slop) | `~/.pi/agent/mcp.json` + `~/.pi/agent/settings.json` | `pi mcp list` → 2 servers | ✅ ativo |
| **omp** | `~/.bun/bin/omp` v18.10.2 | usa mesmo store que `pi` (`~/.pi` symlink?) + `~/.config/opencode/` | herdado de pi/opencode | ✅ ativo |
| **opencode** | `/usr/bin/opencode` + `~/.config/opencode/opencode.jsonc` (817 linhas) | `~/.config/opencode/opencode.jsonc` → `mcp: { playwright, salt }` | `playwright-mcp --config ...` + `http://127.0.0.1:8420/mcp` (salt) | ✅ ativo |
| **claude** | `native` v2.1.270 | `~/.claude.json` (machineID ade569..., projects: ens-portt) | `mcpServers: {}` por projeto | ✅ instalado, MCP vazio |
| **antigravity / gemini** | `~/.gemini/antigravity/` | `~/.gemini/antigravity/mcp/{playwright,salt,gemini-api-docs}/*.json` (file-per-tool) | 25 playwright + 33 salt tools | ✅ ativo |
| **cursor** | — | `~/.cursor/mcp.json` não existe | — | ❌ não instalado |
| **codex** | — | `~/.codex` não existe | — | ❌ não instalado |
| **gemini-cli** | — | `~/.gemini/config.json` não existe | via antigravity | — |

### Detalhes por agent

**pi** (`~/.pi/agent/mcp.json`):
```json
{
  "mcpServers": {
    "playwright": { "command": "playwright-mcp", "args": ["--config", "/home/zens/.config/playwright-mcp/config.json"], "exposure": "deferred" },
    "salt": { "url": "http://127.0.0.1:8420/mcp", "headers": { "Authorization": "Bearer salt_..." } }
  }
}
```
- `pi mcp add <name> -- <cmd>` / `pi mcp add <name> --url <url>` / `pi mcp list --json`
- Settings: `theme: dark`, `defaultProvider: verboo`, `defaultModel: deepseek-v4-flash-0731`

**opencode** (`~/.config/opencode/opencode.jsonc`): 817 linhas, `mcp: { playwright, salt, zpond }`
```json
{ "mcp": { "playwright": { "type": "local", "command": ["playwright-mcp","--config","..."] }, "salt": { "type": "remote", "url": "http://127.0.0.1:8420/mcp" }, "zpond": { "type": "local", "command": ["node","<zpond>/hub-api/dist/mcp-server.js"], "enabled": true } } }
```
- Providers: `kodeo` + `kodeo-cc` → `http://127.0.0.1:8090/kodeo` (apiKey ck_b2ca...)
- Models: `kodeo/grok-4.7` (estável, default do hub `PI_MODEL`), `gpt-6-sol` (timeout 10s em apply), `glm-5.3-flash`, `minimax-m2.7`, `deepseek-v4-flash`, `claude-opus-5`
- `mcp-setup.mjs` com `stripJsonc` preserva comentários JSONC e injeta `zpond` sem sobrescrever `playwright`/`salt`

**claude** (`~/.claude.json`): `mcpServers: {}` — pronto para injeção manual via `~/.claude.json` ou `.mcp.json` no projeto.

**antigravity**: MCP via `~/.gemini/antigravity/mcp/<server>/*.json` (um arquivo por tool). Salt + playwright já espelhados. Injeção é copiar diretório ou via UI.

## zfrog (referência)

- **Path:** `/home/zens/allkodex/all-kode/all-kodez/ens-kody/ProjetosA/zfrog` — v0.1.4 (Python 3.11+, FastAPI, Typer)
- **Output:** `output/<uuid>/` → `index.html`, `design-tokens.json`, `design-tokens.md`, `archive.zip`, `assets/`, `screenshots/`
- **design-tokens.json:** `{ url, title, element_count, palette: [{hex,count,role,properties}], fonts: [{family,count,sizes}] }`
- **catalog.py:** `Catalog(catalog.db)` — `Card {id,url,site,title,mode,engine,screenshot,tokens_json,created_at}` + `card_tags`, `card_colors`, `card_embeddings`
- **visual_search.py:** `describe(card)`, `embed_catalog(catalog)`, `search(catalog, query)` — lexical + color/radius/shadow words, cosine sobre embeddings
- **dashboard:** `dashboard/package.json` — React 19 + TanStack Router/Query + Tailwind 4 + Vite + Tauri 2 (`dashboard/src-tauri/` ausente no zfrog atual — Tauri não configurado, só scripts `desktop:dev/build`)

## REA

- **Pacote:** `rea@6.5.0` (via `npx --yes rea` — npm git fetch desabilitado no env, mas binário funciona quando cacheado)
- **Comandos úteis:** `rea analyze`, `rea inspect`, `rea analyze-web-bundle`, `rea capture-web-screenshot`, `rea capabilities`, `rea doctor`
- **Evidência:** JSON canônico via `rea --json` (a confirmar `rea analyze --json` vs `rea inspect --json`)

## Próximo passo (Fase 2) — ✅ CONCLUÍDO 2026-10-14

`node mcp-setup.mjs` (stripJsonc + fileURLToPath ROOT/MCP_ENTRY):
1. Detecta `~/.pi/agent/mcp.json`, `~/.config/opencode/opencode.jsonc`, `~/.claude.json` (JSONC)
2. Gera `zpond` → `node <zpond>/hub-api/dist/mcp-server.js` (stdio, `Timeout 30`, `exposure: deferred`)
3. Merge sem sobrescrever `playwright`/`salt`
4. `pi mcp list` / `opencode` mostram `zpond: connected` | Antigravity via `~/.gemini/antigravity/mcp/` (file-per-tool) — manual

## Nota 2026-10-15 — Fase 1 REA direto entregue

- Clone `morluto/rea@6.5.0` em `/tmp/rea-ref` validado: `npm ci && npm run build:cached` 15s + `scripts/rea.mjs --help` 50+ comandos
- Providers: `analyze`/`inspect` precisam `GHIDRA_INSTALL_DIR`/`HOPPER_LAUNCHER_PATH` (sem eles → `provider_unavailable`); sem Hopper/Ghidra, `analyze-javascript-application` já funciona (Evidence JS puro, sem worker externo)
- Smoke: `rea analyze-javascript-application /tmp/rea-test-app --format json` → `ev_d2eb…` + `normalized_result.inventory_manifest_id` ok em 3s; `inspect-artifact /bin/ls` sem provider falha esperado
- Hub: `POST /analyze {url: /tmp/rea-test-app}` → `engine:rea-js` (30s wall, `REA_BIN=/tmp/rea-ref/scripts/rea.mjs` quando existe)
- Git: `zpond/.git` inicializado, `.gitignore` saneado (sem `node_modules/dist/src-tauri/target/*.db/output`), pronto para `gh repo create` se quiser tornar público

## Nota 2026-10-14 — rea-agents timeout (resolvido 2026-10-15 via clone local)

`npx --yes rea-agents --help` → timeout 300s (interrupted). REA não respondeu via npx (rede ou pacote pesado). Resolvido: clone + `npm ci` local em `/tmp/rea-ref` (env `REA_BIN`).

## Nota 2026-10-14 — apply loop C validado + smoke revalidado

`POST /packages/:id/apply` testado com os 3 agents (`kodeo/grok-4.7`, wall 210s, idle 45s):
- `pi -p <prompt> --provider kodeo --model kodeo/grok-4.7 --mode json` → 1m42s, escreveu `index.html` + `css/{tokens,base,components}.css` em `/tmp/zpond-projeto-j`
- `omp -p ... --mode json --cwd <dest>` → 3m0s, escreveu `index.html + css/`
- `opencode run <prompt> --dir <dest> --model kodeo/grok-4.7 --format json --auto` → 1m24s, escreveu `example-inspired.html + tokens.css` (sem `--auto` → `permission rejected external_directory /*`)
- `gpt-6-sol` → `Request timed out` em 10s; default do hub = `kodeo/grok-4.7` (`PI_MODEL` env)
- `POST /analyze` → `engine zfrog` 5.7–6s, `palette` 3 (example.com) / 36 (stripe.com), `ZFROG_BIN=/home/zens/.local/bin/zfrog` (default absoluto em `hub-api/src/index.ts`)
- Smoke 2026-10-14 tarde: `POST /analyze {url:example.com, tag:smoke}` → `id:76ff5270` `engine:zfrog`, `POST /packages {card_id:76ff5270, palette}` → `2a1bf891`, `GET /pond?tag=smoke` ok, `POST /catalog/reindex` → `{indexed:0,total:9}`, `POST /packages/:id/apply {dest:/tmp/zpond-projeto-j-nonexistent}` → `400 dest não existe` (error path), dest existente cria `PROMPT.md`/`evidence.json`/`PROMPT.out.jsonl` com wall 210s
- Hub API: `node:sqlite` nativo, `guards.ts#isRecord` canônico, `Record<string,true>` lookup, `clearTimeout` sem guard, `import type` no topo, `spawn` estático
