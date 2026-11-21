import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
const output = process.env.DSH_CHECK_DIR || "/tmp/dsh-stage-chat-013-checks";
await mkdir(output, { recursive: true });
await build({ entryPoints: ["tests/lifecycle.test.ts"], outfile: `${output}/lifecycle.mjs`,
  bundle: true, platform: "node", format: "esm", loader: { ".md": "text" } });
await import(`${output}/lifecycle.mjs`);
const { apply, STRICT_STAGES_CLAUSE, createPresetScopeCache, presetOf, schedulePresetRefresh } = await import("../lib/index.js");
const { bindScopeParent, scopeChainOf } = await import("@deepseek-ai/dsh-scope");
let prompt = "初始提示 {{保留原文}}", strict = true, agentsJson = "{}", section, settingsOwner, disposed = 0;
const fiber = {};
const child = {
  effect: fn => fn(),
  settings: { configure(options, owner) {
    if (options.auto !== false) throw new Error("Generated form must stay off");
    settingsOwner = owner; return () => disposed++;
  } },
  systemPrompt: { section(value) { section = value; return () => disposed++; } }
};
const stockKey = {}, assistantKey = {};
const registry = {
  list: async () => [{ id: "stock" }, { id: "assistant" }],
  acquireScope: async id => ({ key: id === "stock" ? stockKey : assistantKey })
};
apply({ fiber, inject: (_names, fn) => fn({ ...child, agentPresets: registry }) },
  { json: { get: () => "{}" }, outputPrompt: { get: () => prompt },
    strictStages: { get: () => strict }, agents: { get: () => agentsJson } });
// The plugin prewarms its preset-scope cache asynchronously after injection.
await new Promise(resolve => setTimeout(resolve, 50));
if (settingsOwner !== fiber || section.interpolate !== false)
  throw new Error("Host configuration or prompt integration failed");
const composed = (agent = "") => prompt + (strict || agent ?
  "\n\n## 4. 行为硬性要求（设置附加，按 agent 生效）\n\n" +
  [strict ? STRICT_STAGES_CLAUSE : "", agent].filter(Boolean).join("\n") : "");
if (section.text({}) !== composed())
  throw new Error("Global section must compose the strict clause");
agentsJson = JSON.stringify({ stock: "- 股票答复必须先给结论。" });
if (section.text({}) !== composed())
  throw new Error("Without a scope every agent must see the global defaults");
const scopeCache = createPresetScopeCache();
schedulePresetRefresh(scopeCache, { agentPresets: registry });
await new Promise(resolve => setTimeout(resolve, 20));
const sessionKey = {};
bindScopeParent(sessionKey, stockKey);
if (presetOf(scopeCache, sessionKey) !== "stock")
  throw new Error("A session scope under the stock preset must resolve to stock");
const assistantSession = {};
bindScopeParent(assistantSession, assistantKey);
if (presetOf(scopeCache, assistantSession) !== "assistant" || presetOf(scopeCache, undefined) !== null)
  throw new Error("Scope resolution must follow the parent chain");
prompt = "用户更新后的提示";
if (section.text({ scope: sessionKey }) !== composed("- 股票答复必须先给结论。"))
  throw new Error("The stock agent must receive its own requirements");
if (section.text({ scope: assistantSession }) !== composed())
  throw new Error("An agent without requirements must fall back to defaults");
strict = false; agentsJson = "{}";
if (section.text({ scope: sessionKey }) !== prompt)
  throw new Error("Disabled toggle and empty agent requirements must leave the prompt unmodified");
console.log("PASS native settings owner, runtime prompt, and per-agent scope resolution");
