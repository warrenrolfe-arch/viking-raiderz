import { describe, expect, it } from "vitest";
import { BOARD_THEMES, resolveBoardTheme } from "../src/boardThemes";

describe("board graphics themes", () => {
  it("uses the completed storybook graphics as the stable fallback", () => {
    expect(resolveBoardTheme(undefined).id).toBe("new-graphics");
    expect(resolveBoardTheme("unknown-theme").id).toBe("new-graphics");
  });

  it("provides an isolated storybook graphics theme", () => {
    const prototype = resolveBoardTheme("prototype");
    const storybook = resolveBoardTheme("new-graphics");

    expect(BOARD_THEMES.map((theme) => theme.id)).toEqual(["prototype", "new-graphics"]);
    expect(prototype.terrainStyle).toBe("prototype");
    expect(storybook.terrainStyle).toBe("storybook");
    expect(storybook.palette).not.toEqual(prototype.palette);
    expect(storybook.palette.waterFoam).not.toBe(prototype.palette.waterFoam);
  });
});
