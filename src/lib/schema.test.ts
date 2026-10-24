import { describe, expect, it } from "vitest";
import { duplicateItem, exeTarget, newItem, newPreset, normalizeUrl, urlTarget } from "./factory";
import { presetIssues } from "./schema";

describe("presetIssues", () => {
  it("accepts a valid preset", () => {
    const preset = newPreset("Morning");
    preset.items.push(newItem(urlTarget("https://youtube.com")));
    preset.items.push(newItem(exeTarget("C:\\Apps\\discord.exe", ["--start-minimized"])));
    expect(presetIssues(preset)).toEqual([]);
  });

  it("flags dangerous urls and scripts on the right item", () => {
    const preset = newPreset("Bad");
    const url = newItem(urlTarget("javascript:alert(1)"));
    const script = newItem(exeTarget("C:\\x\\run.bat"));
    const file = newItem({ type: "path", path: "C:\\x\\evil.cmd" });
    preset.items.push(url, script, file);
    const issues = presetIssues(preset);
    expect(issues.map((issue) => issue.itemId)).toEqual([url.id, script.id, file.id]);
    expect(issues.map((issue) => issue.message)).toEqual([
      "errors.url",
      "errors.exe",
      "errors.blockedFile",
    ]);
  });

  it("requires a name and absolute paths", () => {
    const preset = newPreset("   ");
    preset.items.push(newItem(exeTarget("relative\\app.exe")));
    const messages = presetIssues(preset).map((issue) => issue.message);
    expect(messages).toContain("errors.nameRequired");
    expect(messages).toContain("errors.pathAbsolute");
  });
});

describe("normalizeUrl", () => {
  it("adds https when the scheme is missing", () => {
    expect(normalizeUrl("youtube.com")).toBe("https://youtube.com");
    expect(normalizeUrl("http://a.com")).toBe("http://a.com");
    expect(normalizeUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
});

describe("duplicateItem", () => {
  it("copies an item deeply with a new id", () => {
    const original = newItem(exeTarget(String.raw`C:\Apps\a.exe`, ["--x"]));
    const copy = duplicateItem(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.target).toEqual(original.target);
    if (copy.target.type === "exe") copy.target.args.push("--y");
    expect(original.target.type === "exe" && original.target.args).toEqual(["--x"]);
  });
});
