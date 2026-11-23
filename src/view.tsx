import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MarkdownText, MarkdownDelegateProvider, type MarkdownLabels } from "@deepseek-ai/dsh-client-ui-primitives";
import type { TurnNavigationItem } from "@deepseek-ai/dsh-client-ui-chat/client";
import { parseFileAddress } from "@deepseek-ai/dsh-util-workspace-path";
import type { PropsRuntime, InjectFace } from "@deepseek-ai/dsh-client-ui-slots";
import type { ObservableSnapshot } from "@deepseek-ai/dsh-client-store";
import type { SessionPendingInteraction } from "@deepseek-ai/dsh-client-ui-session/client";
import { defaultDesign, designOf, template, type Design, type Settings } from "./config";
import { fence, adaptTurn, type Item, type Turn, type Stage } from "./adapter";
import { download, copyText } from "./settings";
import { ChartTheme, renderCode } from "./charts";

export interface Injected {
  hooks: { settings: ObservableSnapshot<Settings | undefined>; pending: ObservableSnapshot<SessionPendingInteraction | undefined> };
  keyedHooks: { turn: (key: string) => ObservableSnapshot<Turn> };
  openFile(path: string): void; loadOlder(): Promise<void>;
  /** Host fork cut; omitted when the binding cannot branch. Resolves after the child session opens. */
  forkAt?(seq: number): void | Promise<void>;
}
export type ViewProps = PropsRuntime<"conversation.view"> & InjectFace<Injected>;
const labels: MarkdownLabels = { code: { copyLabel: "复制", copiedLabel: "已复制" }, footnotes: "来源" };
export function Md({ text, compact = false, streaming = false }: { text: string; compact?: boolean; streaming?: boolean }) {
  return <MarkdownText text={text} labels={labels} omitHtml streaming={streaming} variant={compact ? "compact" : "body"} />;
}
const stateText: Record<Item["state"], string> = {
  queued: "等待执行", running: "执行中", succeeded: "已完成", failed: "执行失败", interrupted: "已中断"
};
const pad = (n: number) => String(n).padStart(2, "0");
/** Today HH:mm; yesterday prefixed; past week day-level; older full timestamp. */
function formatTurnTime(at: number): string {
  const date = new Date(at), now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (at >= startOfToday) return hm;
  if (at >= startOfToday - 86400000) return `昨天 ${hm}`;
  if (now.getTime() - at < 7 * 86400000) return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hm}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  return minutes < 60 ? `${minutes}m${total % 60}s` : `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}
/** Copy button with transient success feedback; keeps table labels stable otherwise. */
function CopyButton({ text, label }: { text: () => string; label: string }) {
  const [done, setDone] = useState<"idle" | "ok" | "fail">("idle");
  return <button onClick={async () => {
    setDone(await copyText(text()) ? "ok" : "fail");
    setTimeout(() => setDone("idle"), 1800);
  }}>{done === "ok" ? "已复制" : done === "fail" ? "复制失败" : label}</button>;
}
const plain = (text: string) => text.replace(/[*#`]/g, "");
/** Honest full-turn Markdown: only sections the host evidence actually shows. */
function turnMarkdown(turn: Turn): string {
  const lines: string[] = [`## 第 ${turn.id} 轮${turn.startedAt ? ` · ${formatTurnTime(turn.startedAt)}` : ""}`, ""];
  const question = turn.users.map(user => [user.text,
    ...user.files.map(name => `附件：${name}`)].filter(Boolean).join("\n")).join("\n\n");
  if (question) lines.push("### 提问", "", question, "");
  const process = turn.stages.filter(stage => stage.id !== `final-${turn.id}`);
  if (process.length) {
    lines.push("### 执行过程", "");
    for (const stage of process) {
      lines.push(`- 阶段：${plain(stage.title)} — ${stateText[stage.state]}`);
      if (stage.text) lines.push("", stage.text.trim(), "");
      for (const item of stage.items) lines.push(`  - 工具：${plain(item.title)}（${item.name}）— ${stateText[item.state]}`);
    }
    lines.push("");
  }
  if (turn.final || turn.partial) {
    lines.push("### 执行结果", "", (turn.final || turn.partial).trim(), "");
    if (!turn.final && turn.partial) lines.push("> 本轮尚未产出完整最终答复，以上为已返回的正文片段。", "");
  } else if (turn.state === "closed") lines.push("### 执行结果", "", "> 本轮已结束，未取得完整最终答复。", "");
  if (turn.confirmation || turn.errors.length) {
    lines.push("### 需要确认", "");
    if (turn.confirmation) lines.push(turn.confirmation.trim(), "");
    turn.errors.forEach(error => lines.push(`- 错误：${error}`));
    if (turn.reason) lines.push(`- 本轮结束状态：${turn.reason}`);
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
function Mark({ state }: { state: Item["state"] }) {
  return <span className="focus-mark" data-state={state} aria-hidden="true">
    {state === "succeeded" ? "✓" : state === "failed" ? "×" : state === "running" ? "◌" : "·"}
  </span>;
}
function Disclosure({ id, title, state, flow = false, initial = false, children, task = false, auto = false, status }:
  { id: string; title: string; state?: Item["state"]; flow?: boolean; initial?: boolean; children: ReactNode; task?: boolean; auto?: boolean; status?: string }) {
  const [open, setOpen] = useState(initial);
  const touched = useRef(false);
  const node = useRef<HTMLDetailsElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = node.current; if (!task || !el) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      setSize(old => old.width === width && old.height === height ? old : { width, height });
    });
    observer.observe(el); return () => observer.disconnect();
  }, [task]);
  useEffect(() => { if (auto && !touched.current) setOpen(initial); }, [auto, initial]);
  return <details ref={node} className={task ? "focus-task focus-metal" : "focus-section"}
    data-node={id} data-execution={state} data-flow={flow ? "on" : "off"} open={open}
    onToggle={e => setOpen(e.currentTarget.open)}>
    <summary onClick={e => {
      if ((e.target as Element).closest("button,a,input")) return;
      e.preventDefault(); touched.current = true; setOpen(v => !v);
    }}>{state && <Mark state={state} />}<span className="focus-summary-title" title={title.replace(/[*#`]/g, "")}><Md text={title} compact /></span>
      {state && <span className="focus-status"><Md text={status || stateText[state]} compact /></span>}
      <span className="focus-chevron" aria-hidden="true">›</span>
      {task && size.width > 0 && <svg className="focus-rim" aria-hidden="true" focusable="false"
      width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
      {[0, 1, 2].map(layer => <rect key={layer} className={`focus-rim-layer focus-rim-${layer}`}
        x="1" y="1" width={Math.max(0, size.width - 2)} height={Math.max(0, size.height - 2)}
        pathLength="100" />)}
      </svg>}
    </summary>
    <div className="focus-detail">{children}</div>
  </details>;
}
function Tool({ item, d, focus, nested = false }:
  { item: Item; d: Design; focus: string | null; nested?: boolean }) {
  const state = item.state;
  const text = [
    "### 执行内容", `工具：\`${item.name || "未知工具"}\``,
    item.input ? fence(item.input, "json") : state === "queued" ? "尚未派发，等待前一项完成。" : "当前记录没有完整工具参数。",
    "### 返回结果",
    item.output ? fence(item.output) : state === "running" ? "等待工具返回，暂不记录执行成功。" :
      state === "queued" ? "尚未开始，不显示返回结果。" :
      state === "interrupted" ? "执行已中断，没有已确认的返回结果。" : "工具没有返回正文。",
    state === "succeeded" ? "> 工具执行完成。业务结果是否达成，以真实回执和最终答复为准。" : ""
  ].filter(Boolean).join("\n\n");
  return <Disclosure id={`tool-${item.id}`} title={`**${item.title}**`}
    state={state} initial={d.interaction.stepOpen}>
    <Md text={text} />
    {item.children.length > 0 && <div className="focus-steps">{item.children.map(child =>
      <Tool key={child.id} item={child} d={d} focus={null} nested />
    )}</div>}
  </Disclosure>;
}
function StageSeat({ stage, turn, current, blocked, d }: {
  stage: Stage; turn: Turn; current: boolean; blocked: boolean; d: Design;
}) {
  const final = stage.id === `final-${turn.id}`, waiting = current && stage.state === "queued";
  return <Disclosure id={`stage-${stage.id}`} title={stage.title} task
    state={waiting ? "running" : stage.state}
    status={blocked && current ? "等待你处理" : waiting ? "等待下一步" : undefined}
    flow={current && !blocked && d.appearance.metal.rimFlowEnabled}
    initial={d.interaction.taskOpen}>
    {stage.text && <Md text={stage.text} />}
    {final && <Md text={turn.final ? "完整最终答复已产出。" : blocked ? "等待你处理下方请求。" :
      turn.state === "closed" ? "本轮已停止，尚未获得完整最终答复。" :
      turn.generating ? "正在整理最终答复与图表。" : "等待前面的阶段完成。"} />}
    {stage.items.length > 0 && <Disclosure id={`stage-tools-${stage.id}`} title={`工具记录 · ${stage.items.length}`}>
      <div className="focus-steps">{stage.items.map(item =>
        <Tool key={item.id} item={item} d={d} focus={null} nested />)}</div>
    </Disclosure>}
  </Disclosure>;
}
const FORK_TOAST = "从这句话之前另开对话";
const FORK_FLASH = "已另开对话";
const COPY_TOAST = "复制用户原文";
const COPY_FLASH = "已复制";
const PLACEHOLDER_HEIGHT = 360;
const plainPreview = (text: string) =>
  text.replace(/[#*`>\-\[\]()|_]/g, " ").replace(/\s+/g, " ").trim();

function TipButton({ label, doneLabel, failLabel, onClick, children }: {
  label: string; doneLabel: string; failLabel?: string;
  onClick: () => void | Promise<void>; children: ReactNode;
}) {
  const [tip, setTip] = useState(false);
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);
  return <button type="button" className="focus-tool" aria-label={label} disabled={busy}
    onClick={async () => {
      if (busy) return;
      setBusy(true);
      try {
        await onClick();
        setFlash(doneLabel);
      } catch {
        setFlash(failLabel || "操作失败");
      } finally {
        setBusy(false);
        setTimeout(() => setFlash(""), 1800);
      }
    }}
    onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}
    onFocus={() => setTip(true)} onBlur={() => setTip(false)}>
    {children}
    {(flash || tip) && <span className="focus-toast" role="tooltip">{flash || label}</span>}
  </button>;
}

function TurnSeat({ id, useTurn, d, pending, latest, forkBeforeSeq, onFork }:
  { id: number; useTurn: ViewProps["useTurn"]; d: Design; pending?: SessionPendingInteraction; latest: boolean;
    forkBeforeSeq: number | null; onFork?: (seq: number) => void | Promise<void>;
  }) {
  const turn = useTurn(String(id));
  if (!turn) return null;
  const blocked = latest && !!pending;
  const current = turn.stages.find(stage => stage.id === turn.currentStageId);
  const abnormal = turn.state === "closed" && !turn.final;
  const canFork = !!onFork && forkBeforeSeq !== null;
  return <article className="focus-turn" data-turn={id} data-mounted="1">
    {turn.users.map(user => <div key={user.id} className="focus-user-block">
      <div className="focus-user-row">
        <div className="focus-tools" aria-label="消息操作">
          {canFork && <TipButton label={FORK_TOAST} doneLabel={FORK_FLASH} failLabel="另开对话失败"
            onClick={() => onFork!(forkBeforeSeq!)}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d="M5 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 6v2.5A2.5 2.5 0 0 0 7.5 11H9v1a2 2 0 1 0 2 0V8.5A2.5 2.5 0 0 0 8.5 6H5Zm0 0V4"/>
            </svg>
          </TipButton>}
          <TipButton label={COPY_TOAST} doneLabel={COPY_FLASH} failLabel="复制失败"
            onClick={async () => {
              if (!await copyText(user.text)) throw new Error("copy failed");
            }}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d="M6 2h6a2 2 0 0 1 2 2v6h-1.5V4a.5.5 0 0 0-.5-.5H6V2Zm-3 3h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 1.5a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V7a.5.5 0 0 0-.5-.5H3Z"/>
            </svg>
          </TipButton>
        </div>
        <div className="focus-user focus-metal">
          <Md text={user.text} compact />
          {user.files.length > 0 && <Md text={user.files.map(name => `- 附件：${name}`).join("\n")} compact />}
        </div>
      </div>
      {turn.startedAt && <div className="focus-user-tips" aria-label="本轮开始时间">
        {formatTurnTime(turn.startedAt)}
        {turn.state === "open" && <span> · {formatElapsed(Date.now() - turn.startedAt)}</span>}
      </div>}
    </div>)}
    <Disclosure id={`process-${id}`} title={`# 1. ${d.content.labels.executionProcess}`} auto
      initial={turn.state === "open" ? d.interaction.runningProcessOpen : d.interaction.processOpen}>
      {current && <div className="focus-current"><span>{blocked ? "等待你处理" : "当前阶段"}</span>
        <strong title={current.title}>{current.title}</strong></div>}
      <div className="focus-tasks">{turn.stages.map(stage =>
        <StageSeat key={stage.id} stage={stage} turn={turn} d={d}
          current={stage.id === turn.currentStageId} blocked={blocked} />)}</div>
      {turn.reportedProcess && <Disclosure id={`reported-process-${id}`} title="**执行说明**">
        <Md text={turn.reportedProcess} />
      </Disclosure>}
    </Disclosure>
    <section className="focus-result focus-metal" data-node={`result-${id}`}>
      <Md text={`# 2. ${d.content.labels.finalReply}`} />
      {turn.final ? <>
        <Md text={turn.result || "本轮答复未提供结果正文。"} />
        <div className="focus-actions">
          <CopyButton text={() => turn.final} label="复制本轮 Markdown" />
          <button onClick={() => download(turn.final, `dsh-result-${id}.md`, "text/markdown")}>下载完整 Markdown</button>
        </div>
      </> : (blocked || abnormal || turn.partial) ? <div className="focus-waiting">
        {(blocked || abnormal) && <Md text={blocked ? "> 等待你处理请求，运行流光已停止。" :
          "> 本轮已结束，未取得完整最终答复。" } />}
        {turn.partial && <Disclosure id={`partial-${id}`} title="**已返回的正文片段（尚未完成）**">
          <Md text={turn.partial} streaming={turn.state === "open"} />
        </Disclosure>}
      </div> : null}
    </section>
    {(blocked || turn.confirmation || turn.errors.length > 0 || ["aborted", "interrupted", "blocked"].includes(turn.reason ?? "")) &&
      <section className="focus-pending focus-metal">
        <div className="focus-pending-heading"><span className="focus-warning" aria-hidden="true">!</span><Md text={`# 3. ${d.content.labels.confirmation}`} /></div>
        {blocked && <Md text="> 当前有确认或审批请求，请在下方 DSH 输入区处理。批准后仍等待工具真实返回。" />}
        {turn.confirmation && <Md text={turn.confirmation} />}
        {turn.errors.map((error, i) => <div key={i} className="focus-error">
          <Mark state="failed" /><span className="focus-diagnostic" aria-hidden="true">●</span><Md text={error} />
        </div>)}
        {turn.reason && <Md text={`本轮结束状态：\`${turn.reason}\``} />}
      </section>}
  </article>;
}

function TurnPlaceholder({ id, height }: { id: number; height: number }) {
  return <article className="focus-turn focus-turn-placeholder" data-turn={id} data-mounted="0"
    style={{ minHeight: height }} aria-hidden="true" />;
}
export function themeStyle(d: Design, light: boolean): CSSProperties {
  const a = d.appearance, colors = a.themes[light ? "light" : "dark"];
  const style: Record<string, string | number> = {};
  // Do not bind text / userText / secondary to host label tokens — they are often too light to read.
  const host: Record<string, string> = {
    bg: "--dsw-alias-bg-base", surface: "--dsw-alias-bg-layer-1", bubble: "--dsw-specific-bubble",
    border: "--dsw-alias-border-l1"
  };
  Object.entries(colors).forEach(([key, value]) => {
    const defaults = defaultDesign.appearance.themes[light ? "light" : "dark"];
    style[`--focus-${key}`] = host[key] && value === defaults[key as keyof typeof defaults] ?
      `var(${host[key]},${value})` : value;
  });
  // MarkdownText hard-codes var(--dsw-alias-label-*); rebind them here or body/bubble stay host-gray.
  const text = colors.text, userText = colors.userText, secondary = colors.secondary, subtle = colors.subtle;
  Object.assign(style, {
    "--focus-text": text,
    "--focus-userText": userText,
    "--focus-user-text": userText,
    "--focus-secondary": secondary,
    "--focus-subtle": subtle,
    "--dsw-alias-label-primary": text,
    "--dsw-alias-label-secondary": secondary,
    "--dsw-alias-label-tertiary": subtle,
    "--dsw-alias-link": text,
    "--focus-accent": a.accent, "--focus-done": a.statusColors.completed[light ? "light" : "dark"],
    "--focus-failed": a.statusColors.failed, "--focus-warning": a.statusColors.warning,
    "--focus-diagnostic": a.faultPair.diagnostic, "--focus-radius": `${a.metal.bubbleRadiusPx}px`,
    "--focus-step-radius": `${a.metal.stepRadiusPx}px`, "--focus-border-width": `${a.metal.borderWidthPx}px`,
    "--focus-flow-duration": `${a.metal.rimFlowDurationMs}ms`, "--focus-flow-opacity": a.metal.rimFlowOpacity,
    "--focus-width": `${a.layout.contentMaxWidthPx}px`, "--focus-padding": `${a.layout.replyPaddingXPx}px`,
    "--focus-gap": `${a.layout.sectionGapPx}px`, "--focus-body": `${a.typography.bodyPx}px`,
    "--focus-markdown": `${a.typography.markdownPx}px`, "--focus-code": `${a.typography.codePx}px`,
    "--focus-final": `${a.typography.finalReplyPx}px`, "--focus-line-height": a.typography.lineHeight,
    "--focus-font": a.fonts.body.join(","), "--focus-mono": a.fonts.mono.join(",")
  });
  return style as CSSProperties;
}
function scrollParent(el: HTMLElement): HTMLElement {
  let parent = el.parentElement;
  while (parent) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
    parent = parent.parentElement;
  }
  return document.scrollingElement as HTMLElement;
}
function nativeLight(): boolean {
  const style = getComputedStyle(document.documentElement);
  if (style.colorScheme === "light" || style.colorScheme === "dark") return style.colorScheme === "light";
  const theme = document.documentElement.dataset.theme;
  if (theme === "light" || document.documentElement.classList.contains("light")) return true;
  if (theme === "dark" || document.documentElement.classList.contains("dark")) return false;
  return !matchMedia("(prefers-color-scheme: dark)").matches;
}
function windowAround(order: readonly number[], center: number, radius = 1): Set<number> {
  const index = order.indexOf(center);
  const next = new Set<number>();
  if (index < 0) { next.add(center); return next; }
  for (let i = Math.max(0, index - radius); i <= Math.min(order.length - 1, index + radius); i++)
    next.add(order[i]!);
  return next;
}

function TurnRail({ items, content, onJump }: {
  items: readonly TurnNavigationItem[]; content: React.RefObject<HTMLDivElement | null>;
  onJump(turn: number): void;
}) {
  const rail = useRef<HTMLElement>(null), [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!content.current || !rail.current) return;
    const body = content.current, el = scrollParent(body), node = rail.current;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = el.getBoundingClientRect(), root = body.parentElement!.getBoundingClientRect();
      node.style.left = `${Math.max(box.left, root.left) + 4}px`;
      node.style.top = `${Math.max(0, box.top) + Math.min(box.height, innerHeight) / 2}px`;
      node.style.maxHeight = `${Math.max(80, Math.min(box.height, innerHeight) - 40)}px`;
      const turns = Array.from(body.querySelectorAll<HTMLElement>("[data-turn]"));
      let value = turns[0]?.dataset.turn;
      for (const turn of turns) {
        if (turn.getBoundingClientRect().top <= box.top + 80) value = turn.dataset.turn;
      }
      setActive(value === undefined ? null : Number(value));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    el.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule); observer.observe(body); observer.observe(el);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      el.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule);
    };
  }, [content, items]);
  return <nav className="focus-rail" aria-label="会话锚点" ref={rail}
    onPointerMove={event => {
      rail.current?.querySelectorAll<HTMLElement>(".focus-anchor").forEach(node => {
        const box = node.getBoundingClientRect();
        const proximity = Math.max(0, 1 - Math.abs(event.clientY - box.top - box.height / 2) / 80);
        node.style.setProperty("--proximity", String(proximity));
      });
    }} onPointerLeave={() => rail.current?.querySelectorAll<HTMLElement>(".focus-anchor")
      .forEach(node => node.style.setProperty("--proximity", "0"))}>
    {items.map((item, i) => <button className="focus-anchor" key={item.turn}
      aria-label={`第 ${i + 1} 轮：${plainPreview(item.prompt) || "对话"}`}
      aria-current={active === item.turn ? "location" : undefined}
      onClick={() => onJump(item.turn)}>
      <span className="focus-anchor-tick" />
      <span className="focus-anchor-preview" aria-hidden="true">
        <b>{plainPreview(item.prompt) || "本轮对话"}</b>
        <span>{plainPreview(item.response) || "答复生成中…"}</span>
      </span>
    </button>)}
  </nav>;
}
export function FocusView({ useSettings, usePending, useChat, useTurn, useSession, openFile, loadOlder, forkAt }: ViewProps) {
  const settings = useSettings(s => s), pending = usePending(p => p), d = designOf(settings);
  const chat = useChat(s => s), order = useChat(s => s.timeline.turnOrder), hasMore = useSession(s => s.hasMore),
    loadingOlder = useSession(s => s.loadingOlder), openError = useSession(s => s.openError);
  const sessionMarkdown = () => {
    const now = new Date();
    const turns = order.map(id => adaptTurn(chat, id))
      .filter(turn => turn.users.length || turn.stages.length > 1 || turn.final || turn.partial);
    return [`# 会话 Markdown 记录`, "",
      `导出于 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}，共 ${turns.length} 轮。`, "",
      turns.map(turnMarkdown).join("\n\n---\n\n")].join("\n");
  };
  const [light, setLight] = useState(nativeLight), [error, setError] = useState("");
  const content = useRef<HTMLDivElement>(null), follow = useRef(true);
  const heights = useRef(new Map<number, number>());
  const [mounted, setMounted] = useState<Set<number>>(() => new Set());
  const navigation = useChat(s => s.navigation.items());
  const endSeqOf = (id: number) => adaptTurn(chat, id).endSeq;

  useEffect(() => {
    if (!order.length) { setMounted(new Set()); return; }
    setMounted(prev => {
      if (prev.size) {
        const next = new Set([...prev].filter(id => order.includes(id)));
        const last = order[order.length - 1]!;
        if (!next.has(last)) next.add(last);
        return next.size ? next : windowAround(order, last, 1);
      }
      return windowAround(order, order[order.length - 1]!, 1);
    });
  }, [order]);

  useEffect(() => {
    const onMountAll = () => setMounted(new Set(order));
    window.addEventListener("dsh-stage-chat-preview-mount-all", onMountAll);
    return () => window.removeEventListener("dsh-stage-chat-preview-mount-all", onMountAll);
  }, [order]);

  useEffect(() => {
    const observer = new MutationObserver(() => setLight(nativeLight()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setLight(nativeLight());
    media.addEventListener("change", update);
    return () => { observer.disconnect(); media.removeEventListener("change", update); };
  }, []);
  useEffect(() => {
    const body = content.current; if (!body) return;
    const el = scrollParent(body);
    let raf = 0, pruneTimer = 0;

    const idsNearViewport = (padRatio = 1) => {
      const box = el.getBoundingClientRect();
      const pad = box.height * padRatio;
      const ids: number[] = [];
      body.querySelectorAll<HTMLElement>("[data-turn]").forEach(node => {
        const rect = node.getBoundingClientRect();
        const id = Number(node.dataset.turn);
        if (!Number.isFinite(id)) return;
        if (rect.bottom >= box.top - pad && rect.top <= box.bottom + pad) ids.push(id);
      });
      return ids;
    };

    const expandVisible = () => {
      const visible = idsNearViewport(1.25);
      if (!visible.length) return;
      setMounted(prev => {
        const next = new Set(prev);
        for (const id of visible) windowAround(order, id, 1).forEach(x => next.add(x));
        if (order.length) next.add(order[order.length - 1]!);
        return next;
      });
    };

    const pruneFar = () => {
      const keep = new Set<number>();
      for (const id of idsNearViewport(1.5)) windowAround(order, id, 1).forEach(x => keep.add(x));
      if (order.length) keep.add(order[order.length - 1]!);
      setMounted(prev => {
        let changed = prev.size !== keep.size;
        if (!changed) for (const id of prev) if (!keep.has(id)) { changed = true; break; }
        return changed ? keep : prev;
      });
    };

    const onScroll = () => {
      follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      // Throttle expand: at most once per frame while scrolling.
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; expandVisible(); });
      // Debounce prune: wait until scrolling settles.
      clearTimeout(pruneTimer);
      pruneTimer = window.setTimeout(pruneFar, 160);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    expandVisible();
    const observer = new ResizeObserver(() => { if (follow.current) el.scrollTop = el.scrollHeight; });
    observer.observe(body);
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(pruneTimer);
    };
  }, [order]);

  useLayoutEffect(() => {
    const body = content.current; if (!body) return;
    body.querySelectorAll<HTMLElement>('.focus-turn[data-mounted="1"]').forEach(node => {
      const id = Number(node.dataset.turn);
      if (Number.isFinite(id)) heights.current.set(id, node.offsetHeight);
    });
  });

  const jumpToTurn = (turn: number) => {
    follow.current = false;
    const body = content.current;
    if (!body) return;
    const el = scrollParent(body);
    setMounted(windowAround(order, turn, 1));
    // Wait for placeholder → mounted paint, then scroll.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = body.querySelector<HTMLElement>(`[data-turn="${turn}"]`);
      if (!target) return;
      el.scrollTo({
        top: el.scrollTop + target.getBoundingClientRect().top - el.getBoundingClientRect().top - 12,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"
      });
    }));
  };

  return <ChartTheme.Provider value={light}><MarkdownDelegateProvider renderCode={renderCode} openFile={async path => openFile(path)}
    openExternalLink={url => { window.open(url, "_blank", "noopener,noreferrer"); }}>
    <div data-dsh-stage-chat data-theme={light ? "light" : "dark"} style={themeStyle(d, light)}
      onPointerDownCapture={event => { if ((event.target as Element).closest("summary")) follow.current = false; }}
      onClickCapture={event => {
        const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
        if (!link) return;
        const href = link.getAttribute("href") ?? "";
        let path = parseFileAddress(href)?.path;
        if (href.startsWith("file:")) {
          try {
            const url = new URL(href);
            path = (url.hostname && url.hostname !== "localhost" ? `//${url.hostname}` : "") + decodeURIComponent(url.pathname);
          } catch { return; }
        }
        if (!path || /[\u0000-\u001f\u007f]/.test(path)) return;
        event.preventDefault(); event.stopPropagation(); openFile(path);
      }}>
      <TurnRail items={navigation} content={content} onJump={jumpToTurn} />
      <div className="focus-content" ref={content}>
        {order.length > 0 && <div className="focus-session-actions">
          <CopyButton text={sessionMarkdown} label="复制会话 Markdown" />
          <button onClick={() => {
            const now = new Date();
            download(sessionMarkdown(),
              `dsh-session-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.md`,
              "text/markdown");
          }}>下载会话 Markdown</button>
        </div>}
        {hasMore && <button disabled={loadingOlder} onClick={async () => {
          const el = content.current ? scrollParent(content.current) : null, old = el ? el.scrollHeight - el.scrollTop : 0;
          follow.current = false;
          try { setError(""); await loadOlder(); requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - old; }); }
          catch (e) { setError(String(e)); }
        }}>{loadingOlder ? "加载中…" : "加载更早对话"}</button>}
        {(error || openError) && <p role="alert">{error || String(openError)}</p>}
        {!order.length && <div className="focus-empty"><Md text={template(d, "emptyMessage", {
          title: d.content.labels.emptyTitle, description: d.content.labels.emptyDescription
        })} /></div>}
        {order.map((id, i) => {
          const prev = i > 0 ? order[i - 1]! : null;
          // First turn: cut at 0（丢掉本句及之后）. Later turns: cut after the previous turn.
          const forkBeforeSeq = prev === null ? 0 : endSeqOf(prev);
          if (!mounted.has(id))
            return <TurnPlaceholder key={id} id={id} height={heights.current.get(id) ?? PLACEHOLDER_HEIGHT} />;
          return <TurnSeat key={id} id={id} useTurn={useTurn} d={d} pending={pending}
            latest={i === order.length - 1} forkBeforeSeq={forkBeforeSeq} onFork={forkAt} />;
        })}
      </div>
    </div>
  </MarkdownDelegateProvider></ChartTheme.Provider>;
}
