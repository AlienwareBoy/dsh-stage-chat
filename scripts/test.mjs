import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
const output = process.env.DSH_CHECK_DIR || "/tmp/dsh-stage-chat-013-checks";
await mkdir(output, { recursive: true });
await build({ entryPoints: ["tests/lifecycle.test.ts"], outfile: `${output}/lifecycle.mjs`,
  bundle: true, platform: "node", format: "esm", loader: { ".md": "text" } });
await import(`${output}/lifecycle.mjs`);
const { apply, STRICT_STAGES_CLAUSE, createSessionDirectoryCache, recordSession, directoryOf } = await import("../lib/index.js");
let prompt = "初始提示 {{保留原文}}", strict = true, agentsJson = "{}", section, settingsOwner, disposed = 0;
const listeners = {};
const fiber = {};
const child = {
  effect: fn => fn(),
  settings: { configure(options, owner) {
    if (options.auto !== false) throw new Error("Generated form must stay off");
    settingsOwner = owner; return () => disposed++;
  } },
  systemPrompt: { section(value) { section = value; return () => disposed++; } }
};
apply({ fiber, on: (name, fn) => { listeners[name] = fn; return () => delete listeners[name]; },
    inject: (_names, fn) => fn(child) },
  { json: { get: () => "{}" }, outputPrompt: { get: () => prompt },
    strictStages: { get: () => strict }, agents: { get: () => agentsJson } });
if (settingsOwner !== fiber || section.interpolate !== false)
  throw new Error("Host configuration or prompt integration failed");
if (typeof listeners["session/created"] !== "function")
  throw new Error("The plugin must track session/created for workspace directories");
const composed = (agent = "") => prompt + (strict || agent ?
  "\n\n## 4. 行为硬性要求（设置附加，按 agent 生效）\n\n" +
  [strict ? STRICT_STAGES_CLAUSE : "", agent].filter(Boolean).join("\n") : "");
if (section.text({}) !== composed())
  throw new Error("Diagnostics assemblies must see the global defaults");
agentsJson = JSON.stringify({ "/work/股票": "- 股票答复必须先给结论。" });
if (section.text({ agent: { id: "unknown-session" } }) !== composed())
  throw new Error("An unannounced session must fall back to the global defaults");
const cache = createSessionDirectoryCache();
recordSession(cache, { id: "s-stocks", header: { cwd: "/work/股票" } });
recordSession(cache, { id: "s-trade", header: {} });
if (directoryOf(cache, "s-stocks") !== "/work/股票" || directoryOf(cache, undefined) !== null)
  throw new Error("Directory bookkeeping must follow session headers");
listeners["session/created"]({ id: "s-live", header: { cwd: "/work/股票" } });
prompt = "用户更新后的提示";
if (section.text({ agent: { id: "s-live" } }) !== composed("- 股票答复必须先给结论。"))
  throw new Error("A session in a configured workspace must receive its own requirements");
strict = false; agentsJson = "{}";
if (section.text({ agent: { id: "s-live" } }) !== prompt)
  throw new Error("Disabled toggle and empty agent requirements must leave the prompt unmodified");
console.log("PASS native settings owner, runtime prompt, and workspace-directory per-agent delivery");
