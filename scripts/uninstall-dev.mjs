#!/usr/bin/env node
/** Restore desktop profile to github:AlienwareBoy/dsh-stage-chat. */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const profile = join(homedir(), ".dsh/profiles/desktop");
const pkgPath = join(profile, "package.json");
const patchPath = join(profile, "cordis.patch.yml");
const githubSpec = "github:AlienwareBoy/dsh-stage-chat";

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(pkgPath)) {
  console.error(`Desktop profile not found: ${pkgPath}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.dependencies ??= {};
delete pkg.dependencies["dsh-stage-chat-dev"];
pkg.dependencies["dsh-stage-chat"] = githubSpec;

const bundles = pkg.dsh?.profile?.bundles;
if (Array.isArray(bundles)) {
  const next = bundles.filter(name => name !== "dsh-stage-chat-dev");
  if (!next.includes("dsh-stage-chat")) next.push("dsh-stage-chat");
  pkg.dsh.profile.bundles = next;
}
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

if (existsSync(patchPath)) {
  let patch = readFileSync(patchPath, "utf8");
  patch = patch.replace(
    /(id:\s*focus\n\s*name:\s*)dsh-stage-chat-dev\b/,
    "$1dsh-stage-chat"
  );
  writeFileSync(patchPath, patch);
}

const which = spawnSync("which", ["pnpm"], { encoding: "utf8" });
const pnpmBin = which.status === 0 ? which.stdout.trim() : null;
if (!pnpmBin) {
  console.error("pnpm not on PATH; package.json restored, run install inside the app.");
  process.exit(1);
}
run(pnpmBin, ["install", "--ignore-scripts", "--registry=https://registry.npmjs.org"], profile);
console.log("Restored github:AlienwareBoy/dsh-stage-chat. Quit and reopen DeepSeek Harness.");
