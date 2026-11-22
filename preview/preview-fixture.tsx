/**
 * Browser-only preview harness. Real plugin client + mocked chat you can type into.
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

const SEED_TURNS = 3;

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

type TurnRec = {
  id: number;
  prompt: string;
  stageText: string;
  toolOutput: string;
  answer: string;
  status: "open" | "closed";
  toolPhase: "preparing" | "start" | "done";
  answerStatus: "none" | "running" | "settled";
  startTime: number;
  endTime?: number;
  endSeq: number;
};

function seedPrompt(i: number): string {
  if (i === 1) return "需要更新，并把旧数据删掉。先判断是否冗余。缓存位置要改到塞外书生缓存目录。";
  if (i === 2) return "看看通达信 mcp 是否正常。trocks 后端服务和前端服务是否正常";
  return `第 ${i} 轮预览：检查通达信 MCP、trocks 前后端与财务缓存。`;
}

function seedAnswer(i: number, promptText: string): string {
  return [
    `## 结论`,
    ``,
    `已收到：「${promptText.slice(0, 42)}${promptText.length > 42 ? "…" : ""}」`,
    ``,
    `第 ${i} 轮体检：三处服务在线，通达信 MCP 可取数。`,
    ``,
    `- **财务缓存写不进家目录**`,
    `- **本地日 K 可继续核对**`,
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

function createSeedTurns(): TurnRec[] {
  const now = Date.now();
  return Array.from({ length: SEED_TURNS }, (_, i) => {
    const id = i + 1;
    const promptText = seedPrompt(id);
    return {
      id,
      prompt: promptText,
      stageText: `## 收集公开资料\n\n正在核对第 ${id} 轮服务与缓存状态。`,
      toolOutput: `第 ${id} 轮工具返回：服务正常`,
      answer: seedAnswer(id, promptText),
      status: "closed" as const,
      toolPhase: "done" as const,
      answerStatus: "settled" as const,
      startTime: now - (SEED_TURNS - id + 1) * 3600_000,
      endTime: now - (SEED_TURNS - id) * 3600_000 + 90_000,
      endSeq: 1000 + id * 10
    };
  });
}

let turns: TurnRec[] = createSeedTurns();
let nextSeq = 1000 + SEED_TURNS * 10 + 10;
let busy = false;

function buildChat() {
  const turnOrder = turns.map(t => t.id);
  const nodesByTurn = new Map<number, any[]>();
  const allNodes = new Map<string, any>();
  const timings = new Map<number, { startTime: number; endTime?: number }>();
  const turnEnds = new Map<number, number>();

  for (const turn of turns) {
    const nodes: any[] = [{
      key: `user-${turn.id}`, kind: "user",
      data: { content: [{ type: "text", text: turn.prompt }] }
    }];

    if (turn.toolPhase !== "preparing" || turn.stageText) {
      nodes.push({
        key: `stage-${turn.id}`, kind: "assistant-step",
        data: {
          status: turn.status === "open" && turn.toolPhase !== "done" ? "running" : "settled",
          blocks: [
            { kind: "text", text: turn.stageText },
            { kind: "tool-call", callId: `c-${turn.id}` }
          ]
        }
      });
      const toolRoot: any = {
        callId: `c-${turn.id}`, name: "check_services",
        args: { text: (key: string) => key === "description" ? "体检" : undefined },
        subCalls: []
      };
      if (turn.toolPhase === "done") {
        Object.assign(toolRoot, {
          kind: "tool-result",
          call: { argsRaw: JSON.stringify({ turn: turn.id }) },
          isError: false,
          content: [{ type: "text", text: turn.toolOutput }]
        });
      } else {
        Object.assign(toolRoot, {
          phase: turn.toolPhase === "start" ? "start" : "preparing",
          argsRaw: JSON.stringify({ turn: turn.id })
        });
      }
      nodes.push({ key: `tool-${turn.id}`, kind: "tool-call", data: { root: toolRoot } });
    }

    if (turn.answerStatus !== "none") {
      nodes.push({
        key: `answer-${turn.id}`, kind: "assistant-step",
        data: {
          status: turn.answerStatus === "running" ? "running" : "settled",
          blocks: [{ kind: "text", text: turn.answer }]
        }
      });
    }

    nodesByTurn.set(turn.id, nodes);
    nodes.forEach(n => allNodes.set(n.key, n));
    timings.set(turn.id, { startTime: turn.startTime, endTime: turn.endTime });
    if (turn.status === "closed") turnEnds.set(turn.id, turn.endSeq);
  }

  return {
    order: [...allNodes.keys()],
    locations: {
      getTurn: (turn: number) => (nodesByTurn.get(turn) ?? []).map(n => n.key)
    },
    navigation: {
      items: () => turnOrder.map(id => {
        const turn = turns.find(t => t.id === id)!;
        return {
          turn: id,
          anchorKey: `user-${id}`,
          prompt: turn.prompt,
          response: turn.answerStatus === "none" ? "" :
            turn.answer.replace(/[#*`|>\-\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
        };
      })
    },
    nodes: {
      get: (key: string) => allNodes.get(key),
      source: () => ({ subscribe: () => () => {} })
    },
    timeline: {
      turnOrder,
      turns: new Map(turnOrder.map(id => {
        const turn = turns.find(t => t.id === id)!;
        return [id, {
          status: turn.status,
          end: turn.status === "closed"
            ? { seq: turn.endSeq, data: { reason: { kind: "completed" } } }
            : undefined
        }];
      }))
    },
    legacy: { turnTimings: timings, turnEnds, nodes: [], partial: null, runningCalls: [] }
  };
}

const chat = store(buildChat());
const pending = store(new Map());
const session = store({ hasMore: false, loadingOlder: false });
const formState = store({
  status: "ready", writable: true, revision: 1,
  value: { json: JSON.stringify(defaults, null, 2), outputPrompt: prompt, strictStages: true, agents: "{}" }
});
const composerBusy = store(false);

function publish() {
  chat.set(buildChat());
  composerBusy.set(busy);
}

function wait(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function sendMessage(text: string) {
  const trimmed = text.trim();
  if (!trimmed || busy) return;
  busy = true;
  const id = (turns[turns.length - 1]?.id ?? 0) + 1;
  const startTime = Date.now();
  turns = [...turns, {
    id,
    prompt: trimmed,
    stageText: "## 收集公开资料\n\n正在根据你的输入核对服务与缓存。",
    toolOutput: "",
    answer: "",
    status: "open",
    toolPhase: "preparing",
    answerStatus: "none",
    startTime,
    endSeq: nextSeq
  }];
  publish();

  await wait(350);
  turns = turns.map(t => t.id === id ? { ...t, toolPhase: "start" } : t);
  publish();

  await wait(700);
  turns = turns.map(t => t.id === id ? {
    ...t,
    toolPhase: "done",
    toolOutput: `已处理输入（${trimmed.length} 字）：工具返回正常。`
  } : t);
  publish();

  await wait(280);
  const draft = [
    `## 结论`,
    ``,
    `已按你的问题执行预览回合。`,
    ``,
    `> ${trimmed}`,
    ``
  ].join("\n");
  turns = turns.map(t => t.id === id ? { ...t, answerStatus: "running", answer: draft } : t);
  publish();

  await wait(450);
  const final = seedAnswer(id, trimmed);
  nextSeq += 10;
  turns = turns.map(t => t.id === id ? {
    ...t,
    answerStatus: "settled",
    answer: final,
    status: "closed",
    endTime: Date.now(),
    endSeq: nextSeq
  } : t);
  busy = false;
  publish();
}

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
    fork: async (opts: {
      sessionId: string; atSeq?: number; increaseTitle?: boolean;
      onCreated?: (childId: string) => void;
    }) => {
      (window as any).__lastFork = opts;
      // Preview stand-in for host fork: keep only history at/before the cut.
      if (typeof opts.atSeq === "number") {
        turns = turns.filter(t => t.status === "closed" && t.endSeq <= opts.atSeq!);
        busy = false;
        publish();
        window.dispatchEvent(new CustomEvent("dsh-stage-chat-preview-mount-all"));
      }
      const childId = `preview-fork-${opts.atSeq ?? "latest"}`;
      opts.onCreated?.(childId);
      const note = document.getElementById("preview-note");
      if (note) {
        note.textContent = `已从此前分支（预览）：保留到 seq ${opts.atSeq ?? "latest"}，共 ${turns.length} 轮`;
        note.hidden = false;
        window.setTimeout(() => { note.hidden = true; }, 2600);
      }
      return childId;
    }
  },
  uiSession: { sessionStatus: pending },
  uiConversation: { binding: () => ({ target: () => chat }) },
  sidebarRight: { openResource: (address: string) => { (window as any).lastOpened = address; } },
  uiWorkspace: {
    openSession: (id: string) => {
      (window as any).__openedSession = id;
      const note = document.getElementById("preview-note");
      if (note) {
        note.textContent = `预览已切换到分支会话 ${id}`;
        note.hidden = false;
        window.setTimeout(() => { note.hidden = true; }, 2600);
      }
    }
  }
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

function Composer() {
  const [text, setText] = React.useState("");
  const running = sourceHook(composerBusy)();
  const send = async () => {
    const value = text;
    setText("");
    await sendMessage(value);
  };
  return <div id="native-composer">
    <textarea
      aria-label="发送消息"
      placeholder={running ? "本轮预览执行中…" : "输入消息后发送，查看气泡 / 执行过程 / 结果"}
      value={text}
      disabled={running}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void send();
        }
      }}
    />
    <div className="composer-actions">
      <span className="composer-hint">Enter 发送 · Shift+Enter 换行 · 预览会模拟工具与最终答复</span>
      <button type="button" disabled={running || !text.trim()} onClick={() => void send()}>
        {running ? "执行中…" : "发送"}
      </button>
    </div>
  </div>;
}

const root = createRoot(document.getElementById("fixture")!);
root.render(
  <div id="plugin-view" className={nativeCss.root} data-phase="active">
    <div className={nativeCss.body}>
      <div id="native-scroll" className={nativeCss.scrollBody}>
        <div className={nativeCss.viewArea}>
          <view.component {...props} />
        </div>
        <div className={nativeCss.composerSeat}>
          <Composer />
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
  },
  send: sendMessage
};

document.getElementById("btn-theme")?.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  (window as any).preview.theme(dark);
});
document.getElementById("btn-jump")?.addEventListener("click", () => {
  (window as any).preview.jump(2);
});
document.getElementById("btn-mount-all")?.addEventListener("click", () => {
  (window as any).preview.mountAll();
});
