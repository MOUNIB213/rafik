# رفيق — موقع محادثة بالذكاء الاصطناعي لك ولأصدقائك

- محادثة مباشرة (بث الرد كلمة بكلمة) مع **Gemini 3.6 Flash** افتراضيًا، وتبديل المزود والنموذج من القائمة أعلى الصفحة.
- إرفاق ملفات (PDF، Word، PowerPoint، صور، نصوص) وتلخيصها بأربعة أنماط، ثم **تصدير PDF** (عربي كامل) أو Markdown.
- رمز دخول لكل صديق، ومفاتيح API محفوظة على الخادم فقط (لا تصل للمتصفح).
- محادثات كل شخص تُحفظ في متصفحه هو فقط.
- التصميم من Motion Studies (DesignBookmark): مكوّن File Drop الأصلي + نوابض حركة، ويمكن تعديل الألوان من أعلى `public/app.css`.

## التشغيل (يحتاج Node.js 18 أو أحدث، بدون تثبيت أي حزم)

1. انسخ `.env.example` إلى `.env`.
2. ضع `GEMINI_API_KEY` (مجاني من https://aistudio.google.com/apikey).
3. ضع في `ACCESS_CODE` رمزًا لكل صديق مفصولًا بفاصلة، مثل: `ahmed-4821,sara-9930`.
4. شغّل: `node server.js` ثم افتح http://localhost:3000

## وضعه على الإنترنت ليدخل أصدقاؤك

- أسهل طريق: Render أو Railway أو Fly.io: ارفع المجلد، أمر التشغيل `node server.js`، وأضف المتغيرات (`GEMINI_API_KEY` و`ACCESS_CODE`...) من إعدادات الخدمة بدل ملف `.env`.
- أو على جهازك مؤقتًا: `cloudflared tunnel --url http://localhost:3000` يعطيك رابطًا عامًا.
- لا تترك `ACCESS_CODE` فارغًا على الإنترنت، وإلا استهلك أي شخص حصتك.

## مزودون آخرون

أضف المفتاح في `.env` فيظهر تلقائيًا في القائمة: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`.
لأي خدمة متوافقة مع OpenAI (مثل Ollama): `CUSTOM_BASE_URL` و`CUSTOM_MODELS`.
ملاحظة: ملفات PDF تعمل مع Gemini وClaude فقط؛ المزودون الآخرون يقبلون الصور (بعضهم) والنصوص وWord وPowerPoint.

## هيكل المشروع

- `server.js` الخادم (بث الردود، المزودون، الحماية، تحديد المعدل)
- `public/` الواجهة: `index.html`, `app.css`, `app.js`, `motion.js` (محرك النوابض), `zip.js` (قراءة Word/PowerPoint)
