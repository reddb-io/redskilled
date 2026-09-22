import { describe, expect, it } from "vitest";
import { startRedskilledSystemTray } from "../src/system-tray.js";

describe("Redskilled system tray", () => {
  it("shows the product name beside the tray icon", async () => {
    let menu: { title?: string; tooltip?: string } | undefined;
    class FakeSystray {
      constructor(options: { menu: { title?: string; tooltip?: string } }) {
        menu = options.menu;
      }
      onClick(): void {}
      sendAction(): void {}
      async ready(): Promise<void> {}
      kill(): void {}
    }

    const tray = startRedskilledSystemTray({
      version: "4.7.1",
      state: () => ({ workers: [] }),
      quit: () => undefined,
      platform: "linux",
      env: { DISPLAY: ":0" },
      loadSystray: async () => FakeSystray as never,
    });

    expect(await tray.ready).toBe(true);
    expect(menu).toMatchObject({ title: "Redskilled", tooltip: "Redskilled 4.7.1" });
    await tray.stop();
  });
});
