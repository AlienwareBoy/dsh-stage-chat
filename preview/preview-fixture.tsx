/**
 * Browser-only preview harness. Real plugin client bundle + mocked session/chat.
 * Not shipped in the Harness package.
 */
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { MarkdownText, MarkdownDelegateProvider, FenceCodeBlock, FenceMathBlock } from "@deepseek-ai/dsh-client-ui-primitives";
import { SlotCore } from "@deepseek-ai/dsh-client-ui-slots";
import nativeCss from "../node_modules/@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationRoot.module.css";
import plugin from "../lib/client.js?text";
import defaults from "../dsh-stage-chat-config.json";
import prompt from "../dsh-stage-chat-output-prompt.md";

const TURN_COUNT = 18;

function store<T>(value: T) {
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(next: T) {
      value = next;
      listeners.forEach(fn => fn());
    }
  };
}

function turnPrompt(i: number): string {
  if (i === 3) return "看看通达信 mcp 是否正常。trocks 后端服务和前端服务是否正常";
  if (i === 1) return "需要更新，并把旧数据删掉。先判断是否冗余。缓存位置要改到塞外书生缓存目录。";
  return `第 ${i} 轮预览：检查通达信 MCP、trocks 前后端与财务缓存。`;
}

function turnAnswer(i: number): string {
  return [
    `## 结论`,
    ``,
    `第 ${i} 轮：三处服务在线，通达信 MCP 可取数。`,
    ``,
    `仍有两点：`,
    ``,
    `- **财务缓存写不进家目录**`,
    `- **本地日 K 停在 11-06，落后若干交易日**`,
    ``,
    `## 体检结果`,
    ``,
    `| 对象 | 状态 |`,
    `| --- | --- |`,
    `| 通达信 MCP | 正常 |`,
    `| trocks 后端 | 正常 |`,
    `| trocks 前端 | 正常 |`,
    ``,
    "```mermaid",
    "flowchart LR",
    "  A[用户] --> B[MCP]",
    "  B --> C[缓存]",
    "```"
  ].join("\n");
}

function makeChat() {
  const turnOrder = Array.from({ length: TURN_COUNT }, (_, i) => i + 1);
  const nodesByTurn = new Map<number, any[]>();
  const allNodes = new Map<string, any>();
  const now = Date.now();
  const timings = new Map<number, { startTime: number; endTime: number }>();
  const turnEnds = new Map<number, number>();

  for (const id of turnOrder) {
    const userKey = `user-${id}`;
    const stageKey = `stage-${id}`;
    const toolKey = `tool-${id}`;
    const answerKey = `answer-${id}`;
    const nodes = [
      {
        key: userKey, kind: "user",
        data: { content: [{ type: "text", text: turnPrompt(id) }] }
      },
      {
        key: stageKey, kind: "assistant-step",
        data: {
          status: "settled",
          blocks: [
            {
              kind: "text",
              text: `## 收集公开资料\n\n正在核对第 ${id} 轮服务与缓存状态。`
            },
            { kind: "tool-call", callId: `c-${id}` }
          ]
        }
      },
      {
        key: toolKey, kind: "tool-call",
        data: {
          root: {
            callId: `c-${id}`, name: "check_services",
            args: { text: (key: string) => key === "description" ? "体检" : undefined },
            subCalls: [],
            kind: "tool-result",
            call: { argsRaw: JSON.stringify({ turn: id }) },
            isError: false,
            content: [{ type: "text", text: `第 ${id} 轮工具返回：服务正常` }]
          }
        }
      },
      {
        key: answerKey, kind: "assistant-step",
        data: { status: "settled", blocks: [{ kind: "text", text: turnAnswer(id) }] }
      }
    ];
    nodesByTurn.set(id, nodes);
    nodes.forEach(n => allNodes.set(n.key, n));
    timings.set(id, {
      startTime: now - (TURN_COUNT - id + 1) * 3600_000,
      endTime: now - (TURN_COUNT - id) * 3600_000 + 90_000
    });
    turnEnds.set(id, 1000 + id * 10);
  }

  return {
    order: [...allNodes.keys()],
    locations: {
      getTurn: (turn: number) => (nodesByTurn.get(turn) ?? []).map(n => n.key)
    },
    navigation: {
      items: () => turnOrder.map(turn => ({
        turn,
        anchorKey: `user-${turn}`,
        prompt: turnPrompt(turn),
        response: turnAnswer(turn).replace(/[#*`|>\-\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
      }))
    },
    nodes: {
      get: (key: string) => allNodes.get(key),
      source: () => ({ subscribe: () => () => {} })
    },
    timeline: {
      turnOrder,
      turns: new Map(turnOrder.map(id => [id, {
        status: "closed",
        end: { seq: turnEnds.get(id), data: { reason: { kind: "completed" } } }
      }]))
    },
    legacy: { turnTimings: timings, turnEnds, nodes: [], partial: null, runningCalls: [] }
  };
}

const chat = store(makeChat());
const pending = store(new Map());
const session = store({ hasMore: false, loadingOlder: false });
const formState = store({
  status: "ready", writable: true, revision: 1,
  value: { json: JSON.stringify(defaults, null, 2), outputPrompt: prompt, strictStages: true, agents: "{}" }
});

const form = {
  ...formState,
  async mutate(ops: any[], revision?: number) {
    if (revision !== undefined && revision !== formState.getSnapshot().revision) return false;
    const value = { ...formState.getSnapshot().value } as any;
    ops.forEach(op => { value[op.path[0]] = op.value; });
    formState.set({
      ...formState.getSnapshot(),
      revision: formState.getSnapshot().revision + 1,
      value
    });
    return true;
  }
};

const cleanups: (() => void)[] = [];
const slots = new SlotCore();
slots.registerFactory({
  name: "fixture-root", scope: "root",
  children: {
    "conversation.view": { kind: "list", scope: "session" },
    "settings.section": { kind: "list", scope: "root" }
  }
} as any, () => null);
slots.register({ name: "conversation.view", id: "native", order: 1, label: "原生对话" }, () => <p>native</p>);

let pluginExports: any;
(window as any).__ModuleLoader__ = {
  load({ id, factory }: any) {
    if (id !== "dsh-stage-chat" && id !== "dsh-stage-chat-dev")
      throw new Error(`Unexpected plugin module ${id}`);
    pluginExports = factory((name: string) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "@deepseek-ai/dsh-client-ui-primitives")
        return { MarkdownText, MarkdownDelegateProvider, FenceCodeBlock, FenceMathBlock };
      throw new Error(`Unexpected host module: ${name}`);
    });
  }
};
Function(plugin)();

const ctx = {
  effect(fn: () => any) {
    const stop = fn();
    if (typeof stop === "function") cleanups.push(stop);
  },
  slots: Object.assign(slots, {
    inject(_name: string, fn: () => any) {
      const stop = fn();
      if (typeof stop === "function") cleanups.push(stop);
      return stop;
    }
  }),
  configForms: { get: () => form, whileServed: (_keys: string[], fn: () => any) => fn() },
  sessions: {
    binding: () => ({
      session: {
        loadOlder: async () => { session.set({ hasMore: false, loadingOlder: false }); }
      }
    }),
    list: { getSnapshot: () => ({ byId: { preview: { cwd: "/tmp/preview" } } }) },
    fork: async (opts: { sessionId: string; atSeq?: number }) => {
      (window as any).__lastFork = opts;
      console.info("[preview] fork", opts);
      return `preview-fork-${opts.atSeq ?? "latest"}`;
    }
  },
  uiSession: { sessionStatus: pending },
  uiConversation: { binding: () => ({ target: () => chat }) },
  sidebarRight: { openResource: (address: string) => { (window as any).lastOpened = address; } },
  uiWorkspace: { openSession: (id: string) => { (window as any).__openedSession = id; } }
};

pluginExports.apply(ctx);

const sourceHook = (source: any) => (selector = (v: any) => v) =>
  selector(React.useSyncExternalStore(source.subscribe, source.getSnapshot));

const view = slots.entriesOfSlot("conversation.view").find((e: any) => e.options.id === "chat")
  ?? slots.entriesOfSlot("conversation.view")[0];
const injected = (view as any).inject("preview");

const props = {
  sessionId: "preview",
  useChat: sourceHook(chat),
  useSession: sourceHook(session),
  useSettings: sourceHook(injected.hooks.settings),
  usePending: sourceHook(injected.hooks.pending),
  useTurn: (id: string, selector?: any) => sourceHook(injected.keyedHooks.turn(id))(selector),
  openView: () => {},
  openFile: injected.openFile,
  loadOlder: injected.loadOlder,
  forkAt: injected.forkAt
};

const root = createRoot(document.getElementById("fixture")!);
root.render(
  <div id="plugin-view" className={nativeCss.root} data-phase="active">
    <div className={nativeCss.body}>
      <div id="native-scroll" className={nativeCss.scrollBody}>
        <div className={nativeCss.viewArea}>
          <view.component {...props} />
        </div>
        <div className={nativeCss.composerSeat}>
          <div id="native-composer">
            <textarea aria-label="发送消息" placeholder="预览输入区（不发送）" readOnly />
          </div>
        </div>
      </div>
    </div>
  </div>
);

(window as any).preview = {
  jump(turn: number) {
    document.querySelector<HTMLElement>(`.focus-anchor[aria-label*="第 ${turn} 轮"]`)?.click();
  },
  mountAll() {
    window.dispatchEvent(new CustomEvent("dsh-stage-chat-preview-mount-all"));
  },
  theme(dark: boolean) {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }
};

document.getElementById("btn-theme")?.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  (window as any).preview.theme(dark);
});
document.getElementById("btn-jump")?.addEventListener("click", () => {
  (window as any).preview.jump(3);
});
document.getElementById("btn-mount-all")?.addEventListener("click", () => {
  (window as any).preview.mountAll();
});
