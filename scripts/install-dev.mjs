#!/usr/bin/env node
/**
 * Point the desktop profile at ./dev (dsh-stage-chat-dev) via pnpm link:,
 * remove the GitHub dsh-stage-chat dependency, keep fiber id `focus` so
 * existing 对话显示 settings stay attached.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  profileDir,
  retargetFocusName,
  dedupeFocusFibers,
  runProfileInstall
} from "./pnpm-profile.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const devDir = join(root, "dev");
const pkgPath = join(profileDir, "package.json");
const patchPath = join(profileDir, "cordis.patch.yml");
const linkSpec = `link:${devDir}`;

spawnSync(process.execPath, [join(root, "scripts/build.mjs")], {
  cwd: root, stdio: "inherit"
}).status === 0 || process.exit(1);

if (!existsSync(pkgPath)) {
  console.error(`Desktop profile not found: ${pkgPath}`);
  process.exit(1);
}

const backup = `${pkgPath}.bak-before-stage-chat-dev`;
if (!existsSync(backup)) copyFileSync(pkgPath, backup);

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.dependencies ??= {};
delete pkg.dependencies["dsh-stage-chat"];
pkg.dependencies["dsh-stage-chat-dev"] = linkSpec;

const bundles = pkg.dsh?.profile?.bundles;
if (Array.isArray(bundles)) {
  const next = bundles.filter(name => name !== "dsh-stage-chat" && name !== "dsh-stage-chat-dev");
  next.push("dsh-stage-chat-dev");
  pkg.dsh.profile.bundles = next;
}

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Updated ${pkgPath}`);
console.log(`  - removed dsh-stage-chat`);
console.log(`  - added dsh-stage-chat-dev → ${linkSpec}`);

if (existsSync(patchPath)) {
  const patchBackup = `${patchPath}.bak-before-stage-chat-dev`;
  if (!existsSync(patchBackup)) copyFileSync(patchPath, patchBackup);
  let patch = readFileSync(patchPath, "utf8");
  patch = dedupeFocusFibers(patch);
  // Accept either release or already-dev names; never stack another -dev.
  patch = retargetFocusName(patch, "dsh-stage-chat-dev-dev", "dsh-stage-chat-dev");
  patch = retargetFocusName(patch, "dsh-stage-chat", "dsh-stage-chat-dev");
  writeFileSync(patchPath, patch);
  console.log(`Retargeted cordis fiber focus → name: dsh-stage-chat-dev`);
}

runProfileInstall(profileDir);

console.log(`
Done. Next:
  1. Fully quit DeepSeek Harness (not only close the window).
  2. Reopen it.
  3. Confirm 内置插件 / bundles shows dsh-stage-chat-dev; GitHub dsh-stage-chat is gone.
  4. After code edits: npm run build  →  reload the window.

Restore GitHub package later with: npm run uninstall:dev
`);
