import defaults from "../dsh-stage-chat-config.json";
import defaultPrompt from "../dsh-stage-chat-output-prompt.md";
import legacy from "./legacy-design.json";
import legacyPrompt from "./legacy-output-prompt.md";

export { defaultPrompt, defaults as defaultDesign };
export const NAMESPACE = "focus";
export type Design = typeof defaults;
export interface Settings { json?: string; outputPrompt?: string; strictStages?: boolean; agents?: string; }
export const defaultJson = JSON.stringify(defaults, null, 2);
export function outputPromptOf(value?: string): string {
  return value === undefined || value.trim() === legacyPrompt.trim() ? defaultPrompt : value;
}
/** Hard clause appended while the strict-stage toggle stays on. */
export const STRICT_STAGES_CLAUSE =
  "- 阶段消息：每次调用工具前，必须先发一条以清楚阶段名称开头、说明当前动作与已确认发现的公开消息；只发工具调用而不先发阶段消息视为流程违规。";
/** Compose the injected section: global strict clause plus this agent's own requirements. */
export function composedOutputPrompt(prompt: string, strictStages?: boolean, agentRequirements?: string): string {
  const clauses = [strictStages !== false ? STRICT_STAGES_CLAUSE : "",
    agentRequirements?.trim() ?? ""].filter(Boolean);
  return clauses.length ? `${prompt}\n\n## 4. 行为硬性要求（设置附加，按 agent 生效）\n\n${clauses.join("\n")}` : prompt;
}
/** Per-agent requirement texts stored as JSON: preset id → free-form hard clauses. */
export function parseAgents(value?: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const agents: Record<string, string> = {};
    for (const [id, text] of Object.entries(parsed)) if (typeof text === "string") agents[id] = text;
    return agents;
  } catch { return {}; }
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function parseDesign(text: string): Design {
  const value: unknown = JSON.parse(text);
  if (!object(value)) throw new Error("配置必须是 JSON 对象。");
  const d = value as unknown as Design;
  if (d.format !== defaults.format || d.version !== 2)
    throw new Error("配置格式应为 dsh-stage-chat-design-initializer，版本为 2。");
  if (JSON.stringify(d.appearance?.layout?.order) !== JSON.stringify(defaults.appearance.layout.order))
    throw new Error("展示顺序必须为执行过程、执行结果、需要确认。");
  if (d.content?.markdown?.singleRenderer !== true ||
      d.appearance?.metal?.rimFlowScope !== "runningTaskItemsOnly" ||
      d.appearance.metal.outerSectionsAnimated !== false ||
      d.appearance.metal.rimFlowConcurrency !== 1 ||
      JSON.stringify(d.appearance.metal.rimFlowStatuses) !== '["running"]')
    throw new Error("请保留统一 Markdown 和仅当前运行任务流光的规则。");
  const a = d.appearance;
  const hex = (s: unknown) => typeof s === "string" && /^#[\da-f]{6}$/i.test(s);
  if (![a.accent, a.statusColors?.completed?.light, a.statusColors?.completed?.dark,
        a.statusColors?.failed, a.statusColors?.warning, a.faultPair?.diagnostic].every(hex))
    throw new Error("状态色与强调色必须是 #RRGGBB。");
  const cssColor = (s: unknown) => typeof s === "string" &&
    (/^#[\da-f]{3,8}$/i.test(s) || /^rgba?\([\d\s.,%]+\)$/i.test(s));
  for (const theme of ["light", "dark"] as const)
    for (const key of Object.keys(defaults.appearance.themes[theme]))
      if (!cssColor(a.themes?.[theme]?.[key as keyof typeof a.themes.light]))
        throw new Error(`主题 ${theme} 缺少有效的 ${key} 颜色。`);
  const nums = [a.metal?.bubbleRadiusPx, a.metal?.stepRadiusPx, a.metal?.borderWidthPx,
    a.metal?.rimFlowDurationMs, a.metal?.rimFlowOpacity, a.layout?.contentMaxWidthPx,
    a.layout?.replyPaddingXPx, a.layout?.sectionGapPx, a.typography?.bodyPx,
    a.typography?.finalReplyPx, a.typography?.markdownPx, a.typography?.codePx, a.typography?.lineHeight];
  if (nums.some(n => typeof n !== "number" || !Number.isFinite(n) || n <= 0) ||
      a.metal.rimFlowOpacity > 1 || a.metal.rimFlowDurationMs < 500 ||
      a.metal.borderWidthPx > 8 || a.layout.contentMaxWidthPx < 200)
    throw new Error("尺寸与动画参数需要有效的正数，透明度不超过 1。");
  for (const family of ["body", "display", "mono"] as const)
    if (!Array.isArray(a.fonts?.[family]) || !a.fonts[family].length ||
        a.fonts[family].some(v => typeof v !== "string" || /[;{}<>]/.test(v)))
      throw new Error("字体配置必须是字体名称数组。");
  if (!object(d.content.labels) || Object.keys(defaults.content.labels).some(k =>
      typeof d.content.labels[k as keyof typeof d.content.labels] !== "string") ||
      !object(d.content.templates) || Object.keys(defaults.content.templates).some(k =>
      typeof d.content.templates[k as keyof typeof d.content.templates] !== "string"))
    throw new Error("请保留有效的文案和 Markdown 模板。");
  if (!object(d.interaction) ||
      ["processOpen", "taskOpen", "stepOpen", "finalReplyOpen", "showEvidence"].some(k =>
        typeof d.interaction[k as keyof typeof d.interaction] !== "boolean"))
    throw new Error("交互初值必须是布尔值。");
  if (JSON.stringify(d.initialState) !== JSON.stringify(defaults.initialState))
    throw new Error("插件初始化必须保持空会话。");
  // Migrate the previous bundled animation default; custom timings remain editable.
  if (d.appearance.metal.rimFlowDurationMs === 9000 &&
      d.appearance.metal.rimImplementation.startsWith("运行 item 使用 CSS ::before")) {
    d.appearance.metal.rimFlowDurationMs = defaults.appearance.metal.rimFlowDurationMs;
    d.appearance.metal.rimImplementation = defaults.appearance.metal.rimImplementation;
  }
  for (const theme of ["light", "dark"] as const) {
    for (const key of Object.keys(legacy.themes[theme]) as (keyof typeof legacy.themes.light)[]) {
      if (d.appearance.themes[theme][key] === legacy.themes[theme][key])
        d.appearance.themes[theme][key] = defaults.appearance.themes[theme][key];
    }
  }
  for (const key of Object.keys(legacy.layout) as (keyof typeof legacy.layout)[]) {
    if (d.appearance.layout[key] === legacy.layout[key]) d.appearance.layout[key] = defaults.appearance.layout[key];
  }
  return d;
}

export function designOf(settings?: Settings): Design {
  try { return parseDesign(settings?.json ?? defaultJson); }
  catch { return defaults; }
}

export function template(d: Design, key: keyof Design["content"]["templates"],
                         values: Record<string, string | number>): string {
  return d.content.templates[key].replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? ""));
}

export function serialFocus<T extends { id: string; state: string }>(items: readonly T[], blocked = false): string | null {
  return blocked ? null : items.find(item => item.state === "running")?.id ?? null;
}
