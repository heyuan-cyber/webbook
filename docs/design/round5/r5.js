/* ============================================================================
   WebBook 设计稿 · 五阶段驱动（无依赖）
   ----------------------------------------------------------------------------
   宠物行为状态机 + 实验台控件。设计意图：

     · 行为全部落在三个 data 属性上（pose / look / awake），CSS 负责表现
     · **绝不跟随光标** —— 只有"转头看"。实验台里可以打开跟随做反面对照
     · 所有事件写进一条可读日志，方便把"它在干什么"讲清楚
   ========================================================================= */
(function () {
  'use strict';

  var reduceQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  function reduced() {
    return reduceQ.matches || document.documentElement.classList.contains('force-reduce');
  }

  /* ── 一段压缩到 28 秒的行为脚本（真实场景对应 90 秒）─────────────────
     每条：at=秒, pose, look, say=气泡文案, log=日志文案 */
  var SCRIPT = [
    { at: 0.0,  pose: '',        look: 'center', say: '', log: '从右下角探出头，坐下', tag: 'arrive' },
    { at: 1.6,  pose: '',        look: 'center', say: '', log: '开始呼吸（2.4s 周期，唯一持续信号）', tag: 'breathe' },
    { at: 4.0,  pose: 'sniff',   look: 'down',   say: '嗯？新面孔。', log: '闻一闻 —— 只对第一次来的访客', tag: 'sniff' },
    { at: 7.0,  pose: '',        look: 'center', say: '', log: '回到待机', tag: 'idle' },
    { at: 9.5,  pose: 'alert',   look: 'left',   say: '', log: '读者滚到「项目示例」→ 抬头看了一眼', tag: 'alert' },
    { at: 12.5, pose: '',        look: 'center', say: '', log: '又坐下了', tag: 'idle' },
    { at: 16.0, pose: 'yawn',    look: 'down',   say: '……呼。', log: '读者在一段上停了 20 秒 → 打个哈欠', tag: 'yawn' },
    { at: 19.5, pose: '',        look: 'center', say: '', log: '待机', tag: 'idle' },
    { at: 23.0, pose: 'stretch', look: 'center', say: '看完了？', log: '滚到底部 → 伸个懒腰', tag: 'stretch' },
    { at: 26.5, pose: '',        look: 'center', say: '', log: '安静下来', tag: 'idle' },
  ];

  function boot() {
    document.querySelectorAll('[data-pet]').forEach(setupPet);
    document.querySelectorAll('[data-lab]').forEach(setupLab);
    initReduceToggle();
  }

  /* ── 单只宠物：随机眨眼、转头看、点击气泡 ─────────────────────────── */
  function setupPet(el) {
    // 默认 hidden，由 JS 显式打开 —— 最坏情况是「没有宠物」而不是「一只卡住的宠物」
    el.hidden = window.innerWidth < 1100;

    // 每个实例的眨眼周期不同，避免多只宠物同频（也避免单只太机械）
    el.style.setProperty('--blink', (4.2 + Math.random() * 3.4).toFixed(2) + 's');

    var bubble = el.parentElement.querySelector('[data-pet-bubble]');
    var sayTimer = 0;

    el.setAttribute('data-look', 'center');
    el.setAttribute('data-awake', 'true');

    // 转头看：指针进入"领地"（宠物周围 260px）才反应。不是跟随。
    var host = el.closest('[data-pet-stage]') || el.parentElement;
    host.addEventListener('pointermove', function (e) {
      if (el.dataset.follow === '1') return;
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 260) { el.setAttribute('data-look', 'center'); return; }
      el.setAttribute('data-look', Math.abs(dx) < 14 && dy > 0 ? 'down' : dx < 0 ? 'left' : 'right');
    });
    host.addEventListener('pointerleave', function () { el.setAttribute('data-look', 'center'); });

    el.addEventListener('click', function () {
      var msg = el.dataset.say || '（它看了你一眼）';
      if (bubble) {
        bubble.textContent = msg;
        bubble.classList.add('show');
        clearTimeout(sayTimer);
        sayTimer = setTimeout(function () { bubble.classList.remove('show'); }, 2600);
      }
      el.setAttribute('data-pose', 'alert');
      setTimeout(function () { el.setAttribute('data-pose', ''); }, 900);
    });
  }

  /* ── 实验台：物种切换 / 行为开关 / 时间轴 / 反面对照 ───────────────── */
  function setupLab(lab) {
    var stage = lab.querySelector('[data-pet-stage]');
    var pet = stage.querySelector('[data-pet]');
    var log = lab.querySelector('.log');
    var playhead = lab.querySelector('.tl-play');
    var bubble = lab.querySelector('[data-pet-bubble]');
    var playBtn = lab.querySelector('[data-lab-play]');

    /* 物种切换 */
    lab.querySelectorAll('[data-species]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-species');
        lab.querySelectorAll('[data-species]').forEach(function (x) { x.classList.toggle('on', x === b); });
        stage.querySelectorAll('[data-pet-svg]').forEach(function (s) {
          s.hidden = s.getAttribute('data-pet-svg') !== key;
        });
        addLog('换上 <b>' + b.getAttribute('data-label') + '</b>　（只换 SVG，行为不变）', 'species');
      });
    });

    /* 行为开关 */
    var opts = {};
    lab.querySelectorAll('[data-beh]').forEach(function (cb) {
      opts[cb.getAttribute('data-beh')] = cb.checked;
      cb.addEventListener('change', function () {
        opts[cb.getAttribute('data-beh')] = cb.checked;
        applyOpts();
        addLog((cb.checked ? '打开' : '关闭') + ' <b>' + cb.getAttribute('data-label') + '</b>', 'opt');
      });
    });

    function applyOpts() {
      pet.dataset.follow = opts.follow ? '1' : '0';
      if (opts.follow) {
        stage.classList.add('follow-demo');
        addLog('<b>跟随光标</b>已打开 —— 这一步是故意做成反面对照', 'warn');
      } else {
        stage.classList.remove('follow-demo');
      }
      pet.style.visibility = opts.show === false ? 'hidden' : '';
      if (!opts.react) pet.setAttribute('data-look', 'center');
      if (opts.quiet) { pet.setAttribute('data-awake', 'false'); pet.setAttribute('data-pose', ''); }
      else pet.setAttribute('data-awake', 'true');
    }

    /* 跟随光标（反面对照）：直接改 transform */
    stage.addEventListener('pointermove', function (e) {
      if (!opts.follow) return;
      var r = stage.getBoundingClientRect();
      pet.style.transform = 'translate(' + (e.clientX - r.left - r.width + 130) * 0.28 + 'px,' +
        (e.clientY - r.top - r.height + 130) * 0.28 + 'px)';
    });
    stage.addEventListener('pointerleave', function () { if (opts.follow) pet.style.transform = ''; });

    /* 时间轴 */
    var t0 = 0, raf = 0, playing = false;
    var DUR = 28;
    function addLog(text, tag) {
      if (!log) return;
      var row = document.createElement('div');
      var s = (playing || t0 ? t0 : 0).toFixed(1);
      row.innerHTML = '<span class="t">' + s.padStart(5, ' ') + 's</span>  ' + text;
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }
    function applyAt(t) {
      var cur = SCRIPT[0];
      for (var i = 0; i < SCRIPT.length; i++) if (SCRIPT[i].at <= t) cur = SCRIPT[i];
      if (pet.dataset.lastTag !== cur.tag + cur.at) {
        pet.dataset.lastTag = cur.tag + cur.at;
        pet.setAttribute('data-pose', opts.react === false ? '' : cur.pose);
        pet.setAttribute('data-look', cur.look);
        if (bubble) {
          if (cur.say) { bubble.textContent = cur.say; bubble.classList.add('show'); }
          else bubble.classList.remove('show');
        }
        if (cur.log) addLog(cur.log, cur.tag);
      }
      if (playhead) playhead.style.left = (t / DUR * 100) + '%';
    }
    function tick(ts) {
      if (!playing) return;
      if (!t0) t0 = ts;
      var t = (ts - t0) / 1000;
      if (t >= DUR) { t = DUR; playing = false; if (playBtn) playBtn.textContent = '重播 28 秒'; }
      applyAt(t);
      if (playing) raf = requestAnimationFrame(tick);
    }
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (playing) { playing = false; cancelAnimationFrame(raf); playBtn.textContent = '继续'; return; }
        if (t0 / 1000 >= DUR || !t0) { t0 = 0; pet.dataset.lastTag = ''; if (log) log.innerHTML = ''; }
        playing = true; playBtn.textContent = '暂停';
        raf = requestAnimationFrame(function (ts) { t0 = ts - (t0 || 0); tick(ts); });
      });
    }
    applyOpts();
    if (!reduced()) addLog('实验台就绪 —— 点「播放 28 秒」看一遍完整行为', 'ready');
    else addLog('检测到减少动态效果：呼吸与眨眼已停，姿态切换为瞬时', 'reduce');
  }

  function initReduceToggle() {
    var btns = document.querySelectorAll('[data-reduce-toggle]');
    if (!btns.length) return;
    function sync() {
      var on = document.documentElement.classList.contains('force-reduce');
      btns.forEach(function (b) {
        b.classList.toggle('on', on);
        var l = b.querySelector('[data-reduce-label]');
        if (l) l.textContent = on ? '已降级（宠物静止）' : '正常动效';
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
