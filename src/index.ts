import type {} from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type { Context, Volatile } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { defaultJson, defaultPrompt, outputPromptOf, composedOutputPrompt, parseAgents } from "./config";

export { STRICT_STAGES_CLAUSE } from "./config";

export interface Config {
  json: Volatile<string>;
  outputPrompt: Volatile<string>;
  strictStages: Volatile<boolean>;
  agents: Volatile<string>;
}
export const Config = z.object({
  json: z.string().default(defaultJson).volatile(),
  outputPrompt: z.string().default(defaultPrompt).volatile(),
  strictStages: z.boolean().default(true).volatile(),
  agents: z.string().default("{}").volatile()
});

/**
 * Per-agent prompt delivery: preset registry owns one standing scope key per
 * preset and every Agent's assembly walks up into it. The section text is
 * evaluated per assembly, so matching the assembly's scope chain against the
 * cached preset keys tells us which agent this turn belongs to. Host modules
 * are imported lazily: on a host that does not expose them, or without the
 * preset registry, the section degrades to the global defaults.
 */
interface PresetScopeCache {
  chain: ((key: object) => readonly object[]) | null;
  keys: Map<string, object>;
  refresh: number;
}
export function createPresetScopeCache(): PresetScopeCache {
  return { chain: null, keys: new Map(), refresh: 0 };
}
export function presetOf(cache: PresetScopeCache, scope: object | undefined): string | null {
  if (!scope || !cache.chain) return null;
  try {
    for (const key of cache.chain(scope)) {
      for (const [id, presetKey] of cache.keys) if (presetKey === key) return id;
    }
  } catch { /* a torn-down scope chain resolves to global */ }
  return null;
}
/** Refresh preset keys at most once a minute; the first turn after a new preset may still use defaults. */
export function schedulePresetRefresh(cache: PresetScopeCache, ctx: Context): void {
  const now = Date.now();
  if (cache.refresh && now - cache.refresh < 60000) return;
  cache.refresh = now;
  void (async () => {
    try { if (!cache.chain) cache.chain = (await import("@deepseek-ai/dsh-scope")).scopeChainOf; } catch { return; }
    const presets = (ctx as { agentPresets?: { list(): Promise<{ id: string }[]>;
      acquireScope(id?: string): Promise<{ key: object }> } }).agentPresets;
    if (!presets?.acquireScope) return;
    try {
      for (const preset of await presets.list()) {
        const id = preset?.id;
        if (!id || cache.keys.has(id)) continue;
        const lease = await presets.acquireScope(id);
        if (lease?.key) cache.keys.set(id, lease.key);
      }
    } catch { /* roster unavailable: keep whatever is cached */ }
  })();
}

export function apply(ctx: Context, config: Config): void {
  ctx.inject(["settings"], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  const presetCache = createPresetScopeCache();
  ctx.inject(["systemPrompt"], child => {
    schedulePresetRefresh(presetCache, child);
    child.effect(() => child.systemPrompt.section({
      name: "dsh-stage-chat-output",
      order: 90,
      text: (context: { scope?: object }) => {
        schedulePresetRefresh(presetCache, child);
        const agents = parseAgents(config.agents.get());
        const preset = presetOf(presetCache, context.scope);
        const agentRequirements = preset && agents[preset] ? agents[preset] : "";
        return composedOutputPrompt(outputPromptOf(config.outputPrompt.get()),
          config.strictStages.get(), agentRequirements);
      },
      interpolate: false
    }));
  });
}
