# dsh-stage-chat-dev

Local-only Cordis package. It re-exports `../lib` and installs into the desktop
profile as `link:…/dev`, so you can turn off the GitHub `dsh-stage-chat` and
iterate without publishing.

```bash
# from the repo root
npm run install:dev
```

Then reload DeepSeek Harness. After code changes:

```bash
npm run build
```

Reload the window again. No reinstall needed while the link stays.

Restore the GitHub package:

```bash
npm run uninstall:dev
```
