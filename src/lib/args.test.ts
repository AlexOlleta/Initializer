import { describe, expect, it } from "vitest";
import { joinArgs, splitArgs } from "./args";

describe("args", () => {
  it("splits windows command lines", () => {
    expect(splitArgs(String.raw`--a "b c" d\"e "f\\" g`)).toEqual([
      "--a",
      "b c",
      'd"e',
      "f\\",
      "g",
    ]);
    expect(splitArgs("   ")).toEqual([]);
  });

  it("roundtrips through join and split", () => {
    const args = [
      "--plain",
      "with space",
      "",
      'quote"inside',
      String.raw`trailing\\`,
      String.raw`C:\Program Files\App\\`,
      String.raw`back\"quote`,
    ];
    expect(splitArgs(joinArgs(args))).toEqual(args);
  });
});
