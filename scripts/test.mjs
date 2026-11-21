import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
const output = process.env.DSH_CHECK_DIR || "/tmp/dsh-stage-chat-013-checks";
await mkdir(output, { recursive: true });
await build({ entryPoints: ["tests/lifecycle.test.ts"], outfile: `${output}/lifecycle.mjs`,
  bundle: true, platform: "node", format: "esm", loader: { ".md": "text" } });
await import(`${output}/lifecycle.mjs`);
const { apply, STRICT_STAGES_CLAUSE, REQUIRED_CHARTS_CLAUSE } = await import("../lib/index.js");
let prompt = "初始提示 {{保留原文}}", strict = true, charts = true, section, settingsOwner, disposed = 0;
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
  { json: { get: () => "{}" }, outputPrompt: { get: () => prompt },
    strictStages: { get: () => strict }, requiredCharts: { get: () => charts } });
if (settingsOwner !== fiber || section.interpolate !== false)
  throw new Error("Host configuration or prompt integration failed");
const composed = () => prompt + (strict || charts ?
  "\n\n## 4. 行为硬性要求（设置开关附加）\n\n" +
  [strict ? STRICT_STAGES_CLAUSE : "", charts ? REQUIRED_CHARTS_CLAUSE : ""].filter(Boolean).join("\n") : "");
if (section.text() !== composed())
  throw new Error("Strict-stage and chart clauses must compose into the section");
if (!section.text().includes("阶段消息") || !section.text().includes("mermaid"))
  throw new Error("Default toggles must append both hard clauses");
prompt = "用户更新后的提示";
if (section.text() !== composed()) throw new Error("Prompt must read current volatile settings");
strict = false; charts = false;
if (section.text() !== prompt) throw new Error("Disabled toggles must leave the prompt unmodified");
strict = true; charts = false;
if (!section.text().includes("阶段消息") || section.text().includes("mermaid"))
  throw new Error("Each toggle must control only its own clause");
console.log("PASS native settings owner, runtime prompt, and dynamic behavior toggles");
