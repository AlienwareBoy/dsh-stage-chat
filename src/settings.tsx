import { useEffect, useRef, useState } from "react";
import type { ConfigForm, ConfigFormSnapshot } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { PropsRuntime, InjectFace } from "@deepseek-ai/dsh-client-ui-slots";
import { defaultJson, defaultPrompt, designOf, parseDesign, parseAgents, outputPromptOf, type Settings } from "./config";

export interface SettingsInjected {
  hooks: { form: ConfigForm<Settings> };
  /** Distinct workspace directories of the loaded sessions. */
  roster: () => Promise<{ id: string; name?: string; description?: string }[]>;
}
export type SettingsProps = PropsRuntime<"settings.section"> & InjectFace<SettingsInjected>;
const colors = [
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
  const revision = useRef<number>();
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
      parseDesign(json); setBusy(true);
      const accepted = await form.mutate([
        { op: "set", path: ["json"], value: json },
        { op: "set", path: ["outputPrompt"], value: prompt },
        { op: "set", path: ["strictStages"], value: strict },
        { op: "set", path: ["agents"], value: JSON.stringify(agents) }
      ], revision.current);
      if (accepted) { setDirty(false); setNote("已保存并应用。提示词将在下一次模型请求时读取。"); }
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
      editJson(JSON.stringify(valid, null, 2));
    }
    return String(obj[keys.at(-1)!]);
  };
  const disabled = busy || snapshot.status !== "ready" || !snapshot.writable;
  const selectedName = rosterItems.find(item => item.id === selected)?.name || selected;
  return <section data-dsh-stage-chat-settings>
    <p className="focus-settings-lead">
      阶段式对话：执行过程 → 执行结果 → 需要确认。仅当前运行项流光，完成后移除高光。
      所有修改在下一次模型请求时生效，不改写其余系统提示词。
    </p>

    <div className="focus-settings-section">
      <h4>回复规则</h4>
      <p className="focus-settings-hint">所有 Agent 共享的默认输出格式。允许为空。</p>
      <textarea className="focus-settings-prose" aria-label="回复规则" value={prompt} rows={9}
        onChange={e => { setDirty(true); setPrompt(e.target.value); setNote(""); }} disabled={busy} />
    </div>

    <div className="focus-settings-section">
      <h4>行为开关</h4>
      <label className="focus-toggle"><input type="checkbox" checked={strict}
        onChange={e => { setDirty(true); setStrict(e.target.checked); setNote(""); }} disabled={busy} />
        严格阶段消息 — 工具调用前必须先发以阶段名称开头的公开消息</label>
    </div>

    <div className="focus-settings-section">
      <h4>Agent 个性化要求</h4>
      <p className="focus-settings-hint">按工作区目录区分。列表来自当前已加载会话的工作目录；未设置的目录沿用全局默认。</p>
      <select aria-label="选择工作区" value={selected}
        onChange={e => { setSelected(e.target.value); setNote(""); }} disabled={busy}>
        <option value="">选择工作区…</option>
        {rosterItems.map(item => <option key={item.id} value={item.id} title={item.id}>
          {item.name || item.id}{agents[item.id] ? "（已设置）" : ""}
        </option>)}
      </select>
      {selected && <>
        <textarea aria-label={`${selected} 的个性化要求`} rows={5} spellCheck={false} className="focus-settings-prose"
          placeholder="留空使用全局默认。图表等要求在此按需添加，例如：凡涉及走势对比的答复，必须附 mermaid 图表。"
          value={agents[selected] ?? ""}
          onChange={e => editAgents(selected, e.target.value)} disabled={busy} />
        <p className="focus-settings-hint">仅附加到 <code>{selectedName}</code> 的会话提示词。</p>
      </>}
    </div>

    <div className="focus-settings-section">
      <h4>配色</h4>
      <div className="focus-settings-colors">{colors.map(([label, path]) =>
        <label key={path} title={path}>{label}<input type="color" value={color(path)} disabled={disabled}
          onChange={e => { try { color(path, e.target.value); } catch (err) { setNote(String(err)); } }} /></label>
      )}</div>
    </div>

    <details className="focus-settings-advanced">
      <summary>高级 · 配置 JSON</summary>
      <p className="focus-settings-hint">完整设计配置。修改后仍需保存并应用。</p>
      <textarea className="focus-settings-code" aria-label="配置 JSON" value={json} rows={12} spellCheck={false}
        onChange={e => editJson(e.target.value)} disabled={busy} />
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
