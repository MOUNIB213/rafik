// خادم بدون أي اعتماديات خارجية (Node 18+). يحمي مفاتيح الذكاء الاصطناعي ويبث الردود للواجهة.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- .env ----------
(function loadEnv() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const env = (k, d = '') => (process.env[k] || d).trim();
const PORT = parseInt(env('PORT', '3000'), 10);
const HOST = env('HOST', '0.0.0.0');
const ACCESS_CODES = env('ACCESS_CODE').split(',').map(s => s.trim()).filter(Boolean);
const MAX_BODY = 40 * 1024 * 1024;
const PUBLIC = path.join(__dirname, 'public');

// ---------- المزودون ----------
const list = (k, d) => env(k, d).split(',').map(s => s.trim()).filter(Boolean);
const PROVIDERS = {
  gemini: {
    label: 'Google Gemini', kind: 'gemini', key: () => env('GEMINI_API_KEY'),
    base: () => env('GEMINI_BASE', 'https://generativelanguage.googleapis.com/v1beta'),
    models: () => list('GEMINI_MODELS', 'gemini-3.6-flash'), files: ['pdf', 'image', 'text'],
  },
  anthropic: {
    label: 'Anthropic Claude', kind: 'anthropic', key: () => env('ANTHROPIC_API_KEY'),
    base: () => env('ANTHROPIC_BASE', 'https://api.anthropic.com/v1'),
    models: () => list('ANTHROPIC_MODELS', 'claude-sonnet-5-5,claude-haiku-5-5,claude-opus-5-5'), files: ['pdf', 'image', 'text'],
  },
  openai: {
    label: 'OpenAI', kind: 'openai', key: () => env('OPENAI_API_KEY'),
    base: () => env('OPENAI_BASE', 'https://api.openai.com/v1'),
    models: () => list('OPENAI_MODELS', ''), files: ['image', 'text'],
  },
  openrouter: {
    label: 'OpenRouter', kind: 'openai', key: () => env('OPENROUTER_API_KEY'),
    base: () => env('OPENROUTER_BASE', 'https://openrouter.ai/api/v1'),
    models: () => list('OPENROUTER_MODELS', ''), files: ['image', 'text'],
  },
  groq: {
    label: 'Groq', kind: 'openai', key: () => env('GROQ_API_KEY'),
    base: () => env('GROQ_BASE', 'https://api.groq.com/openai/v1'),
    models: () => list('GROQ_MODELS', ''), files: ['text'],
  },
  deepseek: {
    label: 'DeepSeek', kind: 'openai', key: () => env('DEEPSEEK_API_KEY'),
    base: () => env('DEEPSEEK_BASE', 'https://api.deepseek.com/v1'),
    models: () => list('DEEPSEEK_MODELS', ''), files: ['text'],
  },
  custom: {
    // أي خدمة متوافقة مع واجهة OpenAI (Ollama, LM Studio, vLLM ...)
    get label() { return env('CUSTOM_LABEL', 'مزود مخصص'); }, kind: 'openai', key: () => env('CUSTOM_API_KEY', env('CUSTOM_BASE_URL') ? 'none' : ''),
    base: () => env('CUSTOM_BASE_URL'),
    models: () => list('CUSTOM_MODELS', ''), files: ['image', 'text'],
  },
};
const enabled = () => Object.entries(PROVIDERS).filter(([, p]) => p.key() && p.base());

// ---------- قوائم النماذج (حية مع احتياطي من الإعدادات) ----------
const modelCache = new Map();
async function fetchJSON(url, headers, ms = 8000) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function liveModels(id, p) {
  const hit = modelCache.get(id);
  if (hit && Date.now() - hit.t < 10 * 60e3) return hit.v;
  let out = [];
  try {
    if (p.kind === 'gemini') {
      const j = await fetchJSON(`${p.base()}/models?pageSize=200`, { 'x-goog-api-key': p.key() });
      out = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace(/^models\//, '')).filter(n => /^gemini-/.test(n) && !/(embedding|image|tts|live|audio|robotics|computer-use)/.test(n));
    } else if (p.kind === 'openai') {
      const j = await fetchJSON(`${p.base()}/models`, p.key() === 'none' ? {} : { Authorization: 'Bearer ' + p.key() });
      out = (j.data || []).map(m => m.id).filter(n => !/(embed|whisper|tts|dall|moderation|image|audio|realtime)/i.test(n));
    } else if (p.kind === 'anthropic') {
      const j = await fetchJSON(`${p.base()}/models?limit=50`, { 'x-api-key': p.key(), 'anthropic-version': '2023-06-01' });
      out = (j.data || []).map(m => m.id);
    }
  } catch { /* نستخدم القائمة المحددة في الإعدادات */ }
  const v = out.sort().reverse();
  modelCache.set(id, { t: Date.now(), v });
  return v;
}
async function describeProviders() {
  const res = [];
  for (const [id, p] of enabled()) {
    const configured = p.models();
    const live = await liveModels(id, p);
    // ما حدّدته في .env يأتي أولاً (والأول هو الافتراضي)، ثم ما اكتشفه الخادم.
    const models = [...new Set([...configured, ...live])].slice(0, 60);
    if (!models.length) continue;
    res.push({ id, label: p.label, models, defaultModel: models[0], files: p.files });
  }
  return res;
}

// ---------- أدوات ----------
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const hits = new Map();
function rateLimited(ip, max = 40, windowMs = 60e3) {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter(t => now - t < windowMs);
  a.push(now); hits.set(ip, a);
  return a.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 60e3)) hits.delete(k); }, 60e3).unref();

function authorized(req) {
  if (!ACCESS_CODES.length) return true;
  const got = Buffer.from(String(req.headers['x-access-code'] || ''));
  return ACCESS_CODES.some(c => {
    const b = Buffer.from(c);
    return b.length === got.length && crypto.timingSafeEqual(b, got);
  });
}
const sendJSON = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('الحجم كبير'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('JSON غير صالح'), { code: 400 })); } });
    req.on('error', reject);
  });
}
async function* sseData(resp) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (data) yield data;
    }
  }
}
const scrub = (s, key) => (key && key !== 'none' ? String(s).split(key).join('***') : String(s));

// ---------- تحويل الرسائل لكل مزود ----------
const fileText = f => `[ملف: ${f.name}]\n${f.text}`;
function toGemini(messages) {
  return messages.map(m => {
    const parts = [];
    for (const f of m.files || []) {
      if (f.data) parts.push({ inlineData: { mimeType: f.mime, data: f.data } });
      else if (f.text != null) parts.push({ text: fileText(f) });
    }
    if (m.text) parts.push({ text: m.text });
    if (!parts.length) parts.push({ text: ' ' });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
}
function toAnthropic(messages) {
  return messages.map(m => {
    const content = [];
    for (const f of m.files || []) {
      if (f.data && f.mime === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
      else if (f.data) content.push({ type: 'image', source: { type: 'base64', media_type: f.mime, data: f.data } });
      else if (f.text != null) content.push({ type: 'text', text: fileText(f) });
    }
    content.push({ type: 'text', text: m.text || ' ' });
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content };
  });
}
function toOpenAI(messages, system) {
  const out = system ? [{ role: 'system', content: system }] : [];
  for (const m of messages) {
    if (m.role === 'assistant') { out.push({ role: 'assistant', content: m.text || ' ' }); continue; }
    const content = [];
    for (const f of m.files || []) {
      if (f.data && f.mime.startsWith('image/')) content.push({ type: 'image_url', image_url: { url: `data:${f.mime};base64,${f.data}` } });
      else if (f.text != null) content.push({ type: 'text', text: fileText(f) });
    }
    content.push({ type: 'text', text: m.text || ' ' });
    out.push({ role: 'user', content: content.length === 1 ? content[0].text : content });
  }
  return out;
}

// ---------- المحادثة ----------
async function chat(req, res) {
  let body;
  try { body = await readBody(req); } catch (e) { return sendJSON(res, e.code || 400, { error: e.message }); }
  const { provider, model, system = '', messages, temperature } = body;
  const p = PROVIDERS[provider];
  if (!p || !p.key() || !p.base()) return sendJSON(res, 400, { error: 'المزود غير مفعّل على الخادم' });
  if (!model || typeof model !== 'string' || !/^[\w.:\-\/]+$/.test(model)) return sendJSON(res, 400, { error: 'اسم النموذج غير صالح' });
  if (!Array.isArray(messages) || !messages.length) return sendJSON(res, 400, { error: 'لا توجد رسائل' });

  const key = p.key();
  const temp = typeof temperature === 'number' ? Math.min(2, Math.max(0, temperature)) : undefined;
  let url, headers, payload;
  if (p.kind === 'gemini') {
    url = `${p.base()}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
    payload = { contents: toGemini(messages) };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };
    if (temp !== undefined) payload.generationConfig = { temperature: temp };
  } else if (p.kind === 'anthropic') {
    url = `${p.base()}/messages`;
    headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    payload = { model, max_tokens: 8192, stream: true, messages: toAnthropic(messages) };
    if (system) payload.system = system;
    if (temp !== undefined) payload.temperature = Math.min(1, temp);
  } else {
    url = `${p.base().replace(/\/$/, '')}/chat/completions`;
    headers = { 'Content-Type': 'application/json' };
    if (key !== 'none') headers.Authorization = 'Bearer ' + key;
    payload = { model, stream: true, messages: toOpenAI(messages, system) };
    if (temp !== undefined) payload.temperature = temp;
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const emit = o => res.write('data: ' + JSON.stringify(o) + '\n\n');
  const ac = new AbortController();
  res.on('close', () => ac.abort());

  try {
    const up = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: ac.signal });
    if (!up.ok) {
      const raw = await up.text();
      let msg = raw.slice(0, 400);
      try { const j = JSON.parse(raw); msg = j.error?.message || j[0]?.error?.message || j.message || msg; } catch { /* نص خام */ }
      emit({ error: `(${up.status}) ${scrub(msg, key)}` });
      return res.end();
    }
    let any = false;
    for await (const data of sseData(up)) {
      if (data === '[DONE]') break;
      let j; try { j = JSON.parse(data); } catch { continue; }
      let t = '';
      if (p.kind === 'gemini') {
        if (j.promptFeedback?.blockReason) { emit({ error: 'رُفض الطلب من المزود: ' + j.promptFeedback.blockReason }); break; }
        for (const part of j.candidates?.[0]?.content?.parts || []) if (part.text && !part.thought) t += part.text;
        const fr = j.candidates?.[0]?.finishReason;
        if (fr && !['STOP', 'MAX_TOKENS'].includes(fr) && !t) emit({ error: 'توقف الرد: ' + fr });
      } else if (p.kind === 'anthropic') {
        if (j.type === 'content_block_delta' && j.delta?.text) t = j.delta.text;
        else if (j.type === 'error') { emit({ error: scrub(j.error?.message || 'خطأ', key) }); break; }
      } else {
        t = j.choices?.[0]?.delta?.content || '';
        if (j.error) { emit({ error: scrub(j.error.message || 'خطأ', key) }); break; }
      }
      if (t) { any = true; emit({ t }); }
    }
    if (!any) emit({ error: 'لم يصل أي رد من النموذج.' });
    emit({ done: true });
  } catch (e) {
    if (!ac.signal.aborted) emit({ error: 'تعذر الاتصال بالمزود: ' + scrub(e.message, key) });
  }
  res.end();
}

// ---------- الملفات الثابتة ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

// ---------- الخادم ----------
const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/api/ping') return sendJSON(res, 200, { authRequired: ACCESS_CODES.length > 0 });
    if (pathname.startsWith('/api/')) {
      if (rateLimited(clientIp(req), pathname === '/api/chat' ? 40 : 120)) return sendJSON(res, 429, { error: 'طلبات كثيرة، انتظر قليلاً' });
      if (!authorized(req)) return sendJSON(res, 401, { error: 'رمز الدخول غير صحيح' });
      if (pathname === '/api/config' && req.method === 'GET') return sendJSON(res, 200, { providers: await describeProviders() });
      if (pathname === '/api/chat' && req.method === 'POST') return chat(req, res);
      return sendJSON(res, 404, { error: 'غير موجود' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res);
  } catch (e) {
    if (!res.headersSent) sendJSON(res, 500, { error: 'خطأ داخلي' }); else res.end();
    console.error(e);
  }
});
server.requestTimeout = 0;
server.listen(PORT, HOST, () => {
  const on = enabled().map(([, p]) => p.label);
  console.log(`\n  الخادم يعمل على  http://localhost:${PORT}`);
  console.log('  المزودون المفعّلون: ' + (on.join('، ') || 'لا يوجد — أضف مفتاحًا في ملف .env'));
  console.log('  رمز الدخول: ' + (ACCESS_CODES.length ? 'مفعّل' : 'غير مفعّل (أي شخص يملك الرابط يستطيع الاستخدام!)') + '\n');
});
