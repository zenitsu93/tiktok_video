import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { hasChecker, removeChecker } from "../src/background";

const W = 600;
const H = 750;

/** A dark disc (the subject) on a flattened checkerboard, or on another background. */
async function picture(bg: (x: number, y: number) => [number, number, number], jpeg = false) {
  const data = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inDisc = (x - W / 2) ** 2 + (y - H / 2) ** 2 < 180 ** 2;
      const c = inDisc ? [40, 30, 90] : bg(x, y);
      data.set(c, (y * W + x) * 3);
    }
  }
  const img = sharp(data, { raw: { width: W, height: H, channels: 3 } });
  return jpeg ? img.jpeg({ quality: 80 }).toBuffer() : img.png().toBuffer();
}

const checker = (size: number, a = 255, b = 204) => (x: number, y: number): [number, number, number] => {
  const v = (Math.floor(x / size) + Math.floor(y / size)) % 2 ? b : a;
  return [v, v, v];
};

describe("checkerboard backgrounds", () => {
  it("finds the classic white and grey squares, even through JPEG", async () => {
    expect(await hasChecker(await picture(checker(16)))).toBe(true);
    expect(await hasChecker(await picture(checker(10, 255, 230), true))).toBe(true);
  });

  it("leaves real backgrounds alone", async () => {
    expect(await hasChecker(await picture(() => [255, 255, 255]))).toBe(false);
    expect(await hasChecker(await picture((x, y) => [200 + (x % 50), 180, 150]))).toBe(false);
    const grad = (x: number, y: number): [number, number, number] => [180 + Math.round((y / H) * 70), 180 + Math.round((y / H) * 70), 180 + Math.round((y / H) * 70)];
    expect(await hasChecker(await picture(grad))).toBe(false);
    // wide stripes, not squares
    expect(await hasChecker(await picture((x) => (Math.floor(x / 150) % 2 ? [255, 255, 255] : [210, 210, 210])))).toBe(false);
  });

  it("cuts the subject out and crops to it", async () => {
    const cut = await removeChecker(await picture(checker(16)));
    expect(cut).not.toBeNull();
    const meta = await sharp(cut!).metadata();
    expect(meta.hasAlpha).toBe(true);
    // the disc is 360 px wide, with a small margin
    expect(meta.width).toBeGreaterThan(360);
    expect(meta.width).toBeLessThan(400);
    const { data, info } = await sharp(cut!).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(at(0, 0)).toBe(0);
    expect(at(Math.floor(info.width / 2), Math.floor(info.height / 2))).toBe(255);
  });
});
