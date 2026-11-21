(() => {
  'use strict';

  const KEY = 'sfu-grade-calc';
  const LETTERS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
  // SFU grade points
  const POINTS = { 'A+': 4.33, 'A': 4, 'A-': 3.67, 'B+': 3.33, 'B': 3, 'B-': 2.67, 'C+': 2.33, 'C': 2, 'C-': 1.67, 'D': 1, 'F': 0 };
  // SIAT recommended percentage cutoffs (minimum % for each letter)
  const SIAT = { 'A+': 95, 'A': 90, 'A-': 85, 'B+': 80, 'B': 75, 'B-': 70, 'C+': 65, 'C': 60, 'C-': 55, 'D': 50, 'F': 0 };

  const $app = document.getElementById('app');
  const $tabs = document.getElementById('tabs');
  const $defaults = document.getElementById('defaults');
  const $file = document.getElementById('import-file');
  const $toast = document.getElementById('toast');

  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const fmt = (n, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).replace(/\.?0+$/, '') || '0';
  const fmtGpa = (n) => n.toFixed(2);

  /* ---------- storage ---------- */

  function blank() {
    return { version: 1, semesters: [], activeId: null, defaults: { ...SIAT }, prior: { cgpa: '', units: '' } };
  }
  function normalize(s) {
    const b = blank();
    const out = { ...b, ...s, defaults: { ...SIAT, ...(s.defaults || {}) }, prior: { ...b.prior, ...(s.prior || {}) } };
    out.semesters = (s.semesters || []).map((sem) => ({
      id: sem.id || uid(), name: sem.name || '', target: sem.target || '',
      courses: (sem.courses || []).map((c) => ({
        id: c.id || uid(), code: c.code || '', units: c.units ?? 3, target: c.target || '',
        custom: c.custom || null, open: c.open !== false,
        items: (c.items || []).map((i) => ({ id: i.id || uid(), name: i.name || '', weight: i.weight ?? '', grade: i.grade ?? '' })),
      })),
    }));
    if (!out.semesters.some((x) => x.id === out.activeId)) out.activeId = out.semesters[0]?.id || null;
    return out;
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && Array.isArray(raw.semesters)) return normalize(raw);
    } catch (e) { /* fall through */ }
    return blank();
  }
  let saveWarned = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { if (!saveWarned) { toast('This browser is blocking storage, so changes won’t be saved.'); saveWarned = true; } }
  }

  let state = load();
  const openCut = new Set(); // course ids with the cutoff editor open

  /* ---------- math ---------- */

  function parseGrade(v) {
    if (v == null) return null;
    const s = String(v).trim().replace(/%$/, '').trim();
    if (!s) return null;
    const m = s.match(/^(-?\d*\.?\d+)\s*\/\s*(\d*\.?\d+)$/);
    if (m) { const d = parseFloat(m[2]); return d > 0 ? (parseFloat(m[1]) / d) * 100 : null; }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function cutoffsFrom(src) {
    const o = {};
    for (const L of LETTERS) { const n = num(src[L]); o[L] = L === 'F' ? 0 : (n == null ? SIAT[L] : n); }
    return o;
  }
  const cutoffsFor = (c) => cutoffsFrom((c && c.custom) || state.defaults);
  const cutoffsValid = (o) => LETTERS.slice(0, -1).every((L, i) => o[L] > o[LETTERS[i + 1]]);
  const isSiat = (src) => LETTERS.every((L) => cutoffsFrom(src)[L] === SIAT[L]);

  function letterFor(pct, cut) {
    for (const L of LETTERS) if (pct + 1e-9 >= cut[L]) return L;
    return 'F';
  }

  function courseStats(c) {
    let total = 0, graded = 0, earned = 0;
    for (const it of c.items) {
      const w = num(it.weight);
      if (!(w > 0)) continue;
      total += w;
      const g = parseGrade(it.grade);
      if (g != null) { graded += w; earned += (w * g) / 100; }
    }
    const cut = cutoffsFor(c);
    const current = graded > 0 ? (earned / graded) * 100 : null;
    const letter = current == null ? null : letterFor(current, cut);
    const remaining = Math.max(0, 100 - graded);
    const needFor = (L) => (remaining > 1e-9 ? ((cut[L] - earned) / remaining) * 100 : null);
    return { total, graded, earned, current, letter, remaining, cut, needFor };
  }

  function semStats(s) {
    let units = 0, pts = 0, allUnits = 0, pu = 0, ppts = 0, anyTarget = false;
    for (const c of s.courses) {
      const st = courseStats(c);
      const u = num(c.units) || 0;
      allUnits += u;
      if (st.letter && u > 0) { units += u; pts += u * POINTS[st.letter]; }
      const proj = c.target || st.letter;
      if (c.target) anyTarget = true;
      if (proj && u > 0) { pu += u; ppts += u * POINTS[proj]; }
    }
    return {
      tgpa: units ? pts / units : null, units, allUnits, pts,
      proj: anyTarget && pu ? ppts / pu : null, anyTarget,
    };
  }

  /* ---------- helpers ---------- */

  const active = () => state.semesters.find((s) => s.id === state.activeId) || null;
  const findCourse = (el) => { const s = active(); const id = el.closest('[data-cid]')?.dataset.cid; return s && s.courses.find((c) => c.id === id); };
  const findItem = (c, el) => { const id = el.closest('[data-iid]')?.dataset.iid; return c && c.items.find((i) => i.id === id); };

  function guessTermName() {
    const d = new Date(), m = d.getMonth(), y = d.getFullYear();
    if (m <= 3) return `Spring ${y}`;
    if (m <= 7) return `Summer ${y}`;
    return `Fall ${y}`;
  }

  const newItem = () => ({ id: uid(), name: '', weight: '', grade: '' });
  const newCourse = () => ({ id: uid(), code: '', units: 3, target: '', custom: null, open: true, items: [newItem()] });
  function newSemester(name) {
    const s = { id: uid(), name: name || guessTermName(), target: '', courses: [] };
    state.semesters.push(s);
    state.activeId = s.id;
    return s;
  }

  let toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
  }

  const letterOptions = (sel, withPoints) =>
    `<option value="">None</option>` +
    LETTERS.slice(0, -1).map((L) => `<option value="${L}"${L === sel ? ' selected' : ''}>${L}${withPoints ? ` (${POINTS[L].toFixed(2)})` : ''}</option>`).join('');

  /* ---------- templates ---------- */

  function emptyHTML() {
    return `
      <form class="start" data-form="new-sem">
        <h1>Start with a semester</h1>
        <p>Add your courses to it, then your assignments.</p>
        <label for="sem-name">Semester name</label>
        <div class="row">
          <input id="sem-name" name="name" value="${esc(guessTermName())}" autocomplete="off" required>
          <button class="btn primary" type="submit">Create</button>
        </div>
      </form>`;
  }

  function cutGrid(src, scope) {
    return `<div class="cut-grid">` +
      LETTERS.slice(0, -1).map((L) =>
        `<label><span><b>${L}</b> from</span><input data-scope="${scope}" data-f="${L}" value="${esc(src[L])}" inputmode="decimal" aria-label="Minimum percent for ${L}"></label>`
      ).join('') +
      `<span class="cut-f">F below D</span></div>`;
  }

  function itemHTML(it) {
    return `
      <div class="irow" data-iid="${it.id}">
        <input data-scope="item" data-f="name" value="${esc(it.name)}" placeholder="Assignment" aria-label="Assignment name">
        <div class="suffix"><input data-scope="item" data-f="weight" value="${esc(it.weight)}" inputmode="decimal" placeholder="Weight" aria-label="Weight in percent"><span>%</span></div>
        <input data-scope="item" data-f="grade" value="${esc(it.grade)}" placeholder="85 or 17/20" aria-label="Grade">
        <span class="contrib" data-out="contrib"></span>
        <button class="x" data-act="del-item" aria-label="Remove assignment" title="Remove">×</button>
      </div>`;
  }

  function courseHTML(c) {
    const cutOpen = openCut.has(c.id);
    return `
      <article class="course${c.open ? ' open' : ''}" data-cid="${c.id}">
        <header class="c-head">
          <button class="caret" data-act="toggle" aria-expanded="${c.open}" aria-label="Show or hide assignments"></button>
          <input class="c-code" data-scope="course" data-f="code" value="${esc(c.code)}" placeholder="Course code" aria-label="Course code">
          <label class="mini">Units <input type="number" min="0" step="0.5" data-scope="course" data-f="units" value="${esc(c.units)}"></label>
          <label class="mini">Target <select data-scope="course" data-f="target">${letterOptions(c.target)}</select></label>
          <div class="c-grade" data-out="badge"></div>
        </header>
        <div class="c-body">
          <div class="items">
            <div class="irow ihead"><span>Assignment</span><span>Weight</span><span>Grade</span><span>Counts for</span><span></span></div>
            ${c.items.map(itemHTML).join('')}
          </div>
          <button class="link" data-act="add-item">+ Add assignment</button>
          <div class="c-stats" data-out="stats"></div>
          <div class="c-cut">
            <button class="link" data-act="toggle-cut" aria-expanded="${cutOpen}" data-out="cutlabel"></button>
            ${cutOpen ? `
              ${cutGrid(c.custom || state.defaults, 'cut')}
              <p class="warn" data-out="cutwarn"></p>
              <div class="cut-actions">${c.custom ? `<button class="link" data-act="reset-cut">Go back to default cutoffs</button>` : ''}</div>` : ''}
          </div>
          <div class="c-foot"><button class="link danger" data-act="del-course">Delete course</button></div>
        </div>
      </article>`;
  }

  function semHTML(s) {
    return `
      <section class="sem">
        <div class="sem-head">
          <input class="sem-name" data-scope="sem" data-f="name" value="${esc(s.name)}" aria-label="Semester name">
          <button class="link danger" data-act="del-sem">Delete semester</button>
        </div>
        <div class="summary">
          <div class="stat big">
            <span class="k">TGPA</span>
            <span class="v" data-out="tgpa">–</span>
            <span class="sub" data-out="units"></span>
          </div>
          <div class="stat">
            <label class="k" for="goal">Semester goal</label>
            <select id="goal" data-scope="sem" data-f="target">${letterOptions(s.target, true)}</select>
            <span class="sub" data-out="goal"></span>
            ${s.target && s.courses.length ? `<button class="link" data-act="apply-goal">Make this every course’s target</button>` : ''}
          </div>
          <div class="stat">
            <span class="k">If you hit your targets</span>
            <span class="v" data-out="proj">–</span>
            <span class="sub" data-out="projsub"></span>
          </div>
          <div class="stat">
            <span class="k">CGPA after this term</span>
            <span class="v" data-out="cgpa">–</span>
            <div class="prior">
              <label>CGPA now<input data-scope="prior" data-f="cgpa" value="${esc(state.prior.cgpa)}" inputmode="decimal" placeholder="3.40"></label>
              <label>Units done<input data-scope="prior" data-f="units" value="${esc(state.prior.units)}" inputmode="decimal" placeholder="45"></label>
            </div>
          </div>
        </div>
        <div class="courses">${s.courses.map(courseHTML).join('')}</div>
        <button class="btn add-course" data-act="add-course">+ Add course</button>
      </section>`;
  }

  function renderTabs() {
    $tabs.innerHTML = state.semesters.length
      ? state.semesters.map((s) => `<button class="tab${s.id === state.activeId ? ' on' : ''}" data-act="open-sem" data-sid="${s.id}">${esc(s.name.trim() || 'Untitled')}</button>`).join('') +
        `<button class="tab add" data-act="new-sem">+ Semester</button>`
      : '';
  }

  function renderDefaults() {
    $defaults.innerHTML = cutGrid(state.defaults, 'def') +
      `<p class="warn" data-out="defwarn"></p>` +
      `<button class="link" data-act="reset-defaults">Reset to SIAT scale</button>`;
  }

  function render() {
    renderTabs();
    const s = active();
    $app.innerHTML = s ? semHTML(s) : emptyHTML();
    refresh();
  }

  /* ---------- live outputs (never touch inputs, so focus is kept) ---------- */

  const out = (root, name, html) => { const el = root.querySelector(`[data-out="${name}"]`); if (el) el.innerHTML = html; };

  function needText(L, need, st) {
    const rem = fmt(st.remaining);
    if (need == null) {
      return st.earned + 1e-9 >= st.cut[L]
        ? `<p class="need good">You finished at or above ${L}.</p>`
        : `<p class="need bad">Everything is graded. You finished below ${L}.</p>`;
    }
    if (need <= 0) return `<p class="need good">${L} is locked in, even with 0 on the remaining ${rem}%.</p>`;
    if (need > 100) return `<p class="need bad">${L} is out of reach. It would take ${fmt(need, 1)}% on the remaining ${rem}%.</p>`;
    return `<p class="need">For ${L} (${fmt(st.cut[L])}%+), you need ${fmt(need, 1)}% on the remaining ${rem}%.</p>`;
  }

  function courseStatsHTML(c, st) {
    const parts = [];
    if (st.graded > 0) {
      parts.push(`<p>${fmt(st.earned)} of ${fmt(st.graded)} points earned so far.` +
        (st.remaining > 1e-9 ? ` Final will land between ${fmt(st.earned)}% (${letterFor(st.earned, st.cut)}) and ${fmt(st.earned + st.remaining)}% (${letterFor(st.earned + st.remaining, st.cut)}).` : '') +
        `</p>`);
    }
    if (st.total > 100 + 1e-9) parts.push(`<p class="warn">Weights add up to ${fmt(st.total)}%, which is over 100%.</p>`);
    else if (st.total > 0 && st.total < 100 - 1e-9) parts.push(`<p class="warn">Weights add up to ${fmt(st.total)}%. The other ${fmt(100 - st.total)}% isn’t listed yet.</p>`);

    if (c.target) parts.push(needText(c.target, st.needFor(c.target), st));

    if (st.graded > 0 && st.remaining > 1e-9) {
      const chips = LETTERS.slice(0, -1).map((L) => {
        const n = st.needFor(L);
        if (n > 100) return '';
        const cls = [n <= 0 ? 'locked' : '', L === c.target ? 'target' : ''].join(' ').trim();
        return `<span${cls ? ` class="${cls}"` : ''}><b>${L}</b>${n <= 0 ? 'locked' : fmt(n, 1) + '%'}</span>`;
      }).join('');
      if (chips) parts.push(`<div class="needs" title="Average you need on everything left">${chips}</div>`);
    }
    return parts.join('');
  }

  function refresh() {
    renderTabs();
    const defCut = cutoffsFrom(state.defaults);
    out($defaults, 'defwarn', cutoffsValid(defCut) ? '' : 'Cutoffs need to go down from A+ to D.');

    const s = active();
    if (!s) return;
    const ss = semStats(s);

    out($app, 'tgpa', ss.tgpa == null ? '–' : fmtGpa(ss.tgpa));
    out($app, 'units', ss.allUnits
      ? (ss.units === ss.allUnits ? `${fmt(ss.units)} units` : `${fmt(ss.units)} of ${fmt(ss.allUnits)} units have grades`)
      : 'Add a course to start');

    if (s.target) {
      const goal = POINTS[s.target];
      if (ss.tgpa == null) out($app, 'goal', `Aiming for ${goal.toFixed(2)}`);
      else {
        const diff = ss.tgpa - goal;
        out($app, 'goal', diff >= -1e-9
          ? `<span class="good">On track, ${fmtGpa(diff)} above</span>`
          : `<span class="bad">${fmtGpa(-diff)} below your goal</span>`);
      }
    } else out($app, 'goal', '');

    out($app, 'proj', ss.proj == null ? '–' : fmtGpa(ss.proj));
    if (ss.proj == null) out($app, 'projsub', 'Set a target on a course');
    else if (s.target) out($app, 'projsub', ss.proj + 1e-9 >= POINTS[s.target]
      ? `<span class="good">Meets your ${s.target} goal</span>`
      : `<span class="bad">Short of your ${s.target} goal by ${fmtGpa(POINTS[s.target] - ss.proj)}</span>`);
    else out($app, 'projsub', 'Untargeted courses use their current grade');

    const pc = num(state.prior.cgpa), pu = num(state.prior.units);
    if (ss.tgpa != null && pc != null && pu != null && pu >= 0 && ss.units + pu > 0) {
      out($app, 'cgpa', fmtGpa((pc * pu + ss.pts) / (pu + ss.units)));
    } else out($app, 'cgpa', '–');

    for (const c of s.courses) {
      const el = $app.querySelector(`[data-cid="${c.id}"]`);
      if (!el) continue;
      const st = courseStats(c);
      out(el, 'badge', st.letter
        ? `<b>${st.letter}</b><span class="pct">${fmt(st.current)}%</span>`
        : `<span class="none">No grades yet</span>`);
      out(el, 'stats', courseStatsHTML(c, st));
      for (const it of c.items) {
        const row = el.querySelector(`[data-iid="${it.id}"]`);
        const w = num(it.weight), g = parseGrade(it.grade);
        if (row) out(row, 'contrib', w > 0 && g != null ? `${fmt((w * g) / 100)} / ${fmt(w)}` : '');
      }
      const cutOpen = openCut.has(c.id);
      out(el, 'cutlabel', `${cutOpen ? 'Hide' : 'Edit'} cutoffs` +
        (c.custom ? ' · custom for this course' : isSiat(state.defaults) ? ' · SIAT default' : ' · your default'));
      out(el, 'cutwarn', cutoffsValid(st.cut) ? '' : 'Cutoffs need to go down from A+ to D.');
    }
  }

  /* ---------- events ---------- */

  document.addEventListener('input', (e) => {
    const t = e.target, scope = t.dataset.scope, f = t.dataset.f;
    if (!scope || !f) return;
    const s = active();
    if (scope === 'sem') {
      s[f] = t.value;
      if (f === 'target') { save(); render(); return; }
    } else if (scope === 'prior') state.prior[f] = t.value;
    else if (scope === 'def') state.defaults[f] = t.value;
    else {
      const c = findCourse(t);
      if (!c) return;
      if (scope === 'course') c[f] = t.value;
      else if (scope === 'item') { const it = findItem(c, t); if (it) it[f] = t.value; }
      else if (scope === 'cut') {
        if (!c.custom) {
          c.custom = { ...state.defaults };
          c.custom[f] = t.value;
          save();
          // re-render so the "go back to default" button appears, then restore focus
          render();
          const again = $app.querySelector(`[data-cid="${c.id}"] [data-scope="cut"][data-f="${f}"]`);
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
          return;
        }
        c.custom[f] = t.value;
      }
    }
    save();
    refresh();
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const s = active();
    const c = findCourse(b);

    switch (act) {
      case 'open-sem': state.activeId = b.dataset.sid; break;
      case 'new-sem': {
        newSemester();
        save(); render();
        const n = $app.querySelector('.sem-name');
        if (n) { n.focus(); n.select(); }
        return;
      }
      case 'del-sem':
        if (!confirm(`Delete “${s.name || 'this semester'}” and all of its courses?`)) return;
        state.semesters = state.semesters.filter((x) => x.id !== s.id);
        state.activeId = state.semesters[state.semesters.length - 1]?.id || null;
        break;
      case 'apply-goal':
        s.courses.forEach((x) => { x.target = s.target; });
        toast(`Every course is now targeting ${s.target}`);
        break;
      case 'add-course': {
        const nc = newCourse();
        s.courses.push(nc);
        save(); render();
        $app.querySelector(`[data-cid="${nc.id}"] .c-code`)?.focus();
        return;
      }
      case 'toggle': c.open = !c.open; break;
      case 'add-item': {
        const it = newItem();
        c.items.push(it);
        save(); render();
        $app.querySelector(`[data-iid="${it.id}"] input`)?.focus();
        return;
      }
      case 'del-item': {
        const it = findItem(c, b);
        c.items = c.items.filter((x) => x !== it);
        break;
      }
      case 'del-course': {
        const hasData = c.code || c.items.some((i) => i.name || i.weight || i.grade);
        if (hasData && !confirm(`Delete ${c.code || 'this course'}?`)) return;
        s.courses = s.courses.filter((x) => x !== c);
        openCut.delete(c.id);
        break;
      }
      case 'toggle-cut':
        openCut.has(c.id) ? openCut.delete(c.id) : openCut.add(c.id);
        break;
      case 'reset-cut': c.custom = null; break;
      case 'reset-defaults':
        state.defaults = { ...SIAT };
        save(); renderDefaults(); render();
        return;
      case 'export': exportData(); return;
      case 'import': $file.click(); return;
      default: return;
    }
    save();
    render();
  });

  // Enter in an assignment row moves down a row, adding one at the end.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (t.dataset.scope !== 'item') return;
    e.preventDefault();
    const c = findCourse(t), it = findItem(c, t);
    const i = c.items.indexOf(it), f = t.dataset.f;
    let next = c.items[i + 1];
    if (!next) {
      if (!it.name && !it.weight && !it.grade) return;
      next = newItem();
      c.items.push(next);
      save(); render();
      $app.querySelector(`[data-iid="${next.id}"] [data-f="name"]`)?.focus();
      return;
    }
    $app.querySelector(`[data-iid="${next.id}"] [data-f="${f}"]`)?.focus();
  });

  document.addEventListener('submit', (e) => {
    if (e.target.dataset.form !== 'new-sem') return;
    e.preventDefault();
    newSemester(new FormData(e.target).get('name').trim());
    const s = active();
    s.courses.push(newCourse());
    save(); render();
    $app.querySelector('.c-code')?.focus();
  });

  /* ---------- backup ---------- */

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sfu-grades-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $file.addEventListener('change', async () => {
    const f = $file.files[0];
    $file.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.semesters)) throw new Error('bad file');
      if (state.semesters.length && !confirm('Replace everything here with the backup?')) return;
      state = normalize(data);
      openCut.clear();
      save(); renderDefaults(); render();
      toast('Backup imported');
    } catch (err) {
      toast('That file isn’t a backup from this app.');
    }
  });

  // Keep other open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = load();
    renderDefaults();
    render();
  });

  renderDefaults();
  render();
})();
