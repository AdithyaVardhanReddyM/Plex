/**
 * Reads the two EXIF facts the proof engine uses from a JPEG: when the photo
 * was taken (DateTimeOriginal) and where (GPS). Anything else, or any other
 * format, returns {}; the upload page then falls back to the file time and
 * the browser's location.
 */
export interface PhotoMeta {
  capturedAt?: number;
  lat?: number;
  lng?: number;
}

export async function readPhotoMeta(file: File): Promise<PhotoMeta> {
  try {
    if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return {};
    const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (view.getUint16(0) !== 0xffd8) return {};
    let off = 2;
    while (off + 4 < view.byteLength) {
      const marker = view.getUint16(off);
      const size = view.getUint16(off + 2);
      if (marker === 0xffe1 && view.getUint32(off + 4) === 0x45786966) return parseTiff(view, off + 10);
      if ((marker & 0xff00) !== 0xff00) break;
      off += 2 + size;
    }
  } catch {}
  return {};
}

function parseTiff(v: DataView, start: number): PhotoMeta {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(start + o, le);
  const u32 = (o: number) => v.getUint32(start + o, le);
  const entries = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; valueOff: number }>();
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), valueOff: e + 8 });
    }
    return out;
  };
  const ascii = (e: { count: number; valueOff: number }) => {
    const at = e.count > 4 ? u32(e.valueOff) : e.valueOff;
    let s = "";
    for (let i = 0; i < e.count - 1; i++) s += String.fromCharCode(v.getUint8(start + at + i));
    return s;
  };
  const rationals = (e: { count: number; valueOff: number }) => {
    const at = u32(e.valueOff);
    return Array.from({ length: e.count }, (_, i) => u32(at + i * 8) / (u32(at + i * 8 + 4) || 1));
  };

  const meta: PhotoMeta = {};
  const ifd0 = entries(u32(4));
  const exifPtr = ifd0.get(0x8769);
  if (exifPtr) {
    const exif = entries(u32(exifPtr.valueOff));
    const dt = exif.get(0x9003) ?? exif.get(0x9004);
    const m = dt && ascii(dt).match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    // EXIF time has no zone; read it as the device's local time.
    if (m) meta.capturedAt = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!).getTime();
  }
  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr) {
    const gps = entries(u32(gpsPtr.valueOff));
    const latRef = gps.get(1), lat = gps.get(2), lngRef = gps.get(3), lng = gps.get(4);
    if (lat && lng) {
      const dms = (r: number[]) => r[0]! + r[1]! / 60 + r[2]! / 3600;
      const sLat = latRef ? String.fromCharCode(v.getUint8(start + latRef.valueOff)) : "N";
      const sLng = lngRef ? String.fromCharCode(v.getUint8(start + lngRef.valueOff)) : "E";
      meta.lat = dms(rationals(lat)) * (sLat === "S" ? -1 : 1);
      meta.lng = dms(rationals(lng)) * (sLng === "W" ? -1 : 1);
    }
  }
  return meta;
}
