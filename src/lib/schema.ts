import { z } from "zod";
import type { Preset } from "./bindings/Preset";

const MAX_DELAY_MS = 120_000;
const BLOCKED_OPEN_EXTENSIONS = new Set([
  "exe",
  "com",
  "bat",
  "cmd",
  "ps1",
  "psm1",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "msi",
  "msp",
  "scr",
  "pif",
  "hta",
  "cpl",
  "reg",
  "lnk",
  "url",
  "jar",
  "appref-ms",
  "application",
  "gadget",
  "inf",
  "msc",
  "scf",
  "ws",
]);

const ABSOLUTE_PATH = /^(?:[a-zA-Z]:\\|\\\\[^\\]+\\[^\\]+)/;
const INVALID_PATH_CHARS = /[<>"|?*\p{Cc}]/u;

const absolutePath = z
  .string()
  .max(1024)
  .refine((value) => ABSOLUTE_PATH.test(value), "errors.pathAbsolute")
  .refine((value) => !INVALID_PATH_CHARS.test(value), "errors.pathChars");

export function extensionOf(path: string): string {
  return /\.([^.\\/]+)[. ]*$/.exec(path)?.[1]?.toLowerCase() ?? "";
}

const exePath = absolutePath.refine((value) => extensionOf(value) === "exe", "errors.exe");

const webUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") && url.host.length > 0;
    } catch {
      return false;
    }
  }, "errors.url");

const delay = z.number().int().min(0).max(MAX_DELAY_MS, "errors.delay");

const browserRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("default") }),
  z.object({ kind: z.literal("installed"), id: z.string().min(1) }),
  z.object({
    kind: z.literal("custom"),
    exePath,
    family: z.enum(["chromium", "firefox"]),
  }),
]);

const target = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("exe"),
    path: exePath,
    args: z.array(z.string().max(1024)).max(32, "errors.args"),
    workingDir: absolutePath.nullable(),
  }),
  z.object({
    type: z.literal("app"),
    aumid: z.string().min(1).max(512),
    displayName: z.string().max(1024),
    processName: z
      .string()
      .regex(/^[^\\/:]+\.exe$/i, "errors.processName")
      .nullable(),
  }),
  z.object({
    type: z.literal("url"),
    url: webUrl,
    browser: browserRef,
    profile: z.string().max(512).nullable(),
    private: z.boolean(),
    args: z.array(z.string().max(1024)).max(32, "errors.args"),
  }),
  z.object({
    type: z.literal("path"),
    path: absolutePath.refine(
      (value) => !BLOCKED_OPEN_EXTENSIONS.has(extensionOf(value)),
      "errors.blockedFile",
    ),
  }),
]);

const item = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
  skipIfRunning: z.boolean(),
  windowState: z.enum(["normal", "minimized", "maximized"]),
  delayAfterMs: delay.nullable(),
  target,
});

export const presetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "errors.nameRequired").max(80, "errors.nameLong"),
  icon: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("glyph"),
      glyph: z.string().regex(/^[a-z0-9-]{1,48}$/),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }),
    z.object({ kind: z.literal("image") }),
  ]),
  tabMode: z.enum(["newWindow", "existingWindow"]),
  defaultDelayMs: delay,
  items: z.array(item).max(200, "errors.tooManyItems"),
  shortcuts: z.array(z.string()),
});

export type PresetIssue = { itemId: string | null; message: string };

export function presetIssues(preset: Preset): PresetIssue[] {
  const result = presetSchema.safeParse(preset);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const [first, index] = issue.path;
    const itemId =
      first === "items" && typeof index === "number" ? (preset.items[index]?.id ?? null) : null;
    const message = issue.message.startsWith("errors.") ? issue.message : "errors.generic";
    return { itemId, message };
  });
}
