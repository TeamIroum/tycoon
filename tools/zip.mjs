/** 무압축(store) ZIP. 파일명은 UTF-8 표시를 켠다(한글 이름이 다른 PC에서 깨지지 않게). 외부 패키지 없음. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function makeZip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(f.data.length, 18); lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    local.push(lh, name, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(f.data.length, 20); ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

/** makeZip이 만든 무압축 ZIP을 다시 읽는다(제출본 자체 검증용). 중앙 디렉터리·CRC가 맞지 않으면 예외. */
export function readZip(zip) {
  const end = zip.length - 22;
  if (end < 0 || zip.readUInt32LE(end) !== 0x06054b50) throw new Error('ZIP 끝 레코드가 없습니다');
  const count = zip.readUInt16LE(end + 10);
  let p = zip.readUInt32LE(end + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP 중앙 디렉터리가 손상되었습니다');
    const method = zip.readUInt16LE(p + 10), crc = zip.readUInt32LE(p + 16), size = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28), extra = zip.readUInt16LE(p + 30), comment = zip.readUInt16LE(p + 32);
    const offset = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLength);
    if (method !== 0) throw new Error(`무압축이 아닌 항목: ${name}`);
    if (zip.readUInt32LE(offset) !== 0x04034b50) throw new Error(`로컬 헤더가 없습니다: ${name}`);
    const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const data = zip.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error(`CRC 불일치: ${name}`);
    files.push({ name, data });
    p += 46 + nameLength + extra + comment;
  }
  return files;
}
