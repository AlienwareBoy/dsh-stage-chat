import type {} from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-system-prompt";
// Type-only: brings the "session/created" event and the AssembleContext.agent
// field (the live Agent of each prompt assembly) into scope.
import type {} from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-agent";
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
 * Per-agent prompt delivery through the workspace directory: every prompt
 * assembly carries the live Agent (its session id), and every Session
 * announces its header — including the absolute `cwd` — when it enters the
 * store, before the first assembly. Requirements are keyed by that directory,
 * so one workspace (one directory) shares one set of hard clauses. Assemblies
 * without an Agent (diagnostics) fall back to the global defaults.
 */
interface SessionDirectoryCache {
  directories: Map<string, string | undefined>;
}
export function createSessionDirectoryCache(): SessionDirectoryCache {
  return { directories: new Map() };
}
export function directoryOf(cache: SessionDirectoryCache, sessionId: string | undefined): string | null {
  if (!sessionId) return null;
  return cache.directories.get(sessionId) ?? null;
}
/** Record one session's directory as it is announced; the listener never throws. */
export function recordSession(cache: SessionDirectoryCache, session: { id: string; header: { cwd?: string } }): void {
  cache.directories.set(session.id, session.header.cwd);
}

export function apply(ctx: Context, config: Config): void {
  ctx.inject(["settings"], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  const directoryCache = createSessionDirectoryCache();
  ctx.on("session/created", session => recordSession(directoryCache, session));
  ctx.inject(["systemPrompt"], child => {
    child.effect(() => child.systemPrompt.section({
      name: "dsh-stage-chat-output",
      order: 90,
      text: (context: { scope?: object; agent?: { id: string } }) => {
        const agents = parseAgents(config.agents.get());
        const directory = directoryOf(directoryCache, context.agent?.id);
        const agentRequirements = directory && agents[directory] ? agents[directory] : "";
        return composedOutputPrompt(outputPromptOf(config.outputPrompt.get()),
          config.strictStages.get(), agentRequirements);
      },
      interpolate: false
    }));
  });
}
