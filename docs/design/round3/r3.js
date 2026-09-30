/* ============================================================================
   WebBook 设计稿 · 动效驱动（约 3KB，无依赖）
   ----------------------------------------------------------------------------
   只用三种机制，避免设计稿本身变成一套框架：
     1) 一次性重播 —— [data-play] 给最近的 .demo 加 .playing，动画结束移除
     2) 开关式    —— [data-toggle] 直接切 .playing（用于同步态 / 镜头 / 勾选）
     3) 自动播放  —— 滚进视口时播一次（IntersectionObserver，只播一次）
   reduced-motion：@media 管真实偏好；#reduceToggle 手动切 <html class="force-reduce">
   让同一台机器上能直接对比「有动效 / 无动效」。
   ========================================================================= */
(function () {
  'use strict';

  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = function () {
    return reduceQuery.matches || document.documentElement.classList.contains('force-reduce');
  };

  /* 每条 animation 的最长时长，用来决定什么时候摘掉 .playing */
  var HOLD = {
    stagger: 900, shared: 620, indicator: 420, save: 1000, camera: 560,
    wire: 700, breathe: 1600, palette: 620, sheet: 520, check: 420,
    skeleton: 520, count: 520,
  };

  var timers = new WeakMap();

  function play(demo) {
    if (!demo) return;
    var name = demo.getAttribute('data-anim');
    demo.classList.remove('playing');
    // 强制回流，让同名 animation 能重播
    void demo.offsetWidth;
    demo.classList.add('playing');
    var prev = timers.get(demo);
    if (prev) clearTimeout(prev);
    if (!/^(save|breathe|indicator|skeleton)/.test(name || '')) {
      timers.set(demo, setTimeout(function () {
        demo.classList.remove('playing');
      }, HOLD[name] || 900));
    }
  }

  function toggle(demo) {
    if (!demo) return;
    demo.classList.toggle('playing');
  }

  /* ── 点击派发 ─────────────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var replay = e.target.closest('[data-play]');
    if (replay) {
      // 一键重播既可挂在 .demo 里，也可直接挂在任何 [data-anim] 容器上（时长阶那种窄行）
      var d = replay.closest('.demo') || replay.closest('[data-anim]');
      if (d && d.getAttribute('data-mode') === 'toggle') toggle(d);
      else play(d);
      return;
    }
    var replayAll = e.target.closest('[data-play-all]');
    if (replayAll) {
      document.querySelectorAll('.demo[data-anim], .dur-row[data-anim]').forEach(function (d) { play(d); });
      return;
    }
    // 滑动指示条：点哪个 tab，滑块滑到哪
    var tab = e.target.closest('[data-anim="indicator"] .ind-track button');
    if (tab) {
      var track = tab.parentElement;
      var thumb = track.querySelector('.ind-thumb');
      track.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
      tab.classList.add('on');
      if (thumb) {
        thumb.style.width = tab.offsetWidth + 'px';
        thumb.style.transform = 'translateX(' + (tab.offsetLeft - 3) + 'px)';
      }
      return;
    }
    // 保存态：同步中 ↔ 已同步
    var sv = e.target.closest('[data-anim="save"] .sv');
    if (sv) { sv.classList.toggle('idle'); sv.classList.toggle('done'); return; }

    // 目录树 / 轨道选中态：让样例屏真的能点
    var row = e.target.closest('.tree-row');
    if (row && row.closest('.sb')) {
      row.parentElement.querySelectorAll('.tree-row').forEach(function (r) { r.classList.remove('on'); });
      row.classList.add('on');
      return;
    }
    var railItem = e.target.closest('.rail-item');
    if (railItem) {
      railItem.parentElement.querySelectorAll('.rail-item').forEach(function (r) { r.classList.remove('on'); });
      railItem.classList.add('on');
      return;
    }
    var mnav = e.target.closest('.m-nav');
    if (mnav) {
      mnav.parentElement.querySelectorAll('.m-nav').forEach(function (r) { r.classList.remove('on'); });
      mnav.classList.add('on');
      return;
    }
    var tabsBtn = e.target.closest('.tabs button');
    if (tabsBtn) {
      tabsBtn.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
      tabsBtn.classList.add('on');
    }
  });

  /* ── 滚进视口自动播一次 ───────────────────────────────────────────── */
  function initAutoPlay() {
    var demos = document.querySelectorAll('.demo[data-anim][data-auto]');
    if (!demos.length) return;
    if (reduced() || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { play(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.35 });
    demos.forEach(function (d) { io.observe(d); });
  }

  /* ── 内容入场（.reveal）──────────────────────────────────────────── */
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;
    if (reduced() || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ── reduced-motion 手动开关 ─────────────────────────────────────── */
  function initReduceToggle() {
    var btns = document.querySelectorAll('[data-reduce-toggle]');
    if (!btns.length) return;
    function sync() {
      var on = document.documentElement.classList.contains('force-reduce');
      btns.forEach(function (b) {
        b.classList.toggle('on', on);
        var label = b.querySelector('[data-reduce-label]');
        if (label) label.textContent = on ? '已降级（无动效）' : '正常动效';
        b.setAttribute('aria-pressed', String(on));
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

  /* ── 运行时显示当前真实偏好 ──────────────────────────────────────── */
  function initEnvLabel() {
    var el = document.querySelector('[data-env-reduced]');
    if (el) el.textContent = reduceQuery.matches ? '系统当前：已开启减少动态效果' : '系统当前：正常';
  }

  /* ── 初始化：指示条滑块定位 ──────────────────────────────────────── */
  function initIndicators() {
    document.querySelectorAll('[data-anim="indicator"] .ind-track').forEach(function (track) {
      var thumb = track.querySelector('.ind-thumb');
      var on = track.querySelector('button.on') || track.querySelector('button');
      if (!thumb || !on) return;
      thumb.style.width = on.offsetWidth + 'px';
      thumb.style.transform = 'translateX(' + (on.offsetLeft - 3) + 'px)';
    });
  }

  function boot() {
    initAutoPlay(); initReveal(); initReduceToggle(); initEnvLabel(); initIndicators();
    reduceQuery.addEventListener && reduceQuery.addEventListener('change', function () {
      initEnvLabel();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 图片/字体加载后尺寸会变，重新量一次滑块
  window.addEventListener('load', initIndicators);
})();
