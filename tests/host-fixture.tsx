// Offline test harness only. The plugin bundle and Markdown renderer are real;
// session transport, slots, and configuration persistence are controlled fixtures.
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { MarkdownText, MarkdownDelegateProvider, FenceCodeBlock, FenceMathBlock } from "@deepseek-ai/dsh-client-ui-primitives";
import { SlotCore } from "@deepseek-ai/dsh-client-ui-slots";
import nativeCss from "../node_modules/@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationRoot.module.css";
import plugin from "../lib/client.js?text";
import defaults from "../dsh-stage-chat-config.json";
import prompt from "../dsh-stage-chat-output-prompt.md";

function store<T>(value: T) {
  const listeners = new Set<() => void>();
  return { getSnapshot: () => value, subscribe(fn: () => void) {
    listeners.add(fn); return () => listeners.delete(fn);
  }, set(next: T) { value = next; listeners.forEach(fn => fn()); } };
}
let stage = 0;
let finalText = "# 检查结论\n\n三个任务已逐项检查。\n\n## 本轮产物\n\n[检查报告](file:///tmp/task-report.md)\n\n```json\n{\"checked\":3}\n```";
let long = false, older = false, extra = "";
function makeChat() {
  const names = ["日报汇总", "更新提醒", "今日待办"];
  const nodes: any[] = [{ key: "user", kind: "user", data: { content: [{ type: "text", text: "逐项检查三个任务，并给出完整结果。" }] } }];
  names.forEach((title, i) => {
    const completed = stage > i;
    nodes.push({ key: `public-stage-${i}`, kind: "assistant-step", data: {
      status: "settled", blocks: [{ kind: "text",
        text: `## ${title}：核对任务运行记录、实际返回与待处理事项，检查所有必要的证据并给出结论\n\n正在检查${title}。这些是本阶段的公开说明。` }, { kind: "tool-call", callId: String(i) }]
    } });
    nodes.push({ key: `tool-${i}`, kind: "tool-call", data: { root: {
      callId: String(i), name: "check_task", args: { text: (key: string) => key === "description" ? title : undefined },
      subCalls: [], ...(completed ? { kind: "tool-result", call: { argsRaw: JSON.stringify({ title }) },
        isError: false, content: [{ type: "text", text: `${title}的实际检查结果` }] } :
        { phase: stage === i ? "start" : "preparing", argsRaw: JSON.stringify({ title }) })
    } } });
  });
  if (stage >= 3) nodes.push({ key: "answer", kind: "assistant-step", data: {
    status: stage === 4 ? "settled" : "running",
    blocks: [{ kind: "text", text: finalText + extra }]
  } });
  const keys = nodes.map(n => n.key), map = new Map(nodes.map(n => [n.key, n]));
  const status = stage === 4 ? "closed" : "open";
  const turnOrder = [...(older ? [0] : []), ...(long ? Array.from({ length: 12 }, (_, i) => i + 10) : []), 1];
  return { order: keys, locations: { getTurn: () => keys },
    navigation: { items: () => turnOrder.map(turn => ({ turn, anchorKey: "user",
      prompt: `第 ${turn} 轮：逐项检查三个任务。`, response: stage === 4 ? finalText.slice(0, 180) : "" })) },
    nodes: { get: (key: string) => map.get(key), source: () => ({ subscribe: () => () => {} }) },
    timeline: { turnOrder: [...(older ? [0] : []), ...(long ? Array.from({ length: 12 }, (_, i) => i + 10) : []), 1],
      turns: new Map([0, 1, ...Array.from({ length: 12 }, (_, i) => i + 10)].map(id => [id, { status,
      end: stage === 4 ? { data: { reason: { kind: "completed" } } } : undefined }])) } };
}
const chat = store(makeChat()), pending = store(new Map());
const session = store({ hasMore: false, loadingOlder: false });
const formState = store({ status: "ready", writable: true, revision: 1, value: {
  json: JSON.stringify(defaults, null, 2), outputPrompt: prompt } });
let accepts = true;
const form = { ...formState, async mutate(ops: any[], revision?: number) {
  if (!accepts || revision !== undefined && revision !== formState.getSnapshot().revision) return false;
  const value = { ...formState.getSnapshot().value } as any;
  ops.forEach(op => { value[op.path[0]] = op.value; });
  formState.set({ ...formState.getSnapshot(), revision: formState.getSnapshot().revision + 1, value }); return true;
} };
const cleanups: (() => void)[] = [];
const slots = new SlotCore();
slots.registerFactory({ name: "fixture-root", scope: "root", children: {
  "conversation.view": { kind: "list", scope: "session" },
  "settings.section": { kind: "list", scope: "root" }
} } as any, () => null);
slots.register({ name: "conversation.view", id: "chat", order: 0, label: "对话" }, () => <p data-native-chat>旧对话</p>);
const tabs = store(slots.entries("conversation.view"));
slots.subscribe("conversation.view", () => tabs.set(slots.entries("conversation.view")));
let pluginExports: any;
(window as any).__ModuleLoader__ = { load({ id, factory }: any) {
  if (id !== "dsh-stage-chat") throw new Error("Unexpected plugin module");
  pluginExports = factory((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "@deepseek-ai/dsh-client-ui-primitives") return { MarkdownText, MarkdownDelegateProvider, FenceCodeBlock, FenceMathBlock };
    throw new Error(`Unexpected host module: ${name}`);
  });
} };
Function(plugin)();
const ctx = {
  effect(fn: () => any) { const stop = fn(); if (typeof stop === "function") cleanups.push(stop); },
  slots: Object.assign(slots, { inject(_name: string, fn: () => any) {
    const stop = fn(); if (typeof stop === "function") cleanups.push(stop); return stop;
  } }),
  configForms: { get: () => form, whileServed: (_keys: string[], fn: () => any) => fn() },
  sessions: {
    binding: () => ({ session: { loadOlder: async () => {
      older = true; session.set({ hasMore: false, loadingOlder: false }); chat.set(makeChat());
    } } }),
    list: { getSnapshot: () => ({ byId: { fixture: { cwd: "/tmp" } } }) }
  },
  uiSession: { sessionStatus: pending },
  uiConversation: { binding: () => ({ target: () => chat }) },
  sidebarRight: { openResource: (address: string) => { (window as any).lastOpened = address; } }
};
pluginExports.apply(ctx);
const preferenceKey = "dsh-ui-conversation.default-view-check";
localStorage.setItem(preferenceKey, JSON.stringify({ draft: "未发送草稿", view: "chat" }));
const sourceHook = (source: any) => (selector = (v: any) => v) =>
  selector(React.useSyncExternalStore(source.subscribe, source.getSnapshot));
const view = slots.entriesOfSlot("conversation.view")[0], settings = slots.entriesOfSlot("settings.section")[0],
  injected = (view as any).inject("fixture");
if (view.options.id !== "chat" || view.options.priority !== -100 || slots.entries("conversation.view").length !== 2)
  throw new Error("Native Chat was not replaced through the real slot election");
if (localStorage.getItem(preferenceKey) !== JSON.stringify({ draft: "未发送草稿", view: "chat" }))
  throw new Error("Draft or view preference changed");
localStorage.removeItem(preferenceKey);
const props = {
  sessionId: "fixture", useChat: sourceHook(chat), useSession: sourceHook(session),
  useSettings: sourceHook(injected.hooks.settings), usePending: sourceHook(injected.hooks.pending),
  useTurn: (id: string, selector?: any) => sourceHook(injected.keyedHooks.turn(id))(selector),
  openView: (id: string) => { (window as any).lastView = id; },
  openFile: injected.openFile, loadOlder: injected.loadOlder
};
const root = createRoot(document.getElementById("fixture")!);
function Header() {
  const entries = sourceHook(tabs)();
  return <div data-conversation-tabs role="tablist">{entries.map((entry: any, i: number) =>
    <button key={i} role="tab" aria-selected={entry.options.id === "chat"}>{entry.options.label}</button>
  )}</div>;
}
root.render(<><div id="plugin-view" className={nativeCss.root} data-phase="active">
  <Header /><div className={nativeCss.body}><div id="native-scroll" className={nativeCss.scrollBody}>
    <div className={nativeCss.viewArea}><view.component {...props} /></div>
    <div className={nativeCss.composerSeat}><div id="native-composer">
      <textarea aria-label="发送消息" placeholder="输入消息" /><button>发送</button>
      <div id="native-approval">批准 / 拒绝</div>
    </div></div>
  </div></div></div><div id="plugin-settings">
  <settings.component form={form} useForm={sourceHook(form)} />
</div></>);
(window as any).fixture = {
  setStage(next: number) { stage = next; chat.set(makeChat()); },
  setFinal(text: string) { finalText = text; stage = 4; chat.set(makeChat()); },
  long(on: boolean) { long = on; chat.set(makeChat()); session.set({ hasMore: on, loadingOlder: false }); },
  append() { extra += "\n\n新的公开结果段落。"; chat.set(makeChat()); },
  addView() { slots.register({ name: "conversation.view", id: "test", label: "其他视图" }, () => null); },
  block(on: boolean) { pending.set(on ? new Map([["fixture", {
    pendingInteraction: { kind: "tool-approval", key: "approval-1", sessionId: "fixture" }
  }]]) : new Map()); },
  accept(on: boolean) { accepts = on; },
  saved() { return formState.getSnapshot().value; },
  dispose() { root.unmount(); cleanups.forEach(stop => stop()); }
};
