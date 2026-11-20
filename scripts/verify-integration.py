"""Offline browser verification of the actual plugin bundle and native SDK UI."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json

output = Path("/tmp/dsh-stage-chat-013-checks")
checks, errors = [], []
diagrams = """# 检查结论

本轮已核对公开记录。

```mermaid
mindmap
  root((任务))
    记录
      运行状态
    结果
      返回证据
```

```mermaid
flowchart LR
  A["检查记录"] --> B{"证据完整？"}
  B -->|是| C["整理结果"]
```

```mermaid
xychart-beta
  x-axis ["第1期", "第2期", "第3期"]
  y-axis "指数" 80 --> 150
  line [100, 115, 137]
```

```diff
-before
+after
```

```math
x^2+1
```

| 项目 | 状态 |
| --- | --- |
| 记录 | 已核对 |

[检查报告](file:///tmp/task-report.md)
"""
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        headless=True,
    )
    page = browser.new_page(viewport={"width": 1100, "height": 1000}, accept_downloads=True)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto((output / "host-fixture.html").as_uri())
    expect(page.locator("[data-dsh-stage-chat]")).to_be_visible()
    expect(page.get_by_role("tab", name="对话", exact=True)).to_have_count(1)
    assert not page.locator("[data-native-chat]").count()
    for label in ["播放流程", "下一阶段", "完整结果", "阶段进展与 Mermaid 预览", "金属对话", "切换浅色", "切换深色"]:
        assert not page.get_by_role("button", name=label, exact=True).count()
    checks.append("原生 chat 覆盖、单个对话标签与简洁控制")

    for stage in range(4):
        page.evaluate("(n)=>fixture.setStage(n)", stage)
        active = page.locator(".focus-task[data-flow=on]")
        expect(active).to_have_count(1)
        expected = f"stage-public-stage-{stage}" if stage < 3 else "stage-final-1"
        expect(active).to_have_attribute("data-node", expected)
        assert page.locator(".focus-task [data-node^=tool-]").count() == 3
        assert not page.locator(".focus-tasks > [data-node^=tool-]").count()
    page.evaluate("fixture.setStage(0)")
    active = page.locator(".focus-task[data-flow=on]")
    summary = active.locator(":scope > summary")
    assert summary.evaluate("el=>getComputedStyle(el).paddingTop") == "6px"
    assert summary.evaluate("el=>getComputedStyle(el).paddingBottom") == "6px"
    title = active.locator(".focus-summary-title").first
    page.set_viewport_size({"width": 390, "height": 1000})
    assert title.locator("p").evaluate("el=>el.scrollWidth>el.clientWidth")
    assert title.locator("p").evaluate("el=>getComputedStyle(el).textOverflow") == "ellipsis"
    page.set_viewport_size({"width": 1100, "height": 1000})
    cycle = active.evaluate("""async el=>{
      const rect=el.querySelector('.focus-rim-2'), anim=rect.getAnimations()[0];
      window.rim=anim;
      const samples=[], start=anim.currentTime, duration=anim.effect.getTiming().duration;
      await new Promise(resolve=>{function frame(){
        samples.push({time:anim.currentTime,offset:parseFloat(getComputedStyle(rect).strokeDashoffset)});
        if(anim.currentTime-start>duration*1.1)resolve();else requestAnimationFrame(frame);
      } requestAnimationFrame(frame)});
      return {duration,samples};
    }""")
    assert cycle["duration"] == 2400
    assert min(s["offset"] for s in cycle["samples"]) < -95
    assert max(s["offset"] for s in cycle["samples"]) > -5
    summary.click()
    expect(active).to_have_attribute("open", "")
    expect(active.locator(".focus-detail").first).to_contain_text("这些是本阶段的公开说明")
    page.wait_for_function("Number(document.querySelector('.focus-task[data-flow=on] svg').getAttribute('height'))>90")
    assert active.evaluate("el=>el.querySelector('.focus-rim-2').getAnimations()[0]===window.rim")
    active.get_by_text("工具记录 · 1", exact=True).click()
    expect(active.locator("[data-node=tool-0]")).to_be_visible()
    active.locator("[data-node=tool-0] > summary").click()
    expect(active).to_contain_text("等待工具返回")
    page.evaluate("fixture.append()")
    assert active.evaluate("el=>el.querySelector('.focus-rim-2').getAnimations()[0]===window.rim")
    page.locator("#plugin-view").screenshot(path=str(output / "running-dark.png"))
    checks.append("阶段优先、工具下沉、6px 边距、长标题省略、公开正文完整展开")
    checks.append(f"真实等待时采样 {len(cycle['samples'])} 帧，2.4 秒连续流光；展开与更新保留动画")

    page.evaluate("fixture.block(true)")
    expect(page.locator(".focus-task[data-flow=on]")).to_have_count(0)
    expect(page.locator(".focus-pending")).to_contain_text("请在下方 DSH 输入区处理")
    assert page.locator(".focus-rim-layer").evaluate_all("els=>els.every(el=>getComputedStyle(el).animationName==='none')")
    page.evaluate("fixture.block(false);fixture.setStage(4)")
    expect(page.locator(".focus-task[data-flow=on]")).to_have_count(0)
    checks.append("审批暂停与实际完成停止流光")

    page.evaluate("(text)=>fixture.setFinal(text)", diagrams)
    expect(page.locator(".focus-chart-canvas > svg")).to_have_count(3, timeout=30000)
    assert page.locator(".focus-result table").count() == 1
    assert page.locator(".focus-result .katex").count() > 0
    assert "before" in page.locator(".focus-result").inner_text()
    first = page.locator(".focus-chart").first
    first.get_by_text("源代码", exact=True).click()
    expect(first).to_contain_text("root((任务))")
    first.get_by_role("button", name="放大查看").click()
    dialog = first.locator("dialog")
    expect(dialog).to_be_visible()
    dialog.get_by_role("button", name="放大图表", exact=True).click()
    expect(dialog).to_contain_text("125%")
    dialog.get_by_role("button", name="重置", exact=True).click()
    expect(dialog).to_contain_text("100%")
    page.keyboard.press("Escape")
    expect(dialog).not_to_be_visible()
    page.get_by_role("link", name="检查报告").click()
    assert "task-report.md" in page.evaluate("lastOpened")
    with page.expect_download() as info:
        page.get_by_role("button", name="下载完整 Markdown", exact=True).click()
    assert Path(info.value.path()).read_text() == diagrams + "\n\n新的公开结果段落。"
    checks.append("mindmap、flowchart、xychart、源码、放大缩小重置、Esc、原生 diff/math/表格与完整下载")

    for scheme in ["light", "dark"]:
        page.evaluate("""scheme=>{
          document.documentElement.style.colorScheme=scheme;
          document.documentElement.style.setProperty('--dsw-alias-bg-base',scheme==='light'?'#ffffff':'#202022');
          document.documentElement.style.setProperty('--dsw-alias-bg-layer-1',scheme==='light'?'#f7f8fa':'#29292c');
          document.documentElement.style.setProperty('--dsw-alias-label-primary',scheme==='light'?'#202124':'#e4e4e7');
          document.documentElement.style.setProperty('--dsw-alias-border-l1',scheme==='light'?'#d8d9dd':'#444449');
        }""", scheme)
        expect(page.locator("[data-dsh-stage-chat]")).to_have_attribute("data-theme", scheme)
        expect(page.locator(".focus-chart-canvas > svg")).to_have_count(3)
        expected_bg = "rgb(255, 255, 255)" if scheme == "light" else "rgb(32, 32, 34)"
        expect(page.locator("[data-dsh-stage-chat]")).to_have_css("background-color", expected_bg)
        page.locator("#plugin-view").screenshot(path=str(output / f"result-{scheme}.png"))
    page.evaluate("document.documentElement.style.colorScheme='normal'")
    page.emulate_media(color_scheme="light")
    expect(page.locator("[data-dsh-stage-chat]")).to_have_attribute("data-theme", "light")
    page.emulate_media(color_scheme="dark")
    expect(page.locator("[data-dsh-stage-chat]")).to_have_attribute("data-theme", "dark")
    checks.append("宿主浅色/深色/跟随系统实时切换及图表适配")

    page.evaluate("fixture.setFinal('# 阅读结果\\n\\n完整正文。');fixture.long(true)")
    expect(page.locator(".focus-anchor")).to_have_count(13)
    scroller = page.locator("#native-scroll")
    scroller.evaluate("el=>el.scrollTop=0")
    rail = page.locator(".focus-rail")
    anchor = rail.locator(".focus-anchor").nth(5)
    tick = anchor.locator(".focus-anchor-tick")
    baseline = tick.bounding_box()["width"]
    anchor.hover()
    expect(anchor.locator(".focus-anchor-preview")).to_be_visible()
    page.wait_for_function("""()=>document.querySelectorAll('.focus-anchor-tick')[5].getBoundingClientRect().width>20""")
    assert tick.bounding_box()["width"] > baseline
    assert rail.locator(".focus-anchor").nth(4).evaluate("el=>parseFloat(el.style.getPropertyValue('--proximity'))") > 0
    page.locator("#plugin-view").screenshot(path=str(output / "anchor-preview.png"))
    anchor.click()
    expect(anchor).to_have_attribute("aria-current", "location")
    assert scroller.evaluate("el=>el.scrollTop") > 0
    anchor.focus()
    page.keyboard.press("Enter")
    expect(anchor).to_have_attribute("aria-current", "location")
    scroller.evaluate("el=>el.scrollTop=100")
    page.wait_for_function("document.querySelector('#native-scroll').scrollTop===100")
    before = scroller.evaluate("el=>el.scrollTop")
    page.evaluate("fixture.append()")
    page.evaluate("()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
    assert abs(scroller.evaluate("el=>el.scrollTop") - before) < 2
    scroller.evaluate("el=>el.scrollTop=0")
    top = page.locator('[data-turn="10"]').evaluate("el=>el.getBoundingClientRect().top")
    page.get_by_role("button", name="加载更早对话", exact=True).click()
    expect(page.locator('[data-turn="0"]')).to_have_count(1)
    page.evaluate("()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
    assert abs(page.locator('[data-turn="10"]').evaluate("el=>el.getBoundingClientRect().top") - top) < 2
    checks.append("轮次锚点、距离动画、悬停预览、鼠标/键盘跳转、当前定位、流式更新与加载历史保留阅读位置")

    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
    page.locator("#plugin-view").screenshot(path=str(output / "mobile.png"))
    checks.append("390px 移动宽度无横向溢出")
    page.evaluate("fixture.long(false);fixture.setStage(0)")
    page.emulate_media(reduced_motion="reduce")
    assert page.locator(".focus-rim-layer").evaluate_all("els=>els.every(el=>getComputedStyle(el).animationName==='none')")
    field = page.get_by_role("textbox", name="回复规则", exact=True)
    field.fill("用户自定义阶段说明规则。")
    page.get_by_role("button", name="保存并应用", exact=True).click()
    expect(page.locator("[data-dsh-stage-chat-settings]")).to_contain_text("已保存并应用")
    assert page.evaluate("fixture.saved().outputPrompt") == "用户自定义阶段说明规则。"
    page.evaluate("fixture.dispose()")
    assert not page.locator("style[data-dsh-stage-chat-styles]").count()
    assert not errors, errors
    checks.append("用户自定义提示词、减少动画与卸载清理")
    browser.close()
(output / "integration-results.json").write_text(json.dumps(checks, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(checks, ensure_ascii=False, indent=2))
