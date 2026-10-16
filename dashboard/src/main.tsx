import "./globals.css"
import React from "react"
import ReactDOM from "react-dom/client"
import { isRecord } from "./lib/guards.js";
import { createRootRoute, createRoute, createRouter, RouterProvider, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router"

const API = "http://127.0.0.1:3333"
const isTauri = typeof window !== "undefined" && "__TAURI__" in window
async function tauriPick(kind: "folder"|"file"): Promise<string|null> {
  try {
    // Tauri not available in web build — dynamic import required (platform-specific)
    const { invoke } = await import("@tauri-apps/api/core")
    const cmd = kind === "folder" ? "pick_folder" : "pick_file"
    return await invoke<string|null>(cmd)
  } catch { return null }
}
async function tauriOpen(path: string) {
  try {
    // Tauri not available in web build — dynamic import required (platform-specific)
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("open_path", { path })
  } catch {}
}
function useTheme() {
  const [theme, setTheme] = React.useState<"light" | "dark">(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("zpond-theme") : null;
    if (saved === "light" || saved === "dark") return saved;
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  React.useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.remove("dark");
    localStorage.setItem("zpond-theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme(t => t === "dark" ? "light" : "dark") } as const;
}

function fmtDate(ts: number) {
  try { return new Date(ts * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) } catch { return String(ts) }
}
function downloadBlob(content: string, filename: string, type: string) {
  const b = new Blob([content], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 800)
}

function PageHead({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-none t-fg">{title}</h1>
      {right && <span className="text-[11px] font-mono t-dim">{right}</span>}
    </div>
  )
}
function Card({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) {
  return <div className={`rounded-xl border t-border t-surface ${pad ? "p-4" : ""}`} style={{ boxShadow: "var(--shadow)" }}>{children}</div>
}

const rootRoute = createRootRoute({
  component: () => {
    const { theme, toggle } = useTheme();
    return (
    <div className="min-h-screen t-bg t-fg">
      <header className="sticky top-0 z-20 border-b t-border backdrop-blur" style={{ background: "var(--scrim)" }}>
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="flex items-baseline gap-2 shrink-0">
            <span className="text-[18px] font-semibold tracking-[-0.02em] t-fg">zpond</span>
            <span className="hidden sm:inline text-[11px] font-mono tracking-wide t-dim">a lagoa do zfrog</span>
          </Link>
          <div className="ml-2 sm:ml-6 flex items-center gap-1 text-[13px]">
            <Link to="/" className="px-2.5 py-1.5 rounded-md transition-colors nav-link [&.active]:nav-active">Alvos</Link>
            <Link to="/pond" className="px-2.5 py-1.5 rounded-md transition-colors nav-link [&.active]:nav-active">Pond</Link>
            <Link to="/packages" className="px-2.5 py-1.5 rounded-md transition-colors nav-link [&.active]:nav-active">Pacotes</Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={toggle} aria-label={theme === "dark" ? "Mudar para claro" : "Mudar para escuro"} title={theme === "dark" ? "Claro" : "Escuro"} className="t-surface t-border inline-flex items-center justify-center size-8 rounded-full cursor-pointer border">
              {theme === "light"
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="1.7"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="1.7"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>}
            </button>
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-mono t-dim">
              <span className="live-dot inline-block size-1.5 rounded-full" style={{ background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }}></span>
              Hub :3333
            </span>
            <span className="hidden sm:inline text-[11px] font-mono t-dim t-border border rounded-full px-2 py-0.5">127.0.0.1:3067</span>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8"><Outlet /></main>
      <footer className="border-t t-border mt-12">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono t-dim">
          <span>zpond · extração de tokens e patterns · hub 127.0.0.1:3333</span>
          <span>paleta Lagoa · ciano / terracota</span>
        </div>
      </footer>
    </div>
    );
  },
})

function Alvos() {
  const [targets, setTargets] = React.useState<{ id: string; title: string; url: string; kind: string }[]>([])
  const [hint, setHint] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [tag, setTag] = React.useState("fintech")
  const [extractions, setExtractions] = React.useState<unknown[]>([])
  const [msg, setMsg] = React.useState("")
  const load = React.useCallback(() => {
    fetch(`${API}/targets`).then(r=>r.json()).then(d=>{ setTargets(d.items ?? []); setHint(d.hint ?? "")}).catch(()=>setHint("api offline"))
    fetch(`${API}/extractions`).then(r=>r.json()).then(d=>setExtractions(d.items ?? [])).catch(()=>{})
  }, [])
  React.useEffect(() => { load() }, [load])
  const analyze = async (opts?: { engine?: string }) => {
    if (!url.trim()) return
    setMsg("analisando...")
    const isBundle = url.trim().endsWith(".js") || tag.trim() === "colat-bundle"
    const body: Record<string, string> = { url: url.trim() }
    if (tag.trim()) body.tag = tag.trim()
    if (opts?.engine || isBundle) body.engine = opts?.engine ?? "rea"
    const r = await fetch(`${API}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json()
    if (!r.ok) { setMsg(j.error ?? "erro"); return }
    setMsg(`criado ${j.id} ${j.engine ? `(${j.engine})` : ""}`)
    load()
  }
  const [observing, setObserving] = React.useState(false)
  const obsRef = React.useRef<number | null>(null)
  const observe = async () => {
    setObserving(true); setMsg("observando 10s...")
    const t0 = Date.now()
    const tick = async () => {
      const r = await fetch(`${API}/targets`).then(x=>x.json()).catch(()=>({items:[]}))
      if (r.items?.length) { setTargets(r.items); setMsg(`encontrado ${r.items.length} aba(s)`); setObserving(false); return }
      if (Date.now() - t0 < 10000) obsRef.current = window.setTimeout(tick, 1000) as unknown as number
      else { setHint(r.hint ?? "nada em 10s · verifique --remote-debugging-port=9222"); setObserving(false); setMsg("sem abas novas") }
    }
    tick()
  }
  React.useEffect(() => () => { if (obsRef.current) clearTimeout(obsRef.current) }, [])

  return (
    <div className="space-y-5" data-od-id="alvos">
      <PageHead title="Alvos" right={`${extractions.length} extrações · ${targets.length} abas`} />

      <Card pad={false}><div className="p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyze()} placeholder="https://site.com  ·  .../bundle.js (rea)  ·  /path/local" className="min-w-[280px] flex-1 rounded-lg t-border border t-bg px-3 py-2.5 text-[13px] t-fg" />
          <input value={tag} onChange={e=>setTag(e.target.value)} placeholder="tag" className="w-[132px] rounded-lg t-border border t-bg px-3 py-2.5 text-[13px] font-mono t-fg" />
          <button onClick={()=>analyze()} className="btn-primary rounded-lg px-4 py-2.5 text-[13px] font-semibold">Analisar</button>
          <button onClick={()=>analyze({engine:"rea"})} className="btn-accent-outline rounded-lg px-4 py-2.5 text-[13px] font-medium">REA</button>
          <button onClick={observe} disabled={observing} className="btn-ghost rounded-lg px-4 py-2.5 text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed">
            {observing ? <span className="inline-flex items-center gap-1.5"><span className="live-dot inline-block size-1.5 rounded-full" style={{ background: "var(--accent)" }}></span>Observando</span> : "Observar 10s"}
          </button>
          {isTauri && <button onClick={async()=>{ const p=await tauriPick("folder"); if(p) setUrl(p)}} className="btn-ghost rounded-lg px-3 py-2.5 text-xs">📂 Pasta</button>}
          {isTauri && <button onClick={async()=>{ const p=await tauriPick("file"); if(p) setUrl(p)}} className="btn-ghost rounded-lg px-3 py-2.5 text-xs">📄 Arquivo</button>}
        </div>
        {msg && <p className="mt-2 text-xs font-mono" style={{ color: msg.includes("erro") ? "var(--secondary)" : "var(--accent)" }}>{msg}</p>}
        {hint && <p className="mt-1 text-[11px] font-mono t-dim">{hint}</p>}
      </div></Card>

      <Card>
        <h2 className="text-[13px] font-semibold t-fg mb-3">Chrome tabs <span className="t-dim font-mono font-normal">({targets.length})</span></h2>
        {targets.length===0
          ? <p className="text-[12px] font-mono t-dim">Nenhuma aba — abra Chrome com --remote-debugging-port=9222</p>
          : <div className="space-y-1.5">{targets.map(t=>(
              <div key={t.id} className="row-card flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
                <span className="shrink-0 t-fg">{t.title}</span>
                <span className="truncate font-mono t-dim flex-1">{t.url}</span>
                <button onClick={()=>setUrl(t.url)} className="btn-accent-outline shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px]">Usar</button>
              </div>))}</div>}
      </Card>

      <Card>
        <h2 className="text-[13px] font-semibold t-fg mb-3">Extrações recentes</h2>
        {extractions.filter((e): e is {id:string;url:string;site:string} => typeof e === "object" && e !== null && isRecord(e) && typeof e["id"] === "string" && typeof e["url"] === "string" && typeof e["site"] === "string").length===0
          ? <p className="text-[12px] font-mono t-dim">Nenhuma — use Analisar</p>
          : <div className="space-y-1.5">{extractions.filter((e): e is {id:string;url:string;site:string;tag?:string} => typeof e === "object" && e !== null && isRecord(e) && typeof e["id"] === "string").slice(0,8).map(e=>(
              <Link key={String(e.id)} to="/e/$id" params={{ id: String(e.id) }} className="row-card w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
                <span className="shrink-0 font-mono text-[11px] font-semibold t-accent">{String(e.id).slice(0,6)}</span>
                <span className="shrink-0 font-mono t-muted">{String((e as Record<string,unknown>).site ?? "")}</span>
                <span className="truncate font-mono t-dim flex-1">{String((e as Record<string,unknown>).url ?? "")}</span>
                {typeof (e as Record<string,unknown>).tag === "string" && (e as Record<string,unknown>).tag ? <span className="hidden md:inline rounded-full border t-border t-surface px-2 py-0.5 text-[10px] font-mono t-muted">{String((e as Record<string,unknown>).tag)}</span> : null}
              </Link>))}</div>}
      </Card>
    </div>
  )
}

function Viewer() {
  const { id } = useParams({ from: "/e/$id" })
  const [data, setData] = React.useState<Record<string, unknown> | null>(null)
  const [err, setErr] = React.useState("")
  React.useEffect(() => {
    fetch(`${API}/extractions/${id}`).then(r=>{ if(!r.ok) throw new Error(String(r.status)); return r.json()}).then(setData).catch(e=>setErr(String(e)))
  }, [id])
  if (err) return <div className="text-sm" style={{ color: "var(--secondary)" }}>{err}</div>
  if (!data) return <div className="text-sm mono t-dim">carregando...</div>
  const tokensUnknown: unknown = (()=>{ try{return JSON.parse(String(data.tokens_json))}catch{return {}}})();
  const tokens: Record<string, unknown> = isRecord(tokensUnknown) ? tokensUnknown : {}
  const evidenceUnknown: unknown = (()=>{ try{return JSON.parse(String(data.evidence_json))}catch{return {}}})();
  const evidence: Record<string, unknown> = isRecord(evidenceUnknown) ? evidenceUnknown : {}
  const [pkgMsg, setPkgMsg] = React.useState("")
  const [pkgPreview, setPkgPreview] = React.useState("")
  const [pkgId, setPkgId] = React.useState("")
  const [selected, setSelected] = React.useState<string[]>(["palette","fonts"])
  const nav = useNavigate()
  const toggle = (k: string) => setSelected(p => p.includes(k) ? p.filter(x=>x!==k) : [...p, k])
  const createPkg = async () => {
    const r = await fetch(`${API}/packages`, { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ card_id: String(data!.id), selectedFeatures: selected }) })
    const j = await r.json()
    if (!r.ok) { setPkgMsg(j.error ?? "erro"); return }
    setPkgId(typeof j.id === "string" ? j.id : String(j.id ?? ""))
    setPkgPreview(String(j.prompt_md ?? ""))
    setPkgMsg(`pacote ${j.id} criado`)
  }
  const [applyDest, setApplyDest] = React.useState("/tmp/zpond-projeto-j")
  const [applyAgent, setApplyAgent] = React.useState<"pi"|"omp"|"opencode">("pi")
  const [applyMsg, setApplyMsg] = React.useState("")
  const applyPkg = async () => {
    let targetId = pkgId
    if (!targetId) {
      const r = await fetch(`${API}/packages`, { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ card_id: String(data!.id), selectedFeatures: selected }) })
      const j = await r.json(); if(!r.ok){ setApplyMsg(j.error ?? "erro criar pacote"); return }
      targetId = typeof j.id === "string" ? j.id : String(j.id ?? ""); setPkgId(targetId); setPkgPreview(String(j.prompt_md ?? ""))
    }
    setApplyMsg("aplicando... (até 4 min)")
    const ctl = new AbortController(); const to=setTimeout(()=>ctl.abort(), 240000)
    const r = await fetch(`${API}/packages/${targetId}/apply`, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ dest: applyDest, agent: applyAgent }), signal: ctl.signal })
    clearTimeout(to)
    const j = await r.json()
    if (j.fallback) setApplyMsg(`fallback: ${String(j.instructions ?? j.stderr ?? "").slice(0,300)}`)
    else setApplyMsg(`ok · ${j.agent} → ${j.dest}`)
  }
  const exportMd = () => {
    if (!pkgPreview) return
    downloadBlob(pkgPreview, `pacote-${pkgId || "draft"}.md`, "text/markdown")
  }
  const exportJson = () => {
    downloadBlob(JSON.stringify({ tokens, evidence }, null, 2), `evidence-${String(data!.id)}.json`, "application/json")
  }
  const keys: string[] = (()=>{ try{ const tVal: unknown = JSON.parse(String(data!.tokens_json)); const eVal: unknown = JSON.parse(String(data!.evidence_json)); const t: Record<string, unknown> = isRecord(tVal) ? tVal : {}; const e: Record<string, unknown> = isRecord(eVal) ? eVal : {}; return [...new Set([...Object.keys(t), ...Object.keys(e)])]}catch{return []}})()

  return (
    <div className="space-y-5" data-od-id="viewer">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={()=>nav({to:"/"})} className="text-[13px] font-mono t-accent hover:opacity-80 shrink-0">← Alvos</button>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] t-fg truncate">{String(data.title ?? data.url)}</h1>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
          <span className="t-dim">{String(data.site)} · {String(data.id)}</span>
          {isTauri && <button onClick={()=>tauriOpen(String(data.url))} className="btn-ghost rounded-md px-2 py-0.5">Abrir no sistema</button>}
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-[13px] font-semibold t-fg">Pacote</h2>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={createPkg} className="btn-primary rounded-lg px-3 py-1.5 text-[12px] font-semibold">Gerar Pacote</button>
            <button onClick={exportMd} disabled={!pkgPreview} className="btn-ghost rounded-lg px-3 py-1.5 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed">Export .md</button>
            <button onClick={exportJson} className="btn-ghost rounded-lg px-3 py-1.5 text-[12px]">Export .json</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {keys.map(k=>{
            const on = selected.includes(k)
            return <button key={k} onClick={()=>toggle(k)} className={`rounded-full px-3 py-1 text-[12px] font-mono border transition-colors ${on ? "btn-primary" : "btn-ghost"}`}>{k}</button>
          })}
          {keys.length===0 && <span className="text-xs t-dim">nenhuma chave</span>}
        </div>
        {pkgMsg && <p className="text-xs font-mono t-dim mb-2">{pkgMsg}</p>}
        {pkgPreview && <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border t-border t-bg p-3 text-[11px] leading-relaxed font-mono t-fg">{pkgPreview}</pre>}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t t-border pt-4">
          <input value={applyDest} onChange={e=>setApplyDest(e.target.value)} placeholder="/tmp/zpond-projeto-j" className="min-w-[220px] flex-1 rounded-lg border t-border t-bg px-3 py-1.5 text-[12px] font-mono t-fg" />
          <select value={applyAgent} onChange={e=>{ const v = e.target.value; if (v==="pi"||v==="omp"||v==="opencode") setApplyAgent(v)}} className="rounded-lg border t-border t-bg px-2.5 py-1.5 text-[12px] font-mono t-fg">
            <option value="pi">pi</option><option value="omp">omp</option><option value="opencode">opencode</option>
          </select>
          <button onClick={applyPkg} className="rounded-lg px-4 py-1.5 text-[12px] font-semibold" style={{ background: "var(--secondary)", color: "var(--on-secondary)", border: "1px solid var(--secondary)" }}>Aplicar no Projeto J</button>
          {isTauri && <button onClick={async()=>{ const p=await tauriPick("folder"); if(p) setApplyDest(p)}} className="btn-ghost rounded-lg px-3 py-1.5 text-xs">📂</button>}
        </div>
        {applyMsg && <p className="mt-2 text-xs font-mono" style={{ color: applyMsg.startsWith("ok") ? "var(--accent)" : "var(--secondary)" }}>{applyMsg}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><div className="flex items-center justify-between mb-2"><span className="text-[11px] font-mono tracking-widest uppercase t-dim">tokens</span><span className="rounded t-surface-2 px-1.5 py-0.5 text-[10px] font-mono t-dim border t-border">JSON</span></div><pre className="overflow-auto max-h-[360px] text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words t-fg">{JSON.stringify(tokens,null,2)}</pre></Card>
        <Card><div className="flex items-center justify-between mb-2"><span className="text-[11px] font-mono tracking-widest uppercase t-dim">evidence</span><span className="rounded t-surface-2 px-1.5 py-0.5 text-[10px] font-mono t-dim border t-border">JSON</span></div><pre className="overflow-auto max-h-[360px] text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words t-fg">{JSON.stringify(evidence,null,2)}</pre></Card>
      </div>
      <details className="rounded-xl border t-border t-surface overflow-hidden group">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none"><span className="text-[11px] font-mono tracking-widest uppercase t-dim">raw · extração completa</span><span className="text-[11px] font-mono t-dim group-open:rotate-180 transition-transform">▾</span></summary>
        <pre className="border-t t-border overflow-auto max-h-[400px] p-4 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words t-dim">{JSON.stringify(data,null,2)}</pre>
      </details>
    </div>
  )
}

function Pond() {
  const [items, setItems] = React.useState<unknown[]>([])
  const [q, setQ] = React.useState("")
  const [tag, setTag] = React.useState("")
  React.useEffect(() => {
    const p = new URLSearchParams()
    if (q) p.set("search", q)
    if (tag) p.set("tag", tag)
    fetch(`${API}/pond?${p}`).then(r=>r.json()).then(d=>setItems(d.items ?? [])).catch(()=>{})
  }, [q, tag])
  const nav = useNavigate()
  const pondQuery = (()=>{ const p=new URLSearchParams(); if(tag)p.set("tag",tag); if(q)p.set("search",q); const s=p.toString(); return s?`?${s}`:""})()
  return (
    <div className="space-y-5" data-od-id="pond">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-none t-fg">Pond</h1>
        <span className="text-[11px] font-mono t-dim">/pond{pondQuery}</span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-2.5 top-2.5 size-3.5" style={{ color: "var(--fg-dim)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="11" cy="11" r="7"/><path d="M20 20L16 16"/></svg>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="buscar — layouts escuros, cards arredondados, fintech..." className="w-full rounded-lg border t-border t-surface pl-8 pr-3 py-2.5 text-[13px] t-fg" />
        </div>
        <input value={tag} onChange={e=>setTag(e.target.value)} placeholder="tag" className="w-28 sm:w-32 rounded-lg border t-border t-surface px-3 py-2.5 text-[13px] font-mono t-fg" />
      </div>
      <div className="text-[11px] font-mono t-dim">{items.length} resultado{items.length!==1?"s":""} · /pond?tag=&amp;color=&amp;site=&amp;search=</div>
      <div className="grid gap-2">
        {items.length===0 ? (
          <div className="rounded-xl border border-dashed t-border px-4 py-12 text-center" style={{ background: "color-mix(in oklch, var(--surface) 60%, transparent)" }}>
            <p className="text-[13px] t-muted">Nenhum resultado para essa busca</p>
            <p className="text-[12px] font-mono t-dim mt-1">tente outros termos ou limpe os filtros</p>
            {(q||tag) && <button onClick={()=>{setQ("");setTag("")}} className="btn-ghost mt-3 rounded-lg px-3 py-1 text-xs">Limpar filtros</button>}
          </div>
        ) : items.filter((e): e is {id:string;url:string;site:string} => typeof e === "object" && e !== null && isRecord(e) && typeof e["id"] === "string" && typeof e["site"] === "string").map(it=>(
          <button key={it.id} onClick={()=>nav({ to: "/e/$id", params: { id: it.id }})} className="row-card group flex items-center gap-3 rounded-xl px-3 py-3 text-left w-full">
            <span className="font-mono text-[11px] font-semibold t-accent">{String(it.id).slice(0,6)}</span>
            <span className="text-[12px] t-muted hidden sm:inline">{it.site}</span>
            <span className="truncate text-[12px] font-mono t-dim flex-1">{it.url}</span>
            {typeof (it as Record<string,unknown>).tag === "string" && (it as Record<string,unknown>).tag ? <span className="hidden md:inline rounded-full border t-border t-surface px-2 py-0.5 text-[10px] font-mono t-muted">{String((it as Record<string,unknown>).tag)}</span> : null}
            <span className="hidden sm:inline text-[11px] t-dim group-hover:t-muted">→</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Pacotes() {
  const [items, setItems] = React.useState<{id:string;card_id:string;name:string;dest:string;created_at:number}[]>([])
  const [msg, setMsg] = React.useState("")
  const load = React.useCallback(() => { fetch(`${API}/packages`).then(r=>r.json()).then(d=>setItems(d.items ?? [])).catch(()=>{}) }, [])
  React.useEffect(() => { load() }, [load])
  const dl = async (id:string, kind:"md"|"json") => {
    const r = await fetch(`${API}/packages/${id}`); const j = await r.json(); if (!r.ok) { setMsg(j.error ?? "erro"); return }
    const body = kind==="md" ? String(j.prompt_md ?? "") : JSON.stringify({ tokens: JSON.parse(String(j.tokens_json ?? "{}")), evidence: JSON.parse(String(j.evidence_json ?? "{}")), meta: JSON.parse(String(j.meta_json ?? "{}")) }, null, 2)
    downloadBlob(body, `pacote-${id}.${kind}`, kind==="md" ? "text/markdown" : "application/json")
  }
  const nav = useNavigate()
  return (
    <div className="space-y-5" data-od-id="pacotes">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-none t-fg">Pacotes</h1>
      {msg && <div className="rounded-lg border px-3 py-2 text-xs font-mono" style={{ borderColor: "var(--secondary)", background: "var(--secondary-soft)", color: "var(--secondary)" }}>{msg}</div>}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed t-border px-4 py-12 text-center" style={{ background: "color-mix(in oklch, var(--surface) 60%, transparent)" }}>
          <div className="mx-auto size-8 rounded-lg t-surface border t-border grid place-items-center mb-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-dim)" strokeWidth="1.6"><path d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg>
          </div>
          <p className="text-[13px] t-muted">Nenhum pacote ainda</p>
          <p className="text-[12px] font-mono t-dim mt-1">Crie um em qualquer extração · /e/:id</p>
          <button onClick={()=>nav({to:"/"})} className="btn-ghost mt-3 rounded-lg px-3 py-1.5 text-xs">Ir para Alvos</button>
        </div>
      ) : (
        <div className="grid gap-2">{items.map(p=>(
          <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border t-border t-surface px-3 py-3 text-xs" style={{ boxShadow: "var(--shadow)" }}>
            <span className="font-mono text-[11px] t-muted">{p.id}</span>
            <span className="font-semibold t-fg">{p.name}</span>
            <span className="rounded-full border t-border t-bg px-2 py-0.5 font-mono text-[11px] t-dim">card {p.card_id}</span>
            {p.dest && <span className="hidden sm:inline truncate max-w-[200px] font-mono text-[11px] t-dim">→ {p.dest}</span>}
            <span className="hidden lg:inline ml-auto font-mono text-[11px] t-dim">{fmtDate(p.created_at)}</span>
            <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto lg:ml-2">
              <button onClick={()=>dl(p.id,"md")} className="btn-ghost rounded-md px-2 py-1 font-mono text-[11px]">.md</button>
              <button onClick={()=>dl(p.id,"json")} className="btn-ghost rounded-md px-2 py-1 font-mono text-[11px]">.json</button>
              <Link to="/e/$id" params={{ id: p.card_id }} className="btn-ghost rounded-md px-2 py-1 font-mono text-[11px]">ver extração</Link>
            </div>
          </div>))}</div>
      )}
    </div>
  )
}


const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Alvos })
const pondRoute = createRoute({ getParentRoute: () => rootRoute, path: "/pond", component: Pond })
const viewerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/e/$id", component: Viewer })
const packagesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/packages", component: Pacotes })
const routeTree = rootRoute.addChildren([indexRoute, pondRoute, viewerRoute, packagesRoute])
const router = createRouter({ routeTree })
declare module "@tanstack/react-router" { interface Register { router: typeof router } }

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>)
