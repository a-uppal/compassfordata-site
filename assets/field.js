/* DATA Compass evidence field. Every graphic on the page is drawn from one
   vocabulary of marks: measured, attributed, missing, contradictory.
   All values are illustrative; nothing here reads or reports real data. */
(function () {
  'use strict';

  var probe = document.createElement('canvas');
  if (!probe.getContext || !window.requestAnimationFrame) return;
  document.documentElement.classList.add('field-js');

  var TAU = Math.PI * 2;
  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = reduceQuery.matches;
  var bodyStyle = getComputedStyle(document.body);
  function token(name, fallback) {
    var value = bodyStyle.getPropertyValue(name).trim();
    return value || fallback;
  }
  var LIGHT = {
    main: token('--home-teal', '#00495D'),
    quiet: token('--home-quiet', '#4A6069'),
    alert: token('--home-terra', '#B85C38'),
    ground: token('--home-ground', '#EBE7E0')
  };
  var DARK = { main: '#FBF9F4', quiet: '#D4E1E3', alert: '#E9A27F', ground: token('--home-teal', '#00495D') };
  var SANS = "600 12px Inter, -apple-system, 'Segoe UI', sans-serif";

  /* Shares of the illustrative example, in mark order. */
  var SHARES = [0.58, 0.19, 0.14, 0.09];
  var MEASURED = 0, ATTRIBUTED = 1, MISSING = 2, CONTRA = 3, NEUTRAL = 4, READ = 5, CHANGED = 6, DIM = 7, WORD = 8;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutBack(t) { var c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function smooth(a, b, v) { var t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
  /* Marks have no head, so rotate through the shorter half turn. */
  function lerpTick(a, b, t) {
    var d = ((b - a + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
    return a + d * t;
  }
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function stateForFraction(f) {
    var acc = 0;
    for (var i = 0; i < SHARES.length; i++) { acc += SHARES[i]; if (f < acc) return i; }
    return CONTRA;
  }

  function line(ctx, x, y, ang, len) {
    var dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
    ctx.beginPath();
    ctx.moveTo(x - dx, y - dy);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
  }
  function drawMark(ctx, style, x, y, ang, len, alpha, pal) {
    if (alpha <= 0.01) return;
    ctx.lineCap = 'round';
    switch (style) {
      case MEASURED:
        ctx.globalAlpha = alpha; ctx.strokeStyle = pal.main; ctx.lineWidth = 2; line(ctx, x, y, ang, len); break;
      case ATTRIBUTED:
        ctx.globalAlpha = alpha * 0.5; ctx.strokeStyle = pal.main; ctx.lineWidth = 1.1; line(ctx, x, y, ang, len); break;
      case MISSING:
        ctx.globalAlpha = alpha * 0.75; ctx.strokeStyle = pal.quiet; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.6, len * 0.26), 0, TAU); ctx.stroke(); break;
      case CONTRA:
        ctx.globalAlpha = alpha; ctx.strokeStyle = pal.alert; ctx.lineWidth = 1.7;
        line(ctx, x, y, ang + Math.PI / 4, len * 0.86); line(ctx, x, y, ang - Math.PI / 4, len * 0.86); break;
      case NEUTRAL:
        ctx.globalAlpha = alpha * 0.3; ctx.strokeStyle = pal.quiet; ctx.lineWidth = 1.2; line(ctx, x, y, ang, len); break;
      case READ:
        ctx.globalAlpha = alpha * 0.9; ctx.strokeStyle = pal.main; ctx.lineWidth = 1.6; line(ctx, x, y, ang, len); break;
      case CHANGED:
        ctx.globalAlpha = alpha; ctx.strokeStyle = pal.main; ctx.lineWidth = 2; line(ctx, x, y, ang, len);
        ctx.fillStyle = pal.alert; ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5, 1.7, 0, TAU); ctx.fill(); break;
      case DIM:
        ctx.globalAlpha = alpha * 0.17; ctx.strokeStyle = pal.main; ctx.lineWidth = 1.2; line(ctx, x, y, ang, len); break;
      case WORD:
        ctx.globalAlpha = alpha * 0.92; ctx.strokeStyle = pal.main; ctx.lineWidth = 1.7; line(ctx, x, y, ang, len); break;
    }
  }
  function drawRose(ctx, x, y, r, pal, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pal.main;
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 4;
      var rr = i % 2 === 0 ? r : r * 0.3;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.alert;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.212, y - r * 0.212);
    ctx.lineTo(x, y);
    ctx.lineTo(x - r * 0.212, y - r * 0.212);
    ctx.closePath(); ctx.fill();
  }

  /* ---------- scene loop ---------- */
  var scenes = [];
  var raf = 0;
  function request() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    var again = false;
    for (var i = 0; i < scenes.length; i++) {
      var s = scenes[i];
      if (!s.visible || !(s.live || s.dirty)) continue;
      s.dirty = false;
      s.live = s.draw(now) === true;
      if (s.live) again = true;
    }
    if (again) request();
  }
  function fit(scene) {
    var rect = scene.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    scene.w = rect.width; scene.h = rect.height;
    scene.canvas.width = Math.round(rect.width * dpr);
    scene.canvas.height = Math.round(rect.height * dpr);
    scene.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scene.layout) scene.layout();
    scene.dirty = true;
    request();
  }
  var visibility = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      scenes.forEach(function (s) {
        if (s.host !== entry.target) return;
        s.visible = entry.isIntersecting;
        if (s.visible) { s.dirty = true; if (s.onShow) s.onShow(); request(); }
      });
    });
  }, { rootMargin: '80px' }) : null;
  function addScene(scene) {
    scene.ctx = scene.canvas.getContext('2d');
    scene.visible = !visibility;
    scenes.push(scene);
    if (visibility) visibility.observe(scene.host);
    fit(scene);
    return scene;
  }
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { scenes.forEach(fit); }, 120);
  });
  function local(canvas, event) {
    var r = canvas.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }

  /* ---------- hero: the asserted word becomes a measured dial ---------- */
  function heroScene() {
    var hero = document.querySelector('.home-hero');
    var canvas = hero && hero.querySelector('.home-hero__canvas');
    var dial = hero && hero.querySelector('.home-hero__dial');
    var stage = dial && dial.querySelector('.home-dial__stage');
    if (!canvas || !stage) return;
    var replay = dial.querySelector('[data-field-replay]');

    var HOLD = 1.25, SWEEP = 2.5, FLIGHT = 1.05, SETTLE = 1.1;
    var REST = -Math.PI / 2 + TAU * 0.885;
    var ambient = [], marks = [], cx = 0, cy = 0, R = 100;
    var t0 = null, fontsReady = false, moved = false;
    var ptr = { x: 0, y: 0, on: false, k: 0 };

    function avoidRects() {
      var base = canvas.getBoundingClientRect();
      return ['.home-hero__copy', '.home-hero__choices', '.home-hero__assurance', '.home-motion-rail', '.home-dial__meta']
        .map(function (sel) { return hero.querySelector(sel); })
        .filter(Boolean)
        .map(function (el) {
          var r = el.getBoundingClientRect();
          return { l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top };
        });
    }
    function rectDistance(rect, x, y) {
      var dx = Math.max(rect.l - x, 0, x - rect.r);
      var dy = Math.max(rect.t - y, 0, y - rect.b);
      return Math.sqrt(dx * dx + dy * dy);
    }
    function sampleWord(count, maxWidth) {
      var off = document.createElement('canvas');
      var W = Math.ceil(maxWidth), H = Math.ceil(R * 1.5);
      off.width = W; off.height = H;
      var o = off.getContext('2d');
      var size = R;
      o.font = 'italic 400 ' + size + "px 'Instrument Serif', Georgia, serif";
      var measured = o.measureText('ready').width || 1;
      size = size * Math.min(W * 0.94 / measured, 1.5);
      o.font = 'italic 400 ' + size + "px 'Instrument Serif', Georgia, serif";
      o.textAlign = 'center'; o.textBaseline = 'middle';
      o.fillText('ready', W / 2, H / 2);
      var data = o.getImageData(0, 0, W, H).data, pts = [];
      for (var y = 0; y < H; y += 2) {
        for (var x = 0; x < W; x += 2) {
          if (data[(y * W + x) * 4 + 3] > 120) pts.push({ x: x - W / 2, y: y - H / 2 });
        }
      }
      var rand = rng(11);
      for (var i = pts.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1)), tmp = pts[i]; pts[i] = pts[j]; pts[j] = tmp;
      }
      var out = [];
      for (var k = 0; k < count; k++) {
        var p = pts.length ? pts[k % pts.length] : { x: (rand() - 0.5) * W * 0.8, y: (rand() - 0.5) * H * 0.4 };
        out.push({ x: p.x + (rand() - 0.5), y: p.y + (rand() - 0.5), key: p.x + rand() * 26 });
      }
      out.sort(function (a, b) { return a.key - b.key; });
      return out;
    }

    var scene = {
      host: hero,
      canvas: canvas,
      layout: function () {
        var base = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        cx = sr.left - base.left + sr.width / 2;
        cy = sr.top - base.top + sr.height / 2;
        R = clamp(Math.min(sr.width, sr.height) / 2 - 8, 70, 215);
        var rects = avoidRects(), rand = rng(7);
        var mx = Math.cos(REST), my = Math.sin(REST);

        ambient = [];
        var step = this.w < 700 ? 27 : 31;
        for (var gy = step / 2; gy < this.h; gy += step) {
          for (var gx = step / 2; gx < this.w; gx += step) {
            var x = gx + (rand() - 0.5) * step * 0.7, y = gy + (rand() - 0.5) * step * 0.7;
            var a0 = rand() * Math.PI, jitter = rand();
            var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
            if (d < R * 1.16) continue;
            var open = 1;
            for (var i = 0; i < rects.length; i++) open = Math.min(open, smooth(6, 78, rectDistance(rects[i], x, y)));
            var alpha = open * (0.13 + 0.4 * Math.exp(-(d - R) / (R * 2.2)));
            if (alpha < 0.025) continue;
            var ux = dx / d, uy = dy / d, dot = mx * ux + my * uy;
            var bearing = ((Math.atan2(dy, dx) + Math.PI / 2) % TAU + TAU) % TAU / TAU;
            ambient.push({
              x: x, y: y, a0: a0, a1: Math.atan2(3 * dot * uy - my, 3 * dot * ux - mx),
              f: bearing, alpha: alpha, len: 7 + jitter * 4, late: jitter * 0.5
            });
          }
        }

        marks = [];
        var rows = this.w < 700 ? 3 : 4;
        for (var row = 0; row < rows; row++) {
          var rr = R - row * 12.5;
          var n = Math.floor(TAU * rr / 5.6);
          for (var m = 0; m < n; m++) {
            var f = (m + (row % 2) * 0.5) / n;
            var edge = 0, acc = 0;
            for (var s = 0; s < SHARES.length; s++) { acc += SHARES[s]; edge = Math.max(edge, Math.abs(f - acc) < 0.0055 ? 1 : 0); }
            if (edge || f < 0.0055) continue;
            var th = -Math.PI / 2 + f * TAU;
            marks.push({
              f: f, state: stateForFraction(f), rx: cx + Math.cos(th) * rr, ry: cy + Math.sin(th) * rr,
              rang: th, a0: rand() * Math.PI, arc: (rand() - 0.5) * 70, len: 8.4
            });
          }
        }
        marks.sort(function (a, b) { return a.f - b.f; });
        var word = sampleWord(marks.length, Math.min(sr.width * 0.94, R * 2.25));
        for (var w = 0; w < marks.length; w++) { marks[w].wx = cx + word[w].x; marks[w].wy = cy + word[w].y; }
      },
      onShow: function () { if (t0 === null && fontsReady) t0 = performance.now(); },
      draw: function (now) {
        var ctx = this.ctx, t = reduced ? 99 : (t0 === null ? 0 : (now - t0) / 1000);
        ctx.clearRect(0, 0, this.w, this.h);
        ptr.k += ((ptr.on ? 1 : 0) - ptr.k) * 0.14;
        var pk = reduced ? 0 : ptr.k;
        var reach = 150;

        function pull(x, y, ang) {
          if (pk < 0.01) return ang;
          var dx = ptr.x - x, dy = ptr.y - y, d = Math.sqrt(dx * dx + dy * dy);
          if (d > reach) return ang;
          var k = (1 - d / reach); k = k * k * pk;
          return lerpTick(ang, Math.atan2(dy, dx), k);
        }

        ctx.lineCap = 'round';
        ctx.strokeStyle = LIGHT.main;
        ctx.lineWidth = 1.2;
        for (var i = 0; i < ambient.length; i++) {
          var a = ambient[i];
          var u = ease(clamp01((t - (HOLD + a.f * SWEEP) - a.late) / 0.9));
          ctx.globalAlpha = a.alpha * (0.55 + 0.45 * u);
          line(ctx, a.x, a.y, pull(a.x, a.y, lerpTick(a.a0, a.a1, u)), a.len);
        }

        var swept = clamp01((t - HOLD) / SWEEP);
        var settle = clamp01((t - HOLD - SWEEP) / SETTLE);
        ctx.globalAlpha = 0.22 * swept; ctx.strokeStyle = LIGHT.main; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(8, R - 56), -Math.PI / 2, -Math.PI / 2 + TAU * swept); ctx.stroke();

        for (var j = 0; j < marks.length; j++) {
          var m = marks[j];
          var e = ease(clamp01((t - (HOLD + m.f * SWEEP)) / FLIGHT));
          var bow = Math.sin(Math.PI * e) * m.arc;
          var x = lerp(m.wx, m.rx, e) + Math.cos(m.rang) * bow;
          var y = lerp(m.wy, m.ry, e) + Math.sin(m.rang) * bow;
          var ang = pull(x, y, lerpTick(m.a0, m.rang, e));
          if (e < 1) drawMark(ctx, WORD, x, y, ang, lerp(3.6, m.len, e), 1 - e, LIGHT);
          if (e > 0) drawMark(ctx, m.state, x, y, ang, lerp(3.6, m.len, e), e, LIGHT);
        }

        var needle = t < HOLD ? -Math.PI / 2
          : t < HOLD + SWEEP ? -Math.PI / 2 + TAU * swept
          : -Math.PI / 2 + TAU + (REST - (-Math.PI / 2 + TAU)) * easeOutBack(settle);
        var nAlpha = clamp01((t - 0.5) / 0.6);
        var nl = R - 62, nw = Math.max(5, R * 0.05);
        var px = Math.cos(needle), py = Math.sin(needle);
        ctx.globalAlpha = nAlpha;
        ctx.fillStyle = LIGHT.alert;
        ctx.beginPath();
        ctx.moveTo(cx + px * nl, cy + py * nl);
        ctx.lineTo(cx - py * nw, cy + px * nw);
        ctx.lineTo(cx + py * nw, cy - px * nw);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = LIGHT.main;
        ctx.beginPath();
        ctx.moveTo(cx - px * nl * 0.62, cy - py * nl * 0.62);
        ctx.lineTo(cx - py * nw, cy + px * nw);
        ctx.lineTo(cx + py * nw, cy - px * nw);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = LIGHT.ground;
        ctx.beginPath(); ctx.arc(cx, cy, nw * 0.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;

        dial.classList.toggle('is-measured', t >= HOLD + SWEEP * 0.72);
        dial.classList.toggle('is-settled', t >= HOLD + SWEEP + SETTLE);

        var wasMoved = moved; moved = false;
        return t0 !== null && !reduced && (t < HOLD + SWEEP + FLIGHT + SETTLE + 0.2 || wasMoved || Math.abs((ptr.on ? 1 : 0) - ptr.k) > 0.01);
      }
    };
    addScene(scene);

    function begin() {
      fontsReady = true;
      fit(scene);
      if (scene.visible && t0 === null) t0 = performance.now();
      scene.live = true; request();
    }
    var started = false;
    function once() { if (!started) { started = true; begin(); } }
    if (document.fonts && document.fonts.load) {
      document.fonts.load("italic 400 120px 'Instrument Serif'").then(once, once);
      setTimeout(once, 1400);
    } else { once(); }

    hero.addEventListener('pointermove', function (event) {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      var p = local(canvas, event);
      ptr.x = p.x; ptr.y = p.y; ptr.on = true; moved = true;
      scene.live = true; request();
    });
    hero.addEventListener('pointerleave', function () { ptr.on = false; scene.live = true; request(); });
    if (replay) {
      if (reduced) replay.hidden = true;
      replay.addEventListener('click', function () {
        t0 = performance.now(); scene.live = true; request();
      });
    }
  }

  /* ---------- one motion: the same marks, four arrangements ---------- */
  function stageScene() {
    var wrap = document.querySelector('.home-stage');
    var canvas = wrap && wrap.querySelector('canvas');
    if (!canvas) return;
    var steps = Array.prototype.slice.call(wrap.querySelectorAll('.home-stage-grid > li'));
    var N = 420;
    var COUNTS = [244, 80, 59, 37];
    var BARS = [34, 24, 17, 12, 9];
    var rand = rng(23);
    var marks = [];
    (function build() {
      var slots = [];
      for (var i = 0; i < N; i++) slots.push(i);
      for (var k = N - 1; k > 0; k--) { var j = Math.floor(rand() * (k + 1)), tmp = slots[k]; slots[k] = slots[j]; slots[j] = tmp; }
      var idx = 0;
      for (var s = 0; s < 4; s++) for (var c = 0; c < COUNTS[s]; c++) {
        marks.push({ state: s, order: c, slot: slots[idx], u: rand(), pos: [null, null, null, null], style: [NEUTRAL, s, s, s] });
        idx++;
      }
      /* Gaps: contradictory first, then missing — ranked into five bars. */
      var gaps = marks.filter(function (m) { return m.state === CONTRA; }).concat(marks.filter(function (m) { return m.state === MISSING; }));
      var g = 0;
      BARS.forEach(function (size, bar) { for (var n = 0; n < size; n++, g++) { gaps[g].bar = bar; gaps[g].barOrder = n; } });
      var supported = marks.filter(function (m) { return m.state < MISSING; });
      supported.forEach(function (m, n) { m.supOrder = n; m.style[2] = DIM; });
      var changed = 0, reassess = 0;
      gaps.forEach(function (m) {
        if (m.bar < 2) { m.group = 1; m.groupOrder = changed++; m.style[3] = CHANGED; }
        else { m.group = 2; m.groupOrder = reassess++; }
      });
    })();

    var labels = [[], [], [], []];
    var extras = { scan: null, owners: [], seal: null };
    var pShown = -1, pTarget = -1;

    var scene = {
      host: wrap,
      canvas: canvas,
      layout: function () {
        var w = this.w, h = this.h, pad = w < 420 ? 14 : 28, i, m;
        labels = [[], [], [], []];

        /* Assess: an undifferentiated grid. */
        var wide = w >= h * 1.05;
        var cols = wide ? 28 : 20, rows = N / cols;
        var cell = Math.min((w - pad * 2) / cols, (h - pad * 2) / rows, 32);
        var ox = (w - cols * cell) / 2 + cell / 2, oy = (h - rows * cell) / 2 + cell / 2;
        for (i = 0; i < N; i++) {
          m = marks[i];
          m.row0 = Math.floor(m.slot / cols) / (rows - 1);
          m.pos[0] = { x: ox + (m.slot % cols) * cell, y: oy + Math.floor(m.slot / cols) * cell, len: cell * 0.56 };
        }
        extras.scan = { x0: ox - cell * 0.7, x1: ox + (cols - 1) * cell + cell * 0.7, y0: oy - cell / 2, y1: oy + (rows - 1) * cell + cell / 2 };

        /* Diagnose: four bands of evidence. */
        var labelW = w >= 520 ? 122 : 0;
        var rb = 4, c = 0;
        for (var tryRows = 4; tryRows <= 14; tryRows++) {
          var fitC = Math.min((w - pad * 2 - labelW) / Math.ceil(COUNTS[0] / tryRows), (h * 0.8 - (labelW ? 0 : 60)) / (4 * tryRows + 3 * 2.3));
          if (fitC > c) { c = fitC; rb = tryRows; }
        }
        c = clamp(c, 4.5, 22);
        var gap = c * 2.3 + (labelW ? 0 : 20);
        var total = 4 * rb * c + 3 * gap;
        var y0 = (h - total) / 2 + (labelW ? 0 : 10);
        var names = ['Measured', 'Attributed', 'Missing', 'Contradictory'];
        for (i = 0; i < N; i++) {
          m = marks[i];
          var yb = y0 + m.state * (rb * c + gap);
          m.pos[1] = { x: pad + labelW + Math.floor(m.order / rb) * c + c / 2, y: yb + (m.order % rb) * c + c / 2, len: c * 0.64 };
        }
        names.forEach(function (name, s) {
          var by = y0 + s * (rb * c + gap);
          labels[1].push(labelW
            ? { text: name, x: pad + labelW - 16, y: by + rb * c / 2, align: 'right' }
            : { text: name, x: pad, y: by - 11, align: 'left' });
        });

        /* Act: what is supported recedes; the gaps become a ranked list. */
        var cs = clamp(c * 0.5, 3.6, 9);
        var colsS = Math.floor((w - pad * 2) / cs), rowsS = Math.ceil(324 / colsS);
        var stripH = rowsS * cs;
        var left = 30, right = w >= 520 ? 118 : 46;
        var cb = clamp(Math.min((w - pad * 2 - left - right) / 17, (h - pad * 2 - stripH - 64) / (10 + 4 * 1.5)), 6, 30);
        var barsH = 5 * 2 * cb + 4 * cb * 1.5;
        var by0 = pad + stripH + 44 + Math.max(0, (h - pad * 2 - stripH - 44 - barsH) / 2);
        extras.owners = [];
        for (i = 0; i < N; i++) {
          m = marks[i];
          if (m.state < MISSING) {
            m.pos[2] = { x: pad + (m.supOrder % colsS) * cs + cs / 2, y: pad + Math.floor(m.supOrder / colsS) * cs + cs / 2, len: cs * 0.6 };
          } else {
            var yk = by0 + m.bar * (2 * cb + cb * 1.5);
            m.pos[2] = { x: pad + left + Math.floor(m.barOrder / 2) * cb + cb / 2, y: yk + (m.barOrder % 2) * cb + cb / 2, len: cb * 0.6 };
          }
        }
        var ownerX = w - pad - (right > 60 ? 86 : 14);
        BARS.forEach(function (size, bar) {
          var yc = by0 + bar * (2 * cb + cb * 1.5) + cb;
          labels[2].push({ text: String(bar + 1), x: pad + 6, y: yc, align: 'left' });
          extras.owners.push({ x0: pad + left + Math.ceil(size / 2) * cb + 8, x1: ownerX, y: yc });
        });
        labels[2].push({ text: 'Priority', x: pad + 6, y: by0 - 20, align: 'left' });
        labels[2].push({ text: 'Owner', x: ownerX + (right > 60 ? 16 : 6), y: by0 - 20, align: right > 60 ? 'left' : 'right' });

        /* Prove: a record of what supports, what changed, what to reassess. */
        var sealW = w >= 480 ? 150 : 0;
        var cols3 = Math.min(Math.floor((w - pad * 2) / c), 54);
        var blocks = [{ n: 324, rows: Math.ceil(324 / cols3), name: 'Supports the decision' }, { n: 58, rows: 2, name: 'Changed' }, { n: 38, rows: 2, name: 'Reassess' }];
        var head = 24, between = 26;
        var total3 = blocks.reduce(function (sum, b) { return sum + head + b.rows * c; }, 0) + between * 2;
        var yy = (h - total3) / 2;
        blocks.forEach(function (b) { b.y = yy + head; labels[3].push({ text: b.name, x: pad, y: yy + 8, align: 'left' }); yy += head + b.rows * c + between; });
        for (i = 0; i < N; i++) {
          m = marks[i];
          if (m.state < MISSING) {
            m.pos[3] = { x: pad + (m.supOrder % cols3) * c + c / 2, y: blocks[0].y + Math.floor(m.supOrder / cols3) * c + c / 2, len: c * 0.64 };
          } else {
            var b = blocks[m.group];
            m.pos[3] = { x: pad + Math.floor(m.groupOrder / 2) * c + c / 2, y: b.y + (m.groupOrder % 2) * c + c / 2, len: c * 0.64 };
          }
        }
        extras.seal = sealW && (58 / 2) * c < w - pad * 2 - sealW ? { x: w - pad - 70, y: blocks[1].y + (blocks[2].y + 2 * c - blocks[1].y) / 2, r: Math.min(56, (blocks[2].y + 2 * c - blocks[1].y) / 2 + 6) } : null;
        measure();
      },
      draw: function () {
        var ctx = this.ctx, w = this.w, h = this.h;
        if (reduced) pShown = Math.round(pTarget);
        else pShown += (pTarget - pShown) * 0.13;
        if (Math.abs(pTarget - pShown) < 0.002) pShown = pTarget;
        var p = pShown;
        ctx.clearRect(0, 0, w, h);

        var scan = clamp01(p + 1);
        var k = clamp(Math.floor(p), 0, 2);
        var raw = clamp01(p - k);
        var T = p <= 0 ? 0 : clamp01((raw - 0.22) / 0.56);
        var S = 0.55;

        for (var i = 0; i < marks.length; i++) {
          var m = marks[i];
          var e = T <= 0 ? 0 : T >= 1 ? 1 : ease(clamp01(T * (1 + S) - S * m.u));
          var a = m.pos[k], b = m.pos[k + 1];
          var x = lerp(a.x, b.x, e), y = lerp(a.y, b.y, e), len = lerp(a.len, b.len, e);
          var from = m.style[k], to = m.style[k + 1];
          if (k === 0 && from === NEUTRAL && m.row0 <= scan) from = READ;
          if (from === to) drawMark(ctx, from, x, y, Math.PI / 2, len, 1, LIGHT);
          else {
            drawMark(ctx, from, x, y, Math.PI / 2, len, 1 - e, LIGHT);
            drawMark(ctx, to, x, y, Math.PI / 2, len, e, LIGHT);
          }
        }

        function near(stage) { return clamp01(1 - Math.abs(p - stage) * 2.6); }

        var s0 = clamp01(1 - Math.max(0, p) * 3);
        if (extras.scan && scan > 0 && scan < 1 && s0 > 0) {
          var sy = lerp(extras.scan.y0, extras.scan.y1, scan);
          ctx.globalAlpha = s0; ctx.strokeStyle = LIGHT.alert; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(extras.scan.x0, sy); ctx.lineTo(extras.scan.x1, sy); ctx.stroke();
        }

        ctx.font = SANS; ctx.textBaseline = 'middle';
        for (var st = 1; st <= 3; st++) {
          var alpha = near(st);
          if (alpha <= 0.01) continue;
          ctx.globalAlpha = alpha; ctx.fillStyle = LIGHT.quiet;
          labels[st].forEach(function (label) { ctx.textAlign = label.align; ctx.fillText(label.text, label.x, label.y); });
          if (st === 2) {
            extras.owners.forEach(function (o) {
              ctx.globalAlpha = alpha * 0.4; ctx.strokeStyle = LIGHT.quiet; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
              ctx.beginPath(); ctx.moveTo(o.x0, o.y); ctx.lineTo(o.x1 - 9, o.y); ctx.stroke(); ctx.setLineDash([]);
              ctx.globalAlpha = alpha; ctx.strokeStyle = LIGHT.main; ctx.lineWidth = 1.6;
              ctx.beginPath(); ctx.arc(o.x1, o.y, 6.5, 0, TAU); ctx.stroke();
              ctx.fillStyle = LIGHT.main; ctx.beginPath(); ctx.arc(o.x1, o.y, 2.4, 0, TAU); ctx.fill();
            });
          }
          if (st === 3 && extras.seal) {
            var seal = extras.seal;
            ctx.globalAlpha = alpha * 0.8; ctx.strokeStyle = LIGHT.main; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(seal.x, seal.y, seal.r, 0, TAU); ctx.stroke();
            for (var q = 0; q < 48; q++) {
              var qa = q / 48 * TAU;
              ctx.globalAlpha = alpha * 0.55;
              line(ctx, seal.x + Math.cos(qa) * (seal.r - 6), seal.y + Math.sin(qa) * (seal.r - 6), qa, q % 4 === 0 ? 6 : 3);
            }
            drawRose(ctx, seal.x, seal.y, seal.r * 0.52, LIGHT, alpha);
          }
        }
        ctx.globalAlpha = 1;

        var active = clamp(Math.round(p), 0, 3);
        steps.forEach(function (step, n) { step.classList.toggle('is-active', n === active); });
        return pShown !== pTarget;
      }
    };

    function measure() {
      if (!steps.length) return;
      var vh = window.innerHeight;
      var stacked = window.matchMedia('(max-width: 800px)').matches;
      var lineY = vh * (stacked ? 0.74 : 0.5);
      var centres = steps.map(function (step) { var r = step.getBoundingClientRect(); return r.top + r.height / 2; });
      var p;
      if (lineY <= centres[0]) p = -clamp01((centres[0] - lineY) / (vh * 0.45));
      else if (lineY >= centres[centres.length - 1]) p = centres.length - 1;
      else {
        p = 0;
        for (var i = 0; i < centres.length - 1; i++) {
          if (lineY >= centres[i] && lineY < centres[i + 1]) { p = i + (lineY - centres[i]) / (centres[i + 1] - centres[i]); break; }
        }
      }
      if (p !== pTarget) { pTarget = p; scene.live = true; request(); }
    }
    addScene(scene);
    window.addEventListener('scroll', measure, { passive: true });
    measure();
  }

  /* ---------- industries: one vocabulary, two shapes ---------- */
  function figureScene(canvas) {
    var kind = canvas.getAttribute('data-figure');
    var host = canvas.closest('.home-industry') || canvas;
    var hover = false, speed = 0, phase = 0, last = 0;
    var seed = kind === 'helix' ? 41 : 67;

    function pick(r) { return r < 0.66 ? MEASURED : r < 0.84 ? ATTRIBUTED : r < 0.95 ? MISSING : CONTRA; }

    var scene = {
      host: host,
      canvas: canvas,
      draw: function (now) {
        var ctx = this.ctx, w = this.w, h = this.h, rand = rng(seed);
        var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
        speed += ((hover && !reduced ? 1 : 0) - speed) * 0.08;
        phase += dt * speed;
        ctx.clearRect(0, 0, w, h);
        var i, j;

        if (kind === 'helix') {
          var amp = h * 0.36, cy = h / 2, stepX = 11, turns = w / 190;
          for (i = 0; i * stepX < w - 8; i++) {
            var x = 6 + i * stepX;
            var ph = x / w * turns * TAU + phase * 0.9;
            var s = Math.sin(ph), depth = Math.cos(ph);
            var yA = cy + s * amp, yB = cy - s * amp;
            var top = Math.min(yA, yB), span = Math.abs(yA - yB);
            var rungs = Math.floor(span / 9);
            var state = pick(rand());
            for (j = 1; j < rungs; j++) {
              drawMark(ctx, state, x, top + j * (span / rungs), Math.PI / 2, 6.4, 0.35 + 0.65 * Math.abs(s), LIGHT);
            }
            ctx.globalAlpha = 0.7 + 0.25 * depth; ctx.fillStyle = LIGHT.main;
            ctx.beginPath(); ctx.arc(x, yA, depth > 0 ? 3 : 2, 0, TAU); ctx.fill();
            ctx.globalAlpha = 0.7 - 0.25 * depth;
            ctx.beginPath(); ctx.arc(x, yB, depth > 0 ? 2 : 3, 0, TAU); ctx.fill();
          }
        } else {
          var colW = 26, n = Math.floor((w - 4) / colW), base = h - 10, unit = 8.5;
          var sweep = (phase * 0.22) % 1.25 - 0.12;
          var challengeY = h * 0.3;
          for (i = 0; i < n; i++) {
            var cx = 2 + i * colW + colW / 2;
            var levels = 5 + Math.floor(rand() * ((base - 8) / unit - 5));
            var lit = speed > 0.02 ? Math.exp(-Math.pow((cx / w - sweep) / 0.07, 2)) * speed : 0;
            for (j = 0; j < levels; j++) {
              var y = base - j * unit;
              var st = pick(rand());
              var gapMark = st >= MISSING;
              drawMark(ctx, st, cx - 5, y, 0, 7.5, gapMark ? Math.min(1, 0.8 + lit) : 0.9, LIGHT);
              drawMark(ctx, pick(rand()), cx + 5, y, 0, 7.5, 0.9, LIGHT);
              if (gapMark && lit > 0.05) {
                ctx.globalAlpha = lit * 0.8; ctx.strokeStyle = LIGHT.alert; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(cx - 5, y, 6.5, 0, TAU); ctx.stroke();
              }
            }
            ctx.globalAlpha = 0.5; ctx.strokeStyle = LIGHT.main; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(cx - 10, base + 6); ctx.lineTo(cx + 10, base + 6); ctx.stroke();
          }
          ctx.globalAlpha = 0.55; ctx.strokeStyle = LIGHT.alert; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
          ctx.beginPath(); ctx.moveTo(0, challengeY); ctx.lineTo(w, challengeY); ctx.stroke(); ctx.setLineDash([]);
          if (speed > 0.02) {
            ctx.globalAlpha = 0.5 * speed; ctx.strokeStyle = LIGHT.alert; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(sweep * w, 0); ctx.lineTo(sweep * w, h); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        var keep = hover || speed > 0.01;
        if (!keep) last = 0;
        return keep && !reduced;
      }
    };
    addScene(scene);
    host.addEventListener('pointerenter', function (event) {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      hover = true; scene.live = true; request();
    });
    host.addEventListener('pointerleave', function () { hover = false; });
  }

  /* ---------- deployment: the data stays inside the wall ---------- */
  function boundaryScene() {
    var figure = document.querySelector('.home-boundary');
    var canvas = figure && figure.querySelector('canvas');
    if (!canvas) return;
    var G = null, start = 0;

    function setTall() { figure.classList.toggle('is-tall', figure.getBoundingClientRect().width < 460); }
    setTall();

    var scene = {
      host: figure,
      canvas: canvas,
      layout: function () {
        setTall();
        var w = this.w, h = this.h, tall = figure.classList.contains('is-tall');
        var wall = tall ? { l: 8, t: 14, r: w - 8, b: h * 0.74 } : { l: 10, t: 16, r: w - 10, b: h * 0.76 };
        var compass = tall ? { x: w * 0.5, y: h * 0.46 } : { x: w * 0.66, y: h * 0.38 };
        var endpoint = tall ? { x: w * 0.5, y: h * 0.84 } : { x: w * 0.66, y: h * 0.9 };
        var centres = tall
          ? [{ x: w * 0.2, y: h * 0.15 }, { x: w * 0.5, y: h * 0.13 }, { x: w * 0.8, y: h * 0.15 }]
          : [{ x: w * 0.2, y: h * 0.19 }, { x: w * 0.15, y: h * 0.38 }, { x: w * 0.2, y: h * 0.57 }];
        var rand = rng(5), ticks = [];
        centres.forEach(function (c) {
          for (var row = 0; row < 4; row++) for (var col = 0; col < 6; col++) {
            var x = c.x + (col - 2.5) * 10, y = c.y + (row - 1.5) * 10;
            ticks.push({ x: x, y: y, bearing: Math.atan2(y - compass.y, x - compass.x), state: rand() < 0.8 ? MEASURED : rand() < 0.6 ? ATTRIBUTED : MISSING });
          }
        });
        var bearings = centres.map(function (c) { return Math.atan2(c.y - compass.y, c.x - compass.x); });
        /* Unwrap so the sweep takes the short way across the sources. */
        var ref = bearings[1];
        bearings = bearings.map(function (b) { var d = b - ref; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return ref + d; });
        ticks.forEach(function (t) { var d = t.bearing - ref; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; t.bearing = ref + d; });
        var lo = Math.min.apply(null, bearings) - 0.16, hi = Math.max.apply(null, bearings) + 0.16;

        /* The wall is stitched from marks, with one gate toward the optional endpoint. */
        var stitches = [], rad = 22, gateHalf = 15, spacing = 7;
        function push(x, y, normal) {
          if (Math.abs(y - wall.b) < 1 && Math.abs(x - endpoint.x) < gateHalf) return;
          stitches.push({ x: x, y: y, ang: normal });
        }
        var x, y, a;
        for (x = wall.l + rad; x <= wall.r - rad; x += spacing) { push(x, wall.t, Math.PI / 2); push(x, wall.b, Math.PI / 2); }
        for (y = wall.t + rad; y <= wall.b - rad; y += spacing) { push(wall.l, y, 0); push(wall.r, y, 0); }
        [[wall.l + rad, wall.t + rad, Math.PI], [wall.r - rad, wall.t + rad, -Math.PI / 2], [wall.r - rad, wall.b - rad, 0], [wall.l + rad, wall.b - rad, Math.PI / 2]].forEach(function (corner) {
          for (a = 0.12; a < Math.PI / 2; a += spacing / rad) {
            var ang = corner[2] + a;
            stitches.push({ x: corner[0] + Math.cos(ang) * rad, y: corner[1] + Math.sin(ang) * rad, ang: ang });
          }
        });
        G = { tall: tall, wall: wall, compass: compass, endpoint: endpoint, centres: centres, ticks: ticks, lo: lo, hi: hi, stitches: stitches, reach: Math.max.apply(null, centres.map(function (c) { return Math.hypot(c.x - compass.x, c.y - compass.y); })) + 44, r: clamp(Math.min(w, h) * 0.085, 24, 40) };
      },
      draw: function (now) {
        if (!G) return false;
        var ctx = this.ctx, w = this.w, h = this.h;
        if (!start) start = now;
        var t = reduced ? 0.25 : (now - start) / 1000;
        var beam = lerp(G.lo, G.hi, 0.5 - 0.5 * Math.cos(t * 0.7));
        ctx.clearRect(0, 0, w, h);
        ctx.lineCap = 'round';

        ctx.strokeStyle = DARK.main; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.62;
        G.stitches.forEach(function (s) { line(ctx, s.x, s.y, s.ang, 9); });

        ctx.save();
        ctx.beginPath(); ctx.rect(G.wall.l + 5, G.wall.t + 5, G.wall.r - G.wall.l - 10, G.wall.b - G.wall.t - 10); ctx.clip();
        var grad = ctx.createRadialGradient(G.compass.x, G.compass.y, G.r, G.compass.x, G.compass.y, G.reach);
        grad.addColorStop(0, 'rgba(251,249,244,0.26)'); grad.addColorStop(1, 'rgba(251,249,244,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(G.compass.x, G.compass.y); ctx.arc(G.compass.x, G.compass.y, G.reach, beam - 0.1, beam + 0.1); ctx.closePath(); ctx.fill();
        ctx.restore();

        ctx.setLineDash([2, 5]); ctx.strokeStyle = DARK.quiet; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
        G.centres.forEach(function (c) {
          var a = Math.atan2(c.y - G.compass.y, c.x - G.compass.x);
          ctx.beginPath(); ctx.moveTo(G.compass.x + Math.cos(a) * (G.r + 8), G.compass.y + Math.sin(a) * (G.r + 8));
          ctx.lineTo(c.x - Math.cos(a) * 38, c.y - Math.sin(a) * 38); ctx.stroke();
        });
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.moveTo(G.endpoint.x, G.compass.y + G.r + (G.tall ? 62 : 8)); ctx.lineTo(G.endpoint.x, G.endpoint.y - 16); ctx.stroke();
        ctx.setLineDash([3, 4]); ctx.strokeStyle = DARK.main; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(G.endpoint.x, G.endpoint.y, 11, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);

        G.ticks.forEach(function (tick) {
          var glow = Math.exp(-Math.pow((tick.bearing - beam) / 0.11, 2));
          drawMark(ctx, tick.state, tick.x, tick.y, Math.PI / 2, 6.5, 0.5 + 0.5 * glow, DARK);
        });

        ctx.globalAlpha = 1; ctx.fillStyle = DARK.main;
        ctx.beginPath(); ctx.arc(G.compass.x, G.compass.y, G.r, 0, TAU); ctx.fill();
        drawRose(ctx, G.compass.x, G.compass.y, G.r * 0.7, { main: DARK.ground, alert: LIGHT.alert }, 1);
        ctx.globalAlpha = 1;
        return !reduced;
      }
    };
    addScene(scene);
  }

  /* ---------- close: every mark on one bearing ---------- */
  function bearingScene(canvas) {
    var host = canvas.closest('section') || canvas;
    var PAL = canvas.getAttribute('data-tone') === 'dark' ? DARK : LIGHT;
    var ptr = { x: 0, y: 0, on: false, k: 0 }, moved = false;
    var REST = -Math.PI / 2 + TAU * 0.885;
    var scene = {
      host: canvas,
      canvas: canvas,
      draw: function () {
        var ctx = this.ctx, w = this.w, h = this.h, rand = rng(3);
        ctx.clearRect(0, 0, w, h);
        ptr.k += ((ptr.on ? 1 : 0) - ptr.k) * 0.12;
        ctx.strokeStyle = PAL.main; ctx.lineCap = 'round'; ctx.lineWidth = 1.3;
        var step = 24;
        for (var y = step / 2; y < h; y += step) {
          for (var x = step / 2; x < w; x += step) {
            var px = x + (rand() - 0.5) * 8, py = y + (rand() - 0.5) * 8, ang = REST;
            if (ptr.k > 0.01) {
              var dx = ptr.x - px, dy = ptr.y - py, d = Math.sqrt(dx * dx + dy * dy);
              if (d < 220) { var k = 1 - d / 220; ang = lerpTick(REST, Math.atan2(dy, dx), k * k * ptr.k); }
            }
            ctx.globalAlpha = 0.14 + 0.36 * (y / h);
            line(ctx, px, py, ang, 9);
          }
        }
        ctx.globalAlpha = 1;
        var wasMoved = moved; moved = false;
        return !reduced && (wasMoved || Math.abs((ptr.on ? 1 : 0) - ptr.k) > 0.01);
      }
    };
    addScene(scene);
    if (reduced) return;
    host.addEventListener('pointermove', function (event) {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      var p = local(canvas, event);
      ptr.x = p.x; ptr.y = p.y; ptr.on = true; moved = true; scene.live = true; request();
    });
    host.addEventListener('pointerleave', function () { ptr.on = false; scene.live = true; request(); });
  }

  /* ---------- shared: a field of filings around one centre ---------- */
  function ambientScene(canvas) {
    var host = canvas.parentElement;
    var PAL = canvas.getAttribute('data-tone') === 'dark' ? DARK : LIGHT;
    var centreEl = host.querySelector(canvas.getAttribute('data-center') || ':scope');
    var avoidSel = canvas.getAttribute('data-avoid');
    var REST = -Math.PI / 2 + TAU * 0.885;
    var marks = [], shownAt = 0, moved = false, cx = 0, cy = 0, R = 100;
    var ptr = { x: 0, y: 0, on: false, k: 0 };
    var scene = {
      host: host,
      canvas: canvas,
      layout: function () {
        var base = canvas.getBoundingClientRect(), c = (centreEl || host).getBoundingClientRect();
        cx = c.left - base.left + c.width / 2; cy = c.top - base.top + c.height / 2;
        R = Math.min(c.width, c.height) / 2;
        var rects = avoidSel ? Array.prototype.map.call(host.querySelectorAll(avoidSel), function (el) {
          var r = el.getBoundingClientRect();
          return { l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top };
        }) : [];
        var rand = rng(13), step = this.w < 700 ? 28 : 32;
        var mx = Math.cos(REST), my = Math.sin(REST), far = Math.max(this.w, this.h);
        marks = [];
        for (var gy = step / 2; gy < this.h; gy += step) {
          for (var gx = step / 2; gx < this.w; gx += step) {
            var x = gx + (rand() - 0.5) * step * 0.7, y = gy + (rand() - 0.5) * step * 0.7;
            var a0 = rand() * Math.PI, jitter = rand();
            var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
            if (d < R * 1.05) continue;
            var open = 1;
            for (var i = 0; i < rects.length; i++) {
              var ex = Math.max(rects[i].l - x, 0, x - rects[i].r), ey = Math.max(rects[i].t - y, 0, y - rects[i].b);
              open = Math.min(open, smooth(4, 70, Math.sqrt(ex * ex + ey * ey)));
            }
            var alpha = open * (0.12 + 0.38 * Math.exp(-(d - R) / (R * 1.8)));
            if (alpha < 0.025) continue;
            var ux = dx / d, uy = dy / d, dot = mx * ux + my * uy;
            marks.push({ x: x, y: y, a0: a0, a1: Math.atan2(3 * dot * uy - my, 3 * dot * ux - mx), alpha: alpha, len: 7 + jitter * 4, delay: d / far * 1.5 + jitter * 0.3 });
          }
        }
      },
      onShow: function () { if (!shownAt) shownAt = performance.now(); },
      draw: function (now) {
        var ctx = this.ctx, t = reduced ? 99 : (shownAt ? (now - shownAt) / 1000 : 0);
        ctx.clearRect(0, 0, this.w, this.h);
        ptr.k += ((ptr.on ? 1 : 0) - ptr.k) * 0.14;
        var pk = reduced ? 0 : ptr.k;
        ctx.lineCap = 'round'; ctx.strokeStyle = PAL.main; ctx.lineWidth = 1.2;
        for (var i = 0; i < marks.length; i++) {
          var m = marks[i], u = ease(clamp01((t - 0.5 - m.delay) / 0.9));
          var ang = lerpTick(m.a0, m.a1, u);
          if (pk > 0.01) {
            var dx = ptr.x - m.x, dy = ptr.y - m.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < 150) { var k = 1 - d / 150; ang = lerpTick(ang, Math.atan2(dy, dx), k * k * pk); }
          }
          ctx.globalAlpha = m.alpha * (0.55 + 0.45 * u);
          line(ctx, m.x, m.y, ang, m.len);
        }
        ctx.globalAlpha = 1;
        var wasMoved = moved; moved = false;
        return !reduced && (t < 3.6 || wasMoved || Math.abs((ptr.on ? 1 : 0) - ptr.k) > 0.01);
      }
    };
    addScene(scene);
    if (reduced) return;
    host.addEventListener('pointermove', function (event) {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      var p = local(canvas, event);
      ptr.x = p.x; ptr.y = p.y; ptr.on = true; moved = true; scene.live = true; request();
    });
    host.addEventListener('pointerleave', function () { ptr.on = false; scene.live = true; request(); });
  }

  /* ---------- platform: six checkpoints, one of them measured ---------- */
  function gatesScene(canvas) {
    var rail = canvas.parentElement.querySelector('.sys-rail');
    if (!rail) return;
    var items = Array.prototype.slice.call(rail.children);
    var measuredIndex = parseInt(canvas.getAttribute('data-measured') || '1', 10);
    var marks = [], bases = [], shownAt = 0;
    var scene = {
      host: canvas,
      canvas: canvas,
      layout: function () {
        var base = canvas.getBoundingClientRect(), rand = rng(31), cell = 10, rows = Math.max(3, Math.floor((this.h - 14) / cell));
        var tops = items.map(function (el) { return Math.round(el.getBoundingClientRect().top); });
        var inRow = tops.every(function (t) { return Math.abs(t - tops[0]) < 4; });
        marks = []; bases = [];
        if (!inRow) return;
        var h = this.h;
        items.forEach(function (el, g) {
          var r = el.getBoundingClientRect(), left = r.left - base.left;
          var cols = Math.max(4, Math.floor(Math.min(r.width, 170) / cell));
          bases.push({ x0: left, x1: left + cols * cell, measured: g === measuredIndex });
          for (var c = 0; c < cols; c++) for (var row = 0; row < rows; row++) {
            marks.push({ x: left + c * cell + cell / 2, y: h - 10 - row * cell - cell / 2, state: g === measuredIndex ? stateForFraction(rand()) : NEUTRAL, u: rand() });
          }
        });
      },
      onShow: function () { if (!shownAt) shownAt = performance.now(); },
      draw: function (now) {
        var ctx = this.ctx, t = reduced ? 99 : (shownAt ? (now - shownAt) / 1000 : 0);
        ctx.clearRect(0, 0, this.w, this.h);
        marks.forEach(function (m) {
          if (m.state === NEUTRAL) { drawMark(ctx, NEUTRAL, m.x, m.y, Math.PI / 2, 6, 1, LIGHT); return; }
          var e = ease(clamp01((t - 0.5 - m.u * 1.1) / 0.6));
          drawMark(ctx, NEUTRAL, m.x, m.y, Math.PI / 2, 6, 1 - e, LIGHT);
          drawMark(ctx, m.state, m.x, m.y, Math.PI / 2, 6, e, LIGHT);
        });
        bases.forEach(function (b) {
          ctx.globalAlpha = b.measured ? 1 : 0.35; ctx.strokeStyle = b.measured ? LIGHT.alert : LIGHT.main; ctx.lineWidth = b.measured ? 2 : 1;
          ctx.beginPath(); ctx.moveTo(b.x0, scene.h - 4); ctx.lineTo(b.x1, scene.h - 4); ctx.stroke();
        });
        ctx.globalAlpha = 1;
        return !reduced && t < 2.6;
      }
    };
    addScene(scene);
  }

  /* ---------- platform: four dimensions standing on one foundation ---------- */
  function pillarsScene(canvas) {
    var names = (canvas.getAttribute('data-labels') || '').split('|');
    var foundation = canvas.getAttribute('data-foundation') || '';
    var scene = {
      host: canvas,
      canvas: canvas,
      draw: function () {
        var ctx = this.ctx, w = this.w, h = this.h, rand = rng(59);
        ctx.clearRect(0, 0, w, h);
        var narrow = w < 640, cell = narrow ? 9 : 11;
        var bandRows = 3, bandTop = h - 26 - bandRows * cell;
        var span = Math.min(w, 980), x0 = (w - span) / 2;
        var cols = narrow ? 5 : 8, rows = Math.max(4, Math.floor((bandTop - (narrow ? 44 : 34)) / cell));
        var i, c, r;
        for (c = 0; c * cell < span; c++) for (r = 0; r < bandRows; r++) {
          drawMark(ctx, rand() < 0.82 ? MEASURED : ATTRIBUTED, x0 + c * cell + cell / 2, bandTop + r * cell + cell / 2, 0, cell * 0.62, 1, LIGHT);
        }
        ctx.font = SANS; ctx.fillStyle = LIGHT.quiet; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 1; ctx.textAlign = 'center';
        ctx.fillText(foundation, w / 2, h - 10);
        for (i = 0; i < names.length; i++) {
          var centre = x0 + span * (i + 0.5) / names.length, left = centre - cols * cell / 2;
          var weak = [0.1, 0.22, 0.3, 0.16][i % 4];
          for (c = 0; c < cols; c++) for (r = 0; r < rows; r++) {
            var roll = rand();
            var state = roll < weak * 0.35 ? CONTRA : roll < weak ? MISSING : roll < weak + 0.2 ? ATTRIBUTED : MEASURED;
            drawMark(ctx, state, left + c * cell + cell / 2, bandTop - 6 - r * cell - cell / 2, Math.PI / 2, cell * 0.62, 1, LIGHT);
          }
          ctx.globalAlpha = 1; ctx.fillStyle = LIGHT.main; ctx.textAlign = 'center';
          var top = bandTop - 6 - rows * cell - 12;
          if (narrow) {
            var parts = names[i].split(' ');
            ctx.fillText(parts[0], centre, top - 14); ctx.fillText(parts.slice(1).join(' '), centre, top);
          } else ctx.fillText(names[i], centre, top);
        }
        ctx.globalAlpha = 1;
        return false;
      }
    };
    addScene(scene);
  }

  heroScene();
  stageScene();
  Array.prototype.forEach.call(document.querySelectorAll('canvas[data-figure]'), figureScene);
  boundaryScene();
  Array.prototype.forEach.call(document.querySelectorAll('.home-close__bearing, canvas[data-field="bearing"]'), bearingScene);
  Array.prototype.forEach.call(document.querySelectorAll('canvas[data-field="ambient"]'), ambientScene);
  Array.prototype.forEach.call(document.querySelectorAll('canvas[data-field="gates"]'), gatesScene);
  Array.prototype.forEach.call(document.querySelectorAll('canvas[data-field="pillars"]'), pillarsScene);

  function onMotionChange() { reduced = reduceQuery.matches; scenes.forEach(function (s) { s.dirty = true; s.live = true; }); request(); }
  if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', onMotionChange);
})();
