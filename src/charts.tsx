import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { FenceCodeBlock, FenceMathBlock, type MarkdownDelegateFenceInfo } from "@deepseek-ai/dsh-client-ui-primitives";
import mermaid from "../vendor/mermaid.js";

export const ChartTheme = createContext(false);
const labels = { copyLabel: "复制", copiedLabel: "已复制" };
let queue = Promise.resolve();
function Mermaid({ code, streaming }: { code: string; streaming: boolean }) {
  const light = useContext(ChartTheme), id = `focus-chart-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const canvas = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [svg, setSvg] = useState(""), [error, setError] = useState(""), [scale, setScale] = useState(1);
  useEffect(() => {
    const el = host.current; if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setVisible(true); observer.disconnect();
    }, { rootMargin: "120px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let live = true;
    setError("");
    if (streaming || !visible) return;
    queue = queue.catch(() => {}).then(async () => {
      if (!live) return;
      const text = light ? "#000000" : "#e4e4e7", bg = light ? "#ffffff" : "#202022",
        surface = light ? "#f4f5f7" : "#29292c", border = light ? "#c8cbd1" : "#606066";
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base",
        suppressErrorRendering: true,
        fontFamily: "PingFang SC, system-ui, sans-serif",
        themeVariables: {
          background: bg, primaryColor: surface, primaryTextColor: text, primaryBorderColor: border,
          secondaryColor: surface, secondaryTextColor: text, tertiaryColor: surface,
          tertiaryTextColor: text, lineColor: border, textColor: text, mainBkg: surface,
          nodeBorder: border, clusterBkg: bg, clusterBorder: border, edgeLabelBackground: bg,
          cScale0: surface, cScale1: surface, cScale2: surface, cScale3: surface,
          cScale4: surface, cScale5: surface, cScale6: surface, cScale7: surface,
          cScaleLabel0: text, cScaleLabel1: text, cScaleLabel2: text, cScaleLabel3: text,
          cScaleLabel4: text, cScaleLabel5: text, cScaleLabel6: text, cScaleLabel7: text,
          xyChart: { backgroundColor: bg, titleColor: text, xAxisLabelColor: text,
            yAxisLabelColor: text, xAxisLineColor: border, yAxisLineColor: border,
            xAxisTickColor: border, yAxisTickColor: border, plotColorPalette: "#568bde,#8b8b93" }
        }
      });
      try {
        const rendered = await mermaid.render(id, code);
        if (live) { setSvg(rendered.svg); setScale(1); }
      } catch {
        if (live) { setSvg(""); setError("图表语法暂时无法解析，请查看源代码。"); }
      }
    });
    return () => { live = false; };
  }, [code, streaming, visible, light, id]);
  return <figure ref={node => { host.current = node; }} className="focus-chart">
    <div className="focus-chart-actions">
      <span>Mermaid</span>
      {svg && !streaming && <button onClick={() => dialog.current?.showModal()}>放大查看</button>}
    </div>
    {streaming ? <p>图表生成中…</p> : !visible ? <p>图表待显示…</p> : error ? <p role="status">{error}</p> :
      <div ref={canvas} className="focus-chart-canvas" dangerouslySetInnerHTML={{ __html: svg }} />}
    <details className="focus-chart-source"><summary>源代码</summary>
      <FenceCodeBlock code={code} lang="mermaid" streaming={streaming} labels={labels} />
    </details>
    <dialog ref={dialog} className="focus-chart-dialog" onClick={e => {
      if (e.target === e.currentTarget) e.currentTarget.close();
    }}>
      <div className="focus-chart-toolbar">
        <button onClick={() => setScale(v => Math.max(.5, v - .25))} aria-label="缩小图表">−</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(v => Math.min(3, v + .25))} aria-label="放大图表">＋</button>
        <button onClick={() => setScale(1)}>重置</button>
        <button onClick={() => dialog.current?.close()}>关闭</button>
      </div>
      <div className="focus-chart-zoom"><div style={{ width: `${scale * 100}%`, minWidth: `${scale * 600}px` }}
        dangerouslySetInnerHTML={{ __html: svg.replaceAll(id, `${id}-zoom`) }} /></div>
    </dialog>
  </figure>;
}
export function renderCode(fence: MarkdownDelegateFenceInfo) {
  return fence.lang?.toLowerCase() === "mermaid" ? <Mermaid code={fence.code} streaming={fence.streaming} /> :
    fence.lang === "math" && !fence.streaming ? <FenceMathBlock code={fence.code} /> :
    <FenceCodeBlock lang={fence.lang} code={fence.code} streaming={fence.streaming} labels={labels} diff={fence.lang === "diff"} />;
}
