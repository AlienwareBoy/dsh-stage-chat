#!/usr/bin/env node
/** Restore desktop profile to github:AlienwareBoy/dsh-stage-chat. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  profileDir,
  retargetFocusName,
  dedupeFocusFibers,
  runProfileInstall
} from "./pnpm-profile.mjs";

const pkgPath = join(profileDir, "package.json");
const patchPath = join(profileDir, "cordis.patch.yml");
const githubSpec = "github:AlienwareBoy/dsh-stage-chat";

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
  const next = bundles.filter(name => name !== "dsh-stage-chat-dev" && name !== "dsh-stage-chat");
  next.push("dsh-stage-chat");
  pkg.dsh.profile.bundles = next;
}
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

if (existsSync(patchPath)) {
  let patch = readFileSync(patchPath, "utf8");
  patch = dedupeFocusFibers(patch);
  patch = retargetFocusName(patch, "dsh-stage-chat-dev-dev", "dsh-stage-chat");
  patch = retargetFocusName(patch, "dsh-stage-chat-dev", "dsh-stage-chat");
  writeFileSync(patchPath, patch);
}

runProfileInstall(profileDir);
console.log("Restored github:AlienwareBoy/dsh-stage-chat. Quit and reopen DeepSeek Harness.");
