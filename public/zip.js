// قارئ بسيط لملفات Word (.docx) و PowerPoint (.pptx) داخل المتصفح بدون أي مكتبات.
(function (root) {
  'use strict';
  async function inflateRaw(u8) {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function readZip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('الملف ليس بصيغة Office صالحة');
    const n = dv.getUint16(e + 10, true);
    let off = dv.getUint32(e + 16, true);
    const files = {};
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
      const nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      const lho = dv.getUint32(off + 42, true);
      const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nlen));
      files[name] = { method, csize, lho };
      off += 46 + nlen + elen + clen;
    }
    async function bytes(name) {
      const f = files[name];
      const nl = dv.getUint16(f.lho + 26, true), el = dv.getUint16(f.lho + 28, true);
      const start = f.lho + 30 + nl + el;
      const data = u8.subarray(start, start + f.csize);
      return f.method === 0 ? data : inflateRaw(data);
    }
    return { names: Object.keys(files), async text(name) { return new TextDecoder().decode(await bytes(name)); } };
  }
  const ent = s => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (m, g) => {
    if (g[0] === '#') return String.fromCodePoint(g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[g.toLowerCase()];
  });
  const tidy = s => ent(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  async function docxText(buf) {
    const z = await readZip(buf);
    if (!z.names.includes('word/document.xml')) throw new Error('لم أجد محتوى Word داخل الملف');
    const xml = await z.text('word/document.xml');
    return tidy(xml.replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, '').replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ''));
  }
  async function pptxText(buf) {
    const z = await readZip(buf);
    const slides = z.names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
    if (!slides.length) throw new Error('لم أجد شرائح داخل الملف');
    const out = [];
    for (let i = 0; i < slides.length; i++) {
      const xml = await z.text(slides[i]);
      out.push(`--- شريحة ${i + 1} ---\n` + tidy(xml.replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '')));
    }
    return out.join('\n\n');
  }
  const api = { readZip, docxText, pptxText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OfficeText = api;
})(typeof window !== 'undefined' ? window : globalThis);
