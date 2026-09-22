import { describe, expect, it } from "vitest";
import { startRedskilledSystemTray } from "../src/system-tray.js";

describe("Redskilled system tray", () => {
  it("opens the diagnostic log without dispatching quit and reports opener failure", async () => {
    let click: (action: { seq_id: number }) => void = () => {};
    let items: { title: string }[] = [];
    let quit = 0;
    const opened: string[] = [];
    const failures: string[] = [];
    const updates: { item: { title: string } }[] = [];
    class FakeSystray {
      constructor(options: { menu: { items: { title: string }[] } }) { items = options.menu.items; }
      onClick(listener: typeof click): void { click = listener; }
      sendAction(action: { item: { title: string } }): void { updates.push(action); }
      async ready(): Promise<void> {}
      kill(): void {}
    }
    const tray = startRedskilledSystemTray({
      version: "4.7.2", state: () => ({ workers: [] }), quit: () => { quit++; },
      platform: "linux", env: { DISPLAY: ":0", XDG_STATE_HOME: "/state with spaces" },
      loadSystray: async () => FakeSystray as never,
      openLog: async (path) => { opened.push(path); throw new Error("test opener refused"); },
      log: (message) => failures.push(message),
    });
    expect(await tray.ready).toBe(true);
    click({ seq_id: items.findIndex((item) => item.title === "Open log") });
    await Promise.resolve();
    expect(opened).toEqual(["/state with spaces/redskilled/logs/daemon.log"]);
    expect(failures).toEqual(["could not open diagnostic log: test opener refused"]);
    expect(updates.at(-1)?.item.title).toBe("Open log — failed");
    expect(quit).toBe(0);
    click({ seq_id: items.findIndex((item) => item.title === "Quit Redskilled") });
    expect(quit).toBe(1);
    await tray.stop();
  });

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
