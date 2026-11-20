import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("lib", { recursive: true });
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
await writeFile("lib/client.js",
  `window.__ModuleLoader__.load({id:"dsh-focus",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`);
console.log("Built lib/index.js and lib/client.js");
