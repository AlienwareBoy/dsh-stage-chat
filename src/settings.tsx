import { useEffect, useMemo, useRef, useState } from "react";
import type { ConfigForm, ConfigFormSnapshot } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { PropsRuntime, InjectFace } from "@deepseek-ai/dsh-client-ui-slots";
import {
  defaultJson, defaultPrompt, designEditClipboard, designJson, designOf,
  parseDesign, parseAgents, outputPromptOf, type Settings
} from "./config";
import { ColorLegend } from "./color-legend";

export interface SettingsInjected {
  hooks: { form: ConfigForm<Settings> };
  /** Distinct workspace directories of the loaded sessions. */
  roster: () => Promise<{ id: string; name?: string; description?: string }[]>;
}
export type SettingsProps = PropsRuntime<"settings.section"> & InjectFace<SettingsInjected>;
const colors = [
  ["正文主色 · 浅色", "themes.light.text"],
  ["用户气泡字 · 浅色", "themes.light.userText"],
  ["次要文字 · 浅色", "themes.light.secondary"],
  ["交互强调色", "accent"],
  ["完成勾 · 深色", "statusColors.completed.dark"],
  ["完成勾 · 浅色", "statusColors.completed.light"],
  ["失败标记", "statusColors.failed"],
  ["警告与待确认", "statusColors.warning"],
  ["诊断标记", "faultPair.diagnostic"]
] as const;
export function download(text: string, name: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Clipboard with a hidden-textarea fallback for non-focusable webviews. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const area = document.createElement("textarea");
      area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
      document.body.append(area); area.select();
      const done = document.execCommand("copy"); area.remove(); return done;
    } catch { return false; }
  }
}

export function SettingsSection({ useForm, form, roster }: SettingsProps & { form: ConfigForm<Settings> }) {
  const snapshot = useForm(s => s) as ConfigFormSnapshot<Settings>;
  const [json, setJson] = useState(defaultJson), [prompt, setPrompt] = useState(defaultPrompt);
  const [strict, setStrict] = useState(true);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [rosterItems, setRosterItems] = useState<{ id: string; name?: string; description?: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const [jsonQuery, setJsonQuery] = useState("");
  const [jsonHit, setJsonHit] = useState(0);
  const jsonRef = useRef<HTMLTextAreaElement>(null);
  const revision = useRef<number>();
  const jsonHits = useMemo(() => {
    const q = jsonQuery.trim().toLowerCase();
    if (!q) return [] as number[];
    const hay = json.toLowerCase(), hits: number[] = [];
    for (let i = 0; (i = hay.indexOf(q, i)) >= 0; i += Math.max(1, q.length)) hits.push(i);
    return hits;
  }, [json, jsonQuery]);
  useEffect(() => { setJsonHit(0); }, [jsonQuery, json]);
  const jumpJsonHit = (dir: 1 | -1) => {
    if (!jsonHits.length || !jsonRef.current) return;
    const area = jsonRef.current;
    const q = jsonQuery.trim();
    const cur = jsonHits[jsonHit] ?? 0;
    const already = area.selectionStart === cur && area.selectionEnd === cur + q.length;
    const next = already ? (jsonHit + dir + jsonHits.length * 10) % jsonHits.length : jsonHit;
    setJsonHit(next);
    const start = jsonHits[next]!, end = start + q.length;
    area.focus();
    area.setSelectionRange(start, end);
    // Approximate scroll from character offset — textarea line-height varies by host zoom.
    const frac = json.length ? start / json.length : 0;
    area.scrollTop = Math.max(0, frac * area.scrollHeight - area.clientHeight * 0.35);
  };
  useEffect(() => {
    void roster().then(items => setRosterItems(items)).catch(() => setRosterItems([]));
  }, [roster]);
  useEffect(() => {
    if (dirty) return;
    setJson(snapshot.value?.json ?? defaultJson);
    setPrompt(outputPromptOf(snapshot.value?.outputPrompt));
    setStrict(snapshot.value?.strictStages ?? true);
    setAgents(parseAgents(snapshot.value?.agents));
    revision.current = snapshot.revision;
  }, [snapshot.value, snapshot.revision, dirty]);
  const editAgents = (id: string, text: string) => {
    setDirty(true); setAgents(old => {
      const next = { ...old };
      if (text.trim()) next[id] = text; else delete next[id];
      return next;
    }); setNote("");
  };
  const editJson = (value: string) => { setDirty(true); setJson(value); setNote(""); };
  const save = async () => {
    setNote("");
    try {
      const normalized = designJson(parseDesign(json));
      setBusy(true);
      const accepted = await form.mutate([
        { op: "set", path: ["json"], value: normalized },
        { op: "set", path: ["outputPrompt"], value: prompt },
        { op: "set", path: ["strictStages"], value: strict },
        { op: "set", path: ["agents"], value: JSON.stringify(agents) }
      ], revision.current);
      if (accepted) {
        setJson(normalized); setDirty(false);
        setNote("已保存并应用。显示规则将在下一次模型请求时读取。");
      }
      else setNote("宿主未接受保存。请检查配置是否可写；若另一窗口已修改，请重新载入后再保存。");
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const color = (path: string, next?: string): string => {
    const d = designOf({ json });
    let obj: Record<string, unknown> = d.appearance as unknown as Record<string, unknown>;
    const keys = path.split(".");
    for (const k of keys.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
    if (next) {
      // Color editing only accepts an already valid draft; malformed JSON is never overwritten.
      const valid = parseDesign(json);
      let target = valid.appearance as unknown as Record<string, unknown>;
      for (const k of keys.slice(0, -1)) target = target[k] as Record<string, unknown>;
      target[keys.at(-1)!] = next;
      editJson(designJson(valid));
    }
    return String(obj[keys.at(-1)!]);
  };
  const disabled = busy || snapshot.status !== "ready" || !snapshot.writable;
  const selectedName = rosterItems.find(item => item.id === selected)?.name || selected;
  return <section data-dsh-stage-chat-settings>
    <p className="focus-settings-lead">
      阶段式对话：执行过程 → 执行结果 → 需要确认。仅当前运行项流光，完成后移除高光。
      修改在下一次模型请求时生效。领域呈现约定请写在工作区或 Agent 的 rules 里，此处宜写路径或短说明。
    </p>

    <div className="focus-settings-section">
      <h4>回复规则</h4>
      <p className="focus-settings-hint">所有工作区共享的对话显示呈现格式。允许为空。</p>
      <textarea className="focus-settings-prose" aria-label="回复规则" value={prompt} rows={9}
        onChange={e => { setDirty(true); setPrompt(e.target.value); setNote(""); }} disabled={busy} />
    </div>

    <div className="focus-settings-section">
      <h4>行为开关</h4>
      <label className="focus-toggle"><input type="checkbox" checked={strict}
        onChange={e => { setDirty(true); setStrict(e.target.checked); setNote(""); }} disabled={busy} />
        严格阶段消息 — 工具调用前先发以阶段名称开头的公开进度，便于收入「执行过程」</label>
    </div>

    <div className="focus-settings-section">
      <h4>各工作区</h4>
      <p className="focus-settings-hint">
        按工作区目录附加说明，列表来自当前已加载会话的工作目录；未设置的目录沿用上方全局默认。
        推荐在工作区维护 rules，有 Agent 时写进 Agent 的 rules，再在此填写规则文件路径并要求遵循。
        若只有普通文件、没有 Agent，可让 AI 生成呈现约定后，把文案贴到此处或写入工作区 rules。
      </p>
      <select aria-label="选择工作区" value={selected}
        onChange={e => { setSelected(e.target.value); setNote(""); }} disabled={busy}>
        <option value="">选择工作区…</option>
        {rosterItems.map(item => <option key={item.id} value={item.id} title={item.id}>
          {item.name || item.id}{agents[item.id] ? "（已设置）" : ""}
        </option>)}
      </select>
      {selected && <>
        <textarea aria-label={`${selected} 的工作区说明`} rows={5} spellCheck={false} className="focus-settings-prose"
          placeholder={"留空沿用全局默认。推荐填写规则路径，例如：\n呈现约定见 docs/conversation-display.md\n或：遵循 AGENTS.md / .cursor/rules 中与对话呈现相关的条目。"}
          value={agents[selected] ?? ""}
          onChange={e => editAgents(selected, e.target.value)} disabled={busy} />
        <p className="focus-settings-hint">仅附加到工作区 <code>{selectedName}</code> 的对话显示段。</p>
      </>}
    </div>

    <div className="focus-settings-section">
      <h4>配色</h4>
      <p className="focus-settings-hint">先看实例对照再改色板；改完保存并应用后，对话区才会生效。</p>
      <ColorLegend
        accent={color("accent")}
        doneLight={color("statusColors.completed.light")}
        doneDark={color("statusColors.completed.dark")}
        failed={color("statusColors.failed")}
        warning={color("statusColors.warning")}
        diagnostic={color("faultPair.diagnostic")}
      />
      <div className="focus-settings-colors">{colors.map(([label, path]) =>
        <label key={path} title={path}>{label}<input type="color" value={color(path)} disabled={disabled}
          onChange={e => { try { color(path, e.target.value); } catch (err) { setNote(String(err)); } }} /></label>
      )}</div>
    </div>

    <details className="focus-settings-advanced" open>
      <summary>高级 · 配置 JSON</summary>
      <p className="focus-settings-hint">
        主配置（主题字色、强调色、排版、交互、文案）排在前面；金属流光等细节在后。
        宿主 Cmd+F 往往搜不到 textarea，请用下方搜索（font / typography / bubble 等）。
      </p>
      <div className="focus-json-toolbar">
        <button type="button" disabled={busy} onClick={async () => {
          try {
            const pretty = designJson(parseDesign(json));
            const ok = await copyText(designEditClipboard(pretty));
            setNote(ok
              ? "已复制：修改提示词 + 完整 JSON。可贴给 AI 改完后再粘贴回来。"
              : "复制失败，请手动全选 JSON。");
          } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
        }}>复制提示词 + JSON</button>
        <button type="button" disabled={busy} onClick={() => {
          try {
            editJson(designJson(parseDesign(json)));
            setNote("已按主配置优先重排 JSON 键序（未保存）。");
          } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
        }}>重排主配置到前</button>
      </div>
      <div className="focus-json-search">
        <input aria-label="在配置 JSON 中搜索" placeholder="搜索 JSON，例如 font / window / bubble"
          value={jsonQuery} disabled={busy}
          onChange={e => setJsonQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); jumpJsonHit(e.shiftKey ? -1 : 1); }
          }} />
        <button type="button" disabled={busy || !jsonHits.length} onClick={() => jumpJsonHit(-1)}>上一个</button>
        <button type="button" disabled={busy || !jsonHits.length} onClick={() => jumpJsonHit(1)}>下一个</button>
        <span className="focus-settings-hint">
          {jsonQuery.trim() ? `${jsonHits.length ? jsonHit + 1 : 0} / ${jsonHits.length}` : "输入关键词后回车跳转"}
        </span>
      </div>
      <textarea ref={jsonRef} className="focus-settings-code" aria-label="配置 JSON" value={json}
        rows={22} spellCheck={false} onChange={e => editJson(e.target.value)} disabled={busy} />
    </details>

    <div className="focus-settings-actions">
      <button className="focus-settings-primary" disabled={disabled} onClick={save}>
        {busy ? "保存中…" : "保存并应用"}</button>
      <button disabled={busy} onClick={() => { setDirty(true); setJson(defaultJson); setPrompt(defaultPrompt);
        setStrict(true); setAgents({}); setNote("已恢复默认草稿，请保存并应用。"); }}>恢复默认</button>
      <button disabled={busy} onClick={() => {
        setDirty(false); setNote(""); setJson(snapshot.value?.json ?? defaultJson);
        setPrompt(outputPromptOf(snapshot.value?.outputPrompt));
        setStrict(snapshot.value?.strictStages ?? true); setAgents(parseAgents(snapshot.value?.agents));
        revision.current = snapshot.revision;
      }}>重新载入</button>
      <button onClick={() => {
        try { download(JSON.stringify({ format: "dsh-stage-chat-plugin-settings", version: 3,
          configuration: parseDesign(json), outputPrompt: prompt,
          strictStages: strict, agents }, null, 2), "dsh-stage-chat-plugin-settings.json"); }
        catch (e) { setNote(String(e)); }
      }}>导出设置 JSON</button>
    </div>

    {snapshot.status !== "ready" && <p className="focus-settings-note" role="status">正在等待宿主配置；请确认插件已安装到当前 profile。</p>}
    {snapshot.status === "ready" && !snapshot.writable && <p className="focus-settings-note">当前配置不可写。通过临时 patch 加载的配置可能只读。</p>}
    {note && <p className="focus-settings-note" role="status">{note}</p>}
  </section>;
}
