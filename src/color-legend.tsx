import type { ReactNode } from "react";

/** Visual map from settings color keys to on-screen marks. */
export function ColorLegend({ accent, doneLight, doneDark, failed, warning, diagnostic }: {
  accent: string; doneLight: string; doneDark: string;
  failed: string; warning: string; diagnostic: string;
}) {
  const rows: { label: string; path: string; where: string; sample: ReactNode }[] = [
    {
      label: "交互强调色", path: "accent", where: "焦点描边、主按钮、强调动作",
      sample: <button type="button" className="focus-legend-accent" style={{ background: accent }}>保存并应用</button>
    },
    {
      label: "完成勾 · 浅色", path: "statusColors.completed.light", where: "浅色主题下任务完成勾",
      sample: <span className="focus-legend-mark" style={{ color: doneLight }}>✓</span>
    },
    {
      label: "完成勾 · 深色", path: "statusColors.completed.dark", where: "深色主题下任务完成勾",
      sample: <span className="focus-legend-mark" style={{ color: doneDark }}>✓</span>
    },
    {
      label: "失败标记", path: "statusColors.failed", where: "执行失败勾 / 错误行",
      sample: <span className="focus-legend-mark" style={{ color: failed }}>✕</span>
    },
    {
      label: "警告与待确认", path: "statusColors.warning", where: "中断、待确认感叹号",
      sample: <span className="focus-legend-mark" style={{ color: warning }}>!</span>
    },
    {
      label: "诊断标记", path: "faultPair.diagnostic", where: "错误旁的诊断圆点（与失败成对）",
      sample: <span className="focus-legend-pair">
        <span className="focus-legend-mark" style={{ color: failed }}>✕</span>
        <span className="focus-legend-mark" style={{ color: diagnostic }}>●</span>
      </span>
    }
  ];
  return <div className="focus-color-legend" aria-label="配色实例对照">
    <p className="focus-settings-hint">对照图：色块会落在对话执行过程的这些位置；改色板后保存并应用才生效。</p>
    <div className="focus-legend-mock">
      <div className="focus-legend-card">
        <div className="focus-legend-card-title">执行过程（示意）</div>
        <div className="focus-legend-line"><span style={{ color: doneLight }}>✓</span> 浅色完成项</div>
        <div className="focus-legend-line"><span style={{ color: doneDark }}>✓</span> 深色完成项</div>
        <div className="focus-legend-line"><span style={{ color: failed }}>✕</span>
          <span style={{ color: diagnostic, marginLeft: 6 }}>●</span> 失败 + 诊断</div>
        <div className="focus-legend-line"><span style={{ color: warning }}>!</span> 待确认 / 警告</div>
        <button type="button" className="focus-legend-accent" style={{ background: accent, marginTop: 8 }}>强调按钮</button>
      </div>
    </div>
    <ul className="focus-legend-list">
      {rows.map(row => <li key={row.path}>
        <div className="focus-legend-meta">
          <strong>{row.label}</strong>
          <code>{row.path}</code>
          <span>{row.where}</span>
        </div>
        <div className="focus-legend-sample">{row.sample}</div>
      </li>)}
    </ul>
  </div>;
}
