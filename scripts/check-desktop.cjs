const fs = require("node:fs");
const path = require("node:path");
const base = process.argv[2] || "/Volumes/DeepSeek Harness 0.2.2-rc.5-arm64/DeepSeek Harness.app/Contents/Resources/app.asar/dsh";
const boot = require(path.join(base, "node_modules/@deepseek-ai/dsh-app-boot/lib/index.js"));
const profileDir = path.join(require("node:os").homedir(), ".dsh/profiles/desktop");
const installAnchor = path.join(base, "node_modules/@deepseek-ai/dsh/package.json");
const profile = boot.loadProfileDirectory("dsh", profileDir, installAnchor);
const rows = boot.composeEntries([...profile.layers.map(layer => layer.patches), profile.patches]);
const inventory = boot.readProfilePlugins({ binName: "dsh", profileDir, installAnchor });
const plugin = inventory.dependencies.find(item => item.name === "dsh-stage-chat");
if (!plugin || plugin.version !== "0.1.5" || !plugin.enabled || !plugin.bundle)
  throw new Error("Updated plugin is not installed and enabled");
if (profile.skippedBundles.some(item => item.packageName === "dsh-stage-chat") || !rows.some(row => row.id === "focus"))
  throw new Error("Updated plugin does not compose into the desktop profile");
const built = fs.readFileSync(path.join(profileDir, "node_modules/dsh-stage-chat/lib/client.js"), "utf8");
// Count host-loader calls, not guarded object methods inside bundled libraries.
const imports = [...new Set([...built.matchAll(/(?<![\w$.])require\("([^"]+)"\)/g)].map(match => match[1]))];
const allowed = new Set(["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives"]);
if (imports.some(name => !allowed.has(name))) throw new Error("Unexpected client host import");
console.log(JSON.stringify({
  runtime: boot.getDshRuntimeVersion(), plugin, clientImports: imports,
  skipped: profile.skippedBundles, focus: rows.filter(row => row.id === "focus"),
  compatibility: boot.evaluatePluginCompatibility(JSON.parse(fs.readFileSync(path.join(profileDir, "node_modules/dsh-stage-chat/package.json"), "utf8")))
}, null, 2));
