import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("lib", { recursive: true });
await mkdir("dev", { recursive: true });

await build({
  entryPoints: ["src/index.ts"], outfile: "lib/index.js", bundle: true,
  platform: "node", format: "esm", target: "es2022",
  packages: "external", loader: { ".md": "text" }
});

const result = await build({
  entryPoints: ["src/client.tsx"], bundle: true, write: false,
  format: "cjs", platform: "browser", target: "es2022", jsx: "automatic",
  external: [
    "react", "react/jsx-runtime", "react-dom", "react-dom/client",
    "@deepseek-ai/cordis", "@deepseek-ai/dsh-client-store",
    "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-ui-primitives"
  ],
  loader: { ".css": "text", ".md": "text" }
});

const body = result.outputFiles[0].text;
const wrap = (id) =>
  `window.__ModuleLoader__.load({id:${JSON.stringify(id)},factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${body}\nreturn module.exports;}});\n`;

// Release package name must match ModuleLoader id.
await writeFile("lib/client.js", wrap("dsh-stage-chat"));
// Local linked package is dsh-stage-chat-dev — client id must match that name.
await writeFile("dev/client.js", wrap("dsh-stage-chat-dev"));

console.log("Built lib/index.js, lib/client.js (dsh-stage-chat), dev/client.js (dsh-stage-chat-dev)");
