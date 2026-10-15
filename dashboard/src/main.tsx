import "./globals.css"
import React from "react"
import ReactDOM from "react-dom/client"
import { isRecord } from "./lib/guards.js";
import { createRootRoute, createRoute, createRouter, RouterProvider, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router"

const API = "http://127.0.0.1:3333"
function hasStringField(o: object, key: string): boolean {
  if (!isRecord(o)) return false;
  const v = o[key];
  return typeof v === "string";
}
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

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight">zpond</span>
          <span className="text-xs text-zinc-500">a lagoa do zfrog</span>
          <div className="ml-4 flex gap-4 text-sm">
            <Link to="/" className="text-zinc-400 hover:text-white [&.active]:text-white">Alvos</Link>
            <Link to="/pond" className="text-zinc-400 hover:text-white [&.active]:text-white">Pond</Link>
            <Link to="/packages" className="text-zinc-400 hover:text-white [&.active]:text-white">Pacotes</Link>
          </div>
          <span className="ml-auto text-xs text-zinc-600">Hub :3333</span>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4"><Outlet /></main>
    </div>
  ),
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
  const analyze = async () => {
    if (!url.trim()) return
    setMsg("analisando...")
    const r = await fetch(`${API}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: url.trim(), tag: tag.trim() || undefined }) })
    const j = await r.json()
    if (!r.ok) { setMsg(j.error ?? "erro"); return }
    setMsg(`criado ${j.id}`)
    load()
  }
  const [observing, setObserving] = React.useState(false)
  const observe = async () => {
    setObserving(true); setMsg("observando 10s...")
    const t0 = Date.now()
    const tick = async () => {
      const r = await fetch(`${API}/targets`).then(x=>x.json()).catch(()=>({items:[]}))
      if (r.items?.length) { setTargets(r.items); setMsg(`encontrado ${r.items.length} aba(s)`); setObserving(false); return }
      if (Date.now() - t0 < 10000) setTimeout(tick, 1000)
      else { setHint(r.hint ?? "nada em 10s"); setObserving(false); setMsg("sem abas") }
    }
    tick()
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Alvos</h1>
      <div className="flex flex-wrap gap-2">
        <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://site.com ou /path/local" className="min-w-[320px] flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500" />
        <input value={tag} onChange={e=>setTag(e.target.value)} placeholder="tag" className="w-32 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none" />
        <button onClick={analyze} className="rounded bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200">Analisar</button>
        <button onClick={observe} disabled={observing} className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">Observar 10s</button>
        {isTauri && <button onClick={async()=>{ const p=await tauriPick("folder"); if(p) setUrl(p)}} className="rounded border border-amber-700/50 px-3 py-2 text-sm text-amber-300 hover:bg-zinc-800">📂 Pasta</button>}
        {isTauri && <button onClick={async()=>{ const p=await tauriPick("file"); if(p) setUrl(p)}} className="rounded border border-amber-700/50 px-3 py-2 text-sm text-amber-300 hover:bg-zinc-800">📄 Arquivo</button>}
      </div>
      {msg && <div className="text-xs text-zinc-400">{msg}</div>}
      <div className="rounded border border-zinc-800 p-3">
        <div className="mb-2 text-xs font-medium text-zinc-400">Chrome tabs {targets.length ? `(${targets.length})` : ""}</div>
        {hint && <div className="mb-2 text-xs text-amber-400/80">{hint}</div>}
        {targets.length === 0 ? <div className="text-xs text-zinc-500">Nenhuma aba — abra Chrome com --remote-debugging-port=9222</div> : targets.map(t=>(
          <div key={t.id} className="flex items-center gap-2 py-1 text-xs">
            <span className="truncate text-zinc-300">{t.title}</span>
            <span className="truncate text-zinc-500">{t.url}</span>
            <button onClick={()=>setUrl(t.url)} className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800">Usar</button>
          </div>
        ))}
      </div>
      <div className="rounded border border-zinc-800 p-3">
        <div className="mb-2 text-xs font-medium text-zinc-400">Extrações recentes</div>
        {extractions.length === 0 ? <div className="text-xs text-zinc-500">Nenhuma — use Analisar acima</div> : extractions.filter((e): e is {id:string;url:string;site:string} => typeof e === "object" && e !== null && hasStringField(e, "id") && hasStringField(e, "url") && hasStringField(e, "site")).map(e=>(
          <Link key={e.id} to="/e/$id" params={{ id: e.id }} className="flex gap-2 py-1 text-xs text-zinc-400 hover:text-white"><span className="font-mono">{e.id}</span><span>{e.site}</span><span className="truncate">{e.url}</span></Link>
        ))}
      </div>
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
  if (err) return <div className="text-sm text-red-400">{err}</div>
  if (!data) return <div className="text-sm text-zinc-500">carregando...</div>
  const tokensUnknown: unknown = (()=>{ try{return JSON.parse(String(data.tokens_json))}catch{return {}}})();
  const tokens: Record<string, unknown> = isRecord(tokensUnknown) ? tokensUnknown : {}
  const evidenceUnknown: unknown = (()=>{ try{return JSON.parse(String(data.evidence_json))}catch{return {}}})();
  const evidence: Record<string, unknown> = isRecord(evidenceUnknown) ? evidenceUnknown : {}
  const [pkgMsg, setPkgMsg] = React.useState("")
  const [pkgPreview, setPkgPreview] = React.useState("")
  const [pkgId, setPkgId] = React.useState("")
  const [selected, setSelected] = React.useState<string[]>(["palette","fonts"])
  const toggle = (k:string)=> setSelected(prev=> prev.includes(k) ? prev.filter(x=>x!==k) : [...prev, k])
  const createPkg = async () => {
    const r = await fetch(`${API}/packages`, { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ card_id: String(data!.id), selectedFeatures: selected }) })
    const j = await r.json()
    if (!r.ok) { setPkgMsg(j.error ?? "erro"); return }
    setPkgId(typeof j.id === "string" ? j.id : String(j.id ?? ""))
    setPkgPreview(String(j.prompt_md ?? ""))
    setPkgMsg(`pacote ${j.id} criado — preview abaixo`)
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
    setApplyMsg("aplicando... (ate 4 min)")
    const ctl = new AbortController(); const to=setTimeout(()=>ctl.abort(), 240000)
    const r = await fetch(`${API}/packages/${targetId}/apply`, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ dest: applyDest, agent: applyAgent }), signal: ctl.signal })
    clearTimeout(to)
    const j = await r.json()
    if (j.fallback) setApplyMsg(`fallback: ${String(j.instructions ?? j.stderr ?? "").slice(0,300)}`)
    else setApplyMsg(`ok agent=${j.agent} dest=${j.dest}`)
  }
  const exportMd = () => {
    if (!pkgPreview) return
    const blob = new Blob([pkgPreview], { type: "text/markdown" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `pacote-${pkgId || "draft"}.md`; a.click(); URL.revokeObjectURL(a.href)
  }
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ tokens, evidence }, null, 2)], { type: "application/json" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `evidence-${String(data!.id)}.json`; a.click(); URL.revokeObjectURL(a.href)
  }
  const keys: string[] = (()=>{ try{ const tVal: unknown = JSON.parse(String(data!.tokens_json)); const eVal: unknown = JSON.parse(String(data!.evidence_json)); const t: Record<string, unknown> = isRecord(tVal) ? tVal : {}; const e: Record<string, unknown> = isRecord(eVal) ? eVal : {}; return [...new Set([...Object.keys(t), ...Object.keys(e)])]}catch{return []}})()

  return (
    <div className="space-y-4">
      <Link to="/" className="text-xs text-zinc-500 hover:text-white">← Alvos</Link>
      <h1 className="text-xl font-semibold">{String(data.title ?? data.url)}</h1>
      {isTauri && <button onClick={()=>tauriOpen(String(data.url))} className="text-xs text-amber-300 hover:text-amber-200">Abrir no sistema</button>}
      <div className="text-xs text-zinc-500">{String(data.site)} · {String(data.id)}</div>
      <div className="rounded border border-zinc-800 p-3">
        <div className="mb-2 text-xs font-medium text-zinc-400">Pacote — selecione features</div>
        <div className="flex flex-wrap gap-2">{keys.map(k=>(<label key={k} className="flex items-center gap-1 text-xs text-zinc-300"><input type="checkbox" checked={selected.includes(k)} onChange={()=>toggle(k)} />{k}</label>))}</div>
        <button onClick={createPkg} className="mt-2 rounded bg-white px-3 py-1 text-xs font-medium text-black hover:bg-zinc-200">Gerar Pacote</button>
        <button onClick={exportMd} disabled={!pkgPreview} className="ml-2 mt-2 rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">Export .md</button>
        <button onClick={exportJson} className="ml-2 mt-2 rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">Export .json</button>
        {pkgMsg && <span className="ml-2 text-xs text-zinc-400">{pkgMsg}</span>}
        {pkgPreview && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-zinc-950 p-2 text-[11px] leading-relaxed text-zinc-400">{pkgPreview}</pre>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={applyDest} onChange={e=>setApplyDest(e.target.value)} placeholder="/tmp/zpond-projeto-j ou git url" className="min-w-[260px] flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs outline-none" />
          <select value={applyAgent} onChange={e=>{ const v = e.target.value; if (v==="pi"||v==="omp"||v==="opencode") setApplyAgent(v)}} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs">
            <option value="pi">pi</option><option value="omp">omp</option><option value="opencode">opencode</option>
          </select>
          <button onClick={applyPkg} className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-black hover:bg-amber-400">Aplicar no Projeto J</button>
          {applyMsg && <span className="text-xs text-zinc-400">{applyMsg}</span>}
          {isTauri && <button onClick={async()=>{ const p=await tauriPick("folder"); if(p) setApplyDest(p)}} className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300">📂</button>}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <pre className="overflow-auto rounded bg-zinc-900 p-3 text-xs text-zinc-300">{JSON.stringify(tokens, null, 2)}</pre>
        <pre className="overflow-auto rounded bg-zinc-900 p-3 text-xs text-zinc-300">{JSON.stringify(evidence, null, 2)}</pre>
      </div>
      <pre className="overflow-auto rounded bg-zinc-900 p-3 text-xs text-zinc-400">{JSON.stringify(data, null, 2)}</pre>
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
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pond</h1>
      <div className="flex gap-2">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="search — layouts escuros com cards arredondados" className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500" />
        <input value={tag} onChange={e=>setTag(e.target.value)} placeholder="tag" className="w-32 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none" />
      </div>
      <div className="text-xs text-zinc-500">{items.length} resultados — /pond?tag=&color=&site=&search=</div>
      <div className="grid gap-2">{items.filter((e): e is {id:string;url:string;site:string} => typeof e === "object" && e !== null && hasStringField(e, "id") && hasStringField(e, "site")).map(it=>(
        <button key={it.id} onClick={()=>nav({ to: "/e/$id", params: { id: it.id }})} className="flex gap-2 rounded border border-zinc-800 px-3 py-2 text-left text-xs hover:bg-zinc-900"><span className="font-mono text-zinc-500">{it.id}</span><span className="text-zinc-400">{it.site}</span><span className="truncate text-zinc-300">{it.url}</span></button>
      ))}</div>
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
    const blob = new Blob([body], { type: kind==="md" ? "text/markdown" : "application/json" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `pacote-${id}.${kind}`; a.click(); URL.revokeObjectURL(a.href)
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pacotes</h1>
      {msg && <div className="text-xs text-amber-400">{msg}</div>}
      {items.length === 0 ? <div className="text-xs text-zinc-500">Nenhum pacote — crie em uma extração (/e/:id)</div> : (
        <div className="grid gap-2">{items.map(p=>(
          <div key={p.id} className="flex flex-wrap items-center gap-2 rounded border border-zinc-800 px-3 py-2 text-xs">
            <span className="font-mono text-zinc-500">{p.id}</span>
            <span className="text-zinc-300">{p.name}</span>
            <span className="text-zinc-500">card {p.card_id}</span>
            {p.dest && <span className="truncate text-zinc-600">→ {p.dest}</span>}
            <span className="ml-auto text-zinc-600">{new Date(p.created_at*1000).toLocaleString()}</span>
            <button onClick={()=>dl(p.id,"md")} className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800">.md</button>
            <button onClick={()=>dl(p.id,"json")} className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800">.json</button>
            <Link to="/e/$id" params={{ id: p.card_id }} className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800">ver extração</Link>
          </div>
        ))}</div>
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
