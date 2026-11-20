import type {} from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type { Context, Volatile } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { defaultJson, defaultPrompt, outputPromptOf } from "./config";

export interface Config {
  json: Volatile<string>;
  outputPrompt: Volatile<string>;
}
export const Config = z.object({
  json: z.string().default(defaultJson).volatile(),
  outputPrompt: z.string().default(defaultPrompt).volatile()
});

export function apply(ctx: Context, config: Config): void {
  ctx.inject(["settings"], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  ctx.inject(["systemPrompt"], child => {
    child.effect(() => child.systemPrompt.section({
      name: "dsh-stage-chat-output",
      order: 90,
      text: () => outputPromptOf(config.outputPrompt.get()),
      interpolate: false
    }));
  });
}
