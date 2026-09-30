/* ============================================================================
   WebBook 设计稿 · 四阶段驱动（约 2KB，无依赖）
   —— 只做四件事：导航模型切换、账号菜单开合、选中态、标签页。
      动效全部交给 r4.css 里的 --dur/--ease，这里不写任何时长常量。
   ========================================================================= */
(function () {
  'use strict';

  document.addEventListener('click', function (e) {
    /* 导航模型切换 */
    var sw = e.target.closest('[data-model-btn]');
    if (sw) {
      var key = sw.getAttribute('data-model-btn');
      var box = sw.closest('[data-model-scope]') || document;
      box.querySelectorAll('[data-model-btn]').forEach(function (b) {
        b.classList.toggle('on', b === sw);
      });
      box.querySelectorAll('[data-model]').forEach(function (m) {
        m.classList.toggle('on', m.getAttribute('data-model') === key);
      });
      return;
    }

    /* 账号菜单开合（点外部关闭） */
    var trig = e.target.closest('[data-acct-trigger]');
    if (trig) {
      var menu = trig.parentElement.querySelector('[data-acct-menu]');
      var open = menu && menu.hasAttribute('hidden') === false;
      document.querySelectorAll('[data-acct-menu]').forEach(function (m) { m.setAttribute('hidden', ''); });
      document.querySelectorAll('[data-acct-trigger]').forEach(function (t) { t.setAttribute('aria-expanded', 'false'); });
      if (menu && !open) { menu.removeAttribute('hidden'); trig.setAttribute('aria-expanded', 'true'); }
      return;
    }
    if (!e.target.closest('[data-acct-menu]')) {
      document.querySelectorAll('[data-acct-menu]').forEach(function (m) { m.setAttribute('hidden', ''); });
      document.querySelectorAll('[data-acct-trigger]').forEach(function (t) { t.setAttribute('aria-expanded', 'false'); });
    }

    /* 顶部导航 / 侧栏目录 / 移动底栏 的选中态 */
    var nav = e.target.closest('.nav-item');
    if (nav) {
      nav.parentElement.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('on'); });
      nav.classList.add('on');
      return;
    }
    var row = e.target.closest('.tree-row');
    if (row) {
      row.parentElement.querySelectorAll('.tree-row').forEach(function (r) { r.classList.remove('on'); });
      row.classList.add('on');
      return;
    }
    var mn = e.target.closest('.m-nav-item');
    if (mn) {
      mn.parentElement.querySelectorAll('.m-nav-item').forEach(function (n) { n.classList.remove('on'); });
      mn.classList.add('on');
      return;
    }
    var tab = e.target.closest('.tabs button');
    if (tab) {
      tab.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
      tab.classList.add('on');
      return;
    }
    var tb = e.target.closest('[data-tabbtn]');
    if (tb) {
      var group = tb.parentElement;
      group.querySelectorAll('[data-tabbtn]').forEach(function (b) { b.classList.toggle('on', b === tb); });
      var panels = group.parentElement.querySelectorAll('[data-tabpanel]');
      panels.forEach(function (p) { p.style.display = p.getAttribute('data-tabpanel') === tb.getAttribute('data-tabbtn') ? '' : 'none'; });
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('[data-acct-menu]').forEach(function (m) { m.setAttribute('hidden', ''); });
    }
  });
})();
