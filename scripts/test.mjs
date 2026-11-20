import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
const output = process.env.DSH_CHECK_DIR || "/tmp/dsh-focus-013-checks";
await mkdir(output, { recursive: true });
await build({ entryPoints: ["tests/lifecycle.test.ts"], outfile: `${output}/lifecycle.mjs`,
  bundle: true, platform: "node", format: "esm", loader: { ".md": "text" } });
await import(`${output}/lifecycle.mjs`);
const { apply } = await import("../lib/index.js");
let prompt = "初始提示 {{保留原文}}", section, settingsOwner, disposed = 0;
const fiber = {};
const child = {
  effect: fn => fn(),
  settings: { configure(options, owner) {
    if (options.auto !== false) throw new Error("Generated form must stay off");
    settingsOwner = owner; return () => disposed++;
  } },
  systemPrompt: { section(value) { section = value; return () => disposed++; } }
};
apply({ fiber, inject: (_names, fn) => fn(child) },
  { json: { get: () => "{}" }, outputPrompt: { get: () => prompt } });
if (settingsOwner !== fiber || section.interpolate !== false || section.text() !== prompt)
  throw new Error("Host configuration or prompt integration failed");
prompt = "用户更新后的提示";
if (section.text() !== prompt) throw new Error("Prompt must read current volatile settings");
console.log("PASS native settings owner and latest runtime prompt integration");
