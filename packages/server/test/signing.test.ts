import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://test@localhost/test";
  process.env.SESSION_SECRET = "s".repeat(40);
  process.env.MEDIA_SECRET = "m".repeat(40);
});

describe("signed media links", async () => {
  const { signMedia, verifyMedia } = await import("../src/signing");
  const parts = (u: string) => {
    const url = new URL(u, "http://x");
    return [url.pathname.split("/").pop()!, url.searchParams.get("e"), url.searchParams.get("s")] as const;
  };

  it("accepts its own link", () => {
    const [id, e, s] = parts(signMedia("iabc123"));
    expect(verifyMedia(id, e, s)).toBe(true);
  });

  it("refuses another asset, a tampered signature or an expired link", () => {
    const [, e, s] = parts(signMedia("iabc123"));
    expect(verifyMedia("iother", e, s)).toBe(false);
    expect(verifyMedia("iabc123", e, s!.replace(/^./, (c) => (c === "A" ? "B" : "A")))).toBe(false);
    const [id2, e2, s2] = parts(signMedia("iabc123", 60, Date.now() - 3 * 3600_000));
    expect(verifyMedia(id2, e2, s2)).toBe(false);
  });

  it("keeps the same URL within a window, so images are not reloaded on each poll", () => {
    const t = Math.floor(Date.now() / 900_000) * 900_000 + 1000;
    expect(signMedia("iabc123", 3600, t)).toBe(signMedia("iabc123", 3600, t + 5000));
  });

  it("rejects ids that could escape the path", () => {
    expect(() => signMedia("../etc/passwd")).toThrow();
  });
});
