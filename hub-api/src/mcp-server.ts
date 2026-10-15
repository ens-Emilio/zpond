#!/usr/bin/env node
// MCP stdio server — zpond tools (JSON-RPC 2.0, line-delimited + Content-Length)
import { DatabaseSync } from "node:sqlite";
import { isRecord } from "./guards.js";

const DB_PATH = `${process.env.HOME}/.zpond/hub.db`;

function getDb(): DatabaseSync | null {
  try { return new DatabaseSync(DB_PATH); } catch { return null; }
}

export type ToolDef = { name: string; description: string; inputSchema: unknown };

export const TOOLS: ToolDef[] = [
  { name: "list_extractions", description: "Lista extrações (cards) do pond", inputSchema: { type:"object", properties:{ limit:{type:"number"} } } },
  { name: "pond_search", description: "Busca pond por tag/color/site/search", inputSchema: { type:"object", properties:{ tag:{type:"string"}, color:{type:"string"}, site:{type:"string"}, search:{type:"string"}, limit:{type:"number"} } } },
  { name: "get_extraction", description: "Detalhe de extração por id", inputSchema: { type:"object", properties:{ id:{type:"string"} }, required:["id"] } },
  { name: "list_packages", description: "Lista pacotes", inputSchema: { type:"object", properties:{ limit:{type:"number"} } } },
  { name: "get_package", description: "Detalhe do pacote", inputSchema: { type:"object", properties:{ id:{type:"string"} }, required:["id"] } },
];

export type McpContent = { type: "text"; text: string };
export type McpToolResult = { content: McpContent[]; isError?: boolean };
export type McpInitializeResult = { protocolVersion: string; capabilities: { tools: { listChanged: boolean } }; serverInfo: { name: string; version: string } };
export type McpToolsListResult = { tools: ToolDef[] };

function getStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

function getNumberArg(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === "number" ? v : undefined;
}

export function handleMcp(method: string, params: Record<string, unknown> = {}): McpInitializeResult | McpToolsListResult | McpToolResult | null {
  const db = getDb();
  if (method === "initialize") return { protocolVersion:"2024-11-05", capabilities:{ tools:{ listChanged:false } }, serverInfo:{ name:"zpond", version:"0.1.0" } };
  if (method === "tools/list") return { tools: TOOLS };
  if (method === "tools/call") {
    const rawName = params.name;
    const name = typeof rawName === "string" ? rawName : "";
    const rawArgs = params.arguments;
    const args: Record<string, unknown> = typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs) && isRecord(rawArgs) ? rawArgs : {};
    if (!db) return { content:[{type:"text", text:"hub.db não encontrado"}] };
    try {
      if (name === "list_extractions") {
        const limit = getNumberArg(args, "limit") ?? 20;
        const rowsUnknown: unknown = db.prepare("SELECT id,url,site,title FROM cards ORDER BY created_at DESC LIMIT ?").all(limit);
        return { content:[{type:"text", text: JSON.stringify(rowsUnknown,null,2)}] };
      }
      if (name === "pond_search") {
        const tag = getStringArg(args, "tag");
        const color = getStringArg(args, "color");
        const site = getStringArg(args, "site");
        const search = getStringArg(args, "search");
        const limit = getNumberArg(args, "limit") ?? 20;
        let sql = "SELECT DISTINCT cards.id,cards.url,cards.site FROM cards";
        const w: string[] = [];
        const ps: (string|number)[] = [];
        if (tag) { sql += " JOIN card_tags t ON t.card_id=cards.id"; w.push("t.tag=?"); ps.push(tag.toLowerCase()); }
        if (color) { sql += " JOIN card_colors col ON col.card_id=cards.id"; w.push("col.hex=?"); ps.push(color.toLowerCase()); }
        if (site) { w.push("cards.site LIKE ?"); ps.push(`%${site}%`); }
        if (search) { w.push("(cards.title LIKE ? OR cards.url LIKE ? OR cards.note LIKE ?)"); ps.push(`%${search}%`,`%${search}%`,`%${search}%`); }
        if (w.length) sql += " WHERE " + w.join(" AND ");
        sql += " ORDER BY cards.created_at DESC LIMIT ?"; ps.push(limit);
        const rowsUnknown: unknown = db.prepare(sql).all(...ps);
        return { content:[{type:"text", text: JSON.stringify(rowsUnknown,null,2)}] };
      }
      if (name === "get_extraction") {
        const id = getStringArg(args, "id") ?? "";
        const rowUnknown: unknown = db.prepare("SELECT * FROM cards WHERE id=?").get(id);
        return { content:[{type:"text", text: JSON.stringify(rowUnknown,null,2)}] };
      }
      if (name === "list_packages") {
        const limit = getNumberArg(args, "limit") ?? 20;
        const rowsUnknown: unknown = db.prepare("SELECT id,card_id,name FROM packages ORDER BY created_at DESC LIMIT ?").all(limit);
        return { content:[{type:"text", text: JSON.stringify(rowsUnknown,null,2)}] };
      }
      if (name === "get_package") {
        const id = getStringArg(args, "id") ?? "";
        const rowUnknown: unknown = db.prepare("SELECT * FROM packages WHERE id=?").get(id);
        return { content:[{type:"text", text: JSON.stringify(rowUnknown,null,2)}] };
      }
      return { content:[{type:"text", text:`unknown tool ${name}`}], isError:true };
    } catch (e) { return { content:[{type:"text", text:String(e)}], isError:true }; }
  }
  return null;
}

export type JsonRpcMsg = { id?: number; method?: string; params?: Record<string, unknown> };

let buf="";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk: string)=>{
  buf+=chunk;
  while (true) {
    const clMatch = buf.match(/^Content-Length:\s*(\d+)\r?\n/i);
    if (clMatch) {
      const len = parseInt(clMatch[1], 10);
      const headerEnd = buf.indexOf("\n", clMatch[0].length - 1) + 1;
      const extraNl = buf[headerEnd] === "\n" ? 1 : buf[headerEnd] === "\r" ? (buf[headerEnd+1]==="\n"?2:1) : 0;
      const bodyStart = headerEnd + extraNl;
      if (buf.length < bodyStart + len) break;
      const body = buf.slice(bodyStart, bodyStart + len);
      buf = buf.slice(bodyStart + len);
      let msg: JsonRpcMsg | null=null;
      try { const parsed: unknown = JSON.parse(body); if (isRecord(parsed)) msg = { id: typeof parsed.id === "number" ? parsed.id : undefined, method: typeof parsed.method === "string" ? parsed.method : undefined, params: isRecord(parsed.params) ? parsed.params : undefined }; } catch { continue; }
      if (msg && msg.method) {
        const result = handleMcp(msg.method, msg.params);
        if (result!==null) {
          const payload = JSON.stringify({ jsonrpc:"2.0", id: msg.id, result });
          process.stdout.write(`Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`);
        }
      }
      continue;
    }
    const nl = buf.indexOf("\n");
    if (nl === -1) break;
    const line = buf.slice(0, nl); buf = buf.slice(nl+1);
    if (!line.trim()) continue;
    let msg: JsonRpcMsg | null=null;
    try { const parsedLine: unknown = JSON.parse(line); if (isRecord(parsedLine)) msg = { id: typeof parsedLine.id === "number" ? parsedLine.id : undefined, method: typeof parsedLine.method === "string" ? parsedLine.method : undefined, params: isRecord(parsedLine.params) ? parsedLine.params : undefined }; } catch { continue; }
    if (msg && msg.method) {
      const result=handleMcp(msg.method, msg.params);
      if (result!==null) process.stdout.write(JSON.stringify({ jsonrpc:"2.0", id: msg.id, result })+"\n");
    }
  }
});
