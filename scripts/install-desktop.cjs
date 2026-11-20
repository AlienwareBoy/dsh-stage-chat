// Use the desktop runtime's native profile manager; this never starts a service.
const path = require("node:path");
const fs = require("node:fs");
const application = process.argv[3] || "/Volumes/DeepSeek Harness 0.2.2-rc.5-arm64/DeepSeek Harness.app/Contents";
const archive = path.resolve(process.argv[2] || "../dsh-stage-chat-0.1.3.tgz");
const runtime = path.join(application, "Resources/runtime");
const packages = path.join(application, "Resources/app.asar/dsh/node_modules");
const anchor = path.join(packages, "@deepseek-ai/dsh/package.json");
const { runProfilePnpm } = require(path.join(packages, "@deepseek-ai/dsh-plugin-manager/lib/types/operations.js"));
const { withFileLock } = require(path.join(packages, "@deepseek-ai/dsh-atomic-write/lib/index.js"));
const profile = path.join(require("node:os").homedir(), ".dsh/profiles/desktop");
(async () => {
  const result = await withFileLock(path.join(profile, "package.json"), () =>
    runProfilePnpm({
      profile: "desktop", dir: profile, installAnchor: anchor, cwd: path.dirname(archive)
    }, ["add", archive, "--ignore-scripts", "--registry=https://registry.npmjs.org"], {
      command: path.join(runtime, "bin/node"),
      args: [path.join(runtime, "primary-runtime/dependencies/pnpm/bin/pnpm.mjs")],
      env: {
        DSH_DESKTOP_NODE_EXECUTABLE: path.join(application, "MacOS/DeepSeek Harness"),
        ELECTRON_RUN_AS_NODE: "1",
        PATH: path.join(runtime, "bin") + ":" + process.env.PATH
      },
      execution: "service", outputBytes: 65536,
      onOutput: (text, stream) => process[stream].write(text),
      activateNewBundles: true,
      expected: { name: "dsh-stage-chat", version: "0.1.3" },
      idleTimeoutMs: 60000, lookupTimeoutMs: 60000
    }), { waitMs: 5000 }
  );
  fs.writeFileSync("/tmp/dsh-stage-chat-0.1.3-install-result.json", JSON.stringify(result, null, 2));
  console.log("Installation exit code:", result.exitCode);
  process.exitCode = result.exitCode ?? 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
