# dsh-focus

[中文](README.md) · **English**

dsh-focus is a stage-based conversation view for DeepSeek Harness. It replaces the built-in Chat view and organizes one turn into three sections, in order: execution, result, and items awaiting confirmation.

| Item | Value |
| --- | --- |
| Package | `dsh-focus` |
| Version | 0.1.3 |
| Compatibility | DeepSeek Harness 0.2.2-rc.5 and earlier |
| Mount point | `chat`, priority `-100` |
| License | [MIT](LICENSE) |

## Interface

The execution section states the active stage and lists the steps that have already returned, each with its status.

![Active stage and completed steps](docs/execution-process.png)

The result of the same turn is a separate section. A step still in progress is marked running. A step that has not started is marked waiting.

![Execution and result](docs/execution-result.png)

The full interaction is in the [demo video](docs/demo.mp4).

## Installation

DeepSeek Harness must already be installed.

```bash
dsh plugin --profile web add github:AlienwareBoy/dsh-chat-view
```

Reload the client after installation. The composer, approvals, and the other views remain part of Harness. Colors follow the host light theme, dark theme, and system setting.

On the desktop app, install the plugin from the in-app plugin manager and reload the window.

## Presentation

- **Execution** contains the public stage notes and the tool calls that occurred inside that stage. When the model does not name a stage, those calls are filed under “Doing the task.”
- **Result** is the final text written by the model. A successful tool call is not a result.
- **Awaiting confirmation** appears only when an item is pending. Confirmation stays in the Harness composer.

Only the active stage shows the moving highlight. The highlight stops when that stage finishes, fails, is interrupted, or waits for approval. It does not play when the system setting “Reduce motion” is enabled.

The left side of the session is a rail of turn anchors. An anchor enlarges as the pointer approaches. Hovering shows that turn’s prompt and reply summary. Activating an anchor jumps to the turn.

Mermaid fences in the result are rendered locally. The view can show the source, zoom the diagram, and download the full Markdown for the turn. It shows public text, tool arguments, and tool results.

## Configuration

Open **Conversation display** in the Harness settings. Adjust the colors, edit the configuration JSON and the reply rules, then save. The reply rules take effect on the next model request and do not rewrite the rest of the system prompt. The reply rules may be empty.

## Build from source

```bash
npm install
npm run typecheck
npm run build
npm test
npm pack
```

These commands do not start Harness. The packed archive can be installed locally:

```bash
dsh plugin --profile web add ./dsh-focus-0.1.3.tgz
```
