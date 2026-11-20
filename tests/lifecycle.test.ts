import assert from "node:assert/strict";
import { adaptTurn, turnSource, fence, splitAnswer } from "../src/adapter";
import { defaultJson, parseDesign, serialFocus } from "../src/config";
import type { ChatSnapshot } from "@deepseek-ai/dsh-client-ui-chat/client";

let checks = 0;
const check = (name: string, run: () => void) => { run(); checks++; console.log(`PASS ${name}`); };
const call = (id: string, phase = "preparing", error = false) => ({
  callId: id, name: `tool-${id}`, turn: 1, step: 1, time: 1, subCalls: [],
  args: { text: () => undefined },
  ...(phase === "result" ? { kind: "tool-result", isError: error, call: { argsRaw: "{}" },
    content: [{ type: "text", text: error ? "实际失败" : "真实返回" }] } : { phase, argsRaw: "{}" })
});
const toolNode = (id: string, phase: string, error = false) =>
  ({ key: id, kind: "tool-call", data: { root: call(id, phase, error) } });
const assistant = (text: string, status = "settled", tools = false) =>
  ({ key: "assistant", kind: "assistant-step", data: { status,
    blocks: [{ kind: "text", text }, ...(tools ? [{ kind: "tool-call", callId: "a" }] : [])] } });
function chat(nodes: unknown[], status = "open", reason = "completed"): ChatSnapshot {
  const map = new Map((nodes as {key: string}[]).map(n => [n.key, n]));
  return { locations: { getTurn: () => [...map.keys()] }, nodes: { get: (k: string) => map.get(k) },
    timeline: { turnOrder: [1], turns: new Map([[1, { status,
      end: status === "closed" ? { data: { reason: { kind: reason } } } : undefined }]]) }
  } as unknown as ChatSnapshot;
}
check("未来准备项不运行、不提前显示返回", () => {
  const model = adaptTurn(chat([toolNode("a", "start"), toolNode("b", "preparing"), toolNode("c", "preparing")]), 1);
  assert.deepEqual(model.items.map(i => i.state), ["running", "queued", "queued"]);
  assert.equal(model.focusId, "a"); assert.equal(model.items[1].output, "");
});
check("前项真实完成后才交接流光", () => {
  const model = adaptTurn(chat([toolNode("a", "result"), toolNode("b", "start"), toolNode("c", "preparing")]), 1);
  assert.deepEqual(model.items.map(i => i.state), ["succeeded", "running", "queued"]);
  assert.equal(model.focusId, "b");
});
check("失败状态来自宿主错误，不从命令猜测", () => {
  const model = adaptTurn(chat([toolNode("a", "result", true)]), 1);
  assert.equal(model.items[0].state, "failed"); assert.equal(model.focusId, null);
  assert.equal(model.items[0].output, "实际失败");
});
check("中断与缺失结果不标记成功", () => {
  const model = adaptTurn(chat([toolNode("a", "start")], "closed", "interrupted"), 1);
  assert.equal(model.items[0].state, "interrupted"); assert.equal(model.focusId, null); assert.equal(model.final, "");
});
check("工具成功不能替代最终答复", () => {
  assert.equal(adaptTurn(chat([toolNode("a", "result")], "closed"), 1).final, "");
});
check("正文流式片段保留，轮次未结束不宣布最终结果", () => {
  const model = adaptTurn(chat([assistant("# 完整结果\n\n[报告](file:///tmp/report.md)", "running")]), 1);
  assert.equal(model.final, ""); assert.ok(model.partial.includes("[报告]")); assert.equal(model.generating, true);
});
check("结束后保留完整 Markdown 与真实文件链接", () => {
  const text = "# 结果\n\n正文\n\n[报告](file:///tmp/report.md)";
  const model = adaptTurn(chat([assistant(text)], "closed"), 1);
  assert.equal(model.final, text); assert.equal(model.generating, false);
});
check("带工具的公开阶段说明不能冒充最终答复", () => {
  assert.equal(adaptTurn(chat([assistant("准备执行", "settled", true)], "closed"), 1).final, "");
});
check("更早的计划文字不能替代缺失的收尾答复", () => {
  assert.equal(adaptTurn(chat([assistant("接下来开始检查"), toolNode("a", "result")], "closed"), 1).final, "");
});
check("中断文本保留为片段而不是最终成功", () => {
  const model = adaptTurn(chat([assistant("未写完", "interrupted")], "closed", "aborted"), 1);
  assert.equal(model.final, ""); assert.equal(model.partial, "未写完");
});
check("真实并发状态保留，但同轮最多一个焦点流光", () => {
  const items = adaptTurn(chat([toolNode("a", "start"), toolNode("b", "start")]), 1).items;
  assert.deepEqual(items.map(i => i.state), ["running", "running"]);
  assert.equal(serialFocus(items), "a"); assert.equal(serialFocus(items, true), null);
});
check("初始化没有虚构会话，支持用户配色", () => {
  const d = parseDesign(defaultJson); d.appearance.statusColors.completed.dark = "#AA33CC";
  assert.equal(parseDesign(JSON.stringify(d)).appearance.statusColors.completed.dark, "#AA33CC");
  assert.deepEqual(d.initialState.messages, []); assert.equal(d.initialState.finalReply, null);
});
check("拒绝破坏顺序、全部流光和无效配置", () => {
  const d = JSON.parse(defaultJson); d.appearance.metal.rimFlowConcurrency = 3;
  assert.throws(() => parseDesign(JSON.stringify(d)));
  d.appearance.metal.rimFlowConcurrency = 1; d.appearance.statusColors.failed = "url(bad)";
  assert.throws(() => parseDesign(JSON.stringify(d)));
});
check("工具正文包含代码围栏仍可完整渲染", () => {
  assert.ok(fence("```json\n{}\n```").startsWith("````text"));
});
check("最终报告按明确章节分区，代码和文件链接原样保留", () => {
  const result = "### 关键结论\n\n完成。\n\n[报告](file:///tmp/report.md)\n\n```md\n## 执行过程\n代码里的标题不能被拆分\n```";
  const parsed = splitAnswer(`## 1. 执行过程\n\n1. 已检查。\n\n## 2. 执行结果\n\n${result}\n\n## 3. 需要确认\n\n无待办事项。需要的话，我可以进一步查询。`);
  assert.equal(parsed.reportedProcess, "1. 已检查。"); assert.equal(parsed.result, result);
  assert.equal(parsed.confirmation, "");
});
check("普通答复不被截断，真实确认独立保留，支持 Setext 标题", () => {
  const plain = "## 操作方法\n\n正文\n\n```md\n## 执行结果\n```\n\n[文件](file:///tmp/a.md)";
  assert.equal(splitAnswer(plain).result, plain);
  const parsed = splitAnswer("执行结果\n---\n\n已生成。\n\n需要确认\n---\n\n是否继续发布？");
  assert.equal(parsed.result, "已生成。"); assert.equal(parsed.confirmation, "是否继续发布？");
});
check("旧默认九秒流光升级为完整周长两点四秒，保留自定义设置", () => {
  const d = JSON.parse(defaultJson);
  d.appearance.metal.rimFlowDurationMs = 9000;
  d.appearance.metal.rimImplementation = "运行 item 使用 CSS ::before 金属环 + ::after 遮罩流光";
  assert.equal(parseDesign(JSON.stringify(d)).appearance.metal.rimFlowDurationMs, 2400);
  d.appearance.metal.rimFlowDurationMs = 3200;
  assert.equal(parseDesign(JSON.stringify(d)).appearance.metal.rimFlowDurationMs, 3200);
});
check("订阅接收节点原地变化和轮次结束，卸载清理", () => {
  let current = chat([toolNode("a", "start")]), changed: (() => void) | undefined, nodeChanged: (() => void) | undefined;
  let disposed = 0, published = 0;
  (current.nodes as any).source = () => ({ subscribe: (fn: () => void) => {
    nodeChanged = fn; return () => { disposed++; };
  } });
  const source = turnSource({ getSnapshot: () => current, subscribe: fn => {
    changed = fn; return () => { disposed++; };
  } }, 1);
  const stop = source.subscribe(() => published++);
  const next = toolNode("a", "result");
  (current.nodes as any).get = () => next; nodeChanged?.();
  assert.equal(source.getSnapshot().items[0].state, "succeeded");
  const keys = current.locations.getTurn(1);
  current = chat([next], "closed"); (current.locations as any).getTurn = () => keys;
  (current.nodes as any).source = () => ({ subscribe: () => () => { disposed++; } });
  changed?.(); assert.equal(source.getSnapshot().state, "closed");
  stop(); assert.ok(disposed >= 2); assert.ok(published >= 2);
});
console.log(`${checks} lifecycle/configuration checks passed`);
