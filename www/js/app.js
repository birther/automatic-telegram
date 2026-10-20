/* ============================================================
   今天吃什么 · 食物转盘 + 饭钱本
   纯原生 JS，无第三方依赖，离线可用（Cordova / 浏览器均可）
   ============================================================ */
(function () {
  'use strict';

  /* ================= 通用工具 ================= */

  var FONT = '"PingFang SC","HarmonyOS Sans SC","Noto Sans SC","Source Han Sans SC","Microsoft YaHei",system-ui,-apple-system,sans-serif';

  function $(id) { return document.getElementById(id); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        var v = JSON.parse(raw);
        return (v === null || v === undefined) ? fallback : v;
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }
  };

  /* 金额显示：¥1,280 / ¥12.5 */
  function fmtMoney(n) {
    var v = Number(n) || 0;
    var neg = v < 0;
    v = Math.abs(v);
    var s = String(Math.round(v * 100) / 100);
    if (s.indexOf('.') >= 0) s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    var p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + '¥' + p.join('.');
  }

  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function inPeriod(date, period) {
    var now = new Date();
    if (period === 'day') return sameDay(date, now);
    if (period === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    if (period === 'year') return date.getFullYear() === now.getFullYear();
    return true;
  }

  /* ================= 轻提示 ================= */

  var toastEl = $('toast');
  var toastTimer = null;

  function hideToast() {
    toastEl.classList.remove('show');
    toastEl.innerHTML = '';
  }

  function toast(msg, actionLabel, onAction) {
    toastEl.innerHTML = '<span class="toast-msg">' + esc(msg) + '</span>';
    if (actionLabel) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-btn';
      b.textContent = actionLabel;
      b.addEventListener('click', function () { hideToast(); if (onAction) onAction(); });
      toastEl.appendChild(b);
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 4200 : 1900);
  }

  /* ================= 页面切换 ================= */

  var pages = { wheel: $('pageWheel'), money: $('pageMoney') };
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  function showPage(name) {
    if (!pages[name]) return;
    Object.keys(pages).forEach(function (k) {
      pages[k].classList.toggle('is-active', k === name);
    });
    tabs.forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-page') === name);
    });
    window.scrollTo(0, 0);
    if (name === 'wheel') setTimeout(fitCanvas, 30);
    if (name === 'money') renderMoneyAll();
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { showPage(tab.getAttribute('data-page')); });
  });

  /* ================= 转盘数据 ================= */

  var FOOD_KEY = 'fw.foods.v2';
  var DEFAULT_FOODS = ['火锅', '烧烤', '麻辣烫', '黄焖鸡', '兰州拉面', '寿司', '汉堡', '沙拉'];
  var PRESETS = ['火锅', '烧烤', '麻辣烫', '炸鸡', '拉面', '寿司', '汉堡', '沙拉', '饺子', '炒饭', '麻辣香锅', '日料', '螺蛳粉', '盖浇饭'];
  var MAX_FOODS = 16;

  var foods = [];
  var savedFoods = store.get(FOOD_KEY, null);

  if (savedFoods && Array.isArray(savedFoods.list)) {
    foods = savedFoods.list
      .filter(function (f) { return f && typeof f.name === 'string' && f.name.trim(); })
      .slice(0, MAX_FOODS)
      .map(function (f) { return { id: f.id || uid(), name: String(f.name).slice(0, 12) }; });
  } else {
    foods = DEFAULT_FOODS.map(function (n) { return { id: uid(), name: n }; });
  }

  function saveFoods() { store.set(FOOD_KEY, { v: 2, list: foods }); }

  /* ================= 转盘引擎 ================= */

  var canvas = $('wheelCanvas');
  var ctx = canvas.getContext('2d');
  var wheelWrap = $('wheelWrap');
  var spinBtn = $('spinBtn');
  var spinLabel = $('spinLabel');
  var spinHint = $('spinHint');
  var gifIdle = $('gifIdle');
  var slotSpin = $('slotSpin');
  var resultEl = $('result');
  var resultName = $('resultName');

  var W = {
    size: 300,
    dpr: 1,
    angle: Math.random() * 360,
    vel: 0,
    mode: 'idle',            /* idle | spin | stop | snap */
    raf: 0,
    lastTs: 0
  };

  var MAX_VEL = 11.5;          /* 度 / 帧（60fps 基准） */
  var PALETTE = [
    ['#FFDCE8', '#B03060'],
    ['#FFEFC2', '#9E6415'],
    ['#D5F5E7', '#1D7C5E'],
    ['#E1E6FF', '#3D4D9C'],
    ['#FFE2D0', '#A54F1E'],
    ['#EDDFFF', '#67439A'],
    ['#D6F2FF', '#1C6A8B'],
    ['#FFE8F1', '#A53A6B'],
    ['#E8F7D2', '#5A7C1B'],
    ['#FFD9DC', '#A23A44']
  ];

  function fitCanvas() {
    if (!wheelWrap) return;
    var rect = wheelWrap.getBoundingClientRect();
    var size = Math.round(rect.width);
    if (!size || size < 100) size = Math.round(Math.min(window.innerWidth * 0.76, 320));
    size = clamp(size, 200, 420);
    var dpr = clamp(window.devicePixelRatio || 1, 1, 3);

    W.size = size;
    W.dpr = dpr;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    drawWheel();
  }

  function drawEmpty(s, cx, cy, R) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.93, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF4F8';
    ctx.fill();
    ctx.setLineDash([Math.max(6, s * 0.022), Math.max(5, s * 0.016)]);
    ctx.lineWidth = Math.max(2, s * 0.008);
    ctx.strokeStyle = '#F6C2D6';
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#C99BAE';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + Math.round(s * 0.048) + 'px ' + FONT;
    ctx.fillText('转盘空空的', cx, cy - s * 0.205);
    ctx.font = '600 ' + Math.round(s * 0.036) + 'px ' + FONT;
    ctx.fillText('在下面添加想吃的吧', cx, cy + s * 0.205);
    ctx.restore();
  }

  function drawWheel() {
    var s = W.size;
    var n = foods.length;
    var cx = s / 2;
    var cy = s / 2;
    var R = s / 2 - Math.max(5, s * 0.018);

    ctx.setTransform(W.dpr, 0, 0, W.dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    if (!n) { drawEmpty(s, cx, cy, R); return; }

    var step = 360 / n;
    function rad(deg) { return (deg - 90) * Math.PI / 180; }
    var i, j, a0, a1, pal, a;

    /* 扇形 */
    for (i = 0; i < n; i++) {
      a0 = rad(W.angle + i * step);
      a1 = rad(W.angle + (i + 1) * step);
      pal = PALETTE[i % PALETTE.length];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = pal[0];
      ctx.fill();
    }

    /* 扇形分隔线 */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = Math.max(1.5, s * 0.006);
    for (i = 0; i < n; i++) {
      a = rad(W.angle + i * step);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.restore();

    /* 文字 */
    var baseFs = clamp(s / (n > 12 ? 21 : n > 9 ? 19 : 17), 9, 19);
    for (j = 0; j < n; j++) {
      pal = PALETTE[j % PALETTE.length];
      var label = foods[j].name;
      var localDeg = ((W.angle + j * step + step / 2) % 360 + 360) % 360;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(localDeg * Math.PI / 180);
      ctx.fillStyle = pal[1];
      ctx.textBaseline = 'middle';

      var fs = baseFs;
      var maxW = R * 0.60;
      ctx.font = '800 ' + fs + 'px ' + FONT;
      while (fs > 8 && ctx.measureText(label).width > maxW) {
        fs -= 0.5;
        ctx.font = '800 ' + fs + 'px ' + FONT;
      }

      if (localDeg > 90 && localDeg < 270) {
        ctx.rotate(Math.PI);
        ctx.textAlign = 'left';
        ctx.fillText(label, -R * 0.92, 0);
      } else {
        ctx.textAlign = 'right';
        ctx.fillText(label, R * 0.92, 0);
      }
      ctx.restore();
    }

    /* 中心圆盘（衬托按钮） */
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.008);
    ctx.strokeStyle = 'rgba(240,98,154,0.16)';
    ctx.stroke();

    /* 外圈 */
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(3, s * 0.014);
    ctx.stroke();
  }

  /* 指针（12 点方向）下的扇形序号 */
  function currentIndex() {
    var n = foods.length;
    if (!n) return -1;
    var step = 360 / n;
    var local = ((-W.angle) % 360 + 360) % 360;
    var idx = Math.floor(local / step);
    if (idx >= n) idx = n - 1;
    if (idx < 0) idx = 0;
    return idx;
  }

  function tick(ts) {
    var dt = W.lastTs ? (ts - W.lastTs) / 16.6667 : 1;
    W.lastTs = ts;
    if (!isFinite(dt) || dt <= 0) dt = 1;
    dt = Math.min(dt, 3);

    if (W.mode === 'spin') {
      W.vel = Math.min(MAX_VEL, W.vel * Math.pow(1.06, dt) + 0.4 * dt);
      W.angle += W.vel * dt;
      if (W.angle > 3600) W.angle = W.angle % 360;
    } else if (W.mode === 'stop') {
      W.vel *= Math.pow(0.962, dt);
      W.angle += W.vel * dt;
      if (W.vel < 0.8) { startSnap(); return; }
    }

    drawWheel();
    W.raf = requestAnimationFrame(tick);
  }

  function startSnap() {
    cancelAnimationFrame(W.raf);
    W.raf = 0;

    var n = foods.length;
    if (!n) { finishIdle(); return; }

    var step = 360 / n;
    var idx = currentIndex();
    var base = -(idx + 0.5) * step;
    var k = Math.round((W.angle - base) / 360);
    var target = base + 360 * k;
    var from = W.angle;
    var t0 = 0;
    var dur = 240;

    W.mode = 'snap';

    function frame(ts) {
      if (!t0) t0 = ts;
      var p = clamp((ts - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - p, 3);
      W.angle = from + (target - from) * e;
      drawWheel();
      if (p < 1) {
        W.raf = requestAnimationFrame(frame);
      } else {
        W.angle = ((target % 360) + 360) % 360;
        drawWheel();
        finish(idx);
      }
    }
    W.raf = requestAnimationFrame(frame);
  }

  function finish(idx) {
    W.mode = 'idle';
    W.vel = 0;
    W.lastTs = 0;
    var name = foods[idx] ? foods[idx].name : '';
    setSpinUI(false);
    showResult(name);
    if (navigator.vibrate) { try { navigator.vibrate(18); } catch (e) {} }
  }

  function finishIdle() {
    W.mode = 'idle';
    W.vel = 0;
    W.lastTs = 0;
    setSpinUI(false);
  }

  function setSpinUI(spinning) {
    document.body.classList.toggle('is-spinning', spinning);
    spinLabel.textContent = spinning ? '停' : '转';
    spinBtn.classList.toggle('is-stop', spinning);
    spinHint.textContent = spinning ? '点圆心「停」，看看天意' : '点击圆心「转」开始';
    gifIdle.classList.toggle('is-hidden', spinning);
    slotSpin.classList.toggle('is-on', spinning);
  }

  function showResult(name) {
    resultName.textContent = name || '—';
    resultEl.classList.remove('show');
    void resultEl.offsetWidth;
    resultEl.classList.add('show');
  }

  function startSpin() {
    W.mode = 'spin';
    W.vel = 2.4;
    W.lastTs = 0;
    if (W.raf) cancelAnimationFrame(W.raf);
    resultEl.classList.remove('show');
    resultName.textContent = '转动中…';
    setSpinUI(true);
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    W.raf = requestAnimationFrame(tick);
  }

  function resetWheel() {
    if (W.raf) cancelAnimationFrame(W.raf);
    W.raf = 0;
    W.mode = 'idle';
    W.vel = 0;
    W.lastTs = 0;
    setSpinUI(false);
    resultEl.classList.remove('show');
    resultName.textContent = '还没转呢';
  }

  spinBtn.addEventListener('click', function () {
    if (W.mode === 'spin') { W.mode = 'stop'; return; }
    if (W.mode !== 'idle') return;
    if (foods.length < 2) { toast('至少放 2 个选项才能转盘哦'); return; }
    startSpin();
  });

  /* ================= 食物列表 ================= */

  var chipsEl = $('chips');
  var presetsEl = $('presets');
  var foodCountEl = $('foodCount');
  var foodInput = $('foodInput');
  var addForm = $('addForm');

  function renderPresets() {
    presetsEl.innerHTML = '';
    var exists = {};
    foods.forEach(function (f) { exists[f.name] = true; });
    var list = PRESETS.filter(function (p) { return !exists[p]; }).slice(0, 8);
    if (!list.length) { presetsEl.hidden = true; return; }
    presetsEl.hidden = false;
    list.forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.textContent = '+ ' + name;
      b.addEventListener('click', function () { addFood(name); });
      presetsEl.appendChild(b);
    });
  }

  function renderFoods() {
    foodCountEl.textContent = foods.length + ' 项';
    chipsEl.innerHTML = '';

    if (!foods.length) {
      var p = document.createElement('p');
      p.className = 'chips-empty';
      p.textContent = '还没有食物，先添加一个吧～';
      chipsEl.appendChild(p);
    }

    foods.forEach(function (f) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = f.name;
      var x = document.createElement('i');
      x.className = 'chip-x';
      x.textContent = '×';
      btn.appendChild(nameSpan);
      btn.appendChild(x);
      btn.addEventListener('click', function () { removeFood(f.id); });
      chipsEl.appendChild(btn);
    });

    renderPresets();
    drawWheel();
  }

  function addFood(name) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!name) return false;
    if (name.length > 12) name = name.slice(0, 12);

    if (foods.length >= MAX_FOODS) { toast('最多 ' + MAX_FOODS + ' 个选项，先删掉几个吧'); return false; }
    if (foods.some(function (f) { return f.name === name; })) {
      toast('「' + name + '」已经在转盘里啦');
      return false;
    }

    foods.push({ id: uid(), name: name });
    saveFoods();
    if (W.mode !== 'idle') resetWheel();
    renderFoods();
    return true;
  }

  function removeFood(id) {
    var i = -1;
    for (var k = 0; k < foods.length; k++) {
      if (foods[k].id === id) { i = k; break; }
    }
    if (i < 0) return;

    var removed = foods.splice(i, 1)[0];
    if (W.mode !== 'idle') resetWheel();
    saveFoods();
    renderFoods();

    toast('已移除「' + removed.name + '」', '撤销', function () {
      foods.splice(Math.min(i, foods.length), 0, removed);
      saveFoods();
      renderFoods();
    });
  }

  addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (addFood(foodInput.value)) {
      foodInput.value = '';
      foodInput.blur();
    }
  });

  /* ================= 记账 ================= */

  var REC_KEY = 'fw.records.v1';
  var records = store.get(REC_KEY, []);
  if (!Array.isArray(records)) records = [];
  records = records.filter(function (r) {
    return r && typeof r.ts === 'number' && typeof r.amount === 'number' &&
           (r.type === 'in' || r.type === 'out');
  });

  var period = 'day';
  var entryType = 'out';

  var statRows = Array.prototype.slice.call(document.querySelectorAll('.stat-row'));
  var typeBtns = Array.prototype.slice.call(document.querySelectorAll('.type-btn'));
  var amountInput = $('amountInput');
  var noteInput = $('noteInput');
  var dateInput = $('dateInput');
  var entryForm = $('entryForm');
  var recList = $('recList');
  var recEmpty = $('recEmpty');
  var recTitle = $('recTitle');
  var recSummary = $('recSummary');

  var PERIOD_LABEL = { day: '今日', month: '本月', year: '本年' };

  function saveRecords() { store.set(REC_KEY, records); }

  function sumOf(periodKey) {
    var out = 0, inc = 0;
    records.forEach(function (r) {
      if (!inPeriod(new Date(r.ts), periodKey)) return;
      if (r.type === 'in') inc += r.amount; else out += r.amount;
    });
    return { out: out, in: inc };
  }

  function renderSum() {
    statRows.forEach(function (row) {
      var p = row.getAttribute('data-period');
      var s = sumOf(p);
      row.querySelector('.out').textContent = fmtMoney(s.out);
      row.querySelector('.in').textContent = fmtMoney(s.in);
      row.classList.toggle('is-active', p === period);
    });
  }

  function fmtWhen(d) {
    var now = new Date();
    if (sameDay(d, now)) return '今天 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    var s = pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    if (d.getFullYear() !== now.getFullYear()) s = d.getFullYear() + '-' + s;
    return s;
  }

  function renderRecords() {
    recTitle.textContent = PERIOD_LABEL[period] + '明细';

    var list = records.filter(function (r) { return inPeriod(new Date(r.ts), period); })
      .slice()
      .sort(function (a, b) { return b.ts - a.ts; });

    var s = sumOf(period);
    recSummary.textContent = list.length
      ? list.length + ' 笔 · 支出 ' + fmtMoney(s.out) + ' / 收入 ' + fmtMoney(s.in)
      : '共 0 笔';

    recList.innerHTML = '';
    list.forEach(function (r) {
      var isIn = r.type === 'in';
      var li = document.createElement('li');
      li.className = 'rec';

      var main = document.createElement('div');
      main.className = 'rec-main';
      var title = document.createElement('div');
      title.className = 'rec-title';
      title.textContent = r.note || (isIn ? '收入' : '支出');
      var sub = document.createElement('div');
      sub.className = 'rec-sub';
      sub.textContent = fmtWhen(new Date(r.ts)) + ' · ' + (isIn ? '收入' : '支出');
      main.appendChild(title);
      main.appendChild(sub);

      var amt = document.createElement('div');
      amt.className = 'rec-amt ' + (isIn ? 'in' : 'out');
      amt.textContent = (isIn ? '+' : '-') + fmtMoney(r.amount);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'rec-del';
      del.textContent = '×';
      del.setAttribute('aria-label', '删除这条记录');
      del.addEventListener('click', function () { deleteRecord(r.id); });

      li.appendChild(main);
      li.appendChild(amt);
      li.appendChild(del);
      recList.appendChild(li);
    });

    recEmpty.hidden = list.length > 0;
  }

  function renderMoneyAll() { renderSum(); renderRecords(); }

  function deleteRecord(id) {
    var i = -1;
    for (var k = 0; k < records.length; k++) {
      if (records[k].id === id) { i = k; break; }
    }
    if (i < 0) return;

    var removed = records.splice(i, 1)[0];
    saveRecords();
    renderMoneyAll();

    toast('已删除 ' + (removed.type === 'in' ? '收入' : '支出') + ' ' + fmtMoney(removed.amount), '撤销', function () {
      records.splice(Math.min(i, records.length), 0, removed);
      saveRecords();
      renderMoneyAll();
    });
  }

  statRows.forEach(function (row) {
    row.addEventListener('click', function () {
      period = row.getAttribute('data-period');
      renderMoneyAll();
    });
  });

  typeBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      entryType = b.getAttribute('data-type');
      typeBtns.forEach(function (x) { x.classList.toggle('is-active', x === b); });
      document.body.classList.toggle('entry-in', entryType === 'in');
    });
  });

  /* 只允许数字和一个小数点，最多两位小数 */
  amountInput.addEventListener('input', function () {
    var v = amountInput.value.replace(/[^\d.]/g, '');
    var dot = v.indexOf('.');
    if (dot >= 0) {
      v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
      var seg = v.split('.');
      if (seg[1].length > 2) v = seg[0] + '.' + seg[1].slice(0, 2);
    }
    if (/^0\d/.test(v)) v = v.replace(/^0+/, '') || '0';
    if (v !== amountInput.value) amountInput.value = v;
  });

  entryForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var amt = parseFloat(amountInput.value);
    if (!isFinite(amt) || amt <= 0) {
      toast('请先输入大于 0 的金额');
      amountInput.focus();
      return;
    }
    if (amt > 99999999) { toast('这个金额有点离谱啦'); return; }

    var now = new Date();
    var picked = parseYmd(dateInput.value);
    var ts;

    if (!picked || sameDay(picked, now)) {
      ts = now.getTime();
      picked = now;
    } else {
      ts = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 12, 0, 0).getTime();
    }

    records.push({
      id: uid(),
      type: entryType,
      amount: Math.round(amt * 100) / 100,
      note: noteInput.value.trim().slice(0, 20),
      ts: ts
    });

    saveRecords();

    if (period === 'day' && !inPeriod(new Date(ts), 'day')) period = 'month';
    if (period === 'month' && !inPeriod(new Date(ts), 'month')) period = 'year';

    renderMoneyAll();

    amountInput.value = '';
    noteInput.value = '';
    dateInput.value = ymd(now);

    toast('已记下' + (entryType === 'in' ? '收入 ' : '支出 ') + fmtMoney(amt));
  });

  /* ================= 启动 ================= */

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitCanvas, 120);
  });
  window.addEventListener('orientationchange', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitCanvas, 240);
  });

  dateInput.value = ymd(new Date());
  fitCanvas();
  renderFoods();
  renderMoneyAll();
  setTimeout(fitCanvas, 120);
  setSpinUI(false);

})();
