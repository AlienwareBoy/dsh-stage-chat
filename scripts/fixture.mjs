import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
const output = process.env.DSH_CHECK_DIR || "/tmp/dsh-stage-chat-013-checks";
await (await import("node:fs/promises")).mkdir(output, { recursive: true });
await build({
  entryPoints: ["tests/host-fixture.tsx"], outfile: `${output}/host-fixture.js`,
  bundle: true, platform: "browser", target: "es2022", jsx: "automatic",
  loader: { ".css": "css", ".md": "text", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl" },
  plugins: [{
    name: "fixture-loaders",
    setup(build) {
      build.onResolve({ filter: /\?text$/ }, args => ({
        path: new URL(args.path.replace(/\?text$/, ""), `file://${args.resolveDir}/`).pathname, namespace: "text-file"
      }));
      build.onLoad({ filter: /.*/, namespace: "text-file" }, async args => ({
        contents: `export default ${JSON.stringify(await readFile(args.path, "utf8"))}`, loader: "js"
      }));
      build.onLoad({ filter: /\.module\.css$/ }, async args => ({ contents: await readFile(args.path, "utf8"), loader: "local-css" }));
    }
  }]
});
const js = await readFile(`${output}/host-fixture.js`, "utf8"), css = await readFile(`${output}/host-fixture.css`, "utf8");
await writeFile(`${output}/host-fixture.html`,
  `<!doctype html><html style="color-scheme:dark"><meta charset="utf-8"><title>DSH Focus built bundle verification</title><style>:root{--dsw-alias-bg-base:#0b0b0c;--dsw-alias-text-primary:#eceae6;--dsw-alias-border-l1:#555}body{margin:0;font:14px system-ui}#plugin-view{height:780px}#plugin-settings{padding:24px;background:#eee;color:#222}#native-composer{height:120px;background:var(--dsw-alias-bg-base);padding:16px;color:#ddd}#native-composer textarea{width:80%;height:60px;resize:none}[data-conversation-tabs]{flex:none;display:flex;padding:12px;gap:12px}#native-approval{display:none}${css}</style><div id="fixture"></div><script>${js.replaceAll("</script", "<\\/script")}</script></html>`);
console.log(`${output}/host-fixture.html`);
