#!/usr/bin/env node
/**
 * Local web preview for the conversation view (no Harness).
 * Builds a multi-turn fixture and serves it on http://127.0.0.1:4177/
 */
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "preview/dist");
const port = Number(process.env.PORT || 4177);

await mkdir(outDir, { recursive: true });
// Ensure the plugin client bundle is current before the fixture embeds it.
await import("./build.mjs");

await build({
  entryPoints: [join(root, "preview/preview-fixture.tsx")],
  outfile: join(outDir, "preview.js"),
  bundle: true,
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  loader: {
    ".css": "css",
    ".md": "text",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".ttf": "dataurl"
  },
  plugins: [{
    name: "preview-loaders",
    setup(api) {
      api.onResolve({ filter: /\?text$/ }, args => ({
        path: new URL(args.path.replace(/\?text$/, ""), `file://${args.resolveDir}/`).pathname,
        namespace: "text-file"
      }));
      api.onLoad({ filter: /.*/, namespace: "text-file" }, async args => ({
        contents: `export default ${JSON.stringify(await readFile(args.path, "utf8"))}`,
        loader: "js"
      }));
      api.onLoad({ filter: /\.module\.css$/ }, async args => ({
        contents: await readFile(args.path, "utf8"),
        loader: "local-css"
      }));
    }
  }]
});

const js = await readFile(join(outDir, "preview.js"), "utf8");
const css = await readFile(join(outDir, "preview.css"), "utf8").catch(() => "");
const html = `<!doctype html>
<html lang="zh-CN" style="color-scheme:light">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-stage-chat 预览</title>
<style>
:root{
  --dsw-alias-bg-base:#ffffff;
  --dsw-alias-bg-layer-1:#f7f8fa;
  --dsw-alias-label-primary:#000000;
  --dsw-alias-label-secondary:#60646c;
  --dsw-alias-border-l1:rgba(10,10,10,.16);
  --dsw-specific-bubble:#f3f4f6;
}
html[data-theme=dark]{
  color-scheme:dark;
  --dsw-alias-bg-base:#202022;
  --dsw-alias-bg-layer-1:#29292c;
  --dsw-alias-label-primary:#e4e4e7;
  --dsw-alias-label-secondary:#b0b0b8;
  --dsw-alias-border-l1:rgba(236,234,230,.16);
  --dsw-specific-bubble:#303034;
}
*{box-sizing:border-box}
body{margin:0;font:13px/1.5 system-ui,sans-serif;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
#preview-bar{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
  padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
#preview-bar button{font:inherit;padding:5px 10px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);
  background:transparent;color:inherit;cursor:pointer}
#preview-bar button[data-active="1"]{background:var(--dsw-specific-bubble);border-color:transparent;font-weight:600}
#preview-bar .hint{font-size:12px;color:var(--dsw-alias-label-secondary);margin-left:auto}
#plugin-view{height:calc(100vh - 52px)}
#native-composer{display:flex;flex-direction:column;gap:8px;min-height:118px;padding:12px 16px;
  border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
#native-composer textarea{width:100%;height:64px;resize:vertical;min-height:56px;max-height:160px;
  border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;
  background:var(--dsw-specific-bubble);color:inherit;font:inherit}
#native-composer textarea:disabled{opacity:.7}
#native-composer .composer-actions{display:flex;align-items:center;gap:12px}
#native-composer .composer-hint{font-size:12px;color:var(--dsw-alias-label-secondary);margin-right:auto}
#native-composer button{font:inherit;padding:6px 14px;border-radius:8px;border:1px solid transparent;
  background:#ff7500;color:#fff;cursor:pointer}
#native-composer button:disabled{opacity:.45;cursor:default}
#preview-note{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:80;
  padding:8px 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  box-shadow:0 8px 24px rgba(0,0,0,.12);font-size:12.5px;white-space:nowrap}
${css}
</style>
<div id="preview-bar">
  <strong>dsh-stage-chat 预览</strong>
  <button type="button" id="btn-chat" data-panel="chat" data-active="1">对话</button>
  <button type="button" id="btn-settings" data-panel="settings" data-active="0">设置 · 配色/JSON</button>
  <button type="button" id="btn-theme">切换深/浅色</button>
  <button type="button" id="btn-jump">跳到第 2 轮</button>
  <button type="button" id="btn-mount-all">临时挂载全部轮次</button>
  <span class="hint">设置页可看配色实例 + JSON 搜索（font / window）</span>
</div>
<div id="preview-note" hidden></div>
<div id="fixture"></div>
<script>${js.replaceAll("</script", "<\\/script")}</script>
</html>`;
await writeFile(join(outDir, "index.html"), html);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  try {
    const body = await readFile(join(outDir, file));
    const type = file.endsWith(".css") ? "text/css" :
      file.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8";
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
});

await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${port}/`;
console.log(`Preview: ${url}`);
console.log("Ctrl+C to stop.");

if (!process.env.NO_OPEN) {
  const open = process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "start" : "xdg-open";
  spawn(open, [url], { stdio: "ignore", shell: process.platform === "win32" });
}
