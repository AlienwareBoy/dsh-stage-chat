#!/usr/bin/env node
/**
 * Point the desktop profile at ./dev (dsh-stage-chat-dev) via pnpm link:,
 * remove the GitHub dsh-stage-chat dependency, keep fiber id `focus` so
 * existing 对话显示 settings stay attached.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const devDir = join(root, "dev");
const profile = join(homedir(), ".dsh/profiles/desktop");
const pkgPath = join(profile, "package.json");
const patchPath = join(profile, "cordis.patch.yml");
const linkSpec = `link:${devDir}`;

function run(cmd, args, cwd, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd, stdio: "inherit", shell: false,
    env: { ...process.env, ...env }
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [join(root, "scripts/build.mjs")], root);

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
  const next = bundles.filter(name => name !== "dsh-stage-chat");
  if (!next.includes("dsh-stage-chat-dev")) next.push("dsh-stage-chat-dev");
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
  // Keep id: focus (settings). Only retarget the package name under that fiber.
  patch = patch.replace(
    /(id:\s*focus\n\s*name:\s*)dsh-stage-chat\b/,
    "$1dsh-stage-chat-dev"
  );
  writeFileSync(patchPath, patch);
  console.log(`Retargeted cordis fiber focus → name: dsh-stage-chat-dev`);
}

const pnpm = [
  "install",
  "--force",
  "--ignore-scripts",
  "--registry=https://registry.npmjs.org"
];
const which = spawnSync("which", ["pnpm"], { encoding: "utf8" });
const pnpmBin = which.status === 0 ? which.stdout.trim() : null;
if (!pnpmBin) {
  console.error("pnpm not on PATH. Profile package.json is updated; run pnpm install inside the app or:");
  console.error(`  cd ${profile} && pnpm install --force`);
  process.exit(1);
}
run(pnpmBin, pnpm, profile, { CI: "1", PNPM_CONFIRM: "false" });

console.log(`
Done. Next:
  1. Fully quit DeepSeek Harness (not only close the window).
  2. Reopen it.
  3. Confirm 内置插件 / bundles shows dsh-stage-chat-dev; GitHub dsh-stage-chat is gone.
  4. After code edits: npm run build  →  reload the window.

Restore GitHub package later with: npm run uninstall:dev
`);
