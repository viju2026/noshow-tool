/* No-Show Call List prototype. Plain JS, no build step. Data comes from data.js.
   Rules follow no-show PRD.md (Key Flows, Key Logic). All data is fake. */

const STORE_KEY = 'noshow.v1';
const DEFAULT_DEMO = '2026-11-18';
const STAFF = ['Staff A', 'Staff B'];
const OUTCOMES = ['Confirmed', 'Voicemail', 'No answer', 'Rescheduled', 'Cancelled', 'Wrong number'];
const REACHED = ['Confirmed', 'Rescheduled', 'Cancelled'];
const TERMINAL = ['Confirmed', 'Rescheduled', 'Cancelled', 'Wrong number'];
const MAX_CALLS = 2;
const LAUNCH_BAR = 0.6;

let appts = [];
let state = null;
const ui = { view: 'front', sort: 'default', filter: 'all', mgr: { day: 'all', type: 'all', reason: 'all', status: 'all', q: '' } };

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = n => Number.isFinite(n) ? Math.round(n * 100) + '%' : '–';
const dt = d => new Date(d + 'T12:00:00');
const dayLabel = d => dt(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
function addDays(d, n) {
  const x = dt(d); x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------- data ---------- */
async function loadData() {
  appts = generateAppointments(); // built in the browser (data.js), so no data file is needed
}
const dates = () => [...new Set(appts.map(a => a.date))].sort();

/* ---------- state + seeded demo history ---------- */
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
function load() {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.v === 1) return s; } catch (e) { /* ignore */ }
  return null;
}
function seed() {
  const rnd = mulberry32(2026);
  const s = { v: 1, demo: DEFAULT_DEMO, as: STAFF[0], calls: {}, claims: {}, skipped: {} };
  const pick = (w) => { let x = rnd(), t = 0; for (const [k, p] of w) { t += p; if (x < t) return k; } return w[w.length - 1][0]; };
  const first = [['Confirmed', .42], ['Voicemail', .26], ['No answer', .14], ['Rescheduled', .08], ['Cancelled', .06], ['Wrong number', .04]];
  const calledShare = { '2026-11-16': .88, '2026-11-17': .84, '2026-11-18': .3 };
  for (const a of appts) {
    if (!a.onCall || !(a.date in calledShare) || rnd() > calledShare[a.date]) continue;
    const staff = rnd() < .52 ? STAFF[0] : STAFF[1];
    const dayBefore = a.date !== '2026-11-16' && a.date !== '2026-11-18' && rnd() < .5;
    const d1 = dayBefore ? addDays(a.date, -1) : a.date;
    const calls = [{ o: pick(first), staff, day: d1, ts: `${d1}T${dayBefore ? '15' : '08'}:${10 + Math.floor(rnd() * 40)}` }];
    if (['Voicemail', 'No answer'].includes(calls[0].o) && rnd() < .6) {
      const o2 = pick([['Confirmed', .45], ['Voicemail', .25], ['No answer', .15], ['Rescheduled', .08], ['Cancelled', .07]]);
      calls.push({ o: o2, staff: rnd() < .5 ? staff : STAFF[rnd() < .5 ? 0 : 1], day: a.date, ts: `${a.date}T09:${10 + Math.floor(rnd() * 40)}` });
    }
    s.calls[a.id] = calls; s.claims[a.id] = staff;
  }
  return s;
}

/* ---------- derived call info ---------- */
const callsOf = a => (state.calls[a.id] || []).filter(c => c.day <= state.demo);
function statusOf(a) {
  const cs = callsOf(a), last = cs[cs.length - 1];
  if (!last) return { key: 'todo', label: 'To call', done: false, calls: cs, last };
  if (TERMINAL.includes(last.o)) return { key: 'done', label: last.o, done: true, calls: cs, last };
  if (cs.length >= MAX_CALLS) return { key: 'maxed', label: 'Max calls reached', done: true, calls: cs, last };
  return { key: 'pending', label: last.o, done: false, calls: cs, last };
}
const listFor = day => appts.filter(a => a.date === day && a.tier === 'High' && !a.replied);

/* ---------- front desk ---------- */
function sortItems(items) {
  const by = {
    default: (x, y) => 0, time: (x, y) => x.time.localeCompare(y.time),
    score: (x, y) => y.score - x.score,
    status: (x, y) => statusOf(x).calls.length - statusOf(y).calls.length,
  }[ui.sort];
  const copy = [...items];
  const isToday = copy.length && copy[0].date === state.demo;
  copy.sort((x, y) => {
    const sk = (!!state.skipped[x.id]) - (!!state.skipped[y.id]);
    if (sk) return sk;
    if (ui.sort === 'default') return isToday ? x.time.localeCompare(y.time) : y.score - x.score;
    return by(x, y) || x.time.localeCompare(y.time);
  });
  return copy;
}
function passesFilter(a) {
  if (ui.filter === 'all') return true;
  const c = state.claims[a.id];
  return ui.filter === 'mine' ? c === state.as : !c;
}
function chips(a) {
  return `<div class="chips">${a.reasons.split('; ').map(r =>
    `<span class="chip${/attended last|in progress/.test(r) ? ' neg' : ''}">${esc(r)}</span>`).join('')}</div>`;
}
const dots = n => Array.from({ length: MAX_CALLS }, (_, i) => `<i class="dot${i < n ? ' on' : ''}"></i>`).join('');
function statusLine(a, st) {
  const tags = [];
  const last = st.last;
  if (last) {
    const when = last.day === addDays(state.demo, -1) ? 'yesterday' : last.day === state.demo ? 'today' : dayLabel(last.day);
    if (['Voicemail', 'No answer'].includes(last.o)) {
      tags.push(`<span class="tag">${last.o === 'Voicemail' ? 'Voicemail left' : 'No answer'} ${when}</span>`);
      if (last.o === 'Voicemail') tags.push('<span class="tag">Text sent: “We left you a message, reply C to confirm”</span>');
    } else if (last.o === 'Wrong number') {
      tags.push('<span class="tag">Wrong number: fix the phone number on file. Text only</span>');
    } else {
      tags.push(`<span class="tag ok">${last.o}</span>`);
      if (last.o === 'Cancelled' || last.o === 'Rescheduled') tags.push('<span class="tag">Slot opened: pass to backfill</span>');
    }
    tags.push(`<span class="attempts">${dots(st.calls.length)} ${st.calls.length}/${MAX_CALLS} calls · last by ${esc(last.staff)}</span>`);
  } else tags.push(`<span class="attempts">${dots(0)} 0/${MAX_CALLS} calls</span>`);
  if (st.key === 'maxed') tags.push('<span class="tag">No more calls. Text follow-up only</span>');
  const cl = state.claims[a.id];
  if (cl) tags.push(`<span>Claimed by ${esc(cl)}</span>`);
  if (state.skipped[a.id]) tags.push('<span class="tag">Skipped for now</span>');
  return `<div class="status full">${tags.join('')}</div>`;
}
const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2);
function rowHTML(a, st) {
  const btn = (o, label, cls = '') => `<button class="btn ${cls}" data-act="log" data-o="${o}" data-id="${a.id}">${label}</button>`;
  const actions = st.done
    ? `<button class="btn" data-act="undo" data-id="${a.id}">Undo last call</button>`
    : btn('Confirmed', '✓ Confirmed', 'primary') + btn('Voicemail', 'Left voicemail') + btn('No answer', 'No answer')
      + `<details class="more"><summary class="btn">More ▾</summary><div class="menu">
          ${['Rescheduled', 'Cancelled', 'Wrong number'].map(o => btn(o, o, 'item')).join('')}
          <hr>
          <button class="btn item" data-act="claim" data-id="${a.id}">${state.claims[a.id] === state.as ? 'Release' : 'Claim this patient'}</button>
          <button class="btn item" data-act="skip" data-id="${a.id}">${state.skipped[a.id] ? 'Unskip' : 'Skip for now'}</button></div></details>`;
  const sev = a.score >= 70 ? 'sev2' : 'sev1';
  return `<article class="row ${sev}${state.skipped[a.id] ? ' skipped' : ''}">
    <div class="row-main">
      <div class="when"><b>${fmtTime(a.time).replace(/ [AP]M/, '')}</b><small>${fmtTime(a.time).slice(-2)}</small></div>
      <div class="avatar" aria-hidden="true">${esc(initials(a.name))}</div>
      <div class="who">
        <div class="name">${esc(a.name)} <span class="pid">${esc(a.pid)}</span></div>
        <div class="meta"><a class="tel" href="tel:${esc(a.phone)}">${esc(a.phone)}</a> · ${esc(a.type)} · ${esc(a.patientType)} patient</div>
      </div>
      <div class="scorebox"><div class="num">${a.score}</div><div class="lbl">${a.tier} risk</div></div>
    </div>
    ${chips(a)}
    ${statusLine(a, st)}
    <div class="actions">${actions}</div>
  </article>`;
}
function renderFront() {
  const today = state.demo, tmr = addDays(today, 1);
  const groups = [['Today', today], ['Tomorrow', tmr]].map(([label, d]) => {
    const all = listFor(d).map(a => ({ a, st: statusOf(a) }));
    return { label, d, all, open: all.filter(x => !x.st.done), done: all.filter(x => x.st.done) };
  });
  const cards = groups.map(g => `<div class="card day-card"><div class="label">${g.label} · ${dayLabel(g.d)}</div>
    <div class="value">${g.open.length}<small> to call</small></div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${g.all.length}" aria-valuenow="${g.done.length}"><span style="width:${g.all.length ? (g.done.length / g.all.length) * 100 : 0}%"></span></div>
    <div class="sub">${g.done.length} of ${g.all.length} high-risk patients done</div></div>`).join('');
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) =>
    `<button data-${key}="${v}" aria-pressed="${ui[key] === v}">${l}</button>`).join('')}</div>`;
  const body = groups.map(g => {
    const open = sortItems(g.open.map(x => x.a)).filter(passesFilter);
    return `<div class="group-title"><h2>${g.label}</h2><span>${dayLabel(g.d)} · ${open.length} shown of ${g.open.length} to call</span></div>
      ${g.all.length === 0 ? '<div class="empty">No high-risk appointments on this day.</div>'
        : open.length ? open.map(a => rowHTML(a, statusOf(a))).join('') : '<div class="empty">Nothing left to call here. Nice work.</div>'}`;
  }).join('');
  const done = groups.flatMap(g => g.done);
  $('#view-front').innerHTML = `
    <div class="cards">${cards}</div>
    <div class="toolbar">
      <label>Sort ${seg('sort', [['default', 'Default'], ['time', 'Appt time'], ['score', 'Risk score'], ['status', 'Call status']])}</label>
      <label>Show ${seg('filter', [['all', 'Everyone'], ['mine', 'Mine'], ['open', 'Unclaimed']])}</label>
    </div>
    ${body}
    <details class="done"><summary>Done (${done.length})</summary>
      ${done.length ? done.map(x => rowHTML(x.a, x.st)).join('') : '<div class="empty">Finished calls will appear here.</div>'}
    </details>`;
}

/* ---------- manager ---------- */
function reasonKeys(a) {
  return a.reasons.split('; ').filter(r => r !== 'no risk signals').map(r => {
    if (/^booked \d+ days ahead/.test(r)) return +r.match(/\d+/)[0] > 30 ? 'booked 30+ days ahead' : 'booked 15–30 days ahead';
    if (/late cancel/.test(r)) return 'late cancel';
    return r;
  });
}
function bars(rows, max, alt) {
  return `<div class="bars">${rows.map(r => `<div class="bar"><span>${esc(r.label)}</span>
    <div class="track"><div class="fill" style="width:${(r.v / max) * 100}%"></div>${r.v2 ? `<div class="fill alt" style="width:${(r.v2 / max) * 100}%"></div>` : ''}</div>
    <span class="num">${r.v + (r.v2 || 0)}</span></div>`).join('')}</div>`;
}
function patientStatus(a) {
  if (a.replied) return { key: 'replied', label: 'Confirmed by text' };
  const st = statusOf(a);
  if (st.key === 'todo') return { key: 'todo', label: a.date < state.demo ? 'Not called' : 'To call' };
  return { key: st.key, label: `${st.label} (${st.calls.length}/${MAX_CALLS})` };
}
function renderManager() {
  const demo = state.demo, tmr = addDays(demo, 1);
  const high = appts.filter(a => a.tier === 'High');
  const onList = appts.filter(a => a.onCall);
  const allCalls = appts.flatMap(a => callsOf(a).map(c => ({ ...c, a })));
  const reached = allCalls.filter(c => REACHED.includes(c.o)).length;
  const confirmed = allCalls.filter(c => c.o === 'Confirmed').length;
  const cards = [
    ['High-risk patients this week', high.length, `${onList.length} on the call list (didn't reply to the text)`],
    ['Calls made so far', allCalls.length, `${pct(allCalls.length ? reached / allCalls.length : NaN)} reached a person`],
    ['Confirmed on a call', confirmed, `${pct(allCalls.length ? confirmed / allCalls.length : NaN)} of calls`],
  ].map(([l, v, s]) => `<div class="card"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('');

  // scoring check on finished days
  const past = appts.filter(a => a.date < demo);
  const ns = past.filter(a => a.result === 'No-show');
  const rate = (xs) => xs.length ? xs.filter(a => a.result === 'No-show').length / xs.length : NaN;
  const coverage = ns.length ? ns.filter(a => a.onCall).length / ns.length : NaN;
  const check = past.length ? `
    <div class="panel"><h2>Does the scoring work? (finished days: ${dayLabel(dates()[0])} to ${dayLabel(addDays(demo, -1))})</h2>
      <div class="cards" style="margin:0">
        <div class="card"><div class="label">No-show rate</div><div class="value">${pct(rate(past))}</div><div class="sub">${ns.length} of ${past.length} appointments · starting rate 15%</div></div>
        <div class="card"><div class="label">High-risk no-show rate</div><div class="value">${pct(rate(past.filter(a => a.tier === 'High')))}</div><div class="sub">Low risk: ${pct(rate(past.filter(a => a.tier === 'Low')))}</div></div>
        <div class="card ${coverage >= LAUNCH_BAR ? 'good' : ''}"><div class="label">No-shows that were on the call list</div><div class="value">${pct(coverage)}</div>
          <div class="sub">Launch bar ${pct(LAUNCH_BAR)}: <span class="${coverage >= LAUNCH_BAR ? 'pass' : 'fail'}">${coverage >= LAUNCH_BAR ? 'met' : 'not met'}</span></div></div>
      </div>
      <p class="note">Results are simulated. Outcomes show only for days before the demo date.</p></div>` : '';

  // charts
  const days = dates();
  const byDay = bars(days.map(d => {
    const hs = high.filter(a => a.date === d);
    const called = hs.filter(a => a.onCall && callsOf(a).length).length;
    return { label: dayLabel(d), v: called, v2: hs.length - called };
  }), Math.max(...days.map(d => high.filter(a => a.date === d).length)));
  const rc = {};
  high.forEach(a => reasonKeys(a).filter(r => !/attended last|in progress/.test(r)).forEach(r => rc[r] = (rc[r] || 0) + 1));
  const top = Object.entries(rc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, v]) => ({ label, v }));
  const reasonBars = bars(top, top[0] ? top[0].v : 1);

  // staff performance
  const staffRows = STAFF.map(s => {
    const cs = allCalls.filter(c => c.staff === s);
    const touched = new Set(cs.map(c => c.a.id));
    Object.entries(state.claims).forEach(([id, who]) => { if (who === s) touched.add(id); });
    const claimedUncalled = [...touched].filter(id => { const a = appts.find(x => x.id === id); return a && a.date <= tmr && !callsOf(a).length; }).length;
    const r = cs.filter(c => REACHED.includes(c.o)).length;
    return `<tr><td>${s}</td><td class="num">${touched.size}</td><td class="num">${cs.length}</td>
      <td class="num">${pct(cs.length ? r / cs.length : NaN)}</td><td class="num">${cs.filter(c => c.o === 'Confirmed').length}</td>
      <td class="num">${cs.filter(c => ['Voicemail', 'No answer'].includes(c.o)).length}</td><td class="num">${claimedUncalled}</td></tr>`;
  }).join('');
  const neverCalled = onList.filter(a => a.date <= tmr && !callsOf(a).length && !state.claims[a.id]);
  const pastNever = neverCalled.filter(a => a.date < demo).length;

  // patient table
  const f = ui.mgr;
  const types = [...new Set(high.map(a => a.type))].sort();
  const allReasons = [...new Set(high.flatMap(reasonKeys))].sort();
  const rows = high.filter(a => (f.day === 'all' || a.date === f.day) && (f.type === 'all' || a.type === f.type)
    && (f.reason === 'all' || reasonKeys(a).includes(f.reason))
    && (f.status === 'all' || patientStatus(a).key === f.status || (f.status === 'reached' && REACHED.includes((statusOf(a).last || {}).o)))
    && (!f.q || a.name.toLowerCase().includes(f.q.toLowerCase()) || a.pid.toLowerCase().includes(f.q.toLowerCase())))
    .sort((x, y) => x.date.localeCompare(y.date) || y.score - x.score);
  const opt = (arr, cur, fmt = x => x) => arr.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(fmt(v))}</option>`).join('');
  const tbl = rows.map(a => {
    const ps = patientStatus(a), shown = a.date < demo && a.result;
    return `<tr><td>${dayLabel(a.date)}<br><span class="meta">${fmtTime(a.time)}</span></td><td>${esc(a.name)}<br><span class="meta">${esc(a.pid)} · ${esc(a.patientType)}</span></td>
      <td>${esc(a.type)}</td><td><span class="badge High">${a.score}</span></td><td>${chips(a)}</td>
      <td>${esc(ps.label)}${shown ? `<br><span class="meta">Result: ${esc(a.result)}</span>` : ''}</td></tr>`;
  }).join('');

  $('#view-manager').innerHTML = `
    <div class="cards">${cards}</div>
    ${check}
    <div class="grid2" style="margin-bottom:16px">
      <div class="panel"><h2>High-risk patients by day</h2>${byDay}
        <div class="legend"><span><i style="background:var(--accent)"></i>Called</span><span><i style="background:var(--high);opacity:.75"></i>Not called / replied</span></div></div>
      <div class="panel"><h2>Top risk reasons</h2>${reasonBars}<p class="note">Across all high-risk patients this week.</p></div>
    </div>
    <div class="panel"><h2>Front desk performance</h2>
      <div class="table-wrap"><table><thead><tr><th>Staff</th><th class="num">Patients handled</th><th class="num">Calls</th><th class="num">Reached</th><th class="num">Confirmed</th><th class="num">Voicemail / no answer</th><th class="num">Claimed, not yet called</th></tr></thead><tbody>${staffRows}</tbody></table></div>
      <p class="note">${neverCalled.length} high-risk patients on the list have no calls and no owner (${pastNever} from days already finished). These are workload and outcome numbers, not a ranking: whether a patient confirms depends a lot on the patient.</p></div>
    <div class="panel"><h2>High-risk patients and reasons (${rows.length})</h2>
      <div class="filters">
        <input type="search" id="m-q" placeholder="Search name or ID" value="${esc(f.q)}" aria-label="Search">
        <select id="m-day" aria-label="Day"><option value="all">All days</option>${opt(days, f.day, dayLabel)}</select>
        <select id="m-type" aria-label="Appointment type"><option value="all">All types</option>${opt(types, f.type)}</select>
        <select id="m-reason" aria-label="Reason"><option value="all">All reasons</option>${opt(allReasons, f.reason)}</select>
        <select id="m-status" aria-label="Status">${[['all', 'All statuses'], ['todo', 'Not called'], ['pending', 'Voicemail / no answer'], ['done', 'Call completed'], ['maxed', 'Max calls reached'], ['replied', 'Confirmed by text']].map(([v, l]) => `<option value="${v}"${v === f.status ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="table-wrap"><table><thead><tr><th>When</th><th>Patient</th><th>Type</th><th>Score</th><th>Reasons</th><th>Status</th></tr></thead>
      <tbody>${tbl || '<tr><td colspan="6" class="meta">No patients match these filters.</td></tr>'}</tbody></table></div></div>`;
}

/* ---------- wiring ---------- */
function render() {
  $('#view-front').hidden = ui.view !== 'front';
  $('#view-manager').hidden = ui.view !== 'manager';
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === ui.view));
  if (ui.view === 'front') renderFront(); else renderManager();
}
function logCall(id, o) {
  (state.calls[id] = state.calls[id] || []).push({ o, staff: state.as, day: state.demo, ts: new Date().toISOString() });
  if (!state.claims[id]) state.claims[id] = state.as;
  delete state.skipped[id];
}
function setup() {
  const dsel = $('#demo-date');
  dsel.innerHTML = dates().map(d => `<option value="${d}">${dayLabel(d)}</option>`).join('');
  dsel.value = state.demo;
  $('#working-as').innerHTML = STAFF.map(s => `<option>${s}</option>`).join('');
  $('#working-as').value = state.as;
  dsel.onchange = () => { state.demo = dsel.value; save(); render(); };
  $('#working-as').onchange = e => { state.as = e.target.value; save(); render(); };
  $('#reset-demo').onclick = () => { state = seed(); save(); dsel.value = state.demo; $('#working-as').value = state.as; render(); };
  document.querySelector('.tabs').onclick = e => { const b = e.target.closest('button'); if (b) { ui.view = b.dataset.view; render(); } };

  $('#view-front').addEventListener('click', e => {
    const sortB = e.target.closest('[data-sort]'), filtB = e.target.closest('[data-filter]');
    if (sortB) { ui.sort = sortB.dataset.sort; return render(); }
    if (filtB) { ui.filter = filtB.dataset.filter; return render(); }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id, open = document.querySelector('details.done')?.open;
    if (b.dataset.act === 'log') logCall(id, b.dataset.o);
    if (b.dataset.act === 'undo') (state.calls[id] || []).pop();
    if (b.dataset.act === 'claim') state.claims[id] === state.as ? delete state.claims[id] : state.claims[id] = state.as;
    if (b.dataset.act === 'skip') state.skipped[id] ? delete state.skipped[id] : state.skipped[id] = true;
    save(); render();
    if (open) document.querySelector('details.done').open = true;
  });
  const mgr = $('#view-manager');
  mgr.addEventListener('change', e => {
    const m = { 'm-day': 'day', 'm-type': 'type', 'm-reason': 'reason', 'm-status': 'status' }[e.target.id];
    if (m) { ui.mgr[m] = e.target.value; renderManager(); }
  });
  mgr.addEventListener('input', e => {
    if (e.target.id === 'm-q') { ui.mgr.q = e.target.value; const pos = e.target.selectionStart; renderManager(); const q = $('#m-q'); q.focus(); q.setSelectionRange(pos, pos); }
  });
}

(async function init() {
  try {
    await loadData();
    state = load() || seed();
    save();
    setup();
    render();
  } catch (err) {
    $('#view-front').innerHTML = `<div class="empty">Could not start: ${esc(err.message)}. Try reloading the page.</div>`;
  }
})();
