/**
 * Shared helpers for desktop-profile install/uninstall.
 * Prefer Harness's bundled pnpm (v11) so public-hoist-pattern matches the
 * modules directory the app created; fall back to PATH pnpm.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const profileDir = join(homedir(), ".dsh/profiles/desktop");

export function resolvePnpm() {
  const bundled = join(
    homedir(),
    ".dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs"
  );
  if (existsSync(bundled)) return { cmd: process.execPath, argsPrefix: [bundled], label: bundled };
  const which = spawnSync("which", ["pnpm"], { encoding: "utf8" });
  if (which.status === 0) {
    const bin = which.stdout.trim();
    return { cmd: bin, argsPrefix: [], label: bin };
  }
  return null;
}

/** Rewrite fiber package name under id: focus without stacking -dev. */
export function retargetFocusName(patch, fromName, toName) {
  const re = new RegExp(
    `(id:\\s*focus\\n\\s*name:\\s*)${fromName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
  );
  if (re.test(patch)) return patch.replace(re, `$1${toName}`);
  // Already on target, or unexpected name — force the focus name line once.
  return patch.replace(/(id:\s*focus\n\s*name:\s*)\S+/, `$1${toName}`);
}

/** Drop duplicate top-level `- id: focus` blocks; keep the last one. */
export function dedupeFocusFibers(patch) {
  const re = /^- id: (\S+)/gm;
  const hits = [];
  let m;
  while ((m = re.exec(patch))) hits.push({ start: m.index, id: m[1] });
  const focus = hits.filter(h => h.id === "focus");
  if (focus.length <= 1) return patch;
  // Keep the last focus block; remove earlier ones (from the end so offsets stay valid).
  let out = patch;
  for (let i = focus.length - 2; i >= 0; i--) {
    const start = focus[i].start;
    const next = hits.find(h => h.start > start);
    const end = next ? next.start : out.length;
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

export function runProfileInstall(profile = profileDir) {
  const pnpm = resolvePnpm();
  if (!pnpm) {
    console.error("pnpm not found. Profile package.json is updated; install inside Harness or:");
    console.error(`  cd ${profile} && pnpm install --no-frozen-lockfile`);
    process.exit(1);
  }
  console.log(`Using pnpm: ${pnpm.label}`);
  const args = [
    ...pnpm.argsPrefix,
    "install",
    "--no-frozen-lockfile",
    "--ignore-scripts",
    "--config.confirm-modules-purge=false",
    "--registry=https://registry.npmjs.org"
  ];
  const result = spawnSync(pnpm.cmd, args, {
    cwd: profile,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      CI: "1",
      PNPM_CONFIRM: "false"
    }
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
