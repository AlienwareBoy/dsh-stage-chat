from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json

root = Path(__file__).resolve().parents[2]
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless=True)
    page = browser.new_page(viewport={"width":1600, "height":1080})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.clock.install()
    page.goto((root / "dsh-chat-lab.html").as_uri())
    page.locator("#play").click()
    ids = ["task-daily-report", "task-update-reminder", "task-today-todos", "task-final-reply"]
    for index in range(14):
        expected = ids[0] if index < 5 else ids[1] if index < 9 else ids[2] if index < 13 else ids[3]
        data = page.locator(".task-list > .task-node").evaluate_all("""nodes => nodes.map(el=>{
          const rim=el.open?el:el.querySelector(":scope > summary");
          return {id:el.dataset.node, state:el.dataset.execution,
            animation:getComputedStyle(rim,"::after").animationName,
            opacity:getComputedStyle(rim,"::after").opacity};
        })""")
        assert [n["id"] for n in data if n["state"]=="running"] == [expected], (index,data)
        assert [n["id"] for n in data if n["animation"]=="metal-rim-sweep"] == [expected], (index,data)
        active = ids.index(expected)
        assert all(n["state"]=="queued" and n["opacity"]=="0" for n in data[active+1:]), (index,data)
        assert all(n["state"]=="succeeded" and n["opacity"]=="0" for n in data[:active]), (index,data)
        assert page.locator(".final-markdown,[data-action='download-result']").count() == 0
        if index == 0:
            expect(page.locator(".waiting-result")).to_contain_text("尚未返回检查结果")
            page.locator('[data-node="task-update-reminder"] > summary').click()
            expect(page.locator('[data-node="task-update-reminder-step-0"]')).to_have_attribute("data-execution","queued")
            page.locator('[data-node="task-update-reminder-step-0"] > summary').click()
            assert page.locator('[data-node="task-update-reminder-step-0"] pre').count() == 1
        if index in [0,5,9,13]:
            page.screenshot(path=str(root / "dsh-preview" / f"sequential-{index}.png"), full_page=True)
        page.clock.fast_forward(1000 if index else 850)
    expect(page.locator(".final-markdown")).to_contain_text("检查结论")
    assert page.locator('.task-node[data-execution="running"]').count() == 0
    checks.append("14 次逐项推进：日报 → 更新提醒 → 今日待办 → 最终答复；同轮仅一项流光")
    page.locator('[data-node="execution-process"] > summary').click()
    assert page.locator(".task-node").evaluate_all("""nodes=>nodes.every(el=>
      getComputedStyle(el.open?el:el.querySelector("summary"),"::after").opacity==="0")""")
    page.locator("#theme-toggle").click()
    page.set_viewport_size({"width":390,"height":844})
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    checks.append("完整结果与产物出现后全部停光；展开、切换浅色和 390px 布局正常")
    page.locator('[data-state="running"]').click()
    page.emulate_media(reduced_motion="reduce")
    assert page.locator('.task-node[data-execution="running"]').evaluate("""el=>
      getComputedStyle(el.open?el:el.querySelector("summary"),"::after").animationName==="none" """)
    checks.append("减少动态效果模式停用流光")
    assert not errors, errors
    browser.close()
(root / "dsh-focus" / "preview-checks.json").write_text(json.dumps(checks,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(checks,ensure_ascii=False,indent=2))
