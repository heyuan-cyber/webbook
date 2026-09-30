/* ============================================================================
   WebBook 设计稿 · 七阶段驱动
   ----------------------------------------------------------------------------
   三条纪律：
     1) 装饰型效果在 no-fx / reduced-motion 下**根本不挂监听**
     2) 每次触发都实时读 [data-preset]（预设可切换，不能缓存）
     3) 元素在 display:none 时（被预设门控掉）直接不处理
   ========================================================================= */
(function () {
  'use strict';

  var reduceQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  function decoOff() {
    return reduceQ.matches || document.documentElement.classList.contains('no-fx') ||
           document.documentElement.classList.contains('force-reduce');
  }
  function presetOf(el) {
    var f = el.closest('[data-preset]');
    return f ? f.getAttribute('data-preset') : 'playful';
  }
  function visible(el) { return el && el.offsetParent !== null; }
  function raf(fn) {
    var q = false, last = null;
    return function (e) {
      last = e;
      if (q) return; q = true;
      requestAnimationFrame(function () { q = false; fn(last); });
    };
  }

  /* ── 预设切换 ─────────────────────────────────────────────────────── */
  function initPresets() {
    document.querySelectorAll('[data-set-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-set-preset');
        var scope = btn.closest('[data-preset-scope]') || document;
        scope.querySelectorAll('[data-set-preset]').forEach(function (b) {
          b.classList.toggle('on', b === btn);
        });
        scope.querySelectorAll('[data-preset]').forEach(function (f) {
          f.setAttribute('data-preset', key);
        });
        scope.querySelectorAll('[data-preset-note]').forEach(function (n) {
          n.hidden = n.getAttribute('data-preset-note') !== key;
        });
      });
    });
  }

  /* ── 站点：顶栏 morph（功能型，reduced 下也工作）──────────────────── */
  function initHeader() {
    document.querySelectorAll('.site-body').forEach(function (body) {
      var head = body.querySelector('.site-header');
      if (!head) return;
      body.addEventListener('scroll', raf(function () {
        head.classList.toggle('stuck', body.scrollTop > 12);
      }), { passive: true });
    });
  }

  /* ── Hero 视差（装饰型 · 仅 lively / playful）─────────────────────── */
  function initParallax() {
    var heroes = document.querySelectorAll('[data-parallax]');
    if (!heroes.length) return;
    function update() {
      if (decoOff()) return;
      heroes.forEach(function (h) {
        if (presetOf(h) === 'quiet' || !visible(h)) {
          h.querySelectorAll('[data-par-depth]').forEach(function (l) { l.style.transform = ''; });
          return;
        }
        var body = h.closest('.site-body');
        var t = body ? body.scrollTop : 0;
        if (t > 700) return;
        h.querySelectorAll('[data-par-depth]').forEach(function (l) {
          var d = parseFloat(l.getAttribute('data-par-depth')) || 0;
          l.style.transform = 'translate3d(0,' + (t * d * 0.16).toFixed(1) + 'px,0)';
        });
      });
    }
    document.querySelectorAll('.site-body').forEach(function (b) {
      b.addEventListener('scroll', raf(update), { passive: true });
    });
    update();
  }

  /* ── 光标光晕（装饰型 · 仅 lively / playful）─────────────────────── */
  function initSpotlight() {
    document.querySelectorAll('[data-spotlight]').forEach(function (host) {
      var glow = host.querySelector('.hero-glow');
      if (!glow) return;
      host.addEventListener('pointermove', raf(function (e) {
        if (decoOff()) { glow.style.opacity = '0'; return; }
        if (presetOf(host) === 'quiet') { glow.style.opacity = '0'; return; }
        var r = host.getBoundingClientRect();
        glow.style.opacity = '1';
        glow.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        glow.style.setProperty('--my', (e.clientY - r.top) + 'px');
      }));
      host.addEventListener('pointerleave', function () { glow.style.opacity = '0'; });
    });
  }

  /* ── 卡片倾斜（装饰型 · 仅 lively / playful）────────────────────── */
  function initTilt() {
    document.querySelectorAll('.cards').forEach(function (grid) {
      grid.addEventListener('pointermove', function (e) {
        grid.querySelectorAll('.card').forEach(function (c) {
          if (decoOff() || presetOf(c) === 'quiet' || !visible(c)) { c.style.transform = ''; return; }
          var r = c.getBoundingClientRect();
          var inside = e.clientX >= r.left - 24 && e.clientX <= r.right + 24 &&
                       e.clientY >= r.top - 24 && e.clientY <= r.bottom + 24;
          if (!inside) { c.style.transform = ''; return; }
          var dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
          var dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
          c.style.transform = 'perspective(700px) rotateY(' + (dx * 6).toFixed(2) + 'deg) rotateX(' + (-dy * 6).toFixed(2) + 'deg) translateY(-3px)';
        });
      });
      grid.addEventListener('pointerleave', function () {
        grid.querySelectorAll('.card').forEach(function (c) { c.style.transform = ''; });
      });
    });
  }

  /* ── 磁吸 CTA（装饰型 · 仅 playful）─────────────────────────────── */
  function initMagnetic() {
    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      var host = btn.parentElement;
      host.addEventListener('pointermove', function (e) {
        if (decoOff() || presetOf(btn) !== 'playful' || !visible(btn)) { btn.style.transform = ''; return; }
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        var d = Math.sqrt(dx * dx + dy * dy), R = 120;
        if (d > R) { btn.style.transform = ''; return; }
        var k = (1 - d / R) * 8 / (d || 1);
        btn.style.transform = 'translate(' + (dx * k).toFixed(2) + 'px,' + (dy * k).toFixed(2) + 'px)';
      });
      host.addEventListener('pointerleave', function () { btn.style.transform = ''; });
    });
  }

  /* ── 卡片涟漪（装饰型 · 仅 playful）─────────────────────────────── */
  function initRipple() {
    document.querySelectorAll('.cards').forEach(function (grid) {
      grid.addEventListener('pointerdown', function (e) {
        var c = e.target.closest('.card');
        if (!c || decoOff() || presetOf(c) !== 'playful') return;
        var r = c.getBoundingClientRect(), size = Math.max(r.width, r.height);
        var el = document.createElement('span');
        el.className = 'card-ripple';
        el.style.width = el.style.height = size + 'px';
        el.style.left = (e.clientX - r.left - size / 2) + 'px';
        el.style.top = (e.clientY - r.top - size / 2) + 'px';
        if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
        c.appendChild(el);
        setTimeout(function () { el.remove(); }, 520);
      });
    });
  }

  /* ── 词标乱码归位（装饰型 · 仅 lively / playful）────────────────── */
  function initScramble() {
    var GLYPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·—/\\';
    document.querySelectorAll('[data-scramble]').forEach(function (el) {
      var target = el.getAttribute('data-scramble');
      var spans = Array.prototype.slice.call(el.querySelectorAll('span'));
      var timers = [];
      el.addEventListener('pointerenter', function () {
        if (decoOff() || presetOf(el) === 'quiet' || !visible(el)) return;
        timers.forEach(clearTimeout); timers = [];
        spans.forEach(function (sp, i) {
          var final = target[i] || sp.textContent, ticks = 4 + i;
          for (var t = 0; t < ticks; t++) {
            (function (t, i, sp) {
              timers.push(setTimeout(function () {
                sp.textContent = GLYPH[Math.floor(Math.random() * GLYPH.length)];
                sp.style.color = 'var(--accent)';
              }, t * 42 + i * 26));
            })(t, i, sp);
          }
          timers.push(setTimeout(function () { sp.textContent = final; sp.style.color = ''; }, ticks * 42 + i * 26));
        });
      });
    });
  }

  /* ── 宠物（装饰型 · 仅 playful）────────────────────────────────── */
  function initPet() {
    document.querySelectorAll('[data-pet]').forEach(function (el) {
      el.style.setProperty('--blink', (4.2 + Math.random() * 3.4).toFixed(2) + 's');
      el.setAttribute('data-look', 'center');
      var host = el.closest('.site-body') || el.parentElement;
      host.addEventListener('pointermove', raf(function (e) {
        if (decoOff() || presetOf(el) !== 'playful' || !visible(el)) return;
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        if (Math.sqrt(dx * dx + dy * dy) > 300) { el.setAttribute('data-look', 'center'); return; }
        el.setAttribute('data-look', Math.abs(dx) < 16 && dy > 0 ? 'down' : dx < 0 ? 'left' : 'right');
      }));
    });
  }

  /* ── 配置面板 ─────────────────────────────────────────────────────── */
  function initSettings() {
    document.querySelectorAll('.itm').forEach(function (itm) {
      var sw = itm.querySelector('.sw');
      if (!sw || itm.classList.contains('locked')) return;
      sw.addEventListener('click', function () {
        itm.classList.toggle('on');
        var gated = itm.getAttribute('data-gate');
        if (gated) document.querySelectorAll('[data-fx="' + gated + '"]').forEach(function (n) { n.hidden = !itm.classList.contains('on'); });
      });
    });
    document.querySelectorAll('input[type=range]').forEach(function (r) {
      var out = r.parentElement.querySelector('.val');
      function sync() { if (out) out.textContent = r.value + r.getAttribute('data-unit'); }
      r.addEventListener('input', sync); sync();
    });
    document.querySelectorAll('.radio label').forEach(function (l) {
      l.addEventListener('click', function () {
        l.parentElement.querySelectorAll('label').forEach(function (x) { x.classList.remove('on'); });
        l.classList.add('on');
        var input = l.querySelector('input'); if (input) input.checked = true;
      });
    });
  }

  /* ── 规范表里的可点样片 ───────────────────────────────────────────── */
  function initMinis() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mini]');
      if (!b) return;
      var m = b.closest('.mini') || b.parentElement.querySelector('.mini');
      if (!m) return;
      m.classList.remove('playing'); void m.offsetWidth; m.classList.add('playing');
      setTimeout(function () { m.classList.remove('playing'); }, 1000);
    });
  }

  /* ── 全局开关 ─────────────────────────────────────────────────────── */
  function initToggles() {
    var fx = document.querySelectorAll('[data-fx-toggle]');
    function syncFx() {
      var off = document.documentElement.classList.contains('no-fx');
      fx.forEach(function (b) {
        b.classList.toggle('on', off);
        var l = b.querySelector('[data-fx-label]');
        if (l) l.textContent = off ? '装饰型：已关闭' : '装饰型：开启';
      });
      if (off) document.querySelectorAll('[data-par-depth],[data-magnetic]').forEach(function (n) { n.style.transform = ''; });
    }
    fx.forEach(function (b) {
      b.addEventListener('click', function () { document.documentElement.classList.toggle('no-fx'); syncFx(); });
    });
    syncFx();

    var rd = document.querySelectorAll('[data-reduce-toggle]');
    function syncRd() {
      var on = document.documentElement.classList.contains('force-reduce');
      rd.forEach(function (b) {
        b.classList.toggle('on', on);
        var l = b.querySelector('[data-reduce-label]');
        if (l) l.textContent = on ? '减少动态：已开启' : '减少动态：关闭';
      });
    }
    rd.forEach(function (b) {
      b.addEventListener('click', function () { document.documentElement.classList.toggle('force-reduce'); syncRd(); });
    });
    syncRd();
  }

  function boot() {
    initPresets(); initHeader(); initParallax(); initSpotlight(); initTilt();
    initMagnetic(); initRipple(); initScramble(); initPet(); initSettings(); initMinis(); initToggles();
    if (reduceQ.matches) document.documentElement.classList.add('force-reduce');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
