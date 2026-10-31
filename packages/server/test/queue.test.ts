import { describe, expect, it } from "vitest";
import { JOBS, sendOptions } from "../src/queue";

describe("queue", () => {
  const id = "00000000-0000-4000-8000-000000000000";
  it("never sends an option key set to undefined (pg-boss refuses the whole job)", () => {
    for (const name of Object.values(JOBS)) {
      const opts = sendOptions(name, { videoId: id });
      for (const [k, v] of Object.entries(opts)) expect(v, `${name}.${k}`).not.toBeUndefined();
    }
  });
  it("keeps the longer expiry for the TikTok send, the singleton for the export", () => {
    expect(sendOptions(JOBS.tiktok, { videoId: id })).toMatchObject({ expireInSeconds: 1800 });
    expect("expireInSeconds" in sendOptions(JOBS.cover, { videoId: id })).toBe(false);
    expect(sendOptions(JOBS.render, { videoId: id })).toMatchObject({ singletonKey: id });
  });
});
