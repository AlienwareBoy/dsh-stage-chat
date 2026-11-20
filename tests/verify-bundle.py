from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json

root = Path(__file__).resolve().parents[1]
checks, errors = [], []
shots = root.parent / "dsh-preview"
shots.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless=True)
    page = browser.new_page(viewport={"width":1100,"height":1080}, accept_downloads=True)
    page.set_default_timeout(5000)
    def page_error(error):
        errors.append(str(error))
        print("Browser error:", error, flush=True)
    page.on("pageerror", page_error)
    page.goto((root / ".checks/host-fixture.html").as_uri())
    expect(page.locator("[data-dsh-focus]")).to_be_visible()
    expect(page.get_by_role("tab",name="对话")).to_have_count(1)
    assert page.locator("[data-native-chat]").count() == 0
    page.evaluate("fixture.addView()")
    expect(page.get_by_role("tab",name="其他视图")).to_be_visible()
    expect(page.get_by_role("tab",name="对话")).to_have_count(1)
    for label in ["金属对话","原生对话","切换浅色","切换深色","复制完整结果"]:
        assert page.get_by_role("button",name=label,exact=True).count() == 0
    checks.append("真实 SlotCore 保留原生注册并选中替代 chat；仅一个对话标签，其他视图仍可见，移除多余按钮")

    for stage, expected in enumerate(["tool-0","tool-1","tool-2","final-task-1"]):
        page.evaluate("(n)=>fixture.setStage(n)", stage)
        active = page.locator(".focus-task[data-flow=on]")
        expect(active).to_have_attribute("data-node", expected)
        expect(active).to_have_count(1)
        expect(active.locator("svg")).to_be_visible()
        states = page.locator(".focus-task").evaluate_all("""els=>els.map(el=>({
          state:el.dataset.execution,flow:el.dataset.flow,
          animation:getComputedStyle(el.querySelector('rect')).animationName
        }))""")
        assert all((n["flow"]=="on") == (n["animation"]=="dsh-focus-rim") for n in states)
    page.evaluate("fixture.setStage(0)")
    active = page.locator(".focus-task[data-flow=on]")
    expect(active.locator("svg")).to_be_visible()
    cycle = active.evaluate("""async el => {
      const rect=el.querySelector('.focus-rim-2'), anim=rect.getAnimations()[0];
      const duration=anim.effect.getTiming().duration, start=anim.currentTime;
      const samples=[];
      await new Promise(resolve=>{
        function sample() {
          samples.push({time:anim.currentTime,offset:parseFloat(getComputedStyle(rect).strokeDashoffset)});
          if(anim.currentTime-start > duration*1.15) resolve(); else requestAnimationFrame(sample);
        } requestAnimationFrame(sample);
      });
      window.testRimAnimation=anim;
      const length=rect.getTotalLength();
      const points=Array.from({length:101},(_,i)=>rect.getPointAtLength(length*i/100));
      return {duration,samples,ends:[points[0].x,points[0].y,points[100].x,points[100].y],
        bounds:{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
          minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))}};
    }""")
    assert cycle["duration"] == 2400
    assert len(cycle["samples"]) > 40
    offsets = [s["offset"] for s in cycle["samples"]]
    assert min(offsets) < -95 and max(offsets) > -5
    assert all(b["time"] >= a["time"] for a,b in zip(cycle["samples"],cycle["samples"][1:]))
    assert abs(cycle["ends"][0]-cycle["ends"][2]) < .1 and abs(cycle["ends"][1]-cycle["ends"][3]) < .1
    assert cycle["bounds"]["maxX"]-cycle["bounds"]["minX"] > 300
    assert cycle["bounds"]["maxY"]-cycle["bounds"]["minY"] > 30
    page.evaluate("fixture.append()")
    assert active.evaluate("el=>el.querySelector('.focus-rim-2').getAnimations()[0]===window.testRimAnimation")
    active.locator("summary").click()
    expect(active).to_have_attribute("open","")
    expect(active.locator("svg")).to_be_visible()
    page.wait_for_function("Number(document.querySelector('.focus-task[data-flow=on] svg').getAttribute('height'))>100")
    assert active.evaluate("el=>el.querySelector('.focus-rim-2').getAnimations()[0]===window.testRimAnimation")
    assert active.locator("svg").evaluate("el=>el.getBoundingClientRect().height") > 100
    page.locator("#plugin-view").screenshot(path=str(shots / "plugin-0.1.2-running.png"))
    checks.append(f"等待真实返回时连续采样 {len(cycle['samples'])} 帧，2400ms 完整闭环；折叠可见，展开与节点更新不重启动画，实际任务逐项交接")

    page.evaluate("fixture.block(true)")
    expect(page.locator(".focus-task[data-flow=on]")).to_have_count(0)
    expect(page.locator(".focus-pending")).to_contain_text("请在下方 DSH 输入区处理")
    assert page.locator(".focus-rim-layer").evaluate_all("els=>els.every(el=>getComputedStyle(el).animationName==='none')")
    page.evaluate("fixture.block(false); fixture.setStage(4)")
    expect(page.get_by_role("button",name="下载完整 Markdown")).to_be_visible()
    expect(page.locator(".focus-task[data-flow=on]")).to_have_count(0)
    page.get_by_role("link",name="检查报告").click()
    assert "task-report.md" in page.evaluate("lastOpened")
    checks.append("审批暂停、完成停止流光；实际结果和文件打开委托保留，输入区仍可用")

    sample_path = Path("/tmp/dsh-focus-public-final.md")
    sample = sample_path.read_text() if sample_path.exists() else "## 执行过程\n\n1. 核对来源。\n\n## 执行结果\n\n### 关键结论\n\n正文。\n\n[来源](https://example.com)\n\n## 需要确认\n\n无待办事项。"
    page.evaluate("(text)=>fixture.setFinal(text)",sample)
    result = page.locator(".focus-result")
    expect(result).to_contain_text("关键结论")
    assert "执行过程" not in result.inner_text() and "核对权威预报" not in result.inner_text()
    assert page.locator(".focus-pending").count() == 0
    page.locator('[data-node="process-1"] > summary').click()
    page.locator('[data-node="reported-process-1"] > summary').click()
    assert page.locator('[data-node="reported-process-1"] ol > li').count() > 0
    assert result.get_by_role("link").count() > 0 or page.locator('[data-node="reported-process-1"]').get_by_role("link").count() > 0
    with page.expect_download() as info:
        page.get_by_role("button",name="下载完整 Markdown").click()
    downloaded = info.value
    assert downloaded.suggested_filename == "dsh-result-1.md"
    assert Path(downloaded.path()).read_text() == sample + "\n\n新的公开结果段落。"
    checks.append("用户实际公开答复回归：过程移到过程区，结果完整保留，空确认隐藏；下载字节与完整原始 Markdown 一致")
    page.locator("#plugin-view").screenshot(path=str(shots / "plugin-0.1.2-result.png"))

    page.evaluate("fixture.setFinal('# 阅读结果\\n\\n完整正文。'); fixture.long(true)")
    scroller = page.locator("#native-scroll")
    assert scroller.evaluate("el=>el.scrollHeight>el.clientHeight")
    assert page.locator("[data-dsh-focus]").evaluate("el=>getComputedStyle(el).overflowY") == "visible"
    scroller.evaluate("el=>el.scrollTop=100")
    page.wait_for_function("document.querySelector('#native-scroll').scrollTop===100")
    before = scroller.evaluate("el=>el.scrollTop")
    text_length = len(page.locator(".focus-result").first.inner_text())
    page.evaluate("fixture.append()")
    page.wait_for_function("(length)=>document.querySelector('.focus-result').innerText.length>length", arg=text_length)
    page.evaluate("()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
    assert abs(scroller.evaluate("el=>el.scrollTop") - before) < 2
    scroller.evaluate("el=>el.scrollTop=el.scrollHeight")
    position = scroller.evaluate("el=>el.scrollTop")
    box = scroller.bounding_box()
    page.mouse.move(box["x"]+box["width"]/2,box["y"]+box["height"]/2)
    page.mouse.wheel(0,-400)
    page.wait_for_function("(old)=>document.querySelector('#native-scroll').scrollTop<old",arg=position)
    scroller.evaluate("el=>el.scrollTop=0")
    anchor = page.locator('[data-turn="10"]').evaluate("el=>el.getBoundingClientRect().top")
    page.get_by_role("button",name="加载更早对话").click()
    expect(page.locator('[data-turn="0"]')).to_have_count(1)
    page.evaluate("()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
    assert abs(page.locator('[data-turn="10"]').evaluate("el=>el.getBoundingClientRect().top") - anchor) < 2
    checks.append("使用实际 SDK ConversationRoot CSS：原生滚动容器可滚动，鼠标滚轮有效，读取新内容及加载历史保留阅读位置")

    page.evaluate("document.documentElement.style.colorScheme='light'")
    expect(page.locator("[data-dsh-focus]")).to_have_attribute("data-theme","light")
    page.set_viewport_size({"width":390,"height":844})
    assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth")
    checks.append("跟随宿主主题，390px 无横向溢出，无额外主题切换")

    field = page.get_by_role("textbox",name="任务内容提示词")
    field.fill("按顺序逐项执行，保留真实结果。")
    page.evaluate("fixture.accept(false)")
    page.get_by_role("button",name="保存并应用").click()
    expect(page.locator("[data-dsh-focus-settings]")).to_contain_text("宿主未接受保存")
    page.evaluate("fixture.accept(true)")
    page.get_by_role("button",name="保存并应用").click()
    expect(page.locator("[data-dsh-focus-settings]")).to_contain_text("已保存并应用")
    assert page.evaluate("fixture.saved().outputPrompt") == "按顺序逐项执行，保留真实结果。"
    design = json.loads(page.evaluate("fixture.saved().json"))
    design["appearance"]["statusColors"]["completed"]["light"] = "#8844CC"
    page.get_by_role("textbox",name="配置 JSON").fill(json.dumps(design,ensure_ascii=False))
    page.get_by_role("button",name="保存并应用").click()
    expect(page.locator('[data-dsh-focus] .focus-mark[data-state=succeeded]').first).to_have_css("color","rgb(136, 68, 204)")
    saved = page.evaluate("fixture.saved().json")
    page.get_by_role("textbox",name="配置 JSON").fill("{invalid")
    page.get_by_role("button",name="保存并应用").click()
    assert page.evaluate("fixture.saved().json") == saved
    page.evaluate("fixture.setStage(0)")
    page.emulate_media(reduced_motion="reduce")
    assert page.locator(".focus-rim-layer").evaluate_all("els=>els.every(el=>getComputedStyle(el).animationName==='none')")
    page.evaluate("fixture.dispose()")
    assert page.locator("style[data-dsh-focus-styles]").count() == 0
    assert page.locator("[data-dsh-focus-duplicate-tab]").count() == 0
    checks.append("配置接受/拒绝、用户配色、无效 JSON、减少动态效果及卸载清理均通过")
    assert not errors,errors
    browser.close()
(root / "bundle-checks.json").write_text(json.dumps(checks,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(checks,ensure_ascii=False,indent=2))
