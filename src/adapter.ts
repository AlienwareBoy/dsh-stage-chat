import type { ChatNode, ChatSnapshot, ToolCallBlock } from "@deepseek-ai/dsh-client-ui-chat/client";
import type { ObservableSnapshot } from "@deepseek-ai/dsh-client-store";
import { serialFocus } from "./config";
import { fromMarkdown } from "mdast-util-from-markdown";

export type State = "queued" | "running" | "succeeded" | "failed" | "interrupted";
export interface Item {
  id: string; title: string; name: string; state: State;
  input: string; output: string; children: Item[];
}
export interface Stage {
  id: string; title: string; text: string; items: Item[]; state: State;
}
export interface Turn {
  id: number; users: { id: string; text: string; files: string[] }[];
  items: Item[]; progress: string[]; final: string; partial: string;
  state: "open" | "closed" | "unknown"; reason?: string; errors: string[];
  generating: boolean; focusId: string | null;
  result: string; reportedProcess: string; confirmation: string;
  stages: Stage[]; currentStageId: string | null;
  startedAt: number | null;
}
function stageTitle(text: string): string {
  return text.split("\n").map(line => line.trim()).find(Boolean)
    ?.replace(/^#{1,6}\s+|^[-*>]\s+/g, "").replace(/[*`]/g, "") || "执行任务";
}
/** Slice original Markdown using parsed top-level headings; never rewrite code or links. */
export function splitAnswer(markdown: string) {
  const tree = fromMarkdown(markdown);
  const names: Record<string, "process" | "result" | "confirmation"> = {
    执行过程: "process", 执行结果: "result", 最终答复: "result", 最终结果: "result",
    需要确认: "confirmation", 待确认: "confirmation"
  };
  const textOf = (node: any): string => node.value ?? node.children?.map(textOf).join("") ?? "";
  const headings = tree.children.flatMap(node => {
    if (node.type !== "heading") return [];
    const name = textOf(node).trim().replace(/^(?:\d+[.、．:：)]\s*|[一二三]+[、.]\s*)/, "").trim();
    const kind = names[name];
    return kind ? [{ kind, depth: node.depth, start: node.position!.start.offset!,
      end: node.position!.end.offset! }] : [];
  });
  const resultHeading = headings.find(h => h.kind === "result");
  if (!resultHeading) return { result: markdown, reportedProcess: "", confirmation: "" };
  const sections = headings.filter(h => h.depth === resultHeading.depth);
  const parts = { process: [] as string[], result: [] as string[], confirmation: [] as string[] };
  const preamble = markdown.slice(0, sections[0].start).trim();
  if (preamble) parts.result.push(preamble);
  sections.forEach((h, i) => {
    const body = markdown.slice(h.end, sections[i + 1]?.start ?? markdown.length).trim();
    if (body) parts[h.kind].push(body);
  });
  let confirmation = parts.confirmation.join("\n\n");
  // Old prompt emitted a no-action section followed by optional offers.
  if (/^(?:[>*\s-]*)(?:无待办事项|暂无待办事项|无需确认|不需要确认|无需要确认的事项|没有待处理事项|无待确认事项|无)[。.!！\s]*$/.test(confirmation) ||
      /^(?:[>*\s-]*)(?:无待办事项|暂无待办事项|无需确认)[。.!！]\s*(?:需要的话|如有需要|如果需要|我可以)/.test(confirmation))
    confirmation = "";
  return { result: parts.result.join("\n\n"), reportedProcess: parts.process.join("\n\n"), confirmation };
}
function tool(call: ToolCallBlock, closed: boolean): Item {
  const settled = "kind" in call;
  const title = call.args.text("description") || call.args.text("title") ||
    call.args.text("task") || call.name || call.callId;
  return {
    id: call.callId, title, name: call.name,
    state: settled ? call.isError ? "failed" : "succeeded" :
      closed ? "interrupted" : call.phase === "start" ? "running" : "queued",
    input: settled ? call.call?.argsRaw ?? "" : call.phase === "start" ? call.argsRaw : "",
    output: settled ? [call.content.map(b => b.type === "text" ? b.text : JSON.stringify(b)).join("\n"),
      call.isError ? call.error?.reason : ""].filter(Boolean).join("\n") : "",
    children: call.subCalls.map(c => tool(c, closed))
  };
}

export function adaptTurn(chat: ChatSnapshot, id: number): Turn {
  const location = chat.timeline.turns.get(id), state = location?.status ?? "unknown";
  const nodes = chat.locations.getTurn(id).flatMap(key => {
    const n = chat.nodes.get(key); return n ? [n as ChatNode] : [];
  });
  const items: Item[] = [], users: Turn["users"] = [], progress: string[] = [], errors: string[] = [];
  const stages: Stage[] = [];
  const seen = new Set<string>();
  let partial = "", lastReply = "", generating = false, closing = "", replyKey = "";
  let stage: Stage | undefined;
  for (const n of nodes) {
    if (n.kind === "user" || n.kind === "steering") {
      users.push({ id: n.key,
        text: n.data.content.flatMap(b => b.type === "text" ? [b.text] : []).join("\n"),
        files: n.data.content.flatMap(b => b.type === "file" ? [b.attachment.name] :
          b.type === "image" ? ["图片附件（在原生对话中查看）"] : [])
      });
    } else if (n.kind === "tool-call" && !seen.has(n.data.root.callId)) {
      seen.add(n.data.root.callId);
      const item = tool(n.data.root, state === "closed");
      items.push(item);
      if (!stage) {
        stage = { id: `execution-${id}`, title: "执行任务", text: "", items: [], state: "queued" };
        stages.push(stage);
      }
      stage.items.push(item);
      lastReply = "";
    } else if (n.kind === "assistant-step") {
      const text = n.data.blocks.flatMap(b => b.kind === "text" ? [b.text] : []).join("\n\n");
      const hasTools = n.data.blocks.some(b => b.kind === "tool-call");
      if (text) {
        stage = { id: n.key, title: stageTitle(text), text, items: [], state: "queued" };
        stages.push(stage);
      }
      if (hasTools) lastReply = "";
      if (text && !hasTools) { lastReply = text; replyKey = n.key; }
      if (n.data.status === "running" && state === "open") {
        partial = text; generating = !hasTools;
      } else if (n.data.status === "interrupted" && text) {
        partial = text;
      }
    } else if (n.kind === "turn-tail" && n.data.closing) {
      if (!n.data.closing.blocks.some(b => b.kind === "tool-call"))
        closing = n.data.closing.blocks.flatMap(b => b.kind === "text" ? [b.text] : []).join("\n\n");
    } else if (n.kind === "turn-error") errors.push(n.data.message || n.data.code || "执行出错");
    else if (n.kind === "turn-max-tokens") errors.push("已达到本轮输出限制。");
  }
  const reason = location?.end?.data.reason.kind;
  const normal = state === "closed" && !errors.length &&
    !["aborted", "interrupted", "blocked"].includes(reason ?? "");
  // No final answer is inferred from a successful tool. It must be actual assistant prose.
  const final = normal ? closing || lastReply : "";
  if (!normal && !partial) partial = closing || lastReply;
  const focusId = serialFocus(items);
  const isGenerating = state === "open" && generating && !items.some(t => t.state === "running" || t.state === "queued");
  // A closing/streaming answer belongs to the result, not to a fabricated business stage.
  if (replyKey && (final || isGenerating || partial) && lastReply) {
    const index = stages.findIndex(s => s.id === replyKey && !s.items.length);
    if (index >= 0) stages.splice(index, 1);
  }
  stages.forEach((s, index) => {
    const states = s.items.map(item => item.state);
    s.state = states.includes("running") ? "running" :
      states.includes("failed") ? "failed" : states.includes("interrupted") ? "interrupted" :
      states.includes("queued") ? "queued" :
      index < stages.length - 1 || final || isGenerating ? "succeeded" :
      state === "closed" ? normal && states.length ? "succeeded" : "interrupted" : "running";
    if (s.text) progress.push(s.text);
  });
  stages.push({ id: `final-${id}`, title: "整理最终答复与图表", text: "", items: [],
    state: final ? "succeeded" : state === "closed" ? "interrupted" : isGenerating ? "running" : "queued" });
  const currentStageId = state === "open" ?
    stages.find(s => s.items.some(item => item.id === focusId))?.id ??
    [...stages].reverse().find(s => s.state === "running")?.id ??
    [...stages].reverse().find(s => s.id !== `final-${id}`)?.id ?? `final-${id}` : null;
  return { id, users, items, progress, final, partial, state, reason, errors, ...splitAnswer(final),
    generating: isGenerating, focusId, stages, currentStageId,
    // Hosts older than rc.5 may not publish legacy timings; absence means no time label.
    startedAt: chat.legacy?.turnTimings?.get(id)?.startTime ?? null };
}

/** Per-turn subscriptions include in-place tool-argument changes and turn/end updates. */
export function turnSource(source: ObservableSnapshot<ChatSnapshot>, id: number): ObservableSnapshot<Turn> {
  let value = adaptTurn(source.getSnapshot(), id);
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      let keys: readonly string[] = [], location: unknown, stops: (() => void)[] = [];
      const publish = () => { value = adaptTurn(source.getSnapshot(), id); listener(); };
      const sync = () => {
        const s = source.getSnapshot(), next = s.locations.getTurn(id), loc = s.timeline.turns.get(id);
        if (keys !== next) {
          stops.forEach(stop => stop()); keys = next;
          stops = keys.map(key => s.nodes.source(key).subscribe(publish));
          location = loc; publish();
        } else if (location !== loc) { location = loc; publish(); }
      };
      const stop = source.subscribe(sync); sync();
      return () => { stop(); stops.forEach(dispose => dispose()); };
    }
  };
}

export function fence(text: string, language = "text"): string {
  const ticks = "`".repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map(v => v.length + 1)));
  return `${ticks}${language}\n${text}\n${ticks}`;
}
