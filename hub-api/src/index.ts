import { isRecord } from "./guards.js";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, name: "zpond", version: "0.1.0" }));

// ponytail: chrome tabs via 9222; fallback empty with hint — real providers (rea/zfrog) in Fase 3
app.get("/targets", async (_req, res) => {
  const targets: unknown[] = [];
  try {
    const r = await fetch("http://127.0.0.1:9222/json/list", { signal: AbortSignal.timeout(800) });
    if (r.ok) {
      const tabsUnknown: unknown = await r.json();
      if (Array.isArray(tabsUnknown)) {
        for (const t of tabsUnknown) {
          if (typeof t !== "object" || t === null) continue;
          if (!("id" in t) || !("url" in t)) continue;
          const idVal = t.id;
          const urlVal = t.url;
          if (typeof idVal !== "string" || typeof urlVal !== "string") continue;
          const titleVal = "title" in t ? t.title : "";
          const title = typeof titleVal === "string" ? titleVal : "";
          targets.push({ kind: "chrome-tab", id: idVal, title, url: urlVal });
        }
      }
    }
  } catch {}
  if (targets.length === 0) {
    return res.json({ items: [], hint: "Abra Chrome com --remote-debugging-port=9222 ou use POST /analyze {url}" });
  }
  res.json({ items: targets });
});

app.post("/analyze", async (req, res) => {
  const bodyUnknown: unknown = req.body;
  if (typeof bodyUnknown !== "object" || bodyUnknown === null || !("url" in bodyUnknown)) {
    return res.status(400).json({ error: "url required" });
  }
  const urlVal = bodyUnknown.url;
  if (typeof urlVal !== "string" || !urlVal) return res.status(400).json({ error: "url required" });
  const url = urlVal;
  const tagVal = "tag" in bodyUnknown && typeof bodyUnknown.tag === "string" ? bodyUnknown.tag : undefined;
  const tagsRawVal = "tags" in bodyUnknown ? bodyUnknown.tags : undefined;
  const noteVal = "note" in bodyUnknown && typeof bodyUnknown.note === "string" ? bodyUnknown.note : undefined;
  const engineHintVal = "engine" in bodyUnknown && typeof bodyUnknown.engine === "string" ? bodyUnknown.engine : "mode" in bodyUnknown && typeof bodyUnknown.mode === "string" ? bodyUnknown.mode : undefined;
  const engineHint = typeof engineHintVal === "string" ? engineHintVal.toLowerCase() : "";

  let tagsInput: string[] = [];
  if (Array.isArray(tagsRawVal)) {
    for (const e of tagsRawVal) if (typeof e === "string") tagsInput.push(e);
  }

  let site = "local";
  try { site = new URL(url).hostname.replace(/^www\./, "") || "local"; } catch { site = url.slice(0, 30); }
  const id = randomUUID().slice(0, 8);
  const now = Date.now() / 1000;
  const title = url;
  const tags: string[] = [...tagsInput, ...(tagVal ? [tagVal] : [])].map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean);

  let tokens: Record<string, unknown> = { url, title, palette: [{ hex: "#635BFF", count: 12, role: "primary" }], fonts: [{ family: "Inter", count: 1 }] };
  let evidence: Record<string, unknown> = { source: "mock", url, extractedAt: new Date().toISOString(), note: noteVal ?? "" };
  let engine = "mock";
  let zfrogCardId: string | null = null;

  // provider REA direto: se path local existe, tenta analyze-javascript-application / inspect-artifact sem precisar de Hopper/Ghidra
  async function runReaJson(args: string[], timeoutMs: number): Promise<Record<string, unknown> | null> {
    const vendorMjs = "/home/zens/allkodex/all-kode/all-kodez/ens-kody/ProjetosB/zpond/vendor/rea/scripts/rea.mjs";
    const reaMjs = process.env.REA_BIN ?? vendorMjs;
    const useLocal = existsSync(reaMjs);
    if (!useLocal && !process.env.REA_BIN) return null;
    const cmd = useLocal ? process.execPath : "npx";
    const cmdArgs = useLocal ? [reaMjs, ...args, "--format", "json"] : ["--yes", "rea-agents", ...args, "--format", "json"];
    try {
      const out = await new Promise<string>((resolve, reject) => {
        const cp = spawn(cmd, cmdArgs, { timeout: timeoutMs });
        let so = "";
        let done = false;
        const to = setTimeout(() => { if (!done) { try { cp.kill(); } catch {} reject(new Error("rea timeout")); } }, timeoutMs);
        cp.stdout?.on("data", (d) => { so += String(d); });
        cp.stderr?.on("data", () => {});
        cp.on("error", (e) => { clearTimeout(to); reject(e); });
        cp.on("close", () => { clearTimeout(to); done = true; resolve(so); });
      });
      // REA emite linhas rea_progress + última linha com evidence_id
      const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const p: unknown = JSON.parse(lines[i]);
          if (isRecord(p) && ("evidence_id" in p || "evidenceId" in p || "normalized_result" in p)) return p;
          if (isRecord(p) && "error" in p) return null;
        } catch {}
      }
      return null;
    } catch { return null; }
  }

  if (/^https?:\/\//.test(url)) {
    const wantRea = engineHint === "rea" || engineHint === "bundle" || engineHint === "js";
    if (wantRea) {
      try {
        const tmpRoot = `/tmp/zpond-remote-${Date.now()}`;
        mkdirSync(tmpRoot, { recursive: true });
        const isJs = url.endsWith(".js") && !url.endsWith(".html");
        const dest = isJs ? join(tmpRoot, "bundle.js") : join(tmpRoot, "index.html");
        const html = await fetch(url, { signal: AbortSignal.timeout(15000) }).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.text();
        }).catch(() => "");
        if (html) {
          writeFileSync(dest, html, "utf8");
          const target = isJs ? dest : tmpRoot;
          const isDir = !isJs;
          const reaArgs = isDir ? ["analyze-javascript-application", target] : ["inspect-artifact", target];
          const reaRes = await runReaJson(reaArgs, 60000);
          if (reaRes) {
            evidence = { source: "rea", url, rea: reaRes, note: noteVal ?? "", extractedAt: new Date().toISOString() };
            const norm: unknown = reaRes.normalized_result ?? reaRes;
            if (isRecord(norm)) {
              const summary: Record<string, unknown> = { url, reaEvidenceId: reaRes.evidence_id ?? reaRes.evidenceId };
              if ("inventory_manifest" in norm) summary.inventory = norm.inventory_manifest;
              if ("application_graph" in norm) summary.graph = "js-application";
              tokens = { ...tokens, rea: summary, raw: norm };
            } else tokens = { ...tokens, rea: reaRes };
            engine = "rea-remote";
          }
        }
      } catch {}
    }
    if (engine === "mock") {
      try {
        const zfrogBin = process.env.ZFROG_BIN ?? "/home/zens/.local/bin/zfrog";
        const zfrogOutBase = process.env.ZFROG_OUTPUT ?? "/home/zens/allkodex/all-kode/all-kodez/ens-kody/ProjetosA/zfrog/output";
        const beforeList = existsSync(zfrogOutBase) ? readdirSync(zfrogOutBase) : [];
        const beforeLookup: Record<string, true> = {};
        for (const d of beforeList) beforeLookup[d] = true;
        const tmpOut = `/tmp/zpond-analyze-${Date.now()}`;
        const args = ["jump", url, "--output", tmpOut];
        if (tags.length) for (const t of tags.slice(0, 3)) args.push("--tag", t);
        const ok = await new Promise<boolean>(resolve => {
          const cp = spawn(zfrogBin, args, { timeout: 20000 });
          let done = false;
          const to = setTimeout(()=>{ if(!done){ try{cp.kill();}catch{} resolve(false); }}, 20000);
          cp.on("error", ()=>{ clearTimeout(to); resolve(false); });
          cp.on("close", code => { clearTimeout(to); done=true; resolve(code===0); });
        });
        let dtPath: string | null = null;
        for (const base of [tmpOut, zfrogOutBase]) {
          if (!existsSync(base)) continue;
          const after = readdirSync(base);
          for (const d of after) {
            const cand = join(base, d, "design-tokens.json");
            if (existsSync(cand)) {
              if (base===tmpOut || !beforeLookup[d]) { dtPath = cand; zfrogCardId = d; break; }
            }
          }
          if (dtPath) break;
          if (base===zfrogOutBase && after.length) {
            let best: string | null = null; let bestM=0;
            for (const d of after) {
              const cand = join(base, d, "design-tokens.json");
              if (!existsSync(cand)) continue;
              try {
                const st = statSync(cand);
                if (st.mtimeMs > bestM) { bestM=st.mtimeMs; best=cand; zfrogCardId=d; }
              } catch {}
            }
            if (best) { dtPath=best; break; }
          }
        }
        if (dtPath && existsSync(dtPath)) {
          const raw = readFileSync(dtPath, "utf8");
          const parsed: unknown = JSON.parse(raw);
          if (isRecord(parsed)) tokens = parsed;
          evidence = { source: "zfrog", url, cardId: zfrogCardId, designTokensPath: dtPath, note: noteVal ?? "", extractedAt: new Date().toISOString() };
          engine = "zfrog";
        } else if (ok && zfrogCardId) {
          engine = "zfrog-no-tokens";
        }
      } catch {}
    }
  } else if (existsSync(url)) {
    try {
      const st = statSync(url);
      const isDir = st.isDirectory();
      const reaArgs = isDir ? ["analyze-javascript-application", url] : ["inspect-artifact", url];
      const reaRes = await runReaJson(reaArgs, 30000);
      if (reaRes) {
        evidence = { source: "rea", url, rea: reaRes, note: noteVal ?? "", extractedAt: new Date().toISOString() };
        // normaliza tokens mínimos a partir do REA
        const norm: unknown = reaRes.normalized_result ?? reaRes;
        if (isRecord(norm)) {
          const summary: Record<string, unknown> = { url, reaEvidenceId: reaRes.evidence_id ?? reaRes.evidenceId };
          if ("inventory_manifest" in norm) summary.inventory = norm.inventory_manifest;
          if ("application_graph" in norm) summary.graph = "js-application";
          tokens = { ...tokens, rea: summary, raw: norm };
        } else {
          tokens = { ...tokens, rea: reaRes };
        }
        engine = isDir ? "rea-js" : "rea-artifact";
        try { site = url.split("/").filter(Boolean).pop()?.slice(0, 30) ?? site; } catch {}
      }
    } catch {}
  }

  const db = getDb();
  db.prepare("INSERT INTO cards (id, url, site, title, source, engine, screenshot, tokens_json, evidence_json, note, created_at, bytes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
    id, url, site, title, "rea", engine, "", JSON.stringify(tokens), JSON.stringify(evidence), noteVal ?? "", now, 0,
  );
  for (const t of tags) {
    try { db.prepare("INSERT OR IGNORE INTO card_tags (card_id, tag) VALUES (?,?)").run(id, t); } catch {}
    const paletteVal = tokens.palette;
    const paletteEntries: unknown[] = Array.isArray(paletteVal) ? paletteVal : [];
    for (const entry of paletteEntries) {
      if (typeof entry !== "object" || entry === null || !("hex" in entry)) continue;
      const hexVal = entry.hex;
      if (typeof hexVal !== "string") continue;
      try { db.prepare("INSERT OR IGNORE INTO card_colors (card_id, hex) VALUES (?,?)").run(id, hexVal.toLowerCase()); } catch {}
    }
  }
  if (tags.length === 0) {
    try { db.prepare("INSERT OR IGNORE INTO card_colors (card_id, hex) VALUES (?,?)").run(id, "#635bff"); } catch {}
  }
  const rowUnknown: unknown = db.prepare("SELECT * FROM cards WHERE id = ?").get(id);
  res.status(201).json(rowUnknown);
});

const VEC_DIM = 128;

function describeCard(cardRow: Record<string, unknown>, tags: string[]): string {
  const tokens = parseRecordJson(cardRow.tokens_json as unknown);
  const parts: string[] = [];
  if (typeof cardRow.title === "string" && cardRow.title) parts.push(cardRow.title);
  if (typeof cardRow.note === "string" && cardRow.note) parts.push(cardRow.note);
  if (tags.length) parts.push(...tags);
  if (typeof cardRow.site === "string" && cardRow.site) parts.push(cardRow.site);
  const paletteVal = tokens.palette;
  const palette: unknown[] = Array.isArray(paletteVal) ? paletteVal.slice(0, 5) : [];
  for (const entry of palette) {
    if (typeof entry !== "object" || entry === null || !("hex" in entry)) continue;
    const hexRaw = String((entry as Record<string, unknown>).hex ?? "").replace(/^#/, "").trim();
    if (hexRaw.length !== 6) continue;
    const r = parseInt(hexRaw.slice(0, 2), 16) / 255;
    const g = parseInt(hexRaw.slice(2, 4), 16) / 255;
    const b = parseInt(hexRaw.slice(4, 6), 16) / 255;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) continue;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const l = (minc + maxc) / 2;
    let s = 0;
    let h = 0;
    if (minc !== maxc) {
      const d = maxc - minc;
      s = l <= 0.5 ? d / (maxc + minc) : d / (2 - maxc - minc);
      const rc = (maxc - r) / d;
      const gc = (maxc - g) / d;
      const bc = (maxc - b) / d;
      if (r === maxc) h = bc - gc;
      else if (g === maxc) h = 2 + rc - bc;
      else h = 4 + gc - rc;
      h = (h / 6) % 1;
      if (h < 0) h += 1;
    }
    const lightness = l;
    const saturation = s;
    const hue = h * 360;
    const lightnessWords: [number, string][] = [[0.18, "very dark"], [0.35, "dark"], [0.65, "light"], [1.01, "very light"]];
    let lw = "very light";
    for (const [lim, name] of lightnessWords) if (lightness < lim) { lw = name; break; }
    const words = [lw];
    if (saturation >= 0.25) {
      const hueWords: [number, string][] = [[15, "red"], [45, "orange"], [70, "yellow"], [165, "green"], [200, "cyan"], [255, "blue"], [290, "violet"], [345, "pink"], [361, "red"]];
      let hn = "red";
      for (const [lim, name] of hueWords) if (hue < lim) { hn = name; break; }
      words.push(hn, "vivid");
    } else words.push("neutral");
    const role = typeof (entry as Record<string, unknown>).role === "string" ? String((entry as Record<string, unknown>).role) : "";
    parts.push(`${role ? `color ${role}` : "color"} ${words.join(" ")}`);
  }
  const fontsVal = tokens.fonts;
  const fonts: unknown[] = Array.isArray(fontsVal) ? fontsVal.slice(0, 3) : [];
  for (const f of fonts) {
    if (typeof f !== "object" || f === null) continue;
    const fam = typeof (f as Record<string, unknown>).family === "string" ? String((f as Record<string, unknown>).family) : "";
    if (!fam) continue;
    const generic = /serif|times|georgia|playfair/i.test(fam) ? "serif" : "sans-serif";
    parts.push(`typography ${generic} ${fam}`);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function embedText(text: string): number[] {
  const vec = new Array(VEC_DIM).fill(0) as number[];
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  for (const w of words) {
    let h = 0;
    for (let i = 0; i < w.length; i++) h = ((h << 5) - h + w.charCodeAt(i)) | 0;
    const idx = Math.abs(h) % VEC_DIM;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

async function embedTextRemote(text: string): Promise<{ vec: number[]; model: string } | null> {
  const url = process.env.ZPOND_EMBEDDING_URL;
  if (!url) return null;
  const model = process.env.ZPOND_EMBEDDING_MODEL ?? "remote";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: text, model }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j: unknown = await r.json();
    if (typeof j !== "object" || j === null || !("data" in j)) return null;
    const dataVal = (j as Record<string, unknown>).data;
    const arr = Array.isArray(dataVal) ? dataVal[0] as unknown : null;
    const emb = arr !== null && typeof arr === "object" && "embedding" in arr ? (arr as Record<string, unknown>).embedding : dataVal;
    if (Array.isArray(emb) && emb.every((e) => typeof e === "number") && emb.length > 0) return { vec: emb as number[], model };
  } catch {}
  return null;
}

async function embedForReindex(text: string): Promise<{ vec: number[]; model: string }> {
  const remote = await embedTextRemote(text);
  if (remote) return remote;
  return { vec: embedText(text), model: "hash-128" };
}

function cosineSim(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

app.get("/pond", async (req, res) => {
  const queryUnknown: unknown = req.query;
  let tag: string | undefined;
  let color: string | undefined;
  let site: string | undefined;
  let search: string | undefined;
  let limitRaw: string | undefined;
  if (typeof queryUnknown === "object" && queryUnknown !== null) {
    if ("tag" in queryUnknown && typeof queryUnknown.tag === "string") tag = queryUnknown.tag;
    if ("color" in queryUnknown && typeof queryUnknown.color === "string") color = queryUnknown.color;
    if ("site" in queryUnknown && typeof queryUnknown.site === "string") site = queryUnknown.site;
    if ("search" in queryUnknown && typeof queryUnknown.search === "string") search = queryUnknown.search;
    if ("limit" in queryUnknown && typeof queryUnknown.limit === "string") limitRaw = queryUnknown.limit;
  }
  const limit = Math.min(parseInt(limitRaw ?? "20", 10) || 20, 100);
  const db = getDb();
  let sql = "SELECT c.* FROM cards c";
  const joins: string[] = [];
  const wheres: string[] = [];
  const params: (string|number)[] = [];

  if (tag) {
    joins.push("JOIN card_tags t ON t.card_id = c.id");
    wheres.push("t.tag = ?");
    params.push(tag.toLowerCase().trim().replace(/^#/, ""));
  }
  if (color) {
    joins.push("JOIN card_colors col ON col.card_id = c.id");
    wheres.push("col.hex = ?");
    params.push(color.toLowerCase());
  }
  if (site) {
    wheres.push("c.site LIKE ?");
    params.push(`%${site}%`);
  }

  if (joins.length) sql += " " + joins.join(" ");
  if (wheres.length) sql += " WHERE " + wheres.join(" AND ");
  sql += " ORDER BY c.created_at DESC LIMIT 1000";

  const rowsUnknown: unknown = db.prepare(sql).all(...params);
  const rowsAll = Array.isArray(rowsUnknown) ? (rowsUnknown as Record<string, unknown>[]) : [];

  if (search) {
    const embRowsUnknown: unknown = db.prepare("SELECT card_id, vector FROM card_embeddings").all();
    const embMap: Record<string, number[]> = {};
    if (Array.isArray(embRowsUnknown)) {
      for (const r of embRowsUnknown) {
        if (typeof r !== "object" || r === null || !("card_id" in r) || !("vector" in r)) continue;
        const cid = (r as Record<string, unknown>).card_id;
        const vecStr = (r as Record<string, unknown>).vector;
        if (typeof cid !== "string" || typeof vecStr !== "string") continue;
        try {
          const v: unknown = JSON.parse(vecStr);
          if (Array.isArray(v) && v.every((e) => typeof e === "number")) embMap[cid] = v as number[];
        } catch {}
      }
    }
    if (Object.keys(embMap).length > 0) {
      const remoteQ = await embedTextRemote(search);
      const qVec = remoteQ ? remoteQ.vec : embedText(search);
      const scored = rowsAll.map((r) => {
        const cid = typeof r.id === "string" ? r.id : "";
        const v = embMap[cid];
        let score = v ? cosineSim(qVec, v) : 0;
        if (score === 0) {
          const hay = `${String(r.title ?? "")} ${String(r.url ?? "")} ${String(r.note ?? "")}`.toLowerCase();
          const terms = search.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
          if (terms.length) score = terms.filter((t) => hay.includes(t)).length / terms.length * 0.5;
        }
        return { row: r, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const filtered = scored.filter((s) => s.score > 0).slice(0, limit).map((s) => s.row);
      const out = filtered.length ? filtered : scored.slice(0, limit).map((s) => s.row);
      return res.json({ items: out, count: out.length });
    }
    const like = `%${search}%`;
    const filtered = rowsAll.filter((r) => {
      const hay = `${String(r.title ?? "")} ${String(r.url ?? "")} ${String(r.note ?? "")}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
    void like;
    return res.json({ items: filtered.slice(0, limit), count: Math.min(filtered.length, limit) });
  }

  const out = rowsAll.slice(0, limit);
  res.json({ items: out, count: out.length });
});

app.get("/extractions", (_req, res) => {
  const db = getDb();
  const rowsUnknown: unknown = db.prepare("SELECT * FROM cards ORDER BY created_at DESC LIMIT 50").all();
  const rows = Array.isArray(rowsUnknown) ? rowsUnknown : [];
  res.json({ items: rows });
});

app.get("/extractions/:id", (req, res) => {
  const id = req.params.id;
  const db = getDb();
  const rowUnknown: unknown = db.prepare("SELECT * FROM cards WHERE id = ?").get(id);
  if (!rowUnknown) return res.status(404).json({ error: "not found" });
  res.json(rowUnknown);
});

app.post("/catalog/reindex", async (_req, res) => {
  const db = getDb();
  const cntUnknown: unknown = db.prepare("SELECT count(*) as c FROM cards").get();
  let total = 0;
  if (typeof cntUnknown === "object" && cntUnknown !== null && "c" in cntUnknown) {
    const c = (cntUnknown as Record<string, unknown>).c;
    if (typeof c === "number") total = c;
    if (typeof c === "bigint") total = Number(c);
  }
  const rowsUnknown: unknown = db.prepare("SELECT * FROM cards").all();
  const rows = Array.isArray(rowsUnknown) ? (rowsUnknown as Record<string, unknown>[]) : [];
  let indexed = 0;
  let modelUsed = "hash-128";
  for (const row of rows) {
    const cid = typeof row.id === "string" ? row.id : "";
    if (!cid) continue;
    let tags: string[] = [];
    try {
      const tRowsUnknown: unknown = db.prepare("SELECT tag FROM card_tags WHERE card_id = ?").all(cid);
      if (Array.isArray(tRowsUnknown)) tags = tRowsUnknown.map((r) => typeof (r as Record<string, unknown>).tag === "string" ? String((r as Record<string, unknown>).tag) : "").filter(Boolean);
    } catch {}
    const desc = describeCard(row, tags);
    const text = desc || `${String(row.title ?? "")} ${String(row.site ?? "")} ${String(row.note ?? "")}`;
    const { vec, model } = await embedForReindex(text);
    modelUsed = model;
    try {
      db.prepare("INSERT OR REPLACE INTO card_embeddings (card_id, vector, model, updated_at) VALUES (?,?,?,?)").run(cid, JSON.stringify(vec), model, Date.now() / 1000);
      indexed++;
    } catch {}
  }
  res.json({ indexed, total, model: modelUsed, reason: indexed ? "" : "nothing to index" });
});

function parseRecordJson(v: unknown): Record<string, unknown> {
  if (typeof v !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(v);
    if (isRecord(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

function buildPrompt(card: Record<string, unknown>, selected: string[]): string {
  const url = typeof card.url === "string" ? card.url : "";
  const site = typeof card.site === "string" ? card.site : "";
  const tokens = parseRecordJson(card.tokens_json);
  const ev = parseRecordJson(card.evidence_json);
  const createdAt = typeof card.created_at === "number" || typeof card.created_at === "string" ? String(card.created_at) : "";
  const keep: string[] = selected.length ? selected : ["palette","typography","layout","colors"];
  return `# Pacote zpond — inspirado em ${site}

> Referência: ${url}
> Extraído: ${createdAt} — features: ${keep.join(", ")}

## O que aplicar (inspirado, não cópia)

${keep.map(k=>{
  const vt = tokens[k];
  const ve = ev[k];
  const val = vt !== undefined ? vt : ve !== undefined ? ve : "(ver evidence.json)";
  return `- **${k}**: extraído em ${JSON.stringify(val)} `;
}).join("\n")}

## Instruções para o agente (pi/omp/opencode)

1. Leia \`evidence.json\` e \`design-tokens.json\` deste pacote.
2. Crie/adapte componentes no projeto destino mantendo seu design system — use a referência como inspiração de espaçamento, hierarquia e paleta, não cópia literal.
3. Preserve a11y e responsivo.

## Evidence (resumo)

\`\`\`json
${JSON.stringify({ tokens, evidence: ev }, null, 2).slice(0, 4000)}
\`\`\`
`;
}

app.get("/packages", (_req, res) => {
  const db = getDb();
  const rowsUnknown: unknown = db.prepare("SELECT * FROM packages ORDER BY created_at DESC LIMIT 50").all();
  const rows = Array.isArray(rowsUnknown) ? rowsUnknown : [];
  res.json({ items: rows });
});

app.post("/packages", (req, res) => {
  const bodyUnknown: unknown = req.body;
  if (typeof bodyUnknown !== "object" || bodyUnknown === null) return res.status(400).json({ error: "card_id required" });
  const cidRaw = "card_id" in bodyUnknown ? bodyUnknown.card_id : "cardId" in bodyUnknown ? bodyUnknown.cardId : undefined;
  if (typeof cidRaw !== "string" || !cidRaw) return res.status(400).json({ error: "card_id required" });
  const cid = cidRaw;
  const nameVal = "name" in bodyUnknown && typeof bodyUnknown.name === "string" ? bodyUnknown.name : undefined;
  const destVal = "dest" in bodyUnknown && typeof bodyUnknown.dest === "string" ? bodyUnknown.dest : undefined;
  let feats: string[] = [];
  const sf = "selectedFeatures" in bodyUnknown ? bodyUnknown.selectedFeatures : undefined;
  const s = "selected" in bodyUnknown ? bodyUnknown.selected : undefined;
  if (Array.isArray(sf)) feats = sf.filter((e): e is string => typeof e === "string");
  else if (Array.isArray(s)) feats = s.filter((e): e is string => typeof e === "string");

  const db = getDb();
  const cardUnknown: unknown = db.prepare("SELECT * FROM cards WHERE id = ?").get(cid);
  if (typeof cardUnknown !== "object" || cardUnknown === null) return res.status(404).json({ error: "card not found" });
  if (!isRecord(cardUnknown)) return res.status(404).json({ error: "card not found" });
  const card = cardUnknown;
  const tokens = parseRecordJson(card.tokens_json);
  const evidence = parseRecordJson(card.evidence_json);
  const filteredTokens = feats.length ? Object.fromEntries(Object.entries(tokens).filter(([k])=>feats.includes(k))) : tokens;
  const filteredEvidence = feats.length ? Object.fromEntries(Object.entries(evidence).filter(([k])=>feats.includes(k))) : evidence;
  const outTokens = Object.keys(filteredTokens).length ? filteredTokens : tokens;
  const outEvidence = Object.keys(filteredEvidence).length ? filteredEvidence : evidence;
  const id = randomUUID().slice(0, 8);
  const now = Date.now() / 1000;
  const prompt = buildPrompt(card, feats);
  const meta = { id, card_id: cid, selectedFeatures: feats, createdAt: new Date().toISOString(), sourceUrl: card.url, site: card.site };
  db.prepare("INSERT INTO packages (id, card_id, name, prompt_md, evidence_json, tokens_json, meta_json, dest, created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(
    id, cid, nameVal ?? `pacote-${cid}`, prompt, JSON.stringify(outEvidence), JSON.stringify(outTokens), JSON.stringify(meta), destVal ?? "", now,
  );
  const rowUnknown: unknown = db.prepare("SELECT * FROM packages WHERE id = ?").get(id);
  res.status(201).json(rowUnknown);
});

app.get("/packages/:id", (req, res) => {
  const id = req.params.id;
  const db = getDb();
  const rowUnknown: unknown = db.prepare("SELECT * FROM packages WHERE id = ?").get(id);
  if (!rowUnknown) return res.status(404).json({ error: "not found" });
  res.json(rowUnknown);
});

// fluxo C: pi/omp/opencode apply — spawn real com wall 210s; fallback instrução se agent ausente
app.post("/packages/:id/apply", async (req, res) => {
  const bodyUnknown: unknown = req.body;
  let destVal: string | undefined;
  let agentVal: string | undefined;
  if (typeof bodyUnknown === "object" && bodyUnknown !== null) {
    if ("dest" in bodyUnknown && typeof bodyUnknown.dest === "string") destVal = bodyUnknown.dest;
    if ("agent" in bodyUnknown && typeof bodyUnknown.agent === "string") agentVal = bodyUnknown.agent;
  }
  if (!destVal) return res.status(400).json({ error: "dest required (path local ou git url)" });
  const dest = destVal;
  const agent = agentVal;
  const db = getDb();
  const pkgUnknown: unknown = db.prepare("SELECT * FROM packages WHERE id = ?").get(req.params.id);
  if (typeof pkgUnknown !== "object" || pkgUnknown === null) return res.status(404).json({ error: "package not found" });
  if (!isRecord(pkgUnknown)) return res.status(404).json({ error: "package not found" });
  const pkg = pkgUnknown;
  const want = (agent ?? process.env.ZPOND_APPLY_AGENT ?? "pi").toLowerCase();
  const promptRaw = pkg.prompt_md;
  const prompt = typeof promptRaw === "string" ? promptRaw : "";

  let cwd = dest;
  const isGit = /^https?:\/\/.+\.git|github\.com/.test(dest);
  if (isGit) {
    try {
      const tmp = `/tmp/zpond-apply-${Date.now()}`;
      await new Promise<void>((resolve, reject) => {
        const cp = spawn("git", ["clone", dest, tmp], { timeout: 15000 });
        cp.on("error", reject); cp.on("close", c=> c===0? resolve() : reject(new Error(String(c))));
        setTimeout(()=>{ try{cp.kill();}catch{} reject(new Error("git clone timeout")); }, 15000);
      });
      cwd = tmp;
    } catch (e) { return res.status(400).json({ error: `git clone falhou: ${String(e)}` }); }
  }

  try {
    if (!existsSync(cwd)) return res.status(400).json({ error: `dest não existe: ${cwd}` });
    const piBin = process.env.PI_BIN ?? "/home/zens/.nvm/versions/node/v24.19.0/bin/pi";
    const ompBin = process.env.OMP_BIN ?? "/home/zens/.bun/bin/omp";
    const opencodeBin = process.env.OPENCODE_BIN ?? "/usr/bin/opencode";
    const piProvider = process.env.PI_PROVIDER ?? "kodeo";
    const piModel = process.env.PI_MODEL ?? "kodeo/grok-4.7";
    const binMap: Record<string, { cmd:string; args:string[]; cwd?:string }> = {
      pi: { cmd: piBin, args: ["-p", prompt, "--provider", piProvider, "--model", piModel], cwd },
      omp: { cmd: ompBin, args: ["-p", prompt, "--provider", piProvider, "--model", piModel, "--cwd", cwd], cwd: undefined },
      opencode: { cmd: opencodeBin, args: ["run", prompt, "--dir", cwd, "--model", piModel, "--format", "json", "--auto"], cwd: undefined },
    };
    const ent = binMap[want];
    if (!ent) return res.json({ ok: true, package: pkg, dest: cwd, instructions: `Agent ${want} desconhecido. Cole o prompt.md com --cwd ${cwd}.` });
    const spawnCwd = ent.cwd;

    const effectiveArgs = want==="pi" ? ["-p", prompt, "--provider", piProvider, "--model", piModel, "--mode", "json"] : want==="omp" ? ["-p", prompt, "--provider", piProvider, "--model", piModel, "--mode", "json", "--cwd", cwd] : ["run", prompt, "--dir", cwd, "--model", piModel, "--format", "json", "--auto"];
    const effectiveCmd = ent.cmd;
    try {
      writeFileSync(join(cwd, "PROMPT.md"), prompt, "utf-8");
      const evJson = pkg.evidence_json;
      const tokJson = pkg.tokens_json;
      writeFileSync(join(cwd, "evidence.json"), typeof evJson === "string" ? evJson : JSON.stringify(evJson ?? {}), "utf-8");
      writeFileSync(join(cwd, "design-tokens.json"), typeof tokJson === "string" ? tokJson : JSON.stringify(tokJson ?? {}), "utf-8");
    } catch {}

    const out = await new Promise<{code:number|null, stdout:string, stderr:string}>((resolve) => {
      const cp = spawn(effectiveCmd, effectiveArgs, { cwd: spawnCwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      let so="", se="";
      let done = false;
      let wall: NodeJS.Timeout | undefined;
      let idle: NodeJS.Timeout | undefined;
      const finish = (code:number|null, extra:string="")=>{
        if(done) return; done=true;
        clearTimeout(idle);
        clearTimeout(wall);
        resolve({ code, stdout: so, stderr: se+extra });
      };
      wall = setTimeout(function(){ try{ cp.kill("SIGTERM"); }catch{} setTimeout(function(){ try{ cp.kill("SIGKILL"); }catch{} finish(null, "\n[wall 210s]"); }, 5000); }, 210000);
      function bump(): void {
        clearTimeout(idle);
        idle = setTimeout(function(){
          if(so.length===0) { try{ cp.kill("SIGTERM"); }catch{} setTimeout(function(){ finish(null, "\n[idle 45s sem output]"); }, 3000); }
          else bump();
        }, 45000);
      }
      bump();
      if (cp.stdout) cp.stdout.on("data", function(d){ so+=String(d); bump(); });
      if (cp.stderr) cp.stderr.on("data", function(d){ se+=String(d); bump(); });
      cp.on("error", function(e){ finish(null, String(e)); });
      cp.on("close", function(code){ finish(typeof code === "number" ? code : null, ""); });
    });

    try {
      const soTrunc = out.stdout.slice(0, 90000);
      if(soTrunc) try{ writeFileSync(join(cwd, "PROMPT.out.jsonl"), soTrunc, "utf-8"); }catch{}
    } catch {}
    const stdoutHasAgent = out.stdout.includes("agent_start") || out.stdout.includes("agent_end") || out.stdout.trim().length>800;
    const okExit = out.code===0 || out.code===143 || out.stdout.trim().length>0;
    if (okExit && stdoutHasAgent) {
      db.prepare("UPDATE packages SET dest = ? WHERE id = ?").run(cwd, req.params.id);
      const tail = out.stdout.length>15000 ? (out.stdout.slice(0,6000)+"\n...[middle truncated]...\n"+out.stdout.slice(-9000)) : out.stdout;
      return res.json({ ok: true, package: pkg, dest: cwd, agent: want, stdout: tail, stderr: out.stderr.slice(0,2000) });
    }
    const hint = out.code===null ? "timeout/idle 30s — agente não respondeu (modelo indisponível?)": String(out.code);
    const fbTail = out.stdout.length>5000 ? out.stdout.slice(-5000) : out.stdout;
    return res.json({ ok: true, package: pkg, dest: cwd, agent: want, fallback: true, stderr: out.stderr.slice(0,2000), stdout: fbTail, instructions: `Falha spawn ${want} (${hint}). Artefatos salvos em ${cwd}/PROMPT.md — cole em ${want} com --cwd ${cwd} ou: pi -p "$(cat PROMPT.md)"` });
  } catch (e) {
    return res.json({ ok: true, package: pkg, dest: cwd, fallback: true, error: String(e), instructions: `Cole o prompt.md em ${want} com --cwd ${cwd}.` });
  }
});

const PORT = parseInt(process.env.PORT ?? "3333", 10);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`zpond hub-api http://127.0.0.1:${PORT}`);
});
