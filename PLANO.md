# zpond — Plano v1.0

> **Nome:** `zpond` — a lagoa onde o `zfrog` mora. Não é outro bicho, é o habitat.
> `zfrog` captura, `zpond` guarda, cura e aplica. Mantém linhagem `z*` sem explicar.

**Data:** 2026-10-14
**Status:** MVP A+B + Fase 1 REA direto entregue — hub zfrog+MCP+dashboard+apply validado (smoke 2026-10-15) — REA path local: `analyze-javascript-application` + `inspect-artifact` (sem Hopper/Ghidra), git inicializado — falta só push/fork público + `remote upstream morluto/rea`

---

## 1. Ideia em 1 frase

Fork do REA como motor + wrapper que detecta **todos os CLIs do PC** (foco `pi`/`omp`/`opencode`)
e **2 fronts (Web + Electron)** que só orquestram `rea --json` / `zfrog --json` e deixam você
montar **Pacotes** (`output/<id>/` filtrado) para aplicar no Projeto J (local ou git).

Tudo local. Front não analisa nada.

---

## 2. Arquitetura alvo

```
[ pi / omp / opencode / claude / cursor / codex / gemini / ... ] --\
                                                                     +--> [ REA Core (fork morluto/rea) ] --> Evidence JSON
[ Alvos: Chrome --remote-debugging-port / pastas / .asar / APK / HAR ] --/                |
[ zfrog capture (provider web) ] ----------------------------------------------------------+
                                                                                           `--> [ Hub API :3333 (Node 22+) ]
                                                                                                    |-> SQLite ~/.zpond/hub.db
                                                                                                    |-> targets / extractions / packages / apply
                                                                                                    |-> spawn: `rea --json`, `zfrog --json`, `pi -p`, `omp -p`
                                                                                                    |
                                                                                         [ Front Web :3000 (Vite + TanStack Router/Query) ]
                                                                                         [ Front Electron (mesma SPA + Tauri 2 shell) ]
```

**Princípio:** 1 codebase de UI (`dashboard/` igual `zfrog/dashboard`), 2 builds.
`vite.config.ts` decide. Ponytail: não duplica rota/componente.

**Fluxo curado:**

```
Alvo --> REA/zfrog --> Evidence (JSON bruto) --> Curadoria (você marca X features)
        --> Pacote output/<id>/ --> Aplicar no Projeto J (export .md/.json OU botão "Aplicar agora" via CLI)
```

---

## 3. O que é um Pacote (decisão 7)

Formato `zfrog/output/<id>/` filtrado, não um JSON solto:

```
pacote-<nome>/
  prompt.md              # instruções prontas pro pi/omp/opencode aplicar
  evidence.json          # Evidence filtrado (só features marcadas)
  design-tokens.json     # palette, typography, spacing (reuso zfrog)
  design-tokens.md       # legível
  archive.zip            # HTML/CSS/JS filtrados + assets curados
  screenshots/           # fullpage + thumbnails
  meta.json              # { id, sourceUrl, tags, createdAt, REA version, zfrog version }
```

Export: `.zip` OU copiar `prompt.md` + `evidence.json` direto. Destino **C**: qualquer `path` local
ou `git clone <url> /tmp/j` e `pi -p "$(cat prompt.md)" --cwd /tmp/j`.

---

## 4. Busca (decisão 9)

Repetir `zfrog pond` completo no Hub:

```
zpond pond                                    # lista tudo
zpond pond --tag fintech --color "#635BFF"    # filtro sql
zpond pond --site stripe.com --search "layouts escuros com cards arredondados"  # vetorial
zpond show <id>
zpond export <id> --format html|zip
```

**Como (reuso `zfrog/catalog.py` + `visual_search.py`):**
- `cards` (id, url, site, title, mode, engine, screenshot, tokens_json, created_at)
- `card_tags` (card_id, tag) + `card_colors` (hex) + `card_embeddings` (vector da screenshot/prompt)
- Busca vetorial: embedding da screenshot em tabela separada, comparada com query. `pond --reindex` / `POST /catalog/reindex` recalcula. Sem modelo → `indexed:0` sem falhar.
- SQLite `~/.zpond/hub.db` (igual `zfrog/catalog.db` + `metrics.db`). B.

---

## 5. Fases

### FASE 0 — Inventário (1 tarde) — ✅ CONCLUÍDO 2026-10-14

- [x] `npx rea --help` → `rea@6.5.0 analyze/inspect/analyze-web-bundle` (rea-agents timeout 300s — pacote pesado, não bloqueia)
- [x] Mapear agents reais:
  - `~/.config/opencode/opencode.jsonc` ✅ 817 linhas, `playwright` + `salt` MCP, provider `kodeo` (`kodeo/grok-4.7` estável, `gpt-6-sol` timeout 10s)
  - `~/.claude.json` ✅ existe (MCP per-project, injetado via mcp-setup.mjs)
  - `pi` @ `~/.nvm/versions/node/v24.19.0/bin/pi` → `~/.pi/agent/mcp.json` ✅
  - `omp` @ `~/.bun/bin/omp` ✅ + `opencode` @ `/usr/bin/opencode` ✅
  - `~/.codex` ❌ não existe, `~/.cursor/mcp.json` ❌, `~/.gemini/antigravity/` ✅ (25 playwright + 33 salt tools)
- [x] Rodar `zfrog jump https://stripe.com` → engine `zfrog` real (6s, palette 36 cores) via `ZFROG_BIN=/home/zens/.local/bin/zfrog`; `POST /analyze` usa `zfrog` quando URL é http(s)
- [ ] Listar 2–3 stacks genéricas que provider vai encapsular (provider `rea --json` direto ainda pendente — hoje só `zfrog`)

**Saída:** `INVENTARIO.md` com supportedAgents atual + paths reais + formato Evidence.

### FASE 1 — Provider REA direto (sem fork) — ✅ ENTREGUE 2026-10-15

Não precisa fork: `zpond` não é fork do REA, é consumidor. REA usado como bin externo.

- Clone de referência: `/tmp/rea-ref` (`morluto/rea@6.5.0` — `npm ci && npm run build:cached` validado)
- Mapeado: `analyze`/`inspect` exigem Hopper/Ghidra/IDA (provider_unavailable sem eles); `analyze-javascript-application` funciona sem Hopper (Evidence JS direto); `inspect-artifact` idem para arquivos; `analyze-web-bundle` exigiria `list-browser-targets` + CDP vivo
- `hub-api/src/index.ts: POST /analyze` agora:
  - `https://…` → `zfrog jump` (como antes)
  - path local existente → tenta REA direto: diretório → `analyze-javascript-application`, arquivo → `inspect-artifact` (timeout 30s, parsing de `rea_progress` + `evidence_id`/`normalized_result`); fallback para mock se REA ausente/falhou
  - env `REA_BIN` aponta para `scripts/rea.mjs` quando `/tmp/rea-ref` existe, senão `npx --yes rea-agents`
- Git inicializado em `zpond/` (.gitignore: `node_modules/`, `dist/`, `src-tauri/target/`, `*.db`, `output/`); fork público = só `gh repo create` + `git remote add upstream https://github.com/morluto/rea.git` quando quiser travar versão
- Smoke 2026-10-15: `POST /analyze {url:/tmp/rea-test-app, tag:rea-smoke}` → `engine:rea-js` `evidence_id:ev_d2eb…` ok
### FASE 2 — Conector Universal de Agents (1 dia) — ✅ CONCLUÍDO

- `mcp-setup.mjs` com `stripJsonc` (// e /* */ + trailing commas), paths absolutos via `fileURLToPath`, `ROOT/MCP_ENTRY`
- Injeta `zpond` → `node <zpond>/hub-api/dist/mcp-server.js` (stdio, `exposure: deferred`, `timeout: 30`) em:
  - `~/.pi/agent/mcp.json` ✅
  - `~/.config/opencode/opencode.jsonc` (`mcp.zpond` local) ✅ — JSONC preservado
  - `~/.claude.json` ✅
- MCP server: `handleMcp` com `TOOLS` (5 tools), `pond_search` suporta `color`, `site`, `search` + `DISTINCT`, framing `Content-Length` + line-delimited, `isRecord` guard canônico
- `pi mcp list` / `opencode` mostram `zpond: connected` | Antigravity manual (copiar diretório) — não automático

### FASE 3 — Hub API :3333 (2 dias) — ✅ MVP ENTREGUE (sem vetorial)

Stack: Node 22+ (`zfrog` via `spawn` estático, sem `await import` dinâmico).

```
GET  /targets              # chrome :9222 (800ms timeout) — hint se vazio
POST /analyze { url,tag,tags,note } # zfrog jump real via ZFROG_BIN (20s wall), fallback mock
GET  /extractions / :id    # viewer
POST /packages { card_id,selectedFeatures } → prompt.md + evidence/tokens filtrados
GET  /packages / :id
POST /packages/:id/apply { dest,agent } # pi/omp/opencode (wall 210s, idle 45s, modelo kodeo/grok-4.7)
GET  /pond?tag=&color=&search=&site=&limit=
POST /catalog/reindex      # retorna { indexed:0, total, reason:"no embedding" } — vetorial pendente
```

Persistência: `node:sqlite` (`node:sqlite` nativo, sem `better-sqlite3`) em `~/.zpond/hub.db` + `card_tags`/`card_colors`/`card_embeddings`/`packages`.
Guards canônicos `hub-api/src/guards.ts#isRecord`, `import type` no topo, `Record<string,true>` lookup, `clearTimeout` sem guard redundante.

### FASE 4 — Front MVP A (2 dias) — ✅ ENTREGUE

Reuso `zfrog/dashboard` (React 19 + TanStack Router/Query + Tailwind 4 + Vite).

4 rotas: `/` Alvos (url+tag→Analisar, Observar 10s polling :9222, extrações recentes, 📂 Tauri pick), `/e/$id` Viewer (tokens+evidence, seleção features, Gerar Pacote, Export .md/.json, Aplicar no Projeto J com agent select, wall 240s), `/pond` (search+tag), `/packages` (lista pacotes + download .md/.json)

`dashboard/src/lib/guards.ts#isRecord` + `isRecord` em tokens/evidence/keys, `hasStringField` helper, `isTauri` com dynamic import justificado (Tauri só no desktop), sem `as` inline.

Build: `vite build` 285kB (gzip 92kB) + `tsc --noEmit` ok. `npm run dev -- --port 3067`, `desktop:dev` via `src-tauri/tauri.conf.json` (com.zpond.desktop, tray, dialog/opener).

### FASE 5 — Pacotes + Aplicar — ✅ ENTREGUE (fluxo C completo)

- Viewer `/e/$id`: checkboxes de features (keys de tokens+evidence), `Gerar Pacote` → `POST /packages`, preview `prompt_md`, `Export .md/.json` via Blob, `Aplicar no Projeto J` (input path/git url + select pi/omp/opencode, `fetch /packages/:id/apply` com AbortController 240s, Tauri 📂 pick)
- `POST /packages {card_id,selectedFeatures}` filtra tokens/evidence (fallback mantém original se filtro zerou), gera `prompt.md` via `buildPrompt`
- `POST /packages/:id/apply`: git clone se `dest` é git url, `writeFileSync` PROMPT.md/evidence.json/design-tokens.json, spawn `pi/omp/opencode` com `wall 210s + idle 45s`, persiste `PROMPT.out.jsonl`, `fallback:true` se falhou
- API já usada pelo smoke: `engine zfrog` 5.7s, pacote `2a1bf891` palette 3, pond filter `tag=smoke` ok, reindex `total:9`

---

## 6. Stack fechada

| Camada | Escolha | Por quê |
|---|---|---|
| REA Core | Fork `morluto/rea` (Node 22+) | Motor, não reescrever |
| Hub API | Node 22+ + `better-sqlite3` | Chama `rea --json`/`zfrog --json` como subprocess |
| Front Web | Vite + React 19 + TanStack Router/Query + Tailwind 4 | Mesmo de `zfrog/dashboard` — reuso |
| Desktop | Tauri 2 (Rust) | Mesmo de `zfrog/src-tauri` — reuso, app na tray |
| DB | SQLite `~/.zpond/hub.db` | `zfrog/catalog.db` pattern |
| Vetores | Tabela `card_embeddings` + reindex | `zfrog/visual_search.py` pattern |
| Agents | `pi`/`omp`/`opencode` + auto-detecção genérica | Inventário Fase 0 |

---

## 7. O que NÃO fazer (YAGNI)

- Abstração genérica de providers antes de 1 provider real
- Reescrever descompilador / análise do zero (encapsular `semgrep`/`tree-sitter`/`docker inspect`/`HAR` quando doer)
- Suporte Windows/Linux exótico, auth multi-user, multi-workspace
- IDE própria — front só orquestra `rea --json`

---

## 8. Próximos passos imediatos

1. ~~Completar Fase 0~~ ✅
2. ~~Dashboard~~ ✅ — 4 rotas no `:3067`, `npm run dev` / `desktop:dev` ok
3. ~~Hub API~~ ✅ — 10 cards em `~/.zpond/hub.db` (inclui `rea-js`), `ZFROG_BIN` absoluto, `POST /catalog/reindex` com `total`
4. ~~Fase 1 REA direto~~ ✅ — falta só `git remote add upstream morluto/rea` + push público quando quiser (não bloqueia)
5. Vetorial: `card_embeddings` + embedding model para `POST /pond?search=` semântico

## 9. Referências

- `zfrog`: `/home/zens/allkodex/all-kode/all-kodez/ens-kody/ProjetosA/zfrog` — `pyproject.toml`, `dashboard/package.json`, `src/zfrog/catalog.py`, `src/zfrog/visual_search.py`, `src/zfrog/engines/analyze.py`
- `opencode`: `~/.config/opencode/opencode.jsonc` (mcp `playwright` + `salt`)
- REA: `morluto/rea` (a clonar)

## MVP A+B — entregue 2026-10-14 (smoke revalidado após lint guards)
- `hub-api :3333`: `GET /health|/targets|/pond|/extractions|/extractions/:id`, `POST /analyze {url,tag,tags,note}` (engine `zfrog` real via `ZFROG_BIN=/home/zens/.local/bin/zfrog` em 6s, fallback `mock`), `POST /catalog/reindex` — `node:sqlite` (node 24, sem nativo)
- `dashboard :3067`: `/` Alvos (url+tag→Analisar, Observar 10s polling :9222, extrações recentes), `/e/$id` Viewer (tokens+evidence raw), `/pond` (search+tag→/pond)
- Build: `hub-api/dist` + `dashboard/dist` ok
- Pacotes: `POST /packages {card_id,selectedFeatures}` → filtra tokens/evidence, gera prompt.md, `POST /packages/:id/apply {dest}`
- Apply loop C: `pi/omp/opencode` spawn `--provider kodeo --model kodeo/grok-4.7` (`gpt-6-sol` timed out em 10s), wall `210s`, persist `90k`, tail `15k`, exit `143` ok, opencode com `--auto` (external_directory sem ele)
- Conector MCP: `mcp-setup.mjs` injeta `zpond` em `~/.pi/agent/mcp.json` + `~/.config/opencode/opencode.jsonc` + `~/.claude.json` (pi mcp list ✓)
- Tauri: `src-tauri/tauri.conf.json` (com.zpond.desktop), scripts `desktop:dev|build`
