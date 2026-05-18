import { describe, expect, it } from "vite-plus/test";

import { encodeIcoFromPngs } from "./ico.ts";

describe("ICO encoding", () => {
  it("writes an ICO header, directory entries, and PNG payload offsets", () => {
    const png16 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 16]);
    const png32 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 32, 33]);
    const ico = encodeIcoFromPngs([
      { height: 16, png: png16, width: 16 },
      { height: 32, png: png32, width: 32 },
    ]);
    const view = new DataView(ico.buffer);

    expect([...ico.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(view.getUint16(4, true)).toBe(2);
    expect(ico[6]).toBe(16);
    expect(ico[7]).toBe(16);
    expect(view.getUint32(14, true)).toBe(png16.byteLength);
    expect(view.getUint32(18, true)).toBe(38);
    expect(ico[22]).toBe(32);
    expect(ico[23]).toBe(32);
    expect(view.getUint32(30, true)).toBe(png32.byteLength);
    expect(view.getUint32(34, true)).toBe(38 + png16.byteLength);
    expect([...ico.subarray(38, 38 + png16.byteLength)]).toEqual([...png16]);
    expect([...ico.subarray(38 + png16.byteLength)]).toEqual([...png32]);
  });

  it("encodes 256px dimensions as zero per ICO convention", () => {
    const ico = encodeIcoFromPngs([{ height: 256, png: new Uint8Array([1]), width: 256 }]);

    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
  });

  it("rejects empty entries and unsupported dimensions", () => {
    expect(() => encodeIcoFromPngs([])).toThrow("at least one PNG entry");
    expect(() => encodeIcoFromPngs([{ height: 16, png: new Uint8Array([]), width: 16 }])).toThrow(
      "must not be empty",
    );
    expect(() => encodeIcoFromPngs([{ height: 16, png: new Uint8Array([1]), width: 257 }])).toThrow(
      "width",
    );
  });
});
