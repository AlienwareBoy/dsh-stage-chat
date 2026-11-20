# dsh-focus

[English](README.en.md)

dsh-focus 是 DeepSeek Harness 的对话视图。一次任务从上往下读：**执行过程**、**执行结果**、**需要确认**。正在做的阶段留在眼前，做完的步骤收回对应阶段，最后的答复单独成块。

兼容 **DeepSeek Harness 0.2.2-rc.5，以及比它更早的版本**。安装之后它占据原来的「对话」位置，主题跟随 Harness 的浅色、深色和系统设置。

## 演示

当前阶段用一行说明标出。已经返回的步骤列在下面，并标上完成状态。

![执行过程：当前阶段和已完成的步骤](docs/execution-process.png)

同一轮继续往下时，执行结果单独成块。进行中的步骤显示「执行中」，还没轮到的步骤显示「等待执行」。

![执行过程与执行结果](docs/execution-result.png)

完整操作过程见 [演示视频](docs/demo.mp4)。

## 安装

本机需要已经装有 DeepSeek Harness。

```bash
dsh plugin --profile web add github:AlienwareBoy/dsh-chat-view
```

装好后重新加载客户端。输入框、审批和其它视图仍由 Harness 提供。插件注册为 `chat`，优先级 `-100`。

## 一次回复怎么读

- **执行过程**。公开的阶段说明，以及这个阶段里真实发生的工具调用。模型没有写出阶段时，这些调用归到「执行任务」。
- **执行结果**。模型最终写出的正文。工具调用成功不会被当成结果。
- **需要确认**。有待处理事项时才出现。批准在 Harness 自己的输入区完成。

同一时刻只有当前阶段有流光。这一步完成、失败、中断，或停下来等审批时，动画停止。系统打开「减少动态效果」后不再播放动画。

左侧是本会话的轮次锚点。指针靠近时锚点变大，悬停可以看到该轮的提示和答复摘要，点击后跳到对应位置。

结果里的 Mermaid 代码块在本地画成图，可以查看源码、放大，并下载这一轮的完整 Markdown。

界面只展示公开文字、工具参数和返回内容。

## 设置

打开 Harness 设置中的 **对话显示**。这里可以调整配色、编辑配置 JSON 和回复规则，然后保存。回复规则从下一次模型请求开始生效，其它系统提示词保持原样。提示词可以留空。

## 从源码构建

```bash
npm install
npm run typecheck
npm run build
npm test
npm pack
```

这些命令不会启动 Harness。打包得到的 `dsh-focus-0.1.3.tgz` 也可以本地安装：

```bash
dsh plugin --profile web add ./dsh-focus-0.1.3.tgz
```

桌面版从应用内的插件管理安装，装完后重新加载界面。

## 许可

[MIT](LICENSE)
