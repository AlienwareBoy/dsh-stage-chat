# dsh-focus

[中文](README.md)

dsh-focus is a conversation view for DeepSeek Harness. A turn reads from top to bottom: **what is running**, **the answer**, and **what needs confirmation**. The active stage stays in view, finished steps fold back into that stage, and the final reply stands on its own.

It supports **DeepSeek Harness 0.2.2-rc.5 and earlier releases**. After installation it takes the place of the built-in Chat view and follows the Harness light, dark, and system themes.

## Demo

The active stage is a single line. Steps that have already returned are listed under it, each with its status.

![Execution: the active stage and completed steps](docs/execution-process.png)

Further down the same turn, the answer is a separate block. A step that is still running is marked in progress. A step that has not started yet stays waiting.

![Execution and the answer](docs/execution-result.png)

The full walkthrough is in the [demo video](docs/demo.mp4).

## Install

DeepSeek Harness needs to be installed locally.

```bash
dsh plugin --profile web add github:AlienwareBoy/dsh-chat-view
```

Reload the client after installing. The composer, approvals, and the other views stay with Harness. This plugin registers as `chat` at priority `-100`.

## How a turn is shown

- **Execution.** The public stage notes, plus the tool calls that actually happened in that stage. When the model does not name a stage, those calls are grouped under “Doing the task.”
- **Answer.** The text the model actually wrote. A successful tool call is not treated as the answer.
- **Needs confirmation.** Shown only when something is waiting. Approval still happens in the Harness composer.

Only the active stage carries the moving highlight. The highlight stops when that step finishes, fails, is interrupted, or pauses for approval. It also stays off when the system setting “Reduce motion” is on.

The left edge is a rail of turn anchors for the current session. An anchor grows as the pointer approaches, a hover shows that turn’s prompt and reply preview, and a click jumps to the turn.

Mermaid fences in the answer are drawn locally. You can open the source, zoom the diagram, and download the full Markdown for the turn.

The view shows public text, tool arguments, and tool results.

## Settings

Open **Conversation display** in the Harness settings. From there you can change the colors, edit the configuration JSON and the reply rules, then save. The reply rules apply on the next model request. The rest of the system prompt is left as it is. The reply rules can be empty.

## Build from source

```bash
npm install
npm run typecheck
npm run build
npm test
npm pack
```

These commands do not start Harness. The packed `dsh-focus-0.1.3.tgz` can also be installed locally:

```bash
dsh plugin --profile web add ./dsh-focus-0.1.3.tgz
```

On the desktop app, install it from the in-app plugin manager and reload the window.

## License

[MIT](LICENSE)
