/* ============================================================================
   Maths — × + − ÷ (UI façon “Verbes”) — version patchée
   - Opération globale (affecte quiz, dashboard, rapport, libre par défaut)
   - Stats : erreur => compteur reset + "X" rouge, succès => 1,2,3 => 👍 (maîtrisé)
   - Jamais re-proposé au quiz après maîtrise (3 consécutifs)
   - Pratique : bouton "Nouvelle session"
   - Libre : génère TOUTES les combinaisons 1..10 de la famille, en désordre, sans doublon
   ============================================================================ */
(() => {
  ('use strict');

  /* Helpers + LS */
  const $ = (id) => document.getElementById(id);
  const nowISO = () => new Date().toISOString();
  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
      d.getHours()
    )}h${pad(d.getMinutes())}`;
  };
  function loadLS(k, f) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? f;
    } catch {
      return f;
    }
  }
  function saveLS(k, o) {
    localStorage.setItem(k, JSON.stringify(o));
  }

  /* Profils */
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
    renderAll();
  }

  /* Données & état */
  const DEFAULT_SETTINGS = {
    globalOp: 'mix', // 'mix' | 'mul' | 'add' | 'sub' | 'div'
    ops: { mul: true, add: false, sub: false, div: false },
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
  let results = [];
  let stats = {}; // k => {success, errors, consecutive, last:'ok'|'ko'|null, errRun}
  let staged = null;

  function loadState() {
    settings = loadLS(keyP(LS_KEYS.settings), DEFAULT_SETTINGS);
    // migration si vieux profil sans globalOp :
    if (!settings.globalOp) settings.globalOp = 'mix';
    results = loadLS(keyP(LS_KEYS.results), []);
    stats = loadLS(keyP(LS_KEYS.stats), {});
    staged = JSON.parse(JSON.stringify(settings));
  }
  function saveSettingsCommit() {
    settings = JSON.parse(JSON.stringify(staged));
    saveLS(keyP(LS_KEYS.settings), settings);
    renderAll();
  }
  function saveResults() {
    saveLS(keyP(LS_KEYS.results), results);
  }
  function saveStats() {
    saveLS(keyP(LS_KEYS.stats), stats);
  }

  /* Onglets & bootstrap */
  document.addEventListener('DOMContentLoaded', bootstrap);
  function bootstrap() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        $(btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'dashboard') {
          renderDashboard();
        }
        if (btn.dataset.tab === 'rapport') {
          renderReport();
          renderDetails(false);
        }
        if (btn.dataset.tab === 'libre') {
          buildLibreFamilies();
        }
      });
    });

    // profil
    $('saveUser').onclick = () => {
      const name = $('userName').value.trim();
      saveLS(LS_KEYS.user, name);
      switchProfile(name);
      alert('Profil chargé pour ' + (name || '👋'));
    };

    // op globale
    // $('globalOpSel').onchange = () => {
    //   staged.globalOp = $('globalOpSel').value;
    //   saveSettingsCommit(); // on commit direct ce choix global (UX attendue)
    // };

    bindSettingsUI();
    bindQuizUI();
    bindLibreUI();

    loadState();
    initGlobalOpUI();
    $('userName').value = loadLS(LS_KEYS.user, '') || '';
    // $('globalOpSel').value = settings.globalOp || 'mix';
    renderAll();
  }

  function renderAll() {
    renderSettings();
    renderDashboard();
    renderStatsGrid(currentOpForView());
  }

  // --- Opération centrale : UI segmentée ---
  function initGlobalOpUI() {
    document.querySelectorAll('#globalOpSeg .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => setGlobalOp(btn.dataset.op));
    });
    updateGlobalOpUI(settings.globalOp || 'mix');
  }
  function setGlobalOp(op) {
    if (!op) return;
    staged.globalOp = op;
    settings.globalOp = op; // on commit tout de suite (choix central)
    saveLS(keyP(LS_KEYS.settings), settings);
    updateGlobalOpUI(op);
    renderAll(); // impacte quiz, stats, rapport, libre par défaut
  }
  function updateGlobalOpUI(op) {
    document
      .querySelectorAll('#globalOpSeg .seg-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.op === op));
    const label = document.getElementById('focusOpLabel');
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

  /* Faits & stats */
  const OP_LABEL = { mul: '×', add: '+', sub: '−', div: '÷' };
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
    const k = keyOf(op, a, b);
    const st = getStat(op, a, b);
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
  function isMastered(op, a, b) {
    return getStat(op, a, b).consecutive >= 3;
  }
  function isWeak(op, a, b) {
    const s = getStat(op, a, b);
    return s.errors > s.success;
  }
  function rate(op, a, b) {
    const s = getStat(op, a, b);
    const tot = s.success + s.errors;
    return tot ? s.success / tot : null;
  }

  /* Génération */
  function opAllowed(op) {
    return staged.globalOp === 'mix' ? true : op === staged.globalOp;
  }
  function buildPool() {
    const pool = [];
    const ex = true; // "jamais re-proposé" une fois maîtrisé

    if (staged.ops.mul && opAllowed('mul')) {
      const R = staged.ranges.mul;
      for (let a = R.aMin; a <= R.aMax; a++) {
        for (let b = 0; b <= R.bMax; b++) {
          if (ex && isMastered('mul', a, b)) continue;
          pool.push({ op: 'mul', a, b, w: weight('mul', a, b) });
        }
      }
    }
    if (staged.ops.add && opAllowed('add')) {
      const R = staged.ranges.add;
      for (let a = R.aMin; a <= R.aMax; a++) {
        for (let b = 0; b <= R.bMax; b++) {
          if (ex && isMastered('add', a, b)) continue;
          pool.push({ op: 'add', a, b, w: weight('add', a, b) });
        }
      }
    }
    if (staged.ops.sub && opAllowed('sub')) {
      const R = staged.ranges.sub;
      for (let a = R.aMin; a <= R.aMax; a++) {
        for (let b = 0; b <= R.bMax; b++) {
          if (R.nonneg && a - b < 0) continue;
          if (ex && isMastered('sub', a, b)) continue;
          pool.push({ op: 'sub', a, b, w: weight('sub', a, b) });
        }
      }
    }
    if (staged.ops.div && opAllowed('div')) {
      const R = staged.ranges.div;
      for (let b = 1; b <= R.bMax; b++) {
        for (let q = 1; q <= 10; q++) {
          const a = b * q;
          if (a > R.aMax) continue;
          if (ex && isMastered('div', a, b)) continue;
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
    if (op === 'mul') return `${a} × ${b}`;
    if (op === 'add') return `${a} + ${b}`;
    if (op === 'sub') return `${a} − ${b}`;
    if (op === 'div') return `${a} ÷ ${b}`;
    return `${a}?${b}`;
  }
  function answerOf(op, a, b) {
    if (op === 'mul') return a * b;
    if (op === 'add') return a + b;
    if (op === 'sub') return a - b;
    if (op === 'div') return Math.floor(a / b);
    return 0;
  }

  /* Quiz */
  let quiz = null,
    timerInterval = null;
  const FULL = 113;
  function bindQuizUI() {
    $('startQuiz').onclick = startQuiz;
    $('submitAnswer').onclick = submit;
    $('answer').addEventListener('keyup', (e) => {
      if (e.key === 'Enter') submit();
    });
    $('backToMenu').onclick = () => document.querySelector('[data-tab="dashboard"]').click();
    $('retryErrors').onclick = retryErrors;
    $('newSession').onclick = startQuiz; // ← relancer direct
  }
  function startQuiz() {
    staged.qCount = clampNum($('qCount').value, 5, 50);
    staged.timerSec = clampNum($('timerSec').value, 0, 60);

    const pool = buildPool();
    if (pool.length === 0) {
      alert('Aucun fait disponible (vérifie Réglages et l’opération globale).');
      return;
    }

    const N = Math.min(staged.qCount, pool.length);
    const bag = pool.slice(),
      items = [];
    while (items.length < N) {
      const it = pickWeighted(bag);
      items.push({ op: it.op, a: it.a, b: it.b });
      bag.splice(bag.indexOf(it), 1);
    }
    quiz = { items, idx: 0, score: 0, points: 0, timerSec: staged.timerSec };
    $('resultBox').classList.add('hidden');
    $('quizBox').classList.remove('hidden');
    document.querySelector('[data-tab="pratique"]').click();
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
    $('timeDisplay').textContent = sec;
    const circle = document.querySelector('.countdown circle');
    circle.classList.remove('low-time');
    circle.style.strokeDashoffset = 0;
    if (sec <= 0) return;
    let left = sec;
    timerInterval = setInterval(() => {
      left--;
      $('timeDisplay').textContent = left;
      const offset = (FULL / (sec - 1 || 1)) * (sec - left);
      circle.style.strokeDashoffset = offset;
      if (left <= 3) circle.classList.add('low-time');
      if (left <= 0) {
        clearInterval(timerInterval);
        submit();
      }
    }, 1000);
  }
  function submit() {
    const it = quiz.items[quiz.idx];
    const user = parseInt($('answer').value, 10);
    const ok = user === answerOf(it.op, it.a, it.b);
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
  function updateProgressBar() {
    const r = quiz.idx / quiz.items.length;
    $('progress-bar').style.width = `${Math.round(r * 100)}%`;
  }
  function endQuiz() {
    $('quizBox').classList.add('hidden');
    $('resultBox').classList.remove('hidden');
    $(
      'resultTitle'
    ).textContent = `Score : ${quiz.score}/${quiz.items.length} — Points : ${quiz.points}`;
    const weakList = topWeak(currentOpForView(), 10);
    $('missedQuestions').innerHTML = weakList
      .map((w) => `<li>${pretty(w.op, w.a, w.b)} = ${answerOf(w.op, w.a, w.b)}</li>`)
      .join('');
    $('retryErrors').onclick = () => {
      if (weakList.length === 0) {
        alert('Aucune faiblesse détectée.');
        return;
      }
      quiz = {
        items: weakList.map((w) => ({ op: w.op, a: w.a, b: w.b })),
        idx: 0,
        score: 0,
        points: 0,
        timerSec: staged.timerSec,
      };
      $('resultBox').classList.add('hidden');
      $('quizBox').classList.remove('hidden');
      updateProgressBar();
      renderQuestion();
    };
    results.push({
      date: fmtDate(new Date()),
      correct: quiz.score,
      missed: quiz.items.length - quiz.score,
      points: quiz.points,
    });
    saveResults();
    renderDashboard();
  }

  /* Tableau de bord */
  function renderDashboard() {
    // KPIs (filtrées par op globale si ≠ mix)
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
    $('kpiRate').textContent = A ? `${Math.round((100 * S) / A)}%` : '—';
    $('kpiAttempts').textContent = A ? `${A} essais` : '—';
    $('kpiMastered').textContent = mastered;
    $('kpiWeak').textContent = weak;

    const last = results[results.length - 1];
    $('kpiLast').textContent = last ? `${last.correct}/${last.correct + last.missed}` : '—';
    $('kpiLastWhen').textContent = last ? last.date : '—';

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

  function currentOpForView() {
    return settings.globalOp === 'mix' ? 'mul' : settings.globalOp;
  }

  function renderStatsGrid(op) {
    // masquer les boutons locaux si op global ≠ mix
    const switcher = document.querySelector('.op-switch');
    if (switcher) {
      switcher.style.display = settings.globalOp === 'mix' ? 'flex' : 'none';
    }

    const grid = $('statsGrid');
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
          d.textContent = '';
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

  /* Réglages */
  function bindSettingsUI() {
    $('presetSelect').onchange = () => {
      const id = $('presetSelect').value;
      if (!id) return;
      applyPresetToStaged(id);
      renderSettings();
    };
    $('saveSettings').onclick = saveSettingsCommit;
    $('resetProgress').onclick = () => {
      if (confirm('Effacer la progression de ce profil ?')) {
        stats = {};
        results = [];
        saveStats();
        saveResults();
        renderAll();
      }
    };
  }
  function renderSettings() {
    $('op_mul').checked = staged.ops.mul;
    $('op_add').checked = staged.ops.add;
    $('op_sub').checked = staged.ops.sub;
    $('op_div').checked = staged.ops.div;
    $('op_mul').onchange = (e) => (staged.ops.mul = e.target.checked);
    $('op_add').onchange = (e) => (staged.ops.add = e.target.checked);
    $('op_sub').onchange = (e) => (staged.ops.sub = e.target.checked);
    $('op_div').onchange = (e) => (staged.ops.div = e.target.checked);

    const R = staged.ranges;
    $('mul_a_min').value = R.mul.aMin;
    $('mul_a_max').value = R.mul.aMax;
    $('mul_b_max').value = R.mul.bMax;
    $('add_a_min').value = R.add.aMin;
    $('add_a_max').value = R.add.aMax;
    $('add_b_max').value = R.add.bMax;
    $('sub_a_min').value = R.sub.aMin;
    $('sub_a_max').value = R.sub.aMax;
    $('sub_b_max').value = R.sub.bMax;
    $('sub_nonneg').checked = R.sub.nonneg;
    $('div_a_max').value = R.div.aMax;
    $('div_b_max').value = R.div.bMax;

    $('mul_a_min').oninput = (e) => (R.mul.aMin = +e.target.value);
    $('mul_a_max').oninput = (e) => (R.mul.aMax = +e.target.value);
    $('mul_b_max').oninput = (e) => (R.mul.bMax = +e.target.value);
    $('add_a_min').oninput = (e) => (R.add.aMin = +e.target.value);
    $('add_a_max').oninput = (e) => (R.add.aMax = +e.target.value);
    $('add_b_max').oninput = (e) => (R.add.bMax = +e.target.value);
    $('sub_a_min').oninput = (e) => (R.sub.aMin = +e.target.value);
    $('sub_a_max').oninput = (e) => (R.sub.aMax = +e.target.value);
    $('sub_b_max').oninput = (e) => (R.sub.bMax = +e.target.value);
    $('sub_nonneg').onchange = (e) => (R.sub.nonneg = !!e.target.checked);
    $('div_a_max').oninput = (e) => (R.div.aMax = +e.target.value);
    $('div_b_max').oninput = (e) => (R.div.bMax = +e.target.value);

    $('qCount').value = staged.qCount;
    $('timerSec').value = staged.timerSec;
    $('excludeMastered').checked = staged.excludeMastered;
    $('qCount').oninput = (e) => (staged.qCount = clampNum(e.target.value, 5, 50));
    $('timerSec').oninput = (e) => (staged.timerSec = clampNum(e.target.value, 0, 60));
    $('excludeMastered').onchange = (e) => (staged.excludeMastered = !!e.target.checked);
  }
  function applyPresetToStaged(id) {
    if (id === 'g3_mul_0_12') {
      staged.globalOp = 'mul';
      staged.ops = { mul: true, add: false, sub: false, div: false };
      staged.ranges.mul = { aMin: 0, aMax: 12, bMax: 12 };
      staged.qCount = 20;
      staged.timerSec = 10;
      staged.excludeMastered = true;
      //   $('globalOpSel').value = 'mul';
      setGlobalOp('mul'); // ou 'mix' / 'add' / 'sub' / 'div' selon le preset
    } else if (id === 'g3_add_sub_0_20') {
      staged.globalOp = 'mix';
      staged.ops = { mul: false, add: true, sub: true, div: false };
      staged.ranges.add = { aMin: 0, aMax: 20, bMax: 20 };
      staged.ranges.sub = { aMin: 0, aMax: 20, bMax: 20, nonneg: true };
      staged.qCount = 20;
      staged.timerSec = 10;
      libSheet;
      staged.excludeMastered = true;
      //   $('globalOpSel').value = 'mix';
      setGlobalOp('mul'); // ou 'mix' / 'add' / 'sub' / 'div' selon le preset
    } else if (id === 'mix_all') {
      staged.globalOp = 'mix';
      staged.ops = { mul: true, add: true, sub: true, div: true };
      staged.ranges.mul = { aMin: 0, aMax: 12, bMax: 12 };
      staged.ranges.add = { aMin: 0, aMax: 20, bMax: 20 };
      staged.ranges.sub = { aMin: 0, aMax: 20, bMax: 20, nonneg: true };
      staged.ranges.div = { aMax: 144, bMax: 12 };
      staged.qCount = 20;
      staged.timerSec = 10;
      staged.excludeMastered = true;
      //   $('globalOpSel').value = 'mix';
      setGlobalOp('mul'); // ou 'mix' / 'add' / 'sub' / 'div' selon le preset
    }
  }

  /* Mode libre */
  function bindLibreUI() {
    $('libGen').onclick = genLibre;
    $('libCheck').onclick = checkLibre;
    $('libOp').onchange = buildLibreFamilies;
  }
  function buildLibreFamilies() {
    const global = settings.globalOp || 'mix';
    const opSel = $('libOp');
    // par défaut, on colle à l’opération globale (si ≠ mix)
    if (global !== 'mix') opSel.value = global;
    const op = opSel.value;

    const famSel = $('libFam'),
      opts = [];
    if (op === 'mul') {
      for (let k = 1; k <= 10; k++) opts.push({ v: `b:${k}`, label: `× ${k}` });
    }
    if (op === 'add') {
      for (let k = 1; k <= 10; k++) opts.push({ v: `b:${k}`, label: `+ ${k}` });
    }
    if (op === 'sub') {
      for (let k = 1; k <= 10; k++) opts.push({ v: `b:${k}`, label: `− ${k}` });
    }
    if (op === 'div') {
      for (let k = 1; k <= 10; k++) opts.push({ v: `b:${k}`, label: `÷ par ${k}` });
    }
    famSel.innerHTML = opts.map((o) => `<option value="${o.v}">${o.label}</option>`).join('');
  }
  function genLibre() {
    const op = $('libOp').value;
    const b = +$('libFam').value.split(':')[1];
    const items = [];
    for (let k = 1; k <= 10; k++) {
      if (op === 'mul') {
        items.push({ op, a: k, b });
      } else if (op === 'add') {
        items.push({ op, a: k, b });
      } else if (op === 'sub') {
        // garantir résultat ≥0 : (b+k) − b
        items.push({ op, a: b + k, b });
      } else if (op === 'div') {
        items.push({ op, a: b * k, b });
      }
    }
    shuffle(items);
    const sheet = $('libSheet');
    sheet.classList.remove('hidden');
    sheet.innerHTML = '';
    sheet.innerHTML = items
      .map(
        (it, idx) => `
      <div class="cell">
        <div style="margin-bottom:6px">${pretty(it.op, it.a, it.b)} = </div>
        <input type="number" id="lib_${idx}" data-op="${it.op}" data-a="${it.a}" data-b="${it.b}">
      </div>`
      )
      .join('');
    $('libFeedback').textContent = '';
  }
  function checkLibre() {
    const inputs = Array.from(document.querySelectorAll('#libSheet input'));
    if (inputs.length === 0) {
      alert('Génère une feuille d’abord.');
      return;
    }
    let ok = 0;
    for (const inp of inputs) {
      const op = inp.dataset.op,
        a = +inp.dataset.a,
        b = +inp.dataset.b;
      const want = answerOf(op, a, b),
        got = parseInt(inp.value, 10);
      const good = got === want;
      updateStat(op, a, b, good);
      if (good) ok++;
      inp.style.borderColor = good ? '#22c55e' : '#f87171';
    }
    $('libFeedback').className = 'feedback ' + (ok === inputs.length ? 'ok' : 'ko');
    $('libFeedback').textContent = `${ok}/${inputs.length} correct(s)`;
    renderDashboard();
  }

  /* Rapport */
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
    $('rGlobalRate').textContent = A ? `${Math.round((100 * S) / A)}%` : '—';
    $('rGlobalAttempts').textContent = A ? `${A} essais` : '—';
    $('rMasteredCount').textContent = mastered;
    $('rWeakCount').textContent = weak;

    const last = results[results.length - 1];
    $('rLastPoints').textContent = last ? last.points : '—';
    $('rLastWhen').textContent = last ? last.date : '—';

    const w = topWeak(currentOpForView(), 10),
      m = topMastered(currentOpForView(), 10);
    $('rWeak').innerHTML = w.length
      ? w
          .map((x) =>
            rowHTML(`${pretty(x.op, x.a, x.b)}`, rate(x.op, x.a, x.b), getAttempts(x.op, x.a, x.b))
          )
          .join('')
      : `<div class="row-line"><div>Aucune faiblesse détectée 🎉</div></div>`;
    $('rMastered').innerHTML = m.length
      ? m
          .map((x) =>
            rowHTML(`${pretty(x.op, x.a, x.b)}`, rate(x.op, x.a, x.b), getAttempts(x.op, x.a, x.b))
          )
          .join('')
      : `<div class="row-line"><div>Pas encore de faits “maîtrisés”.</div></div>`;

    if (!$('rDetailsAll')._bound) {
      $('rDetailsAll').addEventListener('change', (e) => renderDetails(!!e.target.checked));
      $('rDetailsAll')._bound = true;
    }
  }
  function rowHTML(label, r, attempts) {
    const w = r == null ? 0 : Math.round(r * 100),
      color = rateColor(r);
    return `<div class="row-line"><div><span class="tag">${label}</span></div><div>${
      r == null ? '—' : w + '%'
    }</div><div class="meter"><span style="width:${w}%;background:${color}"></span></div><div>${attempts} ess.</div></div>`;
  }
  function rateColor(r) {
    if (r === null) return '#334155';
    if (r < 0.5) return '#f87171';
    if (r < 0.75) return '#fbbf24';
    return '#22c55e';
  }
  function getAttempts(op, a, b) {
    const s = getStat(op, a, b);
    return s.success + s.errors;
  }

  function renderDetails(includeZeros) {
    const rows = [],
      opView = currentOpForView();
    const span = { mul: 12, div: 12, add: 20, sub: 20 };
    const loopOps = settings.globalOp === 'mix' ? ['mul', 'add', 'sub', 'div'] : [opView];
    for (const op of loopOps) {
      for (let i = 0; i <= span[op]; i++) {
        const maxB = op === 'div' ? span[op] : span[op];
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
    rows.sort((x, y) => {
      const dx = y.err - y.succ - (x.err - x.succ);
      if (dx) return dx;
      if (y.attempts !== x.attempts) return y.attempts - x.attempts;
      return x.op.localeCompare(y.op) || x.a - x.b;
    });
    $('rDetails').innerHTML = rows.length
      ? rows
          .slice(0, 800)
          .map((r) => {
            const w = r.rate == null ? 0 : Math.round(r.rate * 100),
              color = rateColor(r.rate);
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

  /* Utils */
  function clampNum(v, min, max) {
    v = parseInt(v, 10);
    if (isNaN(v)) v = min;
    return Math.max(min, Math.min(max, v));
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
})();
