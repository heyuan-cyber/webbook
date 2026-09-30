/* ============================================================================
   WebBook 设计稿 · 六阶段驱动（交互层实验台）
   ----------------------------------------------------------------------------
   两条纪律，整份代码都在遵守：
     1) 装饰型交互在 html.no-fx / prefers-reduced-motion 下一律不挂监听 ——
        不是"挂了但不动"，是**根本不注册**，这样连帧开销都没有
     2) 滚动相关的一律 passive + rAF 节流，且同一帧内只跑一次
   ========================================================================= */
(function () {
  'use strict';

  var reduceQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  function decorativeOff() {
    return reduceQ.matches || document.documentElement.classList.contains('no-fx') ||
           document.documentElement.classList.contains('force-reduce');
  }
  function rafThrottle(fn) {
    var queued = false, lastEvt = null;
    return function (e) {
      lastEvt = e;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fn(lastEvt); });
    };
  }

  /* ══ 装饰型交互 ══════════════════════════════════════════════════════ */

  /* 1 视差：三层不同速率。用「舞台相对视口中心的位置」当进度，更接近线上 */
  function initParallax() {
    var stages = document.querySelectorAll('[data-par]');
    if (!stages.length) return;
    function update() {
      stages.forEach(function (st) {
        var r = st.getBoundingClientRect();
        var p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight; // -1..1 左右
        st.querySelectorAll('[data-par-depth]').forEach(function (l) {
          var d = parseFloat(l.getAttribute('data-par-depth')) || 0;
          l.style.transform = 'translate3d(0,' + (-p * d * 60).toFixed(1) + 'px,0)';
        });
      });
    }
    window.addEventListener('scroll', rafThrottle(update), { passive: true });
    window.addEventListener('resize', rafThrottle(update), { passive: true });
    update();
  }

  /* 2 光标光晕 */
  function initSpotlight() {
    document.querySelectorAll('[data-spotlight]').forEach(function (st) {
      var glow = st.querySelector('.spot-glow');
      if (!glow) return;
      st.addEventListener('pointermove', rafThrottle(function (e) {
        if (decorativeOff()) return;
        var r = st.getBoundingClientRect();
        glow.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        glow.style.setProperty('--my', (e.clientY - r.top) + 'px');
      }));
    });
  }

  /* 3 卡片倾斜（上限 6°，超过就晕） */
  function initTilt() {
    document.querySelectorAll('[data-tilt]').forEach(function (card) {
      var wrap = card.closest('.tilt-wrap') || card.parentElement;
      wrap.addEventListener('pointermove', function (e) {
        if (decorativeOff()) { card.style.transform = ''; return; }
        var r = card.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        dx = Math.max(-1, Math.min(1, dx)); dy = Math.max(-1, Math.min(1, dy));
        card.style.transform = 'rotateY(' + (dx * 6).toFixed(2) + 'deg) rotateX(' + (-dy * 6).toFixed(2) + 'deg)';
      });
      wrap.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }

  /* 4 磁吸按钮（位移上限 8px） */
  function initMagnetic() {
    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      var wrap = btn.parentElement;
      wrap.addEventListener('pointermove', function (e) {
        if (decorativeOff()) { btn.style.transform = ''; return; }
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        var d = Math.sqrt(dx * dx + dy * dy);
        var R = 120;
        if (d > R) { btn.style.transform = ''; return; }
        var k = (1 - d / R) * 8 / (d || 1);
        btn.style.transform = 'translate(' + (dx * k).toFixed(2) + 'px,' + (dy * k).toFixed(2) + 'px)';
      });
      wrap.addEventListener('pointerleave', function () { btn.style.transform = ''; });
    });
  }

  /* 5 字符乱码（悬停时短暂"重排"再归位） */
  function initScramble() {
    var GLYPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·—/\\';
    document.querySelectorAll('[data-scramble]').forEach(function (el) {
      var target = el.getAttribute('data-scramble');
      var spans = Array.prototype.slice.call(el.querySelectorAll('span'));
      var timer = [];
      function run() {
        if (decorativeOff()) return;
        timer.forEach(clearTimeout); timer = [];
        spans.forEach(function (sp, i) {
          var final = target[i] || sp.textContent;
          var ticks = 4 + i;
          for (var t = 0; t < ticks; t++) {
            (function (t, i, sp) {
              timer.push(setTimeout(function () {
                sp.textContent = GLYPH[Math.floor(Math.random() * GLYPH.length)];
                sp.style.color = 'var(--accent)';
              }, t * 42 + i * 26));
            })(t, i, sp);
          }
          timer.push(setTimeout(function () {
            sp.textContent = final;
            sp.style.color = '';
          }, ticks * 42 + i * 26));
        });
      }
      el.addEventListener('pointerenter', run);
    });
  }

  /* ══ 功能区：replay 型 ═══════════════════════════════════════════════ */
  function initReplay() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-replay]');
      if (!b) return;
      var d = b.closest('.demo');
      if (!d) return;
      d.classList.remove('playing');
      void d.offsetWidth;
      d.classList.add('playing');
      setTimeout(function () { d.classList.remove('playing'); }, 1200);
    });
  }

  /* ══ 功能型交互：进度线 / 顶栏 morph（no-fx 下仍然工作）═════════════ */
  function initProgress() {
    document.querySelectorAll('[data-progress]').forEach(function (box) {
      var sc = box.querySelector('.prog-body'), bar = box.querySelector('.prog-bar i');
      if (!sc || !bar) return;
      sc.addEventListener('scroll', rafThrottle(function () {
        var max = sc.scrollHeight - sc.clientHeight;
        bar.style.width = (max > 0 ? sc.scrollTop / max * 100 : 0) + '%';
      }), { passive: true });
    });
  }
  function initMorph() {
    document.querySelectorAll('[data-morph]').forEach(function (box) {
      var sc = box.querySelector('.morph-body'), bar = box.querySelector('.morph-bar');
      if (!sc || !bar) return;
      sc.addEventListener('scroll', rafThrottle(function () {
        bar.classList.toggle('stuck', sc.scrollTop > 12);
      }), { passive: true });
    });
  }
  function initPulseTip() {
    document.querySelectorAll('[data-pulse]').forEach(function (box) {
      var tip = box.querySelector('.pul-tip');
      box.querySelectorAll('.pul i').forEach(function (cell, i) {
        cell.addEventListener('pointerenter', function () {
          if (!tip) return;
          var d = i - 59;
          tip.textContent = d === 0 ? '今天' : Math.abs(d) + ' 天前' + (cell.classList.contains('l3') ? ' · 战斗演出编辑器' : cell.classList.contains('l2') ? ' · 光照管线笔记' : cell.classList.contains('l1') ? ' · 一次小改' : ' · 没有更新');
        });
      });
    });
  }
  function initToggleDemos() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-toggle-demo]');
      if (!t) return;
      var d = t.closest('.demo');
      if (!d) return;
      var stage = d.querySelector('.hash-stage, .night-stage');
      if (stage) stage.classList.toggle(t.getAttribute('data-toggle-demo'));
      t.classList.toggle('on');
    });
  }

  /* ══ 全局：关掉装饰型交互 ═══════════════════════════════════════════ */
  function initFxToggle() {
    var btns = document.querySelectorAll('[data-fx-toggle]');
    if (!btns.length) return;
    function sync() {
      var off = document.documentElement.classList.contains('no-fx');
      btns.forEach(function (b) {
        b.classList.toggle('on', off);
        b.setAttribute('aria-pressed', String(off));
        var l = b.querySelector('[data-fx-label]');
        if (l) l.textContent = off ? '装饰型交互：已关闭' : '装饰型交互：开启';
      });
      // 关掉时把已经写上去的 inline transform 清干净，避免残留
      if (off) {
        document.querySelectorAll('[data-par-depth],[data-tilt],[data-magnetic]').forEach(function (el) {
          el.style.transform = '';
        });
      }
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        document.documentElement.classList.toggle('no-fx');
        sync();
      });
    });
    sync();
  }
  function initReduceToggle() {
    var btns = document.querySelectorAll('[data-reduce-toggle]');
    if (!btns.length) return;
    function sync() {
      var on = document.documentElement.classList.contains('force-reduce');
      btns.forEach(function (b) {
        b.classList.toggle('on', on);
        var l = b.querySelector('[data-reduce-label]');
        if (l) l.textContent = on ? '减少动态：已开启' : '减少动态：关闭';
      });
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        document.documentElement.classList.toggle('force-reduce');
        sync();
      });
    });
    sync();
  }

  function boot() {
    initParallax(); initSpotlight(); initTilt(); initMagnetic(); initScramble();
    initReplay(); initProgress(); initMorph(); initPulseTip(); initToggleDemos();
    initFxToggle(); initReduceToggle();
    document.querySelectorAll('.no .demo-stage, .deco-only .demo-stage').forEach(function (s) {});
    if (reduceQ.matches) document.documentElement.classList.add('force-reduce');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
