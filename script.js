/* ============================================================================
   Maths — × + − ÷ (UI façon “Verbes”) — version robuste
   - Opération centrale (impacte quiz, dashboard, rapport, libre)
   - Sélecteurs DOM SÉCURISÉS (pas d'erreurs classList of null)
   - Pratique : bouton “Démarrer” direct + états propres
   - Libre : 1..10 en désordre, sans doublon (famille remplie)
   - Réglages : opérations désactivées si ≠ Mix (+ message)
   ============================================================================ */
(function () {
  'use strict';

  /* ---------- Helpers & LS ---------- */
  const $ = (id) => document.getElementById(id);
  const fmtDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
      2,
      '0'
    )} ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
  const loadLS = (k, f) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? f;
    } catch {
      return f;
    }
  };
  const saveLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const clamp = (v, min, max) => {
    v = parseInt(v, 10);
    if (isNaN(v)) v = min;
    return Math.max(min, Math.min(max, v));
  };
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* ---------- Profils ---------- */
  let PROFILE_ID = loadLS('math_profile_id_v1', 'default');
  const keyP = (base) => `${base}__${PROFILE_ID}`;
  const LS_KEYS = {
    settings: 'math_settings_v1',
    results: 'math_results_v1',
    stats: 'math_stats_v1',
    user: 'math_user_name_v1',
  };
  function switchProfile(name) {
    PROFILE_ID =
      (name || 'default')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 32) || 'default';
    saveLS('math_profile_id_v1', PROFILE_ID);
    loadState();
    updateGlobalOpUI(settings.globalOp);
    renderAll();
  }

  /* ---------- État ---------- */
  const DEFAULT_SETTINGS = {
    globalOp: 'mix',
    ops: { mul: true, add: true, sub: true, div: true }, // en Mix on peut désactiver
    ranges: {
      mul: { aMin: 0, aMax: 12, bMax: 12 },
      add: { aMin: 0, aMax: 20, bMax: 20 },
      sub: { aMin: 0, aMax: 20, bMax: 20, nonneg: true },
      div: { aMax: 144, bMax: 12 },
    },
    qCount: 20,
    timerSec: 10,
    excludeMastered: true,
  };

  let settings = DEFAULT_SETTINGS;
  let staged = null;
  let results = [];
  let stats = {}; // k => {success, errors, consecutive, last, errRun}
  let lastWeakList = [];

  function loadState() {
    settings = loadLS(keyP(LS_KEYS.settings), DEFAULT_SETTINGS);
    normalizeSettings(settings);
    if (!settings.globalOp) settings.globalOp = 'mix';
    if (!settings.ops) settings.ops = { mul: true, add: true, sub: true, div: true };
    results = loadLS(keyP(LS_KEYS.results), []);
    stats = loadLS(keyP(LS_KEYS.stats), {});
    staged = JSON.parse(JSON.stringify(settings));
  }
  function saveSettingsCommit() {
    settings = JSON.parse(JSON.stringify(staged));
    normalizeSettings(settings);
    saveLS(keyP(LS_KEYS.settings), settings);
    renderAll();
  }
  const saveResults = () => saveLS(keyP(LS_KEYS.results), results);
  const saveStats = () => saveLS(keyP(LS_KEYS.stats), stats);

  function normalizeSettings(s) {
    if (!s || !s.ranges) return;
    const int = (v, d) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : d;
    };
    const fixMinMax = (obj, minKey, maxKey, floor) => {
      obj[minKey] = int(obj[minKey], floor);
      obj[maxKey] = int(obj[maxKey], obj[minKey]);
      if (obj[minKey] > obj[maxKey]) [obj[minKey], obj[maxKey]] = [obj[maxKey], obj[minKey]];
      if (obj[minKey] < floor) obj[minKey] = floor;
      if (obj[maxKey] < floor) obj[maxKey] = floor;
    };
    fixMinMax(s.ranges.mul, 'aMin', 'aMax', 0);
    s.ranges.mul.bMax = Math.max(0, int(s.ranges.mul.bMax, 12));

    fixMinMax(s.ranges.add, 'aMin', 'aMax', 0);
    s.ranges.add.bMax = Math.max(0, int(s.ranges.add.bMax, 20));

    fixMinMax(s.ranges.sub, 'aMin', 'aMax', 0);
    s.ranges.sub.bMax = Math.max(0, int(s.ranges.sub.bMax, 20));

    s.ranges.div.aMax = Math.max(1, int(s.ranges.div.aMax, 144));
    s.ranges.div.bMax = Math.max(1, int(s.ranges.div.bMax, 12));
  }

  /* ---------- Bootstrap ---------- */
  document.addEventListener('DOMContentLoaded', bootstrap);

  function bootstrap() {
    // Tabs (robuste aux id manquants / casse)
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const id = (btn.dataset.tab || '').toLowerCase();
        const panel = document.getElementById(id);
        if (panel) panel.classList.add('active');
        refreshActiveTab();
      });
    });

    // Profil
    $('saveUser')?.addEventListener('click', () => {
      const name = $('userName').value.trim();
      saveLS(LS_KEYS.user, name);
      switchProfile(name);
      alert('Profil chargé pour ' + (name || '👋'));
    });

    // Bindings
    bindGlobalOpUI();
    bindSettingsUI();
    bindQuizUI();
    bindLibreUI();
    bindPrintUI();

    // État initial
    loadState();
    const uname = loadLS(LS_KEYS.user, '') || '';
    if ($('userName')) $('userName').value = uname;

    updateGlobalOpUI(settings.globalOp);
    // Pré-remplir famille du mode libre au premier affichage
    buildLibreFamilies();

    renderAll();
  }

  /* ---------- Rafraîchir l’onglet actif ---------- */
  function refreshActiveTab() {
    if ($('dashboard')?.classList.contains('active')) renderDashboard();
    if ($('rapport')?.classList.contains('active')) {
      renderReport();
      renderDetails(false);
    }
    if ($('libre')?.classList.contains('active')) buildLibreFamilies();
    if ($('pratique')?.classList.contains('active')) renderPracticeState();
    if ($('reglages')?.classList.contains('active')) renderSettings();
  }

  function renderAll() {
    renderSettings();
    renderDashboard();
    renderStatsGrid(currentOpForView());
    renderPracticeState();
  }

  /* ---------- Opération centrale ---------- */
  function bindGlobalOpUI() {
    document.querySelectorAll('#globalOpSeg .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => setGlobalOp(btn.dataset.op));
    });
  }
  function setGlobalOp(op) {
    if (!op) return;
    settings.globalOp = op;
    if (op !== 'mix') {
      // verrouille aux seules opérations de l’op centrale
      settings.ops = { mul: false, add: false, sub: false, div: false };
      settings.ops[op] = true;
    }
    saveLS(keyP(LS_KEYS.settings), settings);
    staged = JSON.parse(JSON.stringify(settings));
    updateGlobalOpUI(op);
    renderAll();
    refreshActiveTab();
  }
  function updateGlobalOpUI(op) {
    document
      .querySelectorAll('#globalOpSeg .seg-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.op === op));
    const label = $('focusOpLabel');
    if (label)
      label.innerHTML =
        op === 'mix'
          ? 'Mix (4 opérations)'
          : op === 'mul'
          ? '× Multiplication'
          : op === 'add'
          ? '+ Addition'
          : op === 'sub'
          ? '− Soustraction'
          : '÷ Division';
  }
  const OP_LABEL = { mul: '×', add: '+', sub: '−', div: '÷' };
  const OP_NAME = {
    mul: 'Multiplication',
    add: 'Addition',
    sub: 'Soustraction',
    div: 'Division',
  };

  /* ---------- Stats & faits ---------- */
  function keyOf(op, a, b) {
    if (op === 'mul' || op === 'add') {
      const a1 = Math.min(a, b),
        b1 = Math.max(a, b);
      return `${op}|${a1}|${b1}`;
    }
    return `${op}|${a}|${b}`;
  }
  function getStat(op, a, b) {
    const k = keyOf(op, a, b);
    return stats[k] || { success: 0, errors: 0, consecutive: 0, last: null, errRun: 0 };
  }
  function updateStat(op, a, b, ok) {
    const k = keyOf(op, a, b),
      st = getStat(op, a, b);
    if (ok) {
      st.success++;
      st.consecutive++;
      st.last = 'ok';
      st.errRun = 0;
    } else {
      st.errors++;
      st.consecutive = 0;
      st.last = 'ko';
      st.errRun = (st.errRun || 0) + 1;
    }
    stats[k] = st;
    saveStats();
  }
  const isMastered = (op, a, b) => getStat(op, a, b).consecutive >= 3;
  const rate = (op, a, b) => {
    const s = getStat(op, a, b);
    const t = s.success + s.errors;
    return t ? s.success / t : null;
  };
  const opAllowed = (op) =>
    settings.globalOp === 'mix' ? settings.ops[op] : op === settings.globalOp;

  /* ---------- Génération quiz ---------- */
  function buildPool() {
    const pool = [];
    const EXCLUDE = !!settings.excludeMastered;
    if (opAllowed('mul')) {
      const R = settings.ranges.mul;
      for (let a = R.aMin; a <= R.aMax; a++) {
        for (let b = 0; b <= R.bMax; b++) {
          if (EXCLUDE && isMastered('mul', a, b)) continue;
          pool.push({ op: 'mul', a, b, w: weight('mul', a, b) });
        }
      }
    }
    if (opAllowed('add')) {
      const R = settings.ranges.add;
      for (let a = R.aMin; a <= R.aMax; a++) {
        for (let b = 0; b <= R.bMax; b++) {
          if (EXCLUDE && isMastered('add', a, b)) continue;
          pool.push({ op: 'add', a, b, w: weight('add', a, b) });
        }
      }
    }
    if (opAllowed('sub')) {
      const R = settings.ranges.sub;
      for (let a = R.aMin; a <= R.aMax; a++) {
        for (let b = 0; b <= R.bMax; b++) {
          if (R.nonneg && a - b < 0) continue;
          if (EXCLUDE && isMastered('sub', a, b)) continue;
          pool.push({ op: 'sub', a, b, w: weight('sub', a, b) });
        }
      }
    }
    if (opAllowed('div')) {
      const R = settings.ranges.div;
      for (let b = 1; b <= R.bMax; b++) {
        for (let q = 1; q <= 10; q++) {
          const a = b * q;
          if (a > R.aMax) continue;
          if (EXCLUDE && isMastered('div', a, b)) continue;
          pool.push({ op: 'div', a, b, w: weight('div', a, b) });
        }
      }
    }
    return pool;
  }
  function weight(op, a, b) {
    const s = getStat(op, a, b);
    return 1 + Math.max(0, s.errors - s.success) + (s.consecutive === 0 ? 1 : 0);
  }
  function pickWeighted(arr) {
    const sum = arr.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * sum;
    for (const x of arr) {
      if ((r -= x.w) <= 0) return x;
    }
    return arr[arr.length - 1];
  }
  function pretty(op, a, b) {
    return op === 'mul'
      ? `${a} × ${b}`
      : op === 'add'
      ? `${a} + ${b}`
      : op === 'sub'
      ? `${a} − ${b}`
      : `${a} ÷ ${b}`;
  }
  function answerOf(op, a, b) {
    return op === 'mul' ? a * b : op === 'add' ? a + b : op === 'sub' ? a - b : Math.floor(a / b);
  }

  /* ---------- Quiz (Pratique) ---------- */
  let quiz = null,
    timerInterval = null;
  const FULL = 113;

  function bindQuizUI() {
    $('startQuiz')?.addEventListener('click', startQuiz);
    $('startQuiz2')?.addEventListener('click', startQuiz);
    $('submitAnswer')?.addEventListener('click', submit);
    $('answer')?.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') submit();
    });
    $('backToMenu')?.addEventListener('click', () =>
      document.querySelector('[data-tab="dashboard"]')?.click()
    );
    $('retryErrors')?.addEventListener('click', retryErrors);
    $('newSession')?.addEventListener('click', startQuiz);
    // op-switch (dashboard)
    document.querySelectorAll('.opbtn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.opbtn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        renderStatsGrid(b.dataset.op);
      });
    });
  }

  function renderPracticeState() {
    const startBox = $('startBox'),
      quizBox = $('quizBox'),
      resultBox = $('resultBox');
    if (!startBox || !quizBox || !resultBox) return;
    if (!quiz) {
      startBox.classList.remove('hidden');
      quizBox.classList.add('hidden');
      resultBox.classList.add('hidden');
    }
  }

  function startQuiz() {
    const pool = buildPool();
    if (pool.length === 0) {
      alert('Aucun fait disponible (réglages et/ou opération centrale).');
      return;
    }

    const N = Math.min(settings.qCount, pool.length);
    const bag = pool.slice(),
      items = [];
    while (items.length < N) {
      const it = pickWeighted(bag);
      items.push({ op: it.op, a: it.a, b: it.b });
      bag.splice(bag.indexOf(it), 1);
    }

    quiz = { items, idx: 0, score: 0, points: 0, timerSec: settings.timerSec };
    $('startBox')?.classList.add('hidden');
    $('resultBox')?.classList.add('hidden');
    $('quizBox')?.classList.remove('hidden');
    document.querySelector('[data-tab="pratique"]')?.click();
    updateProgressBar();
    renderQuestion();
  }

  function renderQuestion() {
    const it = quiz.items[quiz.idx];
    $('question').textContent = `${pretty(it.op, it.a, it.b)} = ?`;
    $('progressTracker').textContent = `Question ${quiz.idx + 1} sur ${quiz.items.length}`;
    $('pointsDisplay').textContent = `Points : ${quiz.points}`;
    $('answer').value = '';
    $('answer').focus();
    $('feedback').className = 'feedback hidden';
    resetTimer();
  }

  function resetTimer() {
    clearInterval(timerInterval);
    const sec = quiz.timerSec;
    const circle = document.querySelector('.countdown circle');
    if ($('timeDisplay')) $('timeDisplay').textContent = sec;
    if (circle) {
      circle.classList.remove('low-time');
      circle.style.strokeDashoffset = 0;
    }
    if (sec <= 0) return;
    let left = sec;
    timerInterval = setInterval(() => {
      left--;
      if ($('timeDisplay')) $('timeDisplay').textContent = left;
      if (circle) {
        const offset = (FULL / (sec - 1 || 1)) * (sec - left);
        circle.style.strokeDashoffset = offset;
        if (left <= 3) circle.classList.add('low-time');
      }
      if (left <= 0) {
        clearInterval(timerInterval);
        submit();
      }
    }, 1000);
  }

  function submit() {
    const it = quiz.items[quiz.idx];
    const ok = parseInt($('answer').value, 10) === answerOf(it.op, it.a, it.b);
    clearInterval(timerInterval);

    if (ok) {
      quiz.score++;
      const bonus = 10 + (quiz.timerSec ? parseInt($('timeDisplay').textContent, 10) : 0);
      quiz.points += Math.max(10, bonus);
      $('feedback').className = 'feedback ok';
      $('feedback').textContent = '✔ Bravo !';
    } else {
      $('feedback').className = 'feedback ko';
      $('feedback').textContent = `✘ Oups. Rép. attendue : ${answerOf(it.op, it.a, it.b)}`;
    }

    updateStat(it.op, it.a, it.b, ok);

    setTimeout(() => {
      quiz.idx++;
      if (quiz.idx >= quiz.items.length) endQuiz();
      else {
        updateProgressBar();
        renderQuestion();
      }
    }, 500);
  }

  const updateProgressBar = () => {
    if ($('progress-bar'))
      $('progress-bar').style.width = `${Math.round((quiz.idx / quiz.items.length) * 100)}%`;
  };

  function endQuiz() {
    $('quizBox')?.classList.add('hidden');
    $('resultBox')?.classList.remove('hidden');
    if ($('resultTitle'))
      $(
        'resultTitle'
      ).textContent = `Score : ${quiz.score}/${quiz.items.length} — Points : ${quiz.points}`;

    const weakList = topWeak(currentOpForView(), 10);
    lastWeakList = weakList;
    if ($('missedQuestions'))
      $('missedQuestions').innerHTML = weakList
        .map((w) => `<li>${pretty(w.op, w.a, w.b)} = ${answerOf(w.op, w.a, w.b)}</li>`)
        .join('');

    const re = $('retryErrors');
    if (re)
      re.onclick = () => {
        if (weakList.length === 0) {
          alert('Aucune faiblesse détectée.');
          return;
        }
        startRetry(weakList);
      };

    results.push({
      date: fmtDate(new Date()),
      correct: quiz.score,
      missed: quiz.items.length - quiz.score,
      points: quiz.points,
    });
    saveResults();
    renderDashboard();
    quiz = null; // pour réafficher l'écran “Démarrer”
  }

  function retryErrors() {
    if (!lastWeakList.length) {
      alert('Aucune faiblesse détectée.');
      return;
    }
    startRetry(lastWeakList);
  }

  function startRetry(list) {
    quiz = {
      items: list.map((w) => ({ op: w.op, a: w.a, b: w.b })),
      idx: 0,
      score: 0,
      points: 0,
      timerSec: settings.timerSec,
    };
    $('resultBox')?.classList.add('hidden');
    $('quizBox')?.classList.remove('hidden');
    updateProgressBar();
    renderQuestion();
  }

  /* ---------- Dashboard & grille ---------- */
  function renderDashboard() {
    let A = 0,
      S = 0,
      mastered = 0,
      weak = 0;
    for (const k in stats) {
      const [op] = k.split('|');
      if (!opAllowed(op)) continue;
      const st = stats[k],
        tot = st.success + st.errors;
      A += tot;
      S += st.success;
      if (st.consecutive >= 3) mastered++;
      if (st.errors > st.success) weak++;
    }
    if ($('kpiRate')) $('kpiRate').textContent = A ? `${Math.round((100 * S) / A)}%` : '—';
    if ($('kpiAttempts')) $('kpiAttempts').textContent = A ? `${A} essais` : '—';
    if ($('kpiMastered')) $('kpiMastered').textContent = mastered;
    if ($('kpiWeak')) $('kpiWeak').textContent = weak;

    const last = results[results.length - 1];
    if ($('kpiLast'))
      $('kpiLast').textContent = last ? `${last.correct}/${last.correct + last.missed}` : '—';
    if ($('kpiLastWhen')) $('kpiLastWhen').textContent = last ? last.date : '—';

    if ($('lastResults'))
      $('lastResults').innerHTML = results
        .slice(-10)
        .reverse()
        .map(
          (r) =>
            `<li>${r.date} — <b>${r.correct}/${r.correct + r.missed}</b>, Points: ${r.points}</li>`
        )
        .join('');

    renderStatsGrid(currentOpForView());
  }

  const currentOpForView = () => (settings.globalOp === 'mix' ? 'mul' : settings.globalOp);

  function renderStatsGrid(op) {
    const switcher = document.querySelector('.op-switch');
    if (switcher) switcher.style.display = settings.globalOp === 'mix' ? 'flex' : 'none';

    const grid = $('statsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const mkHead = (t) => {
      const d = document.createElement('div');
      d.className = 'cell head';
      d.textContent = t;
      return d;
    };
    grid.appendChild(mkHead(''));
    for (let j = 0; j <= 12; j++) grid.appendChild(mkHead(j));

    for (let i = 0; i <= 12; i++) {
      grid.appendChild(mkHead(i));
      for (let j = 0; j <= 12; j++) {
        let a = i,
          b = j;
        if (op === 'add' || op === 'mul') {
          a = Math.min(i, j);
          b = Math.max(i, j);
        }
        if (op === 'div' && (j === 0 || i % j !== 0)) {
          const d = document.createElement('div');
          d.className = 'cell neutral-bg';
          grid.appendChild(d);
          continue;
        }
        const st = getStat(op, a, b);
        const d = document.createElement('div');
        d.className = 'cell';
        let cls = 'neutral-bg',
          label = '-';
        if (st.consecutive >= 3) {
          cls = 'blue-bg';
          label = '👍';
        } else if (st.last === 'ko') {
          cls = 'red-bg';
          label = st.errRun ? `x${st.errRun}` : 'x';
        } else if (st.consecutive > 0) {
          cls = 'green-bg';
          label = String(st.consecutive);
        }
        d.classList.add(cls);
        d.title = `${pretty(op, i, j)} • S:${st.success} / E:${st.errors} • cons:${st.consecutive}`;
        d.textContent = label;
        grid.appendChild(d);
      }
    }
  }

  /* ---------- Réglages ---------- */
  function bindSettingsUI() {
    $('presetSelect')?.addEventListener('change', () => {
      const id = $('presetSelect').value;
      if (!id) return;
      applyPreset(id);
    });
    $('saveSettings')?.addEventListener('click', saveSettingsCommit);
    $('resetProgress')?.addEventListener('click', () => {
      if (confirm('Effacer la progression de ce profil ?')) {
        stats = {};
        results = [];
        saveStats();
        saveResults();
        renderAll();
      }
    });
  }

  function renderSettings() {
    const isMix = settings.globalOp === 'mix';
    if ($('opsLockHint'))
      $('opsLockHint').textContent = isMix
        ? 'En mode Mix, tu peux choisir quelles opérations faire apparaître.'
        : 'Les opérations sont verrouillées par l’opération centrale.';

    ['mul', 'add', 'sub', 'div'].forEach((op) => {
      const cb = $(`op_${op}`);
      if (!cb) return;
      cb.checked = staged.ops[op];
      cb.disabled = !isMix;
      cb.onchange = (e) => {
        if (isMix) {
          staged.ops[op] = e.target.checked;
        }
      };
    });

    const R = staged.ranges;
    // assigner & binder (avec sécurités)
    const bindNum = (id, getter) => {
      const el = $(id);
      if (!el) return;
      el.value = getter();
      el.oninput = (e) => {
        const v = +e.target.value;
        getter(v);
      };
    };

    bindNum('mul_a_min', (v) => (v !== undefined ? (R.mul.aMin = v) : R.mul.aMin));
    bindNum('mul_a_max', (v) => (v !== undefined ? (R.mul.aMax = v) : R.mul.aMax));
    bindNum('mul_b_max', (v) => (v !== undefined ? (R.mul.bMax = v) : R.mul.bMax));

    bindNum('add_a_min', (v) => (v !== undefined ? (R.add.aMin = v) : R.add.aMin));
    bindNum('add_a_max', (v) => (v !== undefined ? (R.add.aMax = v) : R.add.aMax));
    bindNum('add_b_max', (v) => (v !== undefined ? (R.add.bMax = v) : R.add.bMax));

    bindNum('sub_a_min', (v) => (v !== undefined ? (R.sub.aMin = v) : R.sub.aMin));
    bindNum('sub_a_max', (v) => (v !== undefined ? (R.sub.aMax = v) : R.sub.aMax));
    bindNum('sub_b_max', (v) => (v !== undefined ? (R.sub.bMax = v) : R.sub.bMax));
    if ($('sub_nonneg')) {
      $('sub_nonneg').checked = R.sub.nonneg;
      $('sub_nonneg').onchange = (e) => (R.sub.nonneg = !!e.target.checked);
    }

    bindNum('div_a_max', (v) => (v !== undefined ? (R.div.aMax = v) : R.div.aMax));
    bindNum('div_b_max', (v) => (v !== undefined ? (R.div.bMax = v) : R.div.bMax));

    if ($('qCount')) {
      $('qCount').value = staged.qCount;
      $('qCount').oninput = (e) => (staged.qCount = clamp(e.target.value, 5, 50));
    }
    if ($('timerSec')) {
      $('timerSec').value = staged.timerSec;
      $('timerSec').oninput = (e) => (staged.timerSec = clamp(e.target.value, 0, 60));
    }
    if ($('excludeMastered')) {
      $('excludeMastered').checked = staged.excludeMastered;
      $('excludeMastered').onchange = (e) => (staged.excludeMastered = !!e.target.checked);
    }
  }

  function applyPreset(id) {
    if (id === 'g3_mul_0_12') {
      setGlobalOp('mul');
      staged.globalOp = 'mul';
      staged.ops = { mul: true, add: false, sub: false, div: false };
      staged.ranges.mul = { aMin: 0, aMax: 12, bMax: 12 };
      staged.qCount = 20;
      staged.timerSec = 10;
      staged.excludeMastered = true;
    } else if (id === 'g3_add_sub_0_20') {
      setGlobalOp('mix');
      staged.globalOp = 'mix';
      staged.ops = { mul: false, add: true, sub: true, div: false };
      staged.ranges.add = { aMin: 0, aMax: 20, bMax: 20 };
      staged.ranges.sub = { aMin: 0, aMax: 20, bMax: 20, nonneg: true };
      staged.qCount = 20;
      staged.timerSec = 10;
      staged.excludeMastered = true;
    } else if (id === 'mix_all') {
      setGlobalOp('mix');
      staged.globalOp = 'mix';
      staged.ops = { mul: true, add: true, sub: true, div: true };
      staged.ranges.mul = { aMin: 0, aMax: 12, bMax: 12 };
      staged.ranges.add = { aMin: 0, aMax: 20, bMax: 20 };
      staged.ranges.sub = { aMin: 0, aMax: 20, bMax: 20, nonneg: true };
      staged.ranges.div = { aMax: 144, bMax: 12 };
      staged.qCount = 20;
      staged.timerSec = 10;
      staged.excludeMastered = true;
    }
    renderSettings();
  }

  /* ---------- Mode libre ---------- */
  function bindLibreUI() {
    $('libGen')?.addEventListener('click', genLibre);
    $('libCheck')?.addEventListener('click', checkLibre);
    $('libOp')?.addEventListener('change', buildLibreFamilies);
  }

  /* ---------- Imprimer ---------- */
  function bindPrintUI() {
    $('printGen')?.addEventListener('click', genPrint);
    $('printBtn')?.addEventListener('click', () => window.print());
  }

  function genPrint() {
    const items = buildPrintItems();
    if (!items) return;
    renderPrint(items);
  }

  function buildPrintItems() {
    const pool = buildPool();
    if (pool.length === 0) {
      alert('Aucun fait disponible (réglages et/ou opération centrale).');
      return null;
    }
    const N = Math.min(settings.qCount, pool.length);
    const bag = pool.slice();
    const items = [];
    while (items.length < N) {
      const it = pickWeighted(bag);
      items.push({ op: it.op, a: it.a, b: it.b });
      bag.splice(bag.indexOf(it), 1);
    }
    return items;
  }

  function renderPrint(items) {
    const meta = buildPrintMeta(items.length);
    if ($('printMeta')) $('printMeta').textContent = meta;
    if ($('printMetaAnswers')) $('printMetaAnswers').textContent = meta;

    const list = items
      .map(
        (it) =>
          `<div class="print-row"><div class="print-q">${pretty(it.op, it.a, it.b)} =</div><div class="print-line"></div></div>`
      )
      .join('');
    const answers = items
      .map(
        (it) =>
          `<div class="print-row"><div class="print-q">${pretty(
            it.op,
            it.a,
            it.b
          )} =</div><div class="print-answer">${answerOf(it.op, it.a, it.b)}</div></div>`
      )
      .join('');

    if ($('printList')) $('printList').innerHTML = list;
    if ($('printAnswersList')) $('printAnswersList').innerHTML = answers;
  }

  function buildPrintMeta(count) {
    const op =
      settings.globalOp === 'mix'
        ? 'Mix'
        : `${OP_LABEL[settings.globalOp]} ${OP_NAME[settings.globalOp]}`;
    return `${op} • ${count} questions • ${fmtDate(new Date())}`;
  }
  function buildLibreFamilies() {
    const opSel = $('libOp');
    const famSel = $('libFam');
    if (!opSel || !famSel) return;
    if (settings.globalOp !== 'mix') opSel.value = settings.globalOp;
    const op = opSel.value;
    const options = [];
    if (op === 'mul' || op === 'add' || op === 'sub') {
      for (let k = 1; k <= 10; k++) options.push({ v: `b:${k}`, label: `${OP_LABEL[op]} ${k}` });
    }
    if (op === 'div') {
      for (let k = 1; k <= 10; k++) options.push({ v: `b:${k}`, label: `÷ par ${k}` });
    }
    famSel.innerHTML = options.map((o) => `<option value="${o.v}">${o.label}</option>`).join('');
    if (!famSel.value && options.length) famSel.value = options[0].v;
  }
  function genLibre() {
    const opSel = $('libOp'),
      famSel = $('libFam');
    if (!opSel || !famSel) return;
    const op = opSel.value;
    const b = Number((famSel.value || 'b:1').split(':')[1] || 1);
    const items = [];
    for (let k = 1; k <= 10; k++) {
      if (op === 'mul' || op === 'add') items.push({ op, a: k, b });
      else if (op === 'sub') items.push({ op, a: b + k, b });
      else if (op === 'div') items.push({ op, a: b * k, b });
    }
    shuffle(items);
    const sheet = $('libSheet');
    if (!sheet) return;
    sheet.classList.remove('hidden');
    sheet.innerHTML = items
      .map(
        (it, idx) => `
      <div class="cell">
        <div style="margin-right:10px">${pretty(it.op, it.a, it.b)} =</div>
        <input type="number" id="lib_${idx}" data-op="${it.op}" data-a="${it.a}" data-b="${it.b}">
      </div>`
      )
      .join('');
    if ($('libFeedback')) $('libFeedback').textContent = '';
  }
  function checkLibre() {
    const inputs = Array.from(document.querySelectorAll('#libSheet input'));
    if (!inputs.length) {
      alert('Génère une feuille d’abord.');
      return;
    }
    let ok = 0;
    for (const inp of inputs) {
      const op = inp.dataset.op,
        a = +inp.dataset.a,
        b = +inp.dataset.b;
      const good = parseInt(inp.value, 10) === answerOf(op, a, b);
      updateStat(op, a, b, good);
      if (good) ok++;
      inp.style.borderColor = good ? '#22c55e' : '#f87171';
    }
    if ($('libFeedback')) {
      $('libFeedback').className = 'feedback ' + (ok === inputs.length ? 'ok' : 'ko');
      $('libFeedback').textContent = `${ok}/${inputs.length} correct(s)`;
    }
    renderDashboard();
  }

  /* ---------- Rapport ---------- */
  function renderReport() {
    let A = 0,
      S = 0,
      mastered = 0,
      weak = 0;
    for (const k in stats) {
      const [op] = k.split('|');
      if (!opAllowed(op)) continue;
      const st = stats[k],
        tot = st.success + st.errors;
      A += tot;
      S += st.success;
      if (st.consecutive >= 3) mastered++;
      if (st.errors > st.success) weak++;
    }
    if ($('rGlobalRate')) $('rGlobalRate').textContent = A ? `${Math.round((100 * S) / A)}%` : '—';
    if ($('rGlobalAttempts')) $('rGlobalAttempts').textContent = A ? `${A} essais` : '—';
    if ($('rMasteredCount')) $('rMasteredCount').textContent = mastered;
    if ($('rWeakCount')) $('rWeakCount').textContent = weak;

    const last = results[results.length - 1];
    if ($('rLastPoints')) $('rLastPoints').textContent = last ? last.points : '—';
    if ($('rLastWhen')) $('rLastWhen').textContent = last ? last.date : '—';

    const w = topWeak(currentOpForView(), 10),
      m = topMastered(currentOpForView(), 10);
    if ($('rWeak'))
      $('rWeak').innerHTML = w.length
        ? w
            .map((x) =>
              rowHTML(`${pretty(x.op, x.a, x.b)}`, rate(x.op, x.a, x.b), attempts(x.op, x.a, x.b))
            )
            .join('')
        : `<div class="row-line"><div>Aucune faiblesse détectée 🎉</div></div>`;
    if ($('rMastered'))
      $('rMastered').innerHTML = m.length
        ? m
            .map((x) =>
              rowHTML(`${pretty(x.op, x.a, x.b)}`, rate(x.op, x.a, x.b), attempts(x.op, x.a, x.b))
            )
            .join('')
        : `<div class="row-line"><div>Pas encore de faits “maîtrisés”.</div></div>`;
    const allChk = $('rDetailsAll');
    if (allChk && !allChk._bound) {
      allChk.addEventListener('change', (e) => renderDetails(!!e.target.checked));
      allChk._bound = true;
    }
  }
  const attempts = (op, a, b) => {
    const s = getStat(op, a, b);
    return s.success + s.errors;
  };
  const rowHTML = (label, r, att) => {
    const w = r == null ? 0 : Math.round(r * 100),
      color = r == null ? '#334155' : r < 0.5 ? '#f87171' : r < 0.75 ? '#fbbf24' : '#22c55e';
    return `<div class="row-line"><div><span class="tag">${label}</span></div><div>${
      r == null ? '—' : w + '%'
    }</div><div class="meter"><span style="width:${w}%;background:${color}"></span></div><div>${att} ess.</div></div>`;
  };

  function renderDetails(includeZeros) {
    const rows = [],
      opView = currentOpForView();
    const span = { mul: 12, div: 12, add: 20, sub: 20 };
    const loopOps = settings.globalOp === 'mix' ? ['mul', 'add', 'sub', 'div'] : [opView];
    for (const op of loopOps) {
      for (let i = 0; i <= span[op]; i++) {
        const maxB = span[op];
        for (let j = op === 'div' ? 1 : 0; j <= maxB; j++) {
          if (op === 'div' && i % j !== 0) continue;
          let a = i,
            b = j;
          if (op === 'mul' || op === 'add') {
            a = Math.min(i, j);
            b = Math.max(i, j);
          }
          const st = getStat(op, a, b),
            tot = st.success + st.errors;
          if (!includeZeros && tot === 0) continue;
          const r = tot ? st.success / tot : null;
          rows.push({ op, a, b, succ: st.success, err: st.errors, attempts: tot, rate: r });
        }
      }
    }
    rows.sort(
      (x, y) =>
        y.err - y.succ - (x.err - x.succ) ||
        y.attempts - x.attempts ||
        x.op.localeCompare(y.op) ||
        x.a - y.a ||
        x.b - y.b
    );
    if ($('rDetails'))
      $('rDetails').innerHTML = rows.length
        ? rows
            .slice(0, 800)
            .map((r) => {
              const w = r.rate == null ? 0 : Math.round(r.rate * 100),
                color =
                  r.rate == null
                    ? '#334155'
                    : r.rate < 0.5
                    ? '#f87171'
                    : r.rate < 0.75
                    ? '#fbbf24'
                    : '#22c55e';
              return `<div class="row-detail"><div><span class="tag">${pretty(
                r.op,
                r.a,
                r.b
              )}</span></div><div>${r.succ}</div><div>${r.err}</div><div>${
                r.attempts
              }</div><div class="meter"><span style="width:${w}%;background:${color}"></span></div><div>${
                r.rate == null ? '—' : w + '%'
              }</div></div>`;
            })
            .join('')
        : `<div class="row-detail"><div>Aucune donnée.</div></div>`;
  }

  function topWeak(opFilter, n = 10) {
    const out = [];
    for (const k in stats) {
      const [op, a, b] = k.split('|');
      if (settings.globalOp !== 'mix' && op !== opFilter) continue;
      const s = stats[k],
        tot = s.success + s.errors,
        r = tot ? s.success / tot : 0;
      if (s.errors > s.success) out.push({ op, a: +a, b: +b, rate: r, attempts: tot });
    }
    out.sort((x, y) => x.rate - y.rate || y.attempts - x.attempts);
    return out.slice(0, n);
  }
  function topMastered(opFilter, n = 10) {
    const out = [];
    for (const k in stats) {
      const [op, a, b] = k.split('|');
      if (settings.globalOp !== 'mix' && op !== opFilter) continue;
      const s = stats[k];
      if (s.consecutive >= 3) {
        const tot = s.success + s.errors,
          r = tot ? s.success / tot : 1;
        out.push({ op, a: +a, b: +b, rate: r, attempts: tot, streak: s.consecutive });
      }
    }
    out.sort((x, y) => y.streak - x.streak || y.rate - x.rate || y.attempts - x.attempts);
    return out.slice(0, n);
  }
})();
