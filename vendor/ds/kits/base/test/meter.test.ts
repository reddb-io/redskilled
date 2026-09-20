import { describe, expect, it } from "vitest";
import { Meter, meter as meterAppearance } from "./fixtures/progress-feedback-consumer";
import ProgressFeedbackConsumer from "./fixtures/ProgressFeedbackConsumer.svelte";
import { classes, classesOf, render, rendered } from "./mount";

describe("the Base Meter", () => {
  it("conveys its value through semantics, text, and fill length", () => {
    const element = rendered(render(Meter, { value: 3, max: 5, label: "Cluster capacity" }));
    const indicator = element.querySelector<HTMLElement>("[data-meter-indicator]")!;

    expect(element.getAttribute("role")).toBe("meter");
    expect(element.getAttribute("aria-valuemin")).toBe("0");
    expect(element.getAttribute("aria-valuemax")).toBe("5");
    expect(element.getAttribute("aria-valuenow")).toBe("3");
    expect(element.getAttribute("aria-valuetext")).toBe("60%");
    expect(element.textContent).toContain("Cluster capacity");
    expect(element.textContent).toContain("60%");
    expect(indicator.style.width).toBe("60%");
  });

  it("clamps what it draws and announces to the declared range", () => {
    const element = rendered(
      render(Meter, {
        value: -2,
        min: 1,
        max: 4,
        formatValue: (value: number) => `${value} replicas`,
      }),
    );

    expect(element.getAttribute("aria-valuenow")).toBe("1");
    expect(element.getAttribute("aria-valuetext")).toBe("1 replicas");
    expect(element.querySelector<HTMLElement>("[data-meter-indicator]")!.style.width).toBe("0%");
  });

  it("wears token-backed appearance and inherits every active axis", () => {
    const root = render(ProgressFeedbackConsumer);
    const scope = root.querySelector<HTMLElement>("[data-progress-feedback-scope]")!;
    const element = scope.querySelector<HTMLElement>("[data-meter]")!;

    expect(classes(element)).toEqual(classesOf(meterAppearance().root()));
    expect(scope.getAttribute("data-theme")).toBe("marketing");
    expect(scope.getAttribute("data-color-scheme")).toBe("dark");
    expect(scope.getAttribute("data-density")).toBe("compact");
    expect(element.hasAttribute("data-theme")).toBe(false);
    expect(element.hasAttribute("data-color-scheme")).toBe(false);
    expect(element.hasAttribute("data-density")).toBe(false);
  });
});
