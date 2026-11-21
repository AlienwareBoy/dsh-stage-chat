import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-chat/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type { SessionPendingInteraction } from "@deepseek-ai/dsh-client-ui-session/client";
import { fileAddressFor } from "@deepseek-ai/dsh-util-workspace-path";
import type { ObservableSnapshot } from "@deepseek-ai/dsh-client-store";
import { NAMESPACE, type Settings } from "./config";
import { turnSource, type Turn } from "./adapter";
import { FocusView, type Injected } from "./view";
import { SettingsSection } from "./settings";
import { installChatTabDedup } from "./integration";
import css from "./styles.css";

export const inject = ["slots", "sessions", "uiSession", "uiConversation", "sidebarRight", "configForms"];
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const style = document.createElement("style"); style.dataset.dshFocusStyles = "";
    style.textContent = css; document.head.append(style); return () => style.remove();
  });
const form = ctx.configForms.get<Settings>(NAMESPACE);
const settings: ObservableSnapshot<Settings | undefined> = {
  getSnapshot: () => form.getSnapshot().value, subscribe: listener => form.subscribe(listener)
};
/** Agent roster for the per-agent requirements dropdown; degrades to in-use presets. */
const roster = async (): Promise<{ id: string; name?: string; description?: string }[]> => {
  const out: { id: string; name?: string; description?: string }[] = [];
  try {
    const presets = (ctx as unknown as { agentPresets?: { remoteExportList?: () => Promise<{
      presets?: { id: string; name?: string; description?: string }[] }> } }).agentPresets;
    if (presets?.remoteExportList) {
      const rosterData = await presets.remoteExportList();
      for (const preset of rosterData?.presets ?? []) out.push(preset);
      if (out.length) return out;
    }
  } catch { /* fall through to session-derived presets */ }
  try {
    const byId = (ctx.sessions.list.getSnapshot() as { byId?: Record<string, {
      projectionValues?: { agentPreset?: string | null } }> }).byId ?? {};
    const seen = new Set<string>();
    for (const session of Object.values(byId)) {
      const id = session.projectionValues?.agentPreset;
      if (typeof id === "string" && id && !seen.has(id)) { seen.add(id); out.push({ id }); }
    }
  } catch { /* no presets visible yet */ }
  return out;
};
ctx.effect(() => ctx.configForms.whileServed([NAMESPACE], () =>
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section", id: "dsh-stage-chat", order: 31, label: "对话显示",
    inject: () => ({ hooks: { form }, form, roster })
  }, SettingsSection))
));
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view", id: "chat", order: 0, priority: -100, label: "对话",
    inject: (sessionId): Injected => {
      const binding = ctx.sessions.binding(sessionId);
      if (!binding) throw new Error(`dsh-stage-chat: unknown session ${sessionId}`);
      const target = ctx.uiConversation.binding(binding).target("chat");
      const source = { getSnapshot: () => {
        const value = target.getSnapshot();
        if (!value) throw new Error("dsh-stage-chat: Chat target unavailable");
        return value;
      }, subscribe: target.subscribe.bind(target) };
      const sources = new Map<string, ObservableSnapshot<Turn>>();
      const pending: ObservableSnapshot<SessionPendingInteraction | undefined> = {
        getSnapshot: () => ctx.uiSession.sessionStatus.getSnapshot().get(sessionId)?.pendingInteraction,
        subscribe: listener => ctx.uiSession.sessionStatus.subscribe(listener)
      };
      return {
        hooks: { settings, pending },
        keyedHooks: { turn: key => {
          let value = sources.get(key);
          if (!value) { value = turnSource(source, Number(key)); sources.set(key, value); }
          return value;
        }},
        openFile: path => {
          const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd;
          ctx.sidebarRight.openResource(fileAddressFor(sessionId, cwd, path));
        },
        loadOlder: () => binding.session.loadOlder()
      };
    }
  }, FocusView));
  ctx.effect(installChatTabDedup);
}
