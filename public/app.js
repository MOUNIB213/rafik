(() => {
'use strict';
const { S, tune, step, clamp, settled, after } = Motion;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ممتلئ */ } },
};
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  clip: '<path d="M21 11.5 12.7 19.8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
  send: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor" stroke="none"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="3"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="M20 16l-5-5-8 8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  gear: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  down: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
};
const ico = n => `<svg viewBox="0 0 24 24">${P[n]}</svg>`;

// ================= حالة التطبيق =================
let cfg = { providers: [] };
let convs = store.get('wc.convs', []);
let curId = store.get('wc.cur', null);
let sel = store.get('wc.sel', null);
let settings = store.get('wc.settings', { system: '', temp: null });
let authRequired = false, code = store.get('wc.code', '');
let streaming = false, abortCtl = null;
let pending = [];            // مرفقات الرسالة القادمة
let mode = null;
const fileStore = new Map(); // محتوى الملفات (في الذاكرة فقط، لا يُحفظ)
const MODES = {
  brief: ['ملخص موجز', 'لخّص المحتوى تلخيصًا موجزًا: فقرة أو فقرتان ثم من 3 إلى 5 نقاط رئيسية.'],
  detailed: ['ملخص مفصّل', 'أنتج ملخصًا مفصّلًا ومنظّمًا بعناوين: نظرة عامة، المحاور الرئيسية، التفاصيل المهمة، الأرقام والتواريخ والأسماء، ثم الخلاصة.'],
  points: ['نقاط رئيسية', 'استخرج أهم النقاط على شكل قائمة نقطية مرتبة حسب الأهمية، كل نقطة في سطر أو سطرين.'],
  qa: ['أسئلة وأجوبة', 'حوّل المحتوى إلى أسئلة وأجوبة دراسية (8 إلى 12 سؤالًا) تغطي أهم ما فيه.'],
};
const save = () => { store.set('wc.convs', convs.slice(0, 80)); store.set('wc.cur', curId); };
const current = () => convs.find(c => c.id === curId) || null;
const prov = () => cfg.providers.find(p => p.id === sel?.provider);
const toast = msg => {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toasts').appendChild(el); popIn(el);
  after(2.8, () => { el.style.transition = 'opacity .25s'; el.style.opacity = 0; setTimeout(() => el.remove(), 260); });
};

// ================= الحركة (Motion Studies) =================
const ins = [];
function popIn(el, delay = 0) { const s = S(0, 260, 24); s.t = 1; el.style.opacity = 0; ins.push({ el, s, d: delay }); }
const presses = new Set();
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-press]'); if (!el) return;
  if (!el._ps) el._ps = S(1, 700, 28);
  tune(el._ps, 700, 28); el._ps.t = .9; presses.add(el);
});
const release = () => presses.forEach(el => { tune(el._ps, 300, 14); el._ps.t = 1; });
document.addEventListener('pointerup', release); document.addEventListener('pointercancel', release);
Motion.register({
  frame(dt) {
    for (const o of ins) { if (o.d > 0) o.d -= dt; else step(o.s, dt); }
    presses.forEach(el => step(el._ps, dt));
  },
  render() {
    for (let i = ins.length - 1; i >= 0; i--) {
      const o = ins[i], x = o.s.x;
      if (o.d > 0) continue;
      if (settled(o.s)) { o.el.style.opacity = ''; o.el.style.transform = ''; ins.splice(i, 1); continue; }
      o.el.style.opacity = clamp(x * 1.6, 0, 1).toFixed(3);
      o.el.style.transform = `translateY(${((1 - x) * 14).toFixed(2)}px)`;
    }
    presses.forEach(el => { el.style.scale = el._ps.x.toFixed(4); if (settled(el._ps) && el._ps.t === 1) { el.style.scale = ''; presses.delete(el); } });
  },
});

// مظلة تتمدد بين العناصر (Side Nav)
function Stretch(box, hl, selector) {
  const T = S(0, 190, 19), B = S(0, 190, 19), O = S(0, 420, 32); let has = false;
  const go = item => {
    const t = item.offsetTop, b = t + item.offsetHeight;
    if (!has) { T.x = T.t = t; B.x = B.t = b; has = true; }
    else { const down = t > T.t; tune(down ? T : B, 190, 19); tune(down ? B : T, 560, 34); }
    T.t = t; B.t = b; O.t = 1;
  };
  box.addEventListener('pointerover', e => { const it = e.target.closest(selector); if (it && box.contains(it)) go(it); });
  box.addEventListener('pointerleave', () => { O.t = 0; });
  let prev = '';
  Motion.register({
    frame(dt) { step(T, dt); step(B, dt); step(O, dt); },
    render() {
      const k = `${T.x.toFixed(1)}|${B.x.toFixed(1)}|${O.x.toFixed(2)}`; if (k === prev) return; prev = k;
      hl.style.opacity = clamp(O.x, 0, 1).toFixed(3);
      hl.style.transform = `translateY(${T.x.toFixed(1)}px)`;
      hl.style.height = Math.max(0, B.x - T.x).toFixed(1) + 'px';
    },
  });
}

// عناصر تُفتح وتُغلق بنابض (قائمة النماذج، النوافذ، لوحة الملفات، الشريط الجانبي)
function Springy(onRender, k = 360, c = 24) {
  const s = S(0, k, c);
  Motion.register({ frame(dt) { step(s, dt); }, render() { onRender(s.x, s); } });
  return s;
}

// ================= Markdown (آمن) =================
function inline(s) {
  const keep = [];
  s = s.replace(/`([^`\n]+)`/g, (m, c) => { keep.push(`<code>${c}</code>`); return `\u0002${keep.length - 1}\u0002`; });
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s.replace(/\u0002(\d+)\u0002/g, (m, i) => keep[i]);
}
function md(src) {
  const codes = [];
  src = String(src).replace(/```[^\n`]*\n?([\s\S]*?)(```|$)/g, (m, code) => { codes.push(`<pre dir="ltr"><code>${esc(code.replace(/\n$/, ''))}</code></pre>`); return `\n\u0001${codes.length - 1}\u0001\n`; });
  const L = esc(src).split('\n');
  const isBullet = l => /^\s*[-*+•]\s+/.test(l), isNum = l => /^\s*\d+[.)]\s+/.test(l);
  const isTableSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '');
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const blockStart = (l, nx) => /^\u0001\d+\u0001$/.test(l) || /^#{1,6}\s/.test(l) || isBullet(l) || isNum(l) || /^\s*&gt;/.test(l) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || (l.includes('|') && isTableSep(nx));
  let h = '', i = 0, m;
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    if ((m = l.match(/^\u0001(\d+)\u0001$/))) { h += codes[m[1]]; i++; continue; }
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { h += `<h${m[1].length} dir="auto">${inline(m[2])}</h${m[1].length}>`; i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { h += '<hr>'; i++; continue; }
    if (/^\s*&gt;/.test(l)) {
      const q = []; while (i < L.length && /^\s*&gt;/.test(L[i])) q.push(L[i++].replace(/^\s*&gt;\s?/, ''));
      h += `<blockquote dir="auto">${q.map(inline).join('<br>')}</blockquote>`; continue;
    }
    if (l.includes('|') && isTableSep(L[i + 1])) {
      const head = cells(l); i += 2; const rows = [];
      while (i < L.length && L[i].includes('|') && L[i].trim()) rows.push(cells(L[i++]));
      h += `<div class="tw"><table dir="auto"><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, k) => `<td>${inline(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; continue;
    }
    if (isBullet(l) || isNum(l)) {
      const ord = isNum(l), items = [];
      while (i < L.length && (isBullet(L[i]) || isNum(L[i]))) {
        const t = L[i], ind = Math.floor((t.match(/^\s*/)[0].length) / 2);
        items.push(`<li style="margin-inline-start:${ind * 18}px">${inline(t.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, ''))}</li>`); i++;
      }
      h += `<${ord ? 'ol' : 'ul'} dir="auto">${items.join('')}</${ord ? 'ol' : 'ul'}>`; continue;
    }
    const para = [l]; i++;
    while (i < L.length && L[i].trim() && !blockStart(L[i], L[i + 1])) para.push(L[i++]);
    h += `<p dir="auto">${para.map(inline).join('<br>')}</p>`;
  }
  return h;
}

// ================= تصدير PDF (طباعة → حفظ كـ PDF؛ يدعم العربية بالكامل) =================
function exportPDF(title, text, sub) {
  const doc = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:16mm 15mm}
*{box-sizing:border-box}
body{font-family:Inter,"IBM Plex Sans Arabic",Arial,sans-serif;color:#17181a;font-size:12.5pt;line-height:1.9;margin:0}
header{border-bottom:2px solid #17181a;padding-bottom:10px;margin-bottom:18px}
header h1{font-size:19pt;margin:0 0 4px;line-height:1.5}
header div{color:#6f6e68;font-size:10pt}
h1,h2,h3,h4{line-height:1.5;margin:18px 0 6px;page-break-after:avoid}
h1{font-size:17pt}h2{font-size:15pt}h3{font-size:13.5pt}h4{font-size:12.5pt}
p{margin:0 0 9px}ul,ol{margin:0 0 10px;padding-inline-start:24px}li{margin-bottom:3px}
code{font-family:Consolas,monospace;font-size:.9em;background:#f0efed;padding:1px 5px;border-radius:4px;direction:ltr;unicode-bidi:isolate}
pre{background:#f4f3f1;padding:10px 12px;border-radius:8px;direction:ltr;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;page-break-inside:avoid}
pre code{background:none;padding:0}
blockquote{margin:0 0 10px;padding:6px 14px;background:#f4f3f1;border-radius:8px}
table{border-collapse:collapse;width:100%;margin:0 0 12px;font-size:11pt;page-break-inside:avoid}
th,td{border:1px solid #cfcdc8;padding:6px 9px;text-align:start;vertical-align:top}
th{background:#efeeeb}
hr{border:0;border-top:1px solid #cfcdc8;margin:14px 0}
a{color:#17181a}
.tw{overflow:visible}
footer{margin-top:22px;color:#85847e;font-size:9pt;text-align:center}
</style></head><body><header><h1 dir="auto">${esc(title)}</h1><div>${esc(sub)}</div></header><main>${md(text)}</main><footer>أُنشئ بواسطة رفيق</footer></body></html>`;
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden';
  f.srcdoc = doc; document.body.appendChild(f);
  f.onload = async () => {
    const w = f.contentWindow;
    try { await Promise.race([w.document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch { /* تجاهل */ }
    w.focus(); w.print();
    setTimeout(() => f.remove(), 60000);
  };
  toast('في نافذة الطباعة اختر «حفظ كـ PDF»');
}
const dateStr = d => new Date(d).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });

// ================= واجهة برمجة الخادم =================
const api = (path, opts = {}) => fetch(path, { ...opts, headers: { ...(opts.headers || {}), 'x-access-code': code } });

// ================= رسم الواجهة =================
const msgsEl = $('#msgs'), col = $('#col'), ta = $('#ta'), sendBtn = $('#sendBtn');
const els = new Map();
const stick = () => msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 90;
const toBottom = () => { msgsEl.scrollTop = msgsEl.scrollHeight; };
const fmtSize = b => b >= 1e6 ? (b / 1e6).toFixed(1) + ' م.ب' : Math.max(1, Math.round(b / 1e3)) + ' ك.ب';
const kindIcon = k => k === 'image' ? 'image' : 'file';
const fchip = f => `<span class="fchip">${ico(kindIcon(f.kind))}<span>${esc(f.name)}</span></span>`;

function renderConvList() {
  const list = $('#convList');
  const sorted = [...convs].sort((a, b) => b.updated - a.updated);
  list.innerHTML = sorted.length ? sorted.map(c => `<div class="conv${c.id === curId ? ' on' : ''}" data-id="${c.id}" tabindex="0"><span dir="auto">${esc(c.title || 'محادثة')}</span><button class="del" data-del="${c.id}" title="حذف">${ico('trash')}</button></div>`).join('') : '<div class="none">لا توجد محادثات بعد</div>';
}
function renderTop() {
  const c = current();
  $('#topTitle').textContent = c?.title || 'محادثة جديدة';
  $('#topTitle').setAttribute('dir', 'auto');
  $('#exportAll').style.display = c && c.messages.some(m => m.text) ? '' : 'none';
}
const SUGGEST = [
  ['لخّص ملفًا', 'أرفق PDF أو مستند Word واحصل على ملخص منظّم جاهز للتصدير.', null, 'attach'],
  ['اشرح لي بسهولة', 'اشرح لي كيف يعمل الإنترنت كأنني في الصف الخامس.'],
  ['ساعدني في الكتابة', 'اكتب لي رسالة بريد مهنية أطلب فيها تمديد موعد تسليم مشروع.'],
  ['حلّل وقارن', 'قارن بين لغتي بايثون وجافاسكربت في جدول مع أمثلة.'],
];
function renderMessages() {
  col.innerHTML = ''; els.clear();
  const c = current();
  if (!c || !c.messages.length) {
    const ok = cfg.providers.length;
    const e = document.createElement('div'); e.className = 'empty';
    e.innerHTML = `<i class="av big" data-av="10"></i><h1>كيف أستطيع مساعدتك اليوم؟</h1><p>اسألني عن أي شيء، أو أرفق ملفات (PDF، Word، صور…) وسألخّصها لك ثم أصدّرها إلى PDF.</p>
      ${ok ? '' : '<div class="warn">لا يوجد مزود ذكاء اصطناعي مفعّل على الخادم.<br>افتح ملف <b dir="ltr">.env</b> وأضف <b dir="ltr">GEMINI_API_KEY</b> ثم أعد تشغيل الخادم.</div>'}
      <div class="tiles">${SUGGEST.map((s, i) => `<button class="tile" data-s="${i}"><b>${s[0]}</b>${s[1]}</button>`).join('')}</div>`;
    col.appendChild(e); popIn(e);
    return;
  }
  c.messages.forEach((m, i) => col.appendChild(msgEl(m, i === c.messages.length - 1)));
  toBottom();
}
function msgEl(m, isLast) {
  const d = document.createElement('div');
  d.className = 'msg ' + (m.role === 'user' ? 'user' : 'bot'); d.dataset.id = m.id;
  if (m.role === 'user') {
    d.innerHTML = `<div class="bubble" dir="auto">${m.files?.length ? `<div class="files">${m.files.map(fchip).join('')}</div>` : ''}${esc(m.text)}</div>`;
  } else {
    d.innerHTML = `<i class="av" data-av="10"></i><div class="body"><div class="md"></div><div class="acts"></div></div>`;
    els.set(m.id, d); paintBot(m, isLast);
  }
  return d;
}
function paintBot(m, isLast) {
  const d = els.get(m.id); if (!d) return;
  const md_ = $('.md', d), acts = $('.acts', d);
  if (m.error && !m.text) { md_.outerHTML = `<div class="errbox md" dir="auto">${esc(m.error)}</div>`; }
  else if (!m.text && streaming && isLast) md_.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
  else md_.innerHTML = md(m.text) + (m.error ? `<div class="errbox" dir="auto">${esc(m.error)}</div>` : '');
  const busy = streaming && isLast;
  acts.innerHTML = busy || !m.text ? (m.error && isLast && !streaming ? `<button data-act="regen">${ico('refresh')}إعادة المحاولة</button>` : '')
    : `<button data-act="copy">${ico('copy')}نسخ</button><button data-act="pdf">${ico('file')}تصدير PDF</button><button data-act="md">${ico('down')}Markdown</button>${isLast ? `<button data-act="regen">${ico('refresh')}إعادة التوليد</button>` : ''}`;
}
let paintQueued = false;
function paintStreaming(m) {
  if (paintQueued) return; paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    const d = els.get(m.id); if (!d) return;
    const s = stick();
    $('.md', d).innerHTML = md(m.text);
    if (s) toBottom();
  });
}
function renderAll() { renderConvList(); renderTop(); renderMessages(); }

// ---- المرفقات والأنماط ----
function renderAtts() {
  const a = $('#atts');
  a.innerHTML = pending.map(f => `<span class="achip" data-id="${f.id}">${ico(kindIcon(f.kind))}<span>${esc(f.name)}</span><small>${fmtSize(f.size)}</small><button data-rm="${f.id}" title="إزالة">${ico('x')}</button></span>`).join('');
  [...a.children].forEach((el, i) => { if (!el._seen) { el._seen = 1; popIn(el, i * .03); } });
  const m = $('#modes');
  m.innerHTML = pending.length ? Object.entries(MODES).map(([k, v]) => `<button class="mode${mode === k ? ' on' : ''}" data-mode="${k}">${v[0]}</button>`).join('') : '';
  updateSend();
}
function updateSend() {
  sendBtn.innerHTML = streaming ? ico('stop') : ico('send');
  sendBtn.title = streaming ? 'إيقاف' : 'إرسال';
  sendBtn.classList.toggle('off', !streaming && !ta.value.trim() && !pending.length);
}
function autosize() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; updateSend(); }

// ================= إرسال ووصول الرد =================
const supports = (p, f) => f.kind === 'text' || (p?.files || []).includes(f.kind);
function systemPrompt(usedMode) {
  const base = settings.system?.trim() || 'أنت مساعد ذكي ودود ودقيق. أجب بلغة المستخدم (العربية افتراضيًا) وبأسلوب واضح، واستخدم تنسيق Markdown (عناوين وقوائم وجداول) عندما يفيد. عند تلخيص الملفات التزم بما ورد فيها ولا تختلق معلومات، ونبّه إن كان المحتوى ناقصًا أو غير واضح.';
  return base + `\nتاريخ اليوم: ${dateStr(Date.now())}.` + (usedMode && MODES[usedMode] ? '\n\nتعليمات هذه المهمة: ' + MODES[usedMode][1] : '');
}
function buildPayload(conv, upto) {
  let msgs = conv.messages.slice(0, upto).filter(m => m.text).map(m => ({ role: m.role, text: m.text, files: [], _id: m.id, _meta: m.files }));
  let budget = 18e6;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]; if (m.role !== 'user') continue;
    const fs = fileStore.get(m._id);
    if (fs?.length) {
      const sz = fs.reduce((a, f) => a + (f.data ? f.data.length : f.text.length), 0);
      if (sz <= budget) { budget -= sz; m.files = fs.map(({ name, mime, data, text }) => ({ name, mime, data, text })); }
      else m.text += `\n\n[مرفقات سابقة لم تعد متاحة: ${fs.map(f => f.name).join('، ')}]`;
    } else if (m._meta?.length) m.text += `\n\n[مرفقات سابقة (محتواها غير متاح الآن): ${m._meta.map(f => f.name).join('، ')}]`;
  }
  const merged = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) { last.text += '\n\n' + m.text; last.files.push(...m.files); } else merged.push({ role: m.role, text: m.text, files: m.files });
  }
  while (merged.length && merged[0].role !== 'user') merged.shift();
  return merged.slice(-30);
}

async function send() {
  if (streaming) { abortCtl?.abort(); return; }
  const text = ta.value.trim();
  if (!text && !pending.length) return;
  if (!sel || !prov()) { toast('لا يوجد مزود مفعّل — راجع ملف .env'); return; }
  const bad = pending.find(f => !supports(prov(), f));
  if (bad) { toast(`«${prov().label}» لا يدعم هذا النوع من الملفات (${bad.name}). بدّل إلى Gemini من القائمة أعلاه.`); return; }
  let conv = current();
  if (!conv) { conv = { id: uid(), title: '', messages: [], created: Date.now(), updated: Date.now() }; convs.unshift(conv); curId = conv.id; }
  const um = { id: uid(), role: 'user', text: text || 'لخّص الملفات المرفقة.', files: pending.map(({ name, mime, size, kind }) => ({ name, mime, size, kind })), ts: Date.now() };
  if (pending.length) fileStore.set(um.id, pending);
  conv.messages.push(um);
  if (!conv.title) conv.title = (text || pending[0]?.name || 'محادثة').slice(0, 48);
  const usedMode = pending.length ? (mode || 'brief') : null;
  ta.value = ''; pending = []; mode = null; autosize(); renderAtts(); Sheet.close();
  await generate(conv, usedMode);
}

async function generate(conv, usedMode) {
  const upto = conv.messages.length;
  const bot = { id: uid(), role: 'assistant', text: '', ts: Date.now(), provider: sel.provider, model: sel.model };
  const payload = buildPayload(conv, upto);
  conv.messages.push(bot); conv.updated = Date.now();
  streaming = true; abortCtl = new AbortController();
  renderAll(); updateSend(); save();
  const finish = () => { streaming = false; abortCtl = null; conv.updated = Date.now(); save(); renderAll(); updateSend(); };
  try {
    const r = await api('/api/chat', {
      method: 'POST', signal: abortCtl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: sel.provider, model: sel.model, system: systemPrompt(usedMode), temperature: settings.temp, messages: payload }),
    });
    if (r.status === 401) { conv.messages.pop(); finish(); showLogin(); return; }
    if (!r.ok) { const j = await r.json().catch(() => ({})); bot.error = j.error || `خطأ ${r.status}`; return finish(); }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!line.startsWith('data:')) continue;
        let j; try { j = JSON.parse(line.slice(5)); } catch { continue; }
        if (j.t) { bot.text += j.t; paintStreaming(bot); }
        if (j.error) bot.error = j.error;
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') bot.error = 'انقطع الاتصال بالخادم.';
  }
  if (!bot.text && !bot.error) { conv.messages.pop(); }
  finish();
}

function regenerate() {
  const c = current(); if (!c || streaming) return;
  while (c.messages.length && c.messages[c.messages.length - 1].role === 'assistant') c.messages.pop();
  if (!c.messages.length) return;
  generate(c, null);
}

// ================= لوحة الملفات (File Drop) =================
const MAX_FILE = 14 * 1024 * 1024;
const TEXT_EXT = new Set('txt md markdown csv tsv json xml html htm css js ts jsx tsx py java c cpp h cs go rs rb php sh sql yaml yml toml ini log srt vtt tex'.split(' '));
const IMG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const ext = n => (n.split('.').pop() || '').toLowerCase();
const readAs = (file, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('تعذرت قراءة الملف')); r[how](file); });
function validate(f) {
  const e = ext(f.name);
  if (f.size > MAX_FILE) return 'الحد الأقصى 14 ميغابايت';
  if (!f.size) return 'الملف فارغ';
  if (e === 'pdf' || f.type === 'application/pdf' || IMG[e] || f.type.startsWith('image/') && IMG[e] || e === 'docx' || e === 'pptx' || f.type.startsWith('text/') || TEXT_EXT.has(e)) return '';
  if (e === 'doc' || e === 'ppt') return 'احفظه بصيغة docx / pptx أو PDF';
  return 'نوع الملف غير مدعوم';
}
async function readAttachment(f) {
  const e = ext(f.name), base = { id: uid(), name: f.name, size: f.size };
  if (e === 'pdf' || f.type === 'application/pdf') return { ...base, kind: 'pdf', mime: 'application/pdf', data: (await readAs(f, 'readAsDataURL')).split(',')[1] };
  if (IMG[e]) return { ...base, kind: 'image', mime: IMG[e], data: (await readAs(f, 'readAsDataURL')).split(',')[1] };
  if (e === 'docx' || e === 'pptx') {
    const buf = await readAs(f, 'readAsArrayBuffer');
    let text; try { text = e === 'docx' ? await OfficeText.docxText(buf) : await OfficeText.pptxText(buf); } catch (err) { throw new Error(err.message || 'تعذرت قراءة الملف'); }
    if (!text.trim()) throw new Error('لا يوجد نص داخل الملف');
    return { ...base, kind: 'text', mime: 'text/plain', text: text.slice(0, 600000) };
  }
  return { ...base, kind: 'text', mime: 'text/plain', text: (await readAs(f, 'readAsText')).slice(0, 600000) };
}

const Sheet = (() => {
  const sheet = $('#sheet'); let open = false;
  const s = Springy(x => {
    sheet.style.height = (Math.max(0, x) * 224).toFixed(1) + 'px';
    sheet.style.opacity = clamp(x * 1.5, 0, 1).toFixed(3);
  }, 260, 24);
  return {
    open() { open = true; s.t = 1; }, close() { if (FD.busy() || FD.queued()) return; open = false; s.t = 0; },
    toggle() { open ? this.close() : this.open(); },
    get isOpen() { return open; },
  };
})();

const FD = (() => {
  const $i = id => document.getElementById(id);
  const zone = $i('zone'), core = $i('core'), g = $i('g'), ring = $i('ring'), arc = $i('arc'), up = $i('up'), pct = $i('pct'), ok = $i('ok'), tick = $i('tick');
  const file = $i('file'), fn = $i('fn'), pick = $i('pick');
  const CIRC = 2 * Math.PI * 33, DUR = 1.5, IDLE_T = 'أفلت ملفاتك هنا', IDLE_S = 'PDF أو صور أو Word أو PowerPoint أو نص';
  arc.style.strokeDasharray = CIRC.toFixed(2);
  const line = id => { const el = $i(id); return { el, cur: el.firstElementChild, old: null, o: S(1, 360, 30) }; };
  const T = line('t'), U = line('s');
  function say(l, text) {
    if (l.cur.textContent === text) return;
    if (l.old) l.old.remove();
    l.old = l.cur; l.cur = document.createElement('span'); l.cur.textContent = text; l.el.appendChild(l.cur);
    l.o.x = 0; l.o.v = 0; l.o.t = 1;
  }
  const FX = S(0, 90, 15), FY = S(0, 90, 15), FS = S(1, 520, 34), FO = S(0, 500, 40);
  const ZS = S(1, 380, 16), ZH = S(0, 300, 26), CS = S(1, 420, 14);
  const UP = S(1, 420, 30), PO = S(0, 420, 30), RO = S(0, 300, 30), G = S(0, 260, 21), K = S(0, 200, 26);
  let phase = 'idle', p = 0, tUp = 0, total = 0, name = '', overAt = -9, clock = 0, readDone = false, busy = false;
  const queue = [];
  const fmt = b => b >= 1e6 ? (b / 1e6).toFixed(1) + ' م.ب' : Math.max(1, Math.round(b / 1e3)) + ' ك.ب';
  const short = n => n.length > 22 ? n.slice(0, 11) + '…' + n.slice(-8) : n;
  const pace = x => x < .35 ? x * 1.4 : x < .6 ? .49 + (x - .35) * .4 : .59 + (x - .6) * 1.025;

  function begin(f, pt) {
    name = short(f.name); total = f.size; phase = 'upload'; p = 0; tUp = 0; readDone = false;
    UP.t = 0; PO.t = 1; RO.t = 1; G.t = 0; K.t = 0; CS.x = 1.2; ZS.x = .965;
    say(T, 'جارٍ قراءة ' + name); say(U, '0 ك.ب من ' + fmt(total));
    if (pt) {
      fn.textContent = name;
      const c = core.getBoundingClientRect();
      FX.x = pt.x; FY.x = pt.y; FX.v = FY.v = 0; FS.x = FS.t = 1; FO.x = FO.t = 1;
      tune(FX, 520, 36); tune(FY, 520, 36); FX.t = c.left + c.width / 2; FY.t = c.top + c.height / 2; FS.t = 0;
      after(.16, () => { FO.t = 0; });
    }
  }
  function settle(titleTxt, subTxt, ms) {
    UP.t = 1; PO.t = 0; RO.t = 0; G.t = 0; K.t = 0;
    say(T, titleTxt); say(U, subTxt);
    after(ms, finish);
  }
  function fail(msg) { phase = 'error'; settle('تعذّر إضافة الملف', msg, 2.2); }
  function done() {
    phase = 'done'; p = 1; PO.t = 0; RO.t = 0; G.t = 1; K.t = 1; CS.x = .84;
    say(T, 'تمت الإضافة'); say(U, name + ' · ' + fmt(total));
    after(1.3, finish);
  }
  function finish() {
    phase = 'idle'; busy = false; G.t = 0; K.t = 0; UP.t = 1; PO.t = 0; RO.t = 0;
    say(T, IDLE_T); say(U, IDLE_S);
    if (queue.length) pump(); else after(.35, () => { if (!busy && !queue.length) Sheet.close(); });
  }
  async function pump(pt) {
    if (busy) return;
    const f = queue.shift(); if (!f) return;
    busy = true;
    const bad = validate(f.file);
    if (bad) { name = short(f.file.name); phase = 'error'; settle('تعذّر إضافة الملف', bad, 2.2); return; }
    begin(f.file, f.pt);
    try {
      const att = await readAttachment(f.file);
      pending.push(att);
      if (!mode) mode = 'brief';
      renderAtts();
      readDone = true;
    } catch (e) { readDone = true; if (phase === 'upload') fail(e.message || 'تعذرت القراءة'); }
  }
  function enqueue(files, pt) {
    const room = 8 - pending.length - queue.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (files.length > list.length) toast('الحد الأقصى 8 ملفات في الرسالة الواحدة');
    list.forEach((file, i) => queue.push({ file, pt: i === 0 ? pt : null }));
    if (list.length) { Sheet.open(); pump(); }
  }
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  zone.addEventListener('dragover', e => { e.preventDefault(); overAt = clock; });
  zone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation(); overAt = -9; dragDepth = 0;
    if (e.dataTransfer.files.length) enqueue(e.dataTransfer.files, { x: e.clientX, y: e.clientY });
  });
  zone.addEventListener('click', () => pick.click());
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick.click(); } });
  pick.addEventListener('change', () => { if (pick.files.length) enqueue(pick.files, null); pick.value = ''; });
  zone.addEventListener('pointerdown', () => { ZS.x = .975; });

  let dragDepth = 0;
  addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; Sheet.open(); overAt = clock; } });
  addEventListener('dragleave', e => { if (hasFiles(e)) { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { overAt = -9; Sheet.close(); } } });
  addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); overAt = clock; } });
  addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; if (e.dataTransfer.files.length) enqueue(e.dataTransfer.files, { x: e.clientX, y: e.clientY }); });
  addEventListener('paste', e => {
    const fs = [...(e.clipboardData?.files || [])]; if (!fs.length) return;
    e.preventDefault(); enqueue(fs, null);
  });

  Motion.register({
    frame(dt) {
      clock += dt;
      if (phase === 'upload') {
        tUp += dt;
        p = clamp(pace(tUp / DUR), 0, readDone ? 1 : .96);
        if (tUp >= DUR && readDone) done();
      }
      ZH.t = phase !== 'upload' && phase !== 'done' && clock - overAt < .25 ? 1 : 0;
      [FX, FY, FS, FO, ZS, ZH, CS, UP, PO, RO, G, K, T.o, U.o].forEach(s => step(s, dt));
    },
    render() {
      const h = clamp(ZH.x, 0, 1);
      zone.style.setProperty('--h', h.toFixed(3));
      zone.style.transform = `scale(${(ZS.x * (1 + .025 * ZH.x)).toFixed(4)})`;
      core.style.transform = `translateY(${(-5 * ZH.x).toFixed(2)}px) scale(${CS.x.toFixed(4)})`;
      const bob = -3.5 * h * (.5 + .5 * Math.sin(clock * 7));
      up.style.opacity = clamp(UP.x, 0, 1).toFixed(3);
      up.style.transform = `translateY(${(bob + (1 - UP.x) * -12).toFixed(2)}px) scale(${(.6 + .4 * UP.x).toFixed(3)})`;
      pct.style.opacity = clamp(PO.x, 0, 1).toFixed(3);
      pct.style.transform = `scale(${(.7 + .3 * PO.x).toFixed(3)})`;
      ring.style.opacity = clamp(RO.x, 0, 1).toFixed(3);
      arc.style.strokeDashoffset = (CIRC * (1 - p)).toFixed(2);
      g.style.transform = `scale(${Math.max(0, G.x).toFixed(4)})`;
      ok.style.opacity = clamp(K.x * 4, 0, 1).toFixed(3);
      tick.style.strokeDashoffset = (24 * (1 - clamp(K.x, 0, 1))).toFixed(2);
      if (phase === 'upload') {
        const n = String(Math.round(p * 100));
        if (pct.textContent !== n) pct.textContent = n;
        const s = fmt(p * total) + ' من ' + fmt(total);
        if (U.cur.textContent !== s) U.cur.textContent = s;
      }
      [T, U].forEach(l => {
        const o = clamp(l.o.x, 0, 1);
        l.cur.style.opacity = clamp((o - .35) / .65, 0, 1).toFixed(3);
        l.cur.style.transform = `translateY(${((1 - l.o.x) * 16).toFixed(2)}px)`;
        if (l.old) {
          if (o > .985) { l.old.remove(); l.old = null; }
          else { l.old.style.opacity = clamp(1 - o * 1.8, 0, 1).toFixed(3); l.old.style.transform = `translateY(${(-l.o.x * 16).toFixed(2)}px)`; }
        }
      });
      file.style.opacity = clamp(FO.x, 0, 1).toFixed(3);
      file.style.transform = `translate(${FX.x.toFixed(2)}px,${FY.x.toFixed(2)}px) translate(-50%,-50%) rotate(${clamp(FX.v * .04, -16, 16).toFixed(2)}deg) scale(${Math.max(0, FS.x).toFixed(4)})`;
    },
  });
  return { enqueue, busy: () => busy, queued: () => queue.length > 0 };
})();

// ================= قائمة النماذج (Morph Select) =================
const menu = $('#menu'), selBtn = $('#selBtn');
let menuOpen = false;
const MenuS = Springy(x => {
  if (x < .01 && !menuOpen) { menu.style.display = 'none'; return; }
  menu.style.display = 'block';
  menu.style.opacity = clamp(x * 1.8, 0, 1).toFixed(3);
  menu.style.transform = `scale(${(.9 + .1 * x).toFixed(4)}) translateY(${((1 - x) * -8).toFixed(1)}px)`;
}, 360, 24);
function toggleMenu(v) { menuOpen = v ?? !menuOpen; MenuS.t = menuOpen ? 1 : 0; if (menuOpen) $('#menuScroll').scrollTop = 0; }
function renderSel() {
  const p = prov();
  selBtn.innerHTML = p ? `<span class="dot"></span><span>${esc(p.label)}</span><small>${esc(sel.model)}</small>${ico('chev')}` : '<span>لا يوجد مزود</span>';
}
function renderMenu() {
  $('#menuList').innerHTML = cfg.providers.map(p => `<div class="grp">${esc(p.label)}</div>` + p.models.map(m => `<div class="opt${sel?.provider === p.id && sel.model === m ? ' on' : ''}" data-p="${p.id}" data-m="${esc(m)}"><span>${esc(m)}</span>${sel?.provider === p.id && sel.model === m ? ico('check') : ''}</div>`).join('')).join('');
}
function choose(provider, model) {
  sel = { provider, model }; store.set('wc.sel', sel); renderSel(); renderMenu(); toggleMenu(false);
}

// ================= الشريط الجانبي على الجوال =================
const side = $('#side'), backdrop = $('#backdrop');
const SideS = Springy(x => {
  side.style.setProperty('--o', clamp(x, 0, 1.02).toFixed(3));
  backdrop.style.setProperty('--o', clamp(x, 0, 1).toFixed(3));
  const vis = x > .005 || SideS.t === 1;
  side.classList.toggle('vis', vis); backdrop.classList.toggle('vis', SideS.t === 1);
}, 280, 26);
const sideToggle = v => { SideS.t = v ? 1 : 0; };

// ================= نوافذ (دخول / إعدادات) =================
function modal(el) {
  const card = $('.card', el);
  const s = Springy(x => {
    if (x < .01 && !el._open) { el.classList.remove('show'); return; }
    el.classList.add('show'); el.style.opacity = clamp(x * 1.6, 0, 1).toFixed(3);
    card.style.transform = `scale(${(.92 + .08 * x).toFixed(4)}) translateY(${((1 - x) * 16).toFixed(1)}px)`;
  }, 320, 24);
  return { open() { el._open = true; s.t = 1; }, close() { el._open = false; s.t = 0; }, shake() { card.animate([{ translate: '0' }, { translate: '-10px' }, { translate: '9px' }, { translate: '-6px' }, { translate: '0' }], { duration: 320 }); } };
}
const Login = modal($('#login')), Settings = modal($('#settings'));
function showLogin() { Login.open(); setTimeout(() => $('#codeInput').focus(), 200); }

// ================= الإقلاع =================
async function loadConfig() {
  let r;
  try { r = await api('/api/config'); } catch { toast('تعذر الوصول إلى الخادم'); return false; }
  if (r.status === 401) { showLogin(); return false; }
  cfg = await r.json();
  if (!sel || !cfg.providers.some(p => p.id === sel.provider)) {
    const p = cfg.providers[0]; sel = p ? { provider: p.id, model: p.defaultModel } : null;
  }
  if (sel) store.set('wc.sel', sel);
  renderSel(); renderMenu(); renderMessages();
  return true;
}

function applyTheme(t) {
  Motion.setTheme(t); try { localStorage.setItem('ms-theme', t); } catch { /* تجاهل */ }
  $('#themeBtn').innerHTML = ico(t === 'light' ? 'moon' : 'sun');
  $('#themeColor').content = t === 'light' ? '#ffffff' : '#000000';
}

function init() {
  $('#newChat').innerHTML = ico('plus') + 'محادثة جديدة';
  $('#menuBtn').innerHTML = ico('menu'); $('#attachBtn').innerHTML = ico('clip');
  $('#openSettings').innerHTML = ico('gear'); $('#exportAll').innerHTML = ico('file');
  $('#closeSettings').innerHTML = ico('x');
  applyTheme(document.documentElement.dataset.theme || 'dark');
  Stretch($('#convos'), $('#convHl'), '.conv');
  Stretch($('#menuScroll'), $('#menuHl'), '.opt');
  renderConvList(); renderTop(); renderMessages(); renderAtts(); renderSel();
  $('#sysInput').value = settings.system || '';
  const auto = settings.temp == null;
  $('#tempAuto').checked = auto; $('#tempInput').disabled = auto; $('#tempInput').value = auto ? 1 : settings.temp;
  $('#tempVal').textContent = auto ? 'تلقائي' : settings.temp;

  // الأحداث
  $('#newChat').onclick = () => { if (streaming) abortCtl?.abort(); curId = null; save(); renderAll(); sideToggle(false); ta.focus(); };
  $('#convList').onclick = e => {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); convs = convs.filter(c => c.id !== del.dataset.del); if (curId === del.dataset.del) curId = null; save(); renderAll(); return; }
    const it = e.target.closest('.conv'); if (!it || streaming) return;
    curId = it.dataset.id; save(); renderAll(); sideToggle(false);
  };
  $('#convList').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.click?.(); });
  col.onclick = e => {
    const tile = e.target.closest('.tile');
    if (tile) { const s = SUGGEST[+tile.dataset.s]; if (s[3] === 'attach') Sheet.open(); else { ta.value = s[1]; autosize(); ta.focus(); } return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const c = current(), id = a.closest('.msg').dataset.id, m = c.messages.find(x => x.id === id);
    if (a.dataset.act === 'copy') { navigator.clipboard?.writeText(m.text).then(() => toast('تم النسخ'), () => toast('تعذر النسخ')); }
    if (a.dataset.act === 'pdf') exportPDF(c.title || 'رفيق', m.text, `${dateStr(m.ts)} · ${m.model || ''}`);
    if (a.dataset.act === 'md') {
      const url = URL.createObjectURL(new Blob([m.text], { type: 'text/markdown;charset=utf-8' }));
      const l = document.createElement('a'); l.href = url; l.download = (c.title || 'رفيق').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 40) + '.md'; l.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    if (a.dataset.act === 'regen') regenerate();
  };
  $('#exportAll').onclick = () => {
    const c = current(); if (!c) return;
    const text = c.messages.filter(m => m.text).map(m => `## ${m.role === 'user' ? 'أنت' : 'المساعد'}\n\n${m.files?.length ? `*المرفقات: ${m.files.map(f => f.name).join('، ')}*\n\n` : ''}${m.text}`).join('\n\n---\n\n');
    exportPDF(c.title || 'محادثة', text, dateStr(c.updated));
  };
  $('#atts').onclick = e => { const b = e.target.closest('[data-rm]'); if (!b) return; pending = pending.filter(f => f.id !== b.dataset.rm); if (!pending.length) mode = null; renderAtts(); };
  $('#modes').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) { mode = b.dataset.mode; renderAtts(); } };
  $('#attachBtn').onclick = () => Sheet.toggle();
  sendBtn.onclick = send;
  ta.addEventListener('input', autosize);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); send(); }
  });
  $('#themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  $('#menuBtn').onclick = () => sideToggle(true); backdrop.onclick = () => sideToggle(false);
  selBtn.onclick = e => { e.stopPropagation(); toggleMenu(); };
  $('#menuList').onclick = e => { const o = e.target.closest('.opt'); if (o) choose(o.dataset.p, o.dataset.m); };
  $('#customModel').onsubmit = e => { e.preventDefault(); const v = $('#customInput').value.trim(); if (v && sel) { $('#customInput').value = ''; choose(sel.provider, v); } };
  document.addEventListener('pointerdown', e => { if (menuOpen && !e.target.closest('#selWrap')) toggleMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { toggleMenu(false); Settings.close(); sideToggle(false); } });

  $('#openSettings').onclick = () => { $('#logout').style.display = authRequired ? '' : 'none'; Settings.open(); sideToggle(false); };
  $('#closeSettings').onclick = () => Settings.close();
  $('#settings').addEventListener('pointerdown', e => { if (e.target.id === 'settings') Settings.close(); });
  $('#sysInput').oninput = e => { settings.system = e.target.value; store.set('wc.settings', settings); };
  const setTemp = () => {
    const auto2 = $('#tempAuto').checked; $('#tempInput').disabled = auto2;
    settings.temp = auto2 ? null : parseFloat($('#tempInput').value);
    $('#tempVal').textContent = auto2 ? 'تلقائي' : settings.temp; store.set('wc.settings', settings);
  };
  $('#tempAuto').onchange = setTemp; $('#tempInput').oninput = setTemp;
  $('#clearAll').onclick = () => { if (confirm('حذف كل المحادثات المحفوظة في هذا المتصفح؟')) { convs = []; curId = null; save(); renderAll(); Settings.close(); } };
  $('#logout').onclick = () => { code = ''; localStorage.removeItem('wc.code'); Settings.close(); showLogin(); };
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    code = $('#codeInput').value.trim(); $('#loginErr').textContent = '';
    const r = await api('/api/config').catch(() => null);
    if (r && r.ok) { store.set('wc.code', code); Login.close(); $('#codeInput').value = ''; cfg = await r.json(); await loadConfig(); }
    else { $('#loginErr').textContent = r ? 'الرمز غير صحيح' : 'تعذر الوصول إلى الخادم'; Login.shake(); }
  };

  fetch('/api/ping').then(r => r.json()).then(j => { authRequired = !!j.authRequired; }).catch(() => {}).finally(loadConfig);
}
init();
})();
