/* Generates the fake week of appointments in the browser, so no data file is needed.
   Uses a fixed seed, so every visitor sees the same data. Scores follow the PRD's Key Logic rules.
   Relies on mulberry32() and addDays() from app.js (both are called at runtime, after all scripts load). */

function generateAppointments() {
  const rnd = mulberry32(42);
  const choice = arr => arr[Math.floor(rnd() * arr.length)];
  const wchoice = (items, weights) => {
    let x = rnd() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x < 0) return items[i]; }
    return items[items.length - 1];
  };
  const first = ['Maria', 'James', 'Aisha', 'Wei', 'Carlos', 'Priya', 'Olivia', 'Noah', 'Fatima', 'Liam', 'Sofia', 'Ethan', 'Mei', 'Omar', 'Grace', 'Lucas', 'Hannah', 'Diego', 'Zoe', 'Ravi', 'Emma', 'Mateo', 'Nina', 'Jack', 'Layla', 'Ben', 'Isabel', 'Kofi', 'Ava', 'Tom'];
  const last = ['Garcia', 'Smith', 'Khan', 'Chen', 'Lopez', 'Patel', 'Brown', 'Nguyen', 'Ali', 'Johnson', 'Rossi', 'Kim', 'Singh', 'Davis', 'Martinez', 'Wilson', 'Okafor', 'Moore', 'Cohen', 'Silva', 'Taylor', 'Reyes', 'Anderson', 'Park', 'Hughes'];
  const types = ['Cleaning / recall', 'Exam', 'Filling', 'Crown', 'Root canal follow-up', 'Emergency / pain', 'Whitening consult', 'Extraction'];
  const routine = ['Cleaning / recall', 'Exam', 'Whitening consult'];
  const inProgress = ['Crown', 'Root canal follow-up'];
  const slots = [];
  for (let h = 9; h < 17; h++) for (const m of ['00', '30']) slots.push(`${String(h).padStart(2, '0')}:${m}`);
  const days = [0, 1, 2, 3, 4].map(n => addDays('2026-11-16', n));
  const quotaFor = d => d === '2026-11-19' ? { High: 24, Medium: 9, Low: 7 } : { High: 15, Medium: 12, Low: 13 };

  function make(d, t) {
    const isNew = rnd() < 0.15;
    const type = isNew ? 'New patient exam' : choice(types);
    const lead = choice([2, 5, 7, 10, 14, 20, 28, 35, 45, 60]);
    const noshows = isNew ? 0 : wchoice([0, 1, 2], [75, 17, 8]);
    const late = isNew ? 0 : wchoice([0, 1, 2], [80, 15, 5]);
    const attended3 = !isNew && noshows === 0 && rnd() < 0.6;
    let score = 0; const reasons = [];
    if (noshows === 1) { score += 25; reasons.push('1 past no-show'); }
    else if (noshows >= 2) { score += 40; reasons.push('2+ past no-shows'); }
    if (late) { score += Math.min(10 * late, 20); reasons.push(`${late} late cancel${late > 1 ? 's' : ''}`); }
    if (isNew) { score += 20; reasons.push('new patient'); }
    if (lead > 30) { score += 15; reasons.push(`booked ${lead} days ahead`); }
    else if (lead >= 15) { score += 8; reasons.push(`booked ${lead} days ahead`); }
    if (routine.includes(type)) { score += 10; reasons.push('routine recall'); }
    const wd = new Date(d + 'T12:00:00').getDay();
    if (wd === 1 || wd === 5 || t === '09:00') { score += 5; reasons.push('Mon/Fri or first slot'); }
    if (attended3) { score -= 10; reasons.push('attended last 3'); }
    if (inProgress.includes(type)) { score -= 10; reasons.push('treatment in progress'); }
    score = Math.max(0, Math.min(100, score));
    const tier = score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low';
    return { isNew, type, lead, score, tier, reasons };
  }

  const noShowRate = { High: 0.27, Medium: 0.10, Low: 0.03 };
  const out = []; const usedIds = new Set(); let n = 0;
  for (const d of days) {
    const times = Array.from({ length: 40 }, () => choice(slots)).sort();
    const need = quotaFor(d);
    // pick the tier mix for the day, shuffle it, then draw a matching appointment for each time slot
    const tiers = Object.entries(need).flatMap(([t, c]) => Array(c).fill(t));
    for (let i = tiers.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [tiers[i], tiers[j]] = [tiers[j], tiers[i]]; }
    times.forEach((t, i) => {
      let m, tries = 0;
      do { m = make(d, t); tries++; } while (m.tier !== tiers[i] && tries < 2000);
      let pid; do { pid = 'P' + (1000 + Math.floor(rnd() * 9000)); } while (usedIds.has(pid));
      usedIds.add(pid);
      const replied = rnd() < 0.10;
      const p = replied ? 0.03 : noShowRate[m.tier];
      const x = rnd();
      n++;
      out.push({
        id: 'A' + String(n).padStart(4, '0'), date: d, time: t, pid,
        name: `${choice(first)} ${choice(last)}`, phone: `555-01${String(Math.floor(rnd() * 100)).padStart(2, '0')}`,
        booked: addDays(d, -m.lead), type: m.type, patientType: m.isNew ? 'New' : 'Existing', replied,
        score: m.score, tier: m.tier, reasons: m.reasons.length ? m.reasons.join('; ') : 'no risk signals',
        onCall: m.tier === 'High' && !replied,
        result: x < p ? 'No-show' : x < p + 0.04 ? 'Cancelled' : 'Attended',
      });
    });
  }
  return out;
}
