import { describe, it, expect } from "vitest";

describe("extension agent planAction", () => {
  it("blocks risky commands", async () => {
    const { planAction } = await import("../routes/extension.js");
    const result = planAction("submit my quiz", { url: "", title: "", elements: [] });
    expect(result.blocked).toBe(true);
  });

  it("plans scroll down action", async () => {
    const { planAction } = await import("../routes/extension.js");
    const result = planAction("scroll down", { url: "", title: "", elements: [] });
    expect(result.action).toEqual({ type: "scroll", direction: "down" });
  });

  it("plans scroll up action", async () => {
    const { planAction } = await import("../routes/extension.js");
    const result = planAction("scroll up", { url: "", title: "", elements: [] });
    expect(result.action).toEqual({ type: "scroll", direction: "up" });
  });

  it("plans navigate to assignments", async () => {
    const { planAction } = await import("../routes/extension.js");
    const result = planAction("go to assignments", {
      url: "",
      title: "",
      elements: [{ id: "el1", tag: "a", text: "Assignments", ariaLabel: "Assignments" }],
    });
    expect(result.action?.type).toBe("click");
  });

  it("responds with fallback when no match", async () => {
    const { planAction } = await import("../routes/extension.js");
    const result = planAction("zzz aaa", { url: "", title: "", elements: [] });
    expect(result.action).toBeUndefined();
    expect(result.response).toContain("could not find");
  });
});
