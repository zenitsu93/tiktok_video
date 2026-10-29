import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://test@localhost/test";
  process.env.SESSION_SECRET = "s".repeat(40);
  process.env.MEDIA_SECRET = "m".repeat(40);
  process.env.APP_URL = "https://regie.example";
  process.env.TIKTOK_CLIENT_KEY = "ck";
  process.env.TIKTOK_CLIENT_SECRET = "cs";
});

describe("tiktok", async () => {
  const { seal, unseal, chunkPlan, tiktokAuthorizeUrl } = await import("../src/tiktok");
  const MB = 1024 * 1024;

  it("seals tokens so the database alone cannot read them", () => {
    const s = seal("act.secret-token");
    expect(s).not.toContain("secret");
    expect(seal("act.secret-token")).not.toBe(s);
    expect(unseal(s)).toBe("act.secret-token");
  });

  it("refuses a sealed token that was tampered with", () => {
    const s = Buffer.from(seal("abc"), "base64url");
    s[s.length - 1]! ^= 1;
    expect(() => unseal(s.toString("base64url"))).toThrow();
  });

  it("follows TikTok's chunk rules", () => {
    expect(chunkPlan(3 * MB)).toEqual({ chunkSize: 3 * MB, count: 1 });
    expect(chunkPlan(64 * MB)).toEqual({ chunkSize: 64 * MB, count: 1 });
    for (const size of [64 * MB + 1, 100 * MB, 1000 * MB + 123]) {
      const { chunkSize, count } = chunkPlan(size);
      const last = size - chunkSize * (count - 1);
      expect(chunkSize).toBeGreaterThanOrEqual(5 * MB);
      expect(chunkSize).toBeLessThanOrEqual(64 * MB);
      expect(last).toBeLessThanOrEqual(128 * MB);
      expect(last).toBeGreaterThanOrEqual(chunkSize);
    }
  });

  it("asks only for the inbox upload, with the registered callback", () => {
    const u = new URL(tiktokAuthorizeUrl("st"));
    expect(u.origin + u.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(u.searchParams.get("scope")).toBe("user.info.basic,video.upload");
    expect(u.searchParams.get("redirect_uri")).toBe("https://regie.example/auth/tiktok/callback");
    expect(u.searchParams.get("response_type")).toBe("code");
  });
});
