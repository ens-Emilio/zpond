#!/usr/bin/env node
import { readFileSync, existsSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = dirname(fileURLToPath(import.meta.url))
const MCP_ENTRY = join(ROOT, "hub-api/dist/mcp-server.js")
const zpondMcp = { command: "node", args: [MCP_ENTRY], exposure: "deferred", timeout: 30 }

function stripJsonc(s) {
  let out = "", inStr = false, esc = false, inLine = false, inBlock = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i+1] ?? ""
    if (inLine) { if (c === "\n") { inLine = false; out += c } continue }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++ } continue }
    if (inStr) { out += c; if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === "/" && n === "/") { inLine = true; i++; continue }
    if (c === "/" && n === "*") { inBlock = true; i++; continue }
    out += c
  }
  return out.replace(/,\s*([}\]])/g, "$1")
}
function readJsonc(p) {
  const raw = readFileSync(p, "utf8")
  try { return JSON.parse(raw) } catch {}
  return JSON.parse(stripJsonc(raw))
}

function mergePi() {
  const p = join(homedir(), ".pi/agent/mcp.json")
  if (!existsSync(p)) { console.log("pi mcp.json não existe, skip pi"); return }
  const j = readJsonc(p)
  j.mcpServers = j.mcpServers ?? {}
  j.mcpServers.zpond = zpondMcp
  writeFileSync(p, JSON.stringify(j,null,2)+"\n")
  console.log("pi ✓", p)
}
function mergeClaude() {
  const p = join(homedir(), ".claude.json")
  const alt = join(homedir(), ".config/claude/mcp.json")
  for (const cand of [p, alt]) {
    if (existsSync(cand)) {
      try {
        const j = readJsonc(cand)
        if (j.mcpServers) { j.mcpServers.zpond = { command:"node", args:[MCP_ENTRY] }; writeFileSync(cand, JSON.stringify(j,null,2)+"\n"); console.log("claude ✓", cand) }
        else console.log("claude shape desconhecido", cand, Object.keys(j).slice(0,5))
      } catch (e) { console.log("claude skip", cand, String(e).slice(0,120)) }
    }
  }
}
function mergeOpencode() {
  const p = join(homedir(), ".config/opencode/opencode.jsonc")
  if (!existsSync(p)) { console.log("opencode não existe"); return }
  const j = readJsonc(p)
  j.mcp = j.mcp ?? {}
  j.mcp.zpond = { type:"local", command:["node", MCP_ENTRY], enabled:true }
  writeFileSync(p, JSON.stringify(j,null,2)+"\n")
  console.log("opencode ✓", p)
}
mergePi()
mergeClaude()
mergeOpencode()
console.log("done. Verifique: pi mcp list | grep zpond ; opencode mcp list")
