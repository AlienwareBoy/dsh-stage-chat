import { useEffect, useRef, useState } from "react";
import type { ConfigForm, ConfigFormSnapshot } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { PropsRuntime, InjectFace } from "@deepseek-ai/dsh-client-ui-slots";
import { defaultJson, defaultPrompt, designOf, parseDesign, outputPromptOf, type Settings } from "./config";

export interface SettingsInjected { hooks: { form: ConfigForm<Settings> }; }
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

export function SettingsSection({ useForm, form }: SettingsProps & { form: ConfigForm<Settings> }) {
  const snapshot = useForm(s => s) as ConfigFormSnapshot<Settings>;
  const [json, setJson] = useState(defaultJson), [prompt, setPrompt] = useState(defaultPrompt);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const revision = useRef<number>();
  useEffect(() => {
    if (dirty) return;
    setJson(snapshot.value?.json ?? defaultJson);
    setPrompt(outputPromptOf(snapshot.value?.outputPrompt));
    revision.current = snapshot.revision;
  }, [snapshot.value, snapshot.revision, dirty]);
  const editJson = (value: string) => { setDirty(true); setJson(value); setNote(""); };
  const save = async () => {
    setNote("");
    try {
      parseDesign(json); setBusy(true);
      const accepted = await form.mutate([
        { op: "set", path: ["json"], value: json },
        { op: "set", path: ["outputPrompt"], value: prompt }
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
  return <section data-dsh-focus-settings>
    <p>执行过程 → 执行结果 → 需要确认。仅当前运行项流光，完成后移除高光。</p>
    <div className="focus-settings-colors">{colors.map(([label, path]) =>
      <label key={path}>{label}<input type="color" value={color(path)} disabled={disabled}
        onChange={e => { try { color(path, e.target.value); } catch (err) { setNote(String(err)); } }} /></label>
    )}</div>
    <label>配置 JSON<textarea aria-label="配置 JSON" value={json} rows={12} spellCheck={false}
      onChange={e => editJson(e.target.value)} disabled={busy} /></label>
    <label>回复规则<textarea aria-label="回复规则" value={prompt} rows={9}
      onChange={e => { setDirty(true); setPrompt(e.target.value); setNote(""); }} disabled={busy} /></label>
    <p>配色和文案可改。任务状态由真实宿主事件决定；开发提示词不注入运行会话。</p>
    <div className="focus-actions">
      <button disabled={disabled} onClick={save}>{busy ? "保存中…" : "保存并应用"}</button>
      <button disabled={busy} onClick={() => { setDirty(true); setJson(defaultJson); setPrompt(defaultPrompt); setNote("已恢复默认草稿，请保存并应用。"); }}>恢复默认</button>
      <button disabled={busy} onClick={() => {
        setDirty(false); setNote(""); setJson(snapshot.value?.json ?? defaultJson);
        setPrompt(outputPromptOf(snapshot.value?.outputPrompt)); revision.current = snapshot.revision;
      }}>重新载入</button>
      <button onClick={() => {
        try { download(JSON.stringify({ format: "dsh-focus-plugin-settings", version: 1,
          configuration: parseDesign(json), outputPrompt: prompt }, null, 2), "dsh-focus-plugin-settings.json"); }
        catch (e) { setNote(String(e)); }
      }}>导出设置 JSON</button>
    </div>
    {snapshot.status !== "ready" && <p role="status">正在等待宿主配置；请确认插件已安装到当前 profile。</p>}
    {snapshot.status === "ready" && !snapshot.writable && <p>当前配置不可写。通过临时 patch 加载的配置可能只读。</p>}
    {note && <p role="status">{note}</p>}
  </section>;
}
