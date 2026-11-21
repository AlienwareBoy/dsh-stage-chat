import type {} from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-system-prompt";
// Type-only: brings the ctx.agentPresets declaration into scope without a runtime import.
import type {} from "@deepseek-ai/dsh-agent-preset-registry";
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
 * Per-agent prompt delivery: the preset registry owns one standing scope key
 * per preset and every Agent's assembly walks up into it. The section text is
 * evaluated per assembly, so matching the assembly's scope chain against the
 * cached preset keys tells us which agent this turn belongs to. Reading a
 * cordis service without injecting it throws, so the registry is only used
 * from inside an optional "agentPresets" injection; without it every agent
 * falls back to the global defaults and nothing else changes.
 */
interface PresetRegistry {
  list(): Promise<{ id: string }[]>;
  acquireScope(id?: string): Promise<{ key: object }>;
}
interface PresetScopeCache {
  chain: ((key: object) => readonly object[]) | null;
  keys: Map<string, object>;
  refresh: number;
  registry: PresetRegistry | null;
}
export function createPresetScopeCache(): PresetScopeCache {
  return { chain: null, keys: new Map(), refresh: 0, registry: null };
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
export function schedulePresetRefresh(cache: PresetScopeCache): void {
  const registry = cache.registry;
  if (!registry) return;
  const now = Date.now();
  if (cache.refresh && now - cache.refresh < 60000) return;
  cache.refresh = now;
  void (async () => {
    // Every host touch stays inside try: an unhandled rejection here is fatal
    // to the host process, so any failure degrades to the global defaults.
    try {
      if (!cache.chain) cache.chain = (await import("@deepseek-ai/dsh-scope")).scopeChainOf;
      for (const preset of await registry.list()) {
        const id = preset?.id;
        if (!id || cache.keys.has(id)) continue;
        const lease = await registry.acquireScope(id);
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
  ctx.inject(["agentPresets"], registryCtx => {
    presetCache.registry = registryCtx.agentPresets as unknown as PresetRegistry;
    schedulePresetRefresh(presetCache);
  });  ctx.inject(["systemPrompt"], child => {
    schedulePresetRefresh(presetCache);
    child.effect(() => child.systemPrompt.section({
      name: "dsh-stage-chat-output",
      order: 90,
      text: (context: { scope?: object }) => {
        schedulePresetRefresh(presetCache);
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
