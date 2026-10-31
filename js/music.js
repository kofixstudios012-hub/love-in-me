/* Kofix background music: automatic rotation, no track controls for visitors.
   - Tracks come from the admin uploads (/api/music) plus the built-in list (/music/playlist.json)
   - A new track every 60 seconds, with a smooth cross-fade
   - Respects browser autoplay rules: if blocked, one small button / the first tap starts it */
(function () {
  'use strict';
  var ROTATE_MS = 60 * 1000;   // switch track every 60 seconds
  var FADE_S = 3;              // cross-fade length (seconds)
  var VOLUME = 0.6;
  var REFRESH_MS = 5 * 60 * 1000; // pick up newly uploaded tracks without a reload
  var SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=';

  var btn = document.getElementById('musicBtn'), tip = document.getElementById('musicTip');
  var tracks = [], queue = [], current = null, lastSwitch = 0, started = false, starting = false, userMuted = false, bad = {};
  var ctx = null, master = null, players = [], active = 0, hasWebAudio = false;

  try { userMuted = localStorage.getItem('kofix-music-muted') === '1'; } catch (e) {}

  /* ---------- playlist ---------- */
  function getJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function loadTracks() {
    return Promise.all([
      getJSON('/api/music').catch(function () { return null; }),
      getJSON('/music/playlist.json').catch(function () { return null; })
    ]).then(function (res) {
      var api = res[0] || {}, built = (res[1] && res[1].tracks) || [], disabled = api.disabled || [];
      var list = built.filter(function (t) { return disabled.indexOf(t.id) === -1; })
        .concat((api.tracks || []).filter(function (t) { return t.enabled !== false; }));
      tracks = list.filter(function (t) { return t && t.src && !bad[t.id]; });
      queue = queue.filter(function (id) { return tracks.some(function (t) { return t.id === id; }); });
      if (current && !tracks.some(function (t) { return t.id === current.id; }) && !tracks.length) current = null;
      return tracks;
    });
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pickNext() {
    if (!tracks.length) return null;
    if (tracks.length === 1) return tracks[0];
    if (!queue.length) {
      queue = shuffle(tracks.map(function (t) { return t.id; }));
      if (current && queue[0] === current.id) queue.push(queue.shift());   // never repeat the same track back to back
    }
    while (queue.length) {
      var id = queue.shift();
      var t = tracks.filter(function (x) { return x.id === id; })[0];
      if (t && (!current || t.id !== current.id)) return t;
    }
    return tracks.filter(function (x) { return !current || x.id !== current.id; })[0] || tracks[0];
  }

  /* ---------- audio graph ---------- */
  function setup() {
    if (players.length) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    for (var i = 0; i < 2; i++) {
      var a = new Audio(); a.preload = 'auto'; a.setAttribute('playsinline', ''); a.crossOrigin = 'anonymous';
      players.push({ audio: a, gain: null });
    }
    if (AC) {
      try {
        ctx = new AC(); master = ctx.createGain(); master.gain.value = userMuted ? 0 : VOLUME; master.connect(ctx.destination);
        players.forEach(function (p) { var src = ctx.createMediaElementSource(p.audio); p.gain = ctx.createGain(); p.gain.gain.value = 0; src.connect(p.gain); p.gain.connect(master); });
        hasWebAudio = true;
      } catch (e) { hasWebAudio = false; }
    }
    players.forEach(function (p, i) {
      p.audio.addEventListener('ended', function () { if (started && i === active) rotate(true); });
      p.audio.addEventListener('error', function () { if (started && i === active && current) { bad[current.id] = 1; rotate(true); } });
    });
  }
  function setGain(p, v, secs) {
    if (hasWebAudio) {
      var g = p.gain.gain, n = ctx.currentTime;
      try { g.cancelScheduledValues(n); g.setValueAtTime(g.value, n); g.linearRampToValueAtTime(v, n + Math.max(secs, 0.01)); } catch (e) { g.value = v; }
    } else {
      // fallback for browsers without Web Audio: step the element volume
      var from = p.audio.volume * 1, steps = Math.max(1, Math.round(secs * 20)), k = 0;
      clearInterval(p.timer);
      p.timer = setInterval(function () { k++; p.audio.volume = clamp01(from + (v * (userMuted ? 0 : VOLUME) - from) * (k / steps)); if (k >= steps) clearInterval(p.timer); }, 50);
    }
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function playOn(p, track) {
    p.audio.loop = false;
    p.audio.src = track.src;
    try { p.audio.currentTime = 0; } catch (e) {}
    var pr = p.audio.play();
    return pr && pr.then ? pr : Promise.resolve();
  }

  /* ---------- play / rotate ---------- */
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function start() {
    if (started || starting) return Promise.resolve();
    starting = true;
    setup();
    var resume = ctx && ctx.state !== 'running' ? Promise.race([ctx.resume(), delay(900)]) : Promise.resolve();
    return resume.then(function () { return loadTracks(); }).then(function () {
      var t = pickNext();
      if (!t) { starting = false; return; }
      var p = players[active];
      // unlock the second element for mobile Safari while we have a user gesture
      var other = players[1 - active];
      try { other.audio.src = SILENT; var pp = other.audio.play(); if (pp && pp.then) pp.then(function () { other.audio.pause(); }).catch(function () {}); } catch (e) {}
      if (!hasWebAudio) p.audio.volume = 0;
      return playOn(p, t).then(function () {
        if (ctx && ctx.state !== 'running') throw new Error('suspended');
        current = t; started = true; starting = false; lastSwitch = Date.now();
        setGain(p, 1, 2);
        p.audio.loop = tracks.length === 1;
        ui('playing');
      });
    }).catch(function () {
      starting = false; started = false;
      players.forEach(function (p) { try { p.audio.pause(); } catch (e) {} });
      ui('blocked');
    });
  }

  function rotate(force) {
    if (!started) return;
    // if the list changed (new uploads), refresh before choosing
    var next = pickNext();
    if (!next || (current && next.id === current.id)) {
      // only one track available: keep it going, do not restart it
      players[active].audio.loop = true; lastSwitch = Date.now(); return;
    }
    var from = players[active], to = players[1 - active];
    var track = next;
    to.audio.loop = false;
    if (!hasWebAudio) to.audio.volume = 0; else setGain(to, 0, 0.01);
    playOn(to, track).then(function () {
      current = track; lastSwitch = Date.now();
      setGain(to, 1, FADE_S); setGain(from, 0, FADE_S);
      var old = from; active = 1 - active;
      setTimeout(function () { if (old !== players[active]) { old.audio.pause(); } }, FADE_S * 1000 + 200);
    }).catch(function () { bad[track.id] = 1; lastSwitch = Date.now() - ROTATE_MS + 2000; });
  }

  /* one clock: robust even when the tab was throttled in the background */
  setInterval(function () {
    if (started && Date.now() - lastSwitch >= ROTATE_MS) rotate(false);
  }, 1000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && started && ctx && ctx.state === 'suspended') ctx.resume();
  });
  setInterval(function () { if (started) loadTracks(); }, REFRESH_MS);

  /* ---------- UI ---------- */
  function ui(state) {
    if (!btn) return;
    btn.hidden = false;
    var on = state === 'playing' && !userMuted;
    btn.classList.toggle('playing', on);
    btn.classList.toggle('need', state === 'blocked');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Mute background music' : 'Turn background music on');
    if (tip) tip.textContent = state === 'blocked' ? 'Tap for music' : (userMuted ? 'Music off' : 'Tap for music');
  }

  function setMuted(m) {
    userMuted = m;
    try { localStorage.setItem('kofix-music-muted', m ? '1' : '0'); } catch (e) {}
    if (hasWebAudio && master) { var n = ctx.currentTime; master.gain.cancelScheduledValues(n); master.gain.setValueAtTime(master.gain.value, n); master.gain.linearRampToValueAtTime(m ? 0 : VOLUME, n + 0.4); }
    else players.forEach(function (p) { p.audio.volume = m ? 0 : VOLUME; });
    ui(started ? 'playing' : 'blocked');
  }

  if (btn) btn.addEventListener('click', function () {
    if (!started) { userMuted = false; try { localStorage.setItem('kofix-music-muted', '0'); } catch (e) {} setup(); if (master) master.gain.value = VOLUME; start(); }
    else setMuted(!userMuted);
  });

  /* first tap / key anywhere starts the music if the browser blocked autoplay */
  var gestureEvents = ['pointerdown', 'touchend', 'click', 'keydown'];
  function onGesture(e) {
    if (e.target && e.target.closest && e.target.closest('#musicBtn')) return;
    if (userMuted) return;
    setup();
    start().then(function () { if (started) gestureEvents.forEach(function (n) { window.removeEventListener(n, onGesture, true); }); });
  }
  gestureEvents.forEach(function (n) { window.addEventListener(n, onGesture, true); });

  /* try to start right away (works where the browser allows autoplay) */
  window.addEventListener('load', function () {
    ui(userMuted ? 'muted' : 'blocked');
    if (!userMuted) { setup(); start(); }
  });
})();
