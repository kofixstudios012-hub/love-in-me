(function () {
  'use strict';
  var S = window.SITE || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  document.documentElement.classList.remove('no-js');

  /* ---------- config -> DOM ---------- */
  $$('[data-her]').forEach(function (e) { if (S.her) e.textContent = S.her; });
  $$('[data-him]').forEach(function (e) { if (S.him) e.textContent = S.him; });
  $$('[data-phone-display]').forEach(function (e) { if (S.phoneDisplay) e.textContent = S.phoneDisplay; });
  $$('[data-call]').forEach(function (e) { if (S.phone) e.href = 'tel:' + S.phone; });
  $$('[data-wa]').forEach(function (e) {
    if (S.phone) e.href = 'https://wa.me/' + S.phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(S.whatsappText || '');
  });

  /* ---------- copyright year: always the device's current year ---------- */
  function setYear() {
    var y = String(new Date().getFullYear());
    $$('[data-year]').forEach(function (e) { if (e.textContent !== y) e.textContent = y; });
  }
  setYear();
  setInterval(setYear, 60 * 1000);
  document.addEventListener('visibilitychange', setYear);

  /* ---------- scroll reveal ---------- */
  var revealEls = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); ro.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (e) { ro.observe(e); });
  } else revealEls.forEach(function (e) { e.classList.add('in'); });

  /* ---------- 3D tilt cards ---------- */
  $$('[data-tilt]').forEach(function (el) {
    function move(ev) {
      var r = el.getBoundingClientRect();
      var px = clamp((ev.clientX - r.left) / r.width, 0, 1), py = clamp((ev.clientY - r.top) / r.height, 0, 1);
      el.style.setProperty('--ry', ((px - 0.5) * 18).toFixed(2) + 'deg');
      el.style.setProperty('--rx', ((0.5 - py) * 14).toFixed(2) + 'deg');
      el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      el.style.setProperty('--s', '1.03');
      el.classList.add('active');
    }
    function leave() {
      el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--s', '1');
      el.classList.remove('active');
    }
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointercancel', leave);
  });

  /* ---------- hero deck follows pointer ---------- */
  var hero = $('#home'), deck = $('#deck');
  if (hero && deck && !reduce) {
    hero.addEventListener('pointermove', function (ev) {
      var r = hero.getBoundingClientRect();
      var px = (ev.clientX - r.left) / r.width, py = (ev.clientY - r.top) / r.height;
      deck.style.setProperty('--dry', ((px - 0.5) * 22).toFixed(2) + 'deg');
      deck.style.setProperty('--drx', ((0.5 - py) * 10).toFixed(2) + 'deg');
    });
    hero.addEventListener('pointerleave', function () { deck.style.setProperty('--dry', '0deg'); deck.style.setProperty('--drx', '0deg'); });
  }

  /* ---------- rotating hero captions ---------- */
  var cap = $('#caption');
  if (cap && S.captions && S.captions.length > 1) {
    var ci = 0;
    setInterval(function () {
      cap.classList.add('out');
      setTimeout(function () { ci = (ci + 1) % S.captions.length; cap.textContent = S.captions[ci]; cap.classList.remove('out'); }, 600);
    }, 5200);
  }

  /* ---------- 3D butterflies ---------- */
  var layer = $('#butterflies');
  var palettes = [
    ['#ff8da8', '#e94e7c', 'rgba(255,141,168,.7)'],
    ['#f7d99a', '#ffb347', 'rgba(247,217,154,.7)'],
    ['#5fe3c8', '#1aa38c', 'rgba(95,227,200,.6)'],
    ['#c9a0ff', '#8a5cf0', 'rgba(201,160,255,.6)'],
    ['#ffffff', '#ffc4d4', 'rgba(255,255,255,.6)']
  ];
  function wingSVG(c1, c2) {
    return '<svg viewBox="0 0 60 80" aria-hidden="true"><defs>' +
      '<linearGradient id="g' + c1.slice(1) + c2.slice(1) + '" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<path d="M60 40C52 4 10-6 2 18c-6 17 26 28 58 24z" fill="url(#g' + c1.slice(1) + c2.slice(1) + ')" stroke="rgba(255,255,255,.55)" stroke-width="1"/>' +
      '<path d="M60 42C36 46 6 52 14 68c8 14 36 4 46-22z" fill="url(#g' + c1.slice(1) + c2.slice(1) + ')" fill-opacity=".85" stroke="rgba(255,255,255,.45)" stroke-width="1"/>' +
      '<circle cx="34" cy="26" r="5" fill="rgba(255,255,255,.55)"/><circle cx="30" cy="58" r="3.5" fill="rgba(255,255,255,.45)"/>' +
      '<path d="M58 41C44 30 28 22 10 20M58 43C42 48 26 54 18 64" stroke="rgba(60,20,50,.35)" fill="none" stroke-width="1"/></svg>';
  }
  var flies = [];
  if (layer) {
    var small = window.innerWidth < 700;
    var heroN = reduce ? 3 : (small ? 7 : 11), pageN = reduce ? 1 : 4;
    for (var i = 0; i < heroN + pageN; i++) {
      var isHero = i < heroN, p = palettes[i % palettes.length];
      var sc = isHero ? 0.55 + Math.random() * 0.7 : 0.45 + Math.random() * 0.35;
      var el = document.createElement('div');
      el.className = 'bf';
      el.style.setProperty('--fl', (0.26 + Math.random() * 0.2).toFixed(2) + 's');
      el.style.setProperty('--glow', p[2]);
      el.innerHTML = '<div class="bf-body"><div class="bf-wing bf-l">' + wingSVG(p[0], p[1]) + '</div><div class="bf-wing bf-r">' + wingSVG(p[0], p[1]) + '</div><i class="bf-torso"></i></div>';
      layer.appendChild(el);
      flies.push({
        el: el, hero: isHero, sc: sc,
        cx: 0.1 + Math.random() * 0.8, cy: isHero ? 0.12 + Math.random() * 0.62 : 0.2 + Math.random() * 0.6,
        ax: 0.18 + Math.random() * 0.32, ay: 0.12 + Math.random() * 0.2,
        fx: 0.07 + Math.random() * 0.1, fy: 0.09 + Math.random() * 0.12,
        p1: Math.random() * 6.28, p2: Math.random() * 6.28, p3: Math.random() * 6.28
      });
    }
  }
  function flyPos(f, t, W, H) {
    var x = W * (f.cx + f.ax * Math.sin(f.fx * t + f.p1) + 0.35 * f.ax * Math.sin(2.7 * f.fx * t + f.p2));
    var y = H * (f.cy + f.ay * Math.sin(f.fy * t + f.p3) + 0.3 * f.ay * Math.sin(2.1 * f.fy * t + f.p1)) + Math.sin(t * 7 + f.p2) * 4;
    return [x, y];
  }

  /* ---------- sparkles in hero ---------- */
  var sc = $('#sparkles'), sctx = sc && sc.getContext('2d'), stars = [], SW = 0, SH = 0;
  function sizeSparkles() {
    if (!sc) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    SW = sc.clientWidth; SH = sc.clientHeight;
    sc.width = SW * dpr; sc.height = SH * dpr; sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = [];
    for (var i = 0; i < (SW < 700 ? 45 : 90); i++) stars.push({ x: Math.random() * SW, y: Math.random() * SH, r: Math.random() * 1.6 + .3, p: Math.random() * 6.28, s: .4 + Math.random() * 1.4 });
  }
  function drawSparkles(t) {
    if (!sctx) return;
    sctx.clearRect(0, 0, SW, SH);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i], a = .25 + .75 * Math.abs(Math.sin(t * s.s + s.p));
      sctx.fillStyle = 'rgba(255,230,190,' + a.toFixed(2) + ')';
      sctx.beginPath(); sctx.arc(s.x, s.y, s.r, 0, 6.283); sctx.fill();
    }
  }
  sizeSparkles();

  /* ---------- sticky stack + kiss parallax ---------- */
  var stackCards = $$('.stack-card'), kissBg = $('#kissBg'), kissSec = $('#chapter-5');
  function onScrollFx() {
    var vh = window.innerHeight;
    for (var i = 0; i < stackCards.length - 1; i++) {
      var a = stackCards[i], b = stackCards[i + 1];
      var d = b.getBoundingClientRect().top - a.getBoundingClientRect().top;
      var gap = i < 0 ? 0 : 26;
      var pr = 1 - clamp((d - gap) / a.offsetHeight, 0, 1);
      a.style.setProperty('--sc', (1 - pr * 0.06).toFixed(3));
      a.style.setProperty('--br', (1 - pr * 0.4).toFixed(3));
    }
    if (kissBg && kissSec) {
      var r = kissSec.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        var prog = (vh - r.top) / (vh + r.height);
        kissBg.style.transform = 'translate3d(0,' + ((prog - 0.5) * -90).toFixed(1) + 'px,0) scale(' + (1.08 + (0.5 - Math.abs(prog - 0.5)) * 0.12).toFixed(3) + ')';
      }
    }
  }
  window.addEventListener('scroll', onScrollFx, { passive: true });
  window.addEventListener('resize', function () { sizeSparkles(); onScrollFx(); ringLayout(); });
  onScrollFx();

  /* ---------- confetti ---------- */
  var cv = $('#confetti'), cctx = cv && cv.getContext('2d'), bits = [], cRunning = false;
  var cols = ['#ff8da8', '#e94e7c', '#f7d99a', '#5fe3c8', '#c9a0ff', '#ffffff', '#ffb347'];
  function sizeConfetti() { if (!cv) return; cv.width = window.innerWidth; cv.height = window.innerHeight; }
  sizeConfetti(); window.addEventListener('resize', sizeConfetti);
  function burst(x, y, n, spread, up) {
    if (reduce) n = Math.round(n / 4);
    for (var i = 0; i < n; i++) {
      var ang = (up ? -Math.PI / 2 : Math.random() * 6.28) + (Math.random() - .5) * spread, sp = 4 + Math.random() * 10;
      bits.push({ x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, r: Math.random() * 6.28, vr: (Math.random() - .5) * .4, c: cols[i % cols.length], life: 1 });
    }
    if (!cRunning) { cRunning = true; requestAnimationFrame(stepConfetti); }
  }
  function stepConfetti() {
    cctx.clearRect(0, 0, cv.width, cv.height);
    for (var i = bits.length - 1; i >= 0; i--) {
      var b = bits[i];
      b.vy += .22; b.vx *= .992; b.vy *= .992; b.x += b.vx; b.y += b.vy; b.r += b.vr; b.life -= .004;
      if (b.y > cv.height + 30 || b.life <= 0) { bits.splice(i, 1); continue; }
      cctx.save(); cctx.translate(b.x, b.y); cctx.rotate(b.r); cctx.globalAlpha = clamp(b.life * 2, 0, 1);
      cctx.fillStyle = b.c; cctx.scale(1, Math.abs(Math.cos(b.r * 2)) + .2); cctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); cctx.restore();
    }
    if (bits.length) requestAnimationFrame(stepConfetti); else { cRunning = false; cctx.clearRect(0, 0, cv.width, cv.height); }
  }
  function celebrate() {
    var w = window.innerWidth, h = window.innerHeight;
    burst(w * .15, h * .9, 90, 1.1, true); burst(w * .85, h * .9, 90, 1.1, true); burst(w * .5, h * .35, 120, 6.28, false);
    for (var i = 1; i <= 3; i++) setTimeout(function () { burst(Math.random() * w, h * .2, 60, 6.28, false); }, i * 380);
    for (var k = 0; k < 14; k++) setTimeout(makeHeart, k * 90);
  }

  /* ---------- wish + celebrate buttons ---------- */
  var wishBtn = $('#wishBtn'), flame = $('#flame'), wishMsg = $('#wishMsg'), wi = 0;
  if (wishBtn) wishBtn.addEventListener('click', function () {
    flame.classList.add('off');
    var list = S.wishes || ['Happy birthday!'];
    wishMsg.textContent = list[wi++ % list.length]; wishMsg.classList.add('show');
    var r = wishBtn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top, 110, 1.6, true);
    setTimeout(function () { flame.classList.remove('off'); wishBtn.textContent = 'Make another wish'; }, 3200);
  });
  var cBtn = $('#confettiBtn'); if (cBtn) cBtn.addEventListener('click', celebrate);

  /* ---------- envelope ---------- */
  var env = $('#envelope'), paper = $('#letterPaper');
  if (env && paper) env.addEventListener('click', function () {
    var open = !env.classList.contains('open');
    env.classList.toggle('open', open); paper.classList.toggle('show', open);
    env.setAttribute('aria-expanded', open); paper.setAttribute('aria-hidden', !open);
    if (open) setTimeout(function () { paper.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 650);
  });

  /* ---------- 3D ring gallery ---------- */
  var scene = $('#ringScene'), ring = $('#ring'), cards = $$('.ring-card'), rot = 0, vel = 0, dragging = false, moved = 0, lastX = 0, ringVisible = false;
  function ringLayout() {
    if (!scene || !cards.length) return;
    var cw = parseFloat(getComputedStyle(scene).getPropertyValue('--cw')) || 210;
    var n = cards.length, step = 360 / n, r = (cw / 2) / Math.tan(Math.PI / n) + 26;
    scene.style.setProperty('--r', r + 'px'); ring.style.setProperty('--r', r + 'px'); ring.style.setProperty('--step', step + 'deg');
    cards.forEach(function (c, i) { c.style.setProperty('--i', i); c.style.setProperty('--r', r + 'px'); c.style.setProperty('--step', step + 'deg'); });
  }
  ringLayout();
  if (scene) {
    scene.addEventListener('pointerdown', function (e) { dragging = true; moved = 0; lastX = e.clientX; vel = 0; scene.classList.add('drag'); });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); rot += dx * .35; vel = dx * .35;
    });
    function up() { dragging = false; scene.classList.remove('drag'); }
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { ringVisible = en[0].isIntersecting; }).observe(scene); else ringVisible = true;
  }

  /* lightbox */
  var lb = $('#lightbox'), lbImg = $('#lbImg'), lbIdx = 0;
  function lbShow(i) {
    lbIdx = (i + cards.length) % cards.length;
    lbImg.src = cards[lbIdx].getAttribute('data-full'); lbImg.alt = cards[lbIdx].querySelector('img').alt;
    lb.hidden = false; document.body.style.overflow = 'hidden';
  }
  function lbHide() { lb.hidden = true; document.body.style.overflow = ''; }
  cards.forEach(function (c, i) { c.addEventListener('click', function () { if (moved < 7) lbShow(i); }); });
  if (lb) {
    $('.lb-close', lb).addEventListener('click', lbHide);
    $('.lb-prev', lb).addEventListener('click', function () { lbShow(lbIdx - 1); });
    $('.lb-next', lb).addEventListener('click', function () { lbShow(lbIdx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lbHide(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') lbHide(); if (e.key === 'ArrowLeft') lbShow(lbIdx - 1); if (e.key === 'ArrowRight') lbShow(lbIdx + 1);
    });
  }

  /* ---------- floating hearts ---------- */
  function makeHeart() {
    var h = document.createElement('div');
    h.className = 'floating-heart';
    h.textContent = ['♥', '♡', '❤'][Math.floor(Math.random() * 3)];
    h.style.left = Math.random() * 100 + 'vw';
    h.style.fontSize = (12 + Math.random() * 18) + 'px';
    h.style.animationDuration = (7 + Math.random() * 7) + 's';
    document.body.appendChild(h);
    setTimeout(function () { h.remove(); }, 15000);
  }
  if (!reduce) setInterval(function () { if (!document.hidden) makeHeart(); }, 1100);

  /* ---------- main animation loop ---------- */
  var t0 = performance.now();
  function frame(now) {
    var t = (now - t0) / 1000, W = window.innerWidth, H = window.innerHeight;
    var fade = clamp(1 - window.scrollY / (H * 1.05), 0, 1);
    for (var i = 0; i < flies.length; i++) {
      var f = flies[i], p = flyPos(f, t, W, H), q = flyPos(f, t + .05, W, H);
      var ang = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI + 90;
      var z = Math.sin(t * .6 + f.p1) * 70;
      f.el.style.transform = 'translate3d(' + p[0].toFixed(1) + 'px,' + p[1].toFixed(1) + 'px,' + z.toFixed(0) + 'px) rotateZ(' + ang.toFixed(1) + 'deg) scale(' + f.sc.toFixed(2) + ')';
      f.el.style.opacity = f.hero ? fade.toFixed(2) : '.85';
    }
    if (hero && window.scrollY < H * 1.2) drawSparkles(t);
    if (ringVisible) {
      if (!dragging) { vel *= .95; rot += vel + (reduce ? 0 : .12); }
      ring.style.setProperty('--rot', rot.toFixed(2) + 'deg');
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
