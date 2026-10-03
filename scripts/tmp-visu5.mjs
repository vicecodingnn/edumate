/** Vérification v2.5 (temporaire) : leçons 80 %, historique, temps, cases notions, bouton décollé. */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8123';
fs.mkdirSync('/tmp/shots5', { recursive: true });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message.slice(0, 160)}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text().slice(0, 160)); });

const email = `v25-${Date.now()}@edumate.local`;
await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle2' });
await page.evaluate(async (email) => {
  await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse-solide-123', firstName: 'Camille', level: 'seconde' }) });
}, email);

// sujet de maths pour la leçon + thème
const topicInfo = await page.evaluate(async () => {
  const csrf = decodeURIComponent(document.cookie.match(/edumate_csrf=([^;]+)/)?.[1] ?? '');
  const search = await fetch('/api/search?subject=mathematiques&limit=3', { headers: { 'X-CSRF-Token': csrf } }).then((r) => r.json());
  return { topicId: search.items[0].id, themeId: search.items[0].themeId };
});

// ---- 1) Leçon jouée MAUVAISE (< 80 %) ----
let lessonSteps = [];
page.on('response', async (r) => {
  const url = r.url();
  if (lessonSteps.length) return;
  if (!url.includes(`/api/lessons/${topicInfo.topicId}`)) return;
  if (url.includes('/complete') || url.includes('/fiches') || url.includes('/enrich') || url.includes('/revision')) return;
  try { lessonSteps = (await r.json())?.lesson?.steps ?? []; } catch { /* ignore */ }
});
await page.goto(`${BASE}/lecons/${encodeURIComponent(topicInfo.topicId)}`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1500));
if (!lessonSteps.length) {
  lessonSteps = await page.evaluate(async (id) => (await (await fetch(`/api/lessons/${encodeURIComponent(id)}`)).json())?.lesson?.steps ?? [], topicInfo.topicId);
}
const goodAnswers = lessonSteps.filter((s) => s.kind === 'exercice').map((s) => s.question?.answer ?? 0);

async function playLesson(well) {
  let cursor = 0;
  for (let i = 0; i < 20; i++) {
    const done = await page.evaluate(() => /Mission accomplie|Bien joué|Beau travail/.test(document.body.innerText));
    if (done) break;
    const clicked = await page.evaluate((good) => {
      const options = [...document.querySelectorAll('.lp-option')].filter((o) => !o.className.includes('is-'));
      if (options.length) {
        const pick = good >= 0 ? Math.min(good, options.length - 1) : Math.min((good + 1) % options.length, options.length - 1);
        options[pick]?.click();
        return true;
      }
      return false;
    }, well ? (goodAnswers[cursor] ?? 0) : -1);
    if (clicked) cursor += 1;
    else await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 600));
  }
  await new Promise((r) => setTimeout(r, 1500));
}

// première partie : réponses FAUSSES (index décalé)
let cursor = 0;
for (let i = 0; i < 20; i++) {
  const done = await page.evaluate(() => /Mission accomplie|Bien joué|Beau travail/.test(document.body.innerText));
  if (done) break;
  const clicked = await page.evaluate((good) => {
    const options = [...document.querySelectorAll('.lp-option')].filter((o) => !o.className.includes('is-'));
    if (options.length) { options[(good + 1) % options.length]?.click(); return true; }
    return false;
  }, goodAnswers[cursor] ?? 0);
  if (clicked) cursor += 1;
  else await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 600));
}
await new Promise((r) => setTimeout(r, 1800));
const lowBanner = await page.evaluate(() => ({
  notValidated: document.body.innerText.includes('pas encore validée'),
  replay: [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Rejouer la leçon')),
  noFiche: !document.body.innerText.includes('Fiche de révision créée'),
}));
console.log('leçon < 80 % → bannière non validée + rejouer + pas de fiche :', JSON.stringify(lowBanner));
await page.screenshot({ path: '/tmp/shots5/lesson-low.png' });

// ---- 2) Rejouer et réussir (>= 80 %) ----
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Rejouer la leçon'))?.click(); });
await new Promise((r) => setTimeout(r, 900));
await playLesson(true);
const okBanner = await page.evaluate(() => ({
  created: document.body.innerText.includes('Fiche de révision créée') || document.body.innerText.includes('Fiche de révision mise à jour'),
  link: [...document.querySelectorAll('a')].some((a) => a.textContent?.includes('Voir ma fiche')),
}));
console.log('leçon ≥ 80 % → fiche créée + lien :', JSON.stringify(okBanner));
await page.screenshot({ path: '/tmp/shots5/lesson-ok.png' });

// ---- 3) Progression : leçons terminées + temps ----
await page.goto(`${BASE}/progression`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1800));
console.log('progression : carte leçons terminées :', await page.evaluate(() => document.body.innerText.includes('Leçons terminées')));
await page.screenshot({ path: '/tmp/shots5/progress-lessons.png' });

// ---- 4) Dashboard : minutes leçons comptées ----
await page.goto(`${BASE}/tableau-de-bord`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2000));
const dash = await page.evaluate(() => {
  const m = document.body.innerText.match(/(\d+) min travaillées aujourd’hui \(quiz \+ leçons\)/);
  return m ? Number(m[1]) : -1;
});
console.log('dashboard minutes (quiz+leçons) :', dash);

// ---- 5) Planning : cases notions ----
const datePlus4 = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
await page.goto(`${BASE}/planning?new=1`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1400));
const setNativeSrc = `(el, value, proto) => {
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}`;
await page.evaluate((setNativeSrc) => {
  const setNative = eval(setNativeSrc);
  const modal = document.querySelector('.modal');
  setNative([...modal.querySelectorAll('select')][0], 'mathematiques', window.HTMLSelectElement.prototype);
}, setNativeSrc);
await new Promise((r) => setTimeout(r, 900));
await page.evaluate((setNativeSrc, date, themeId) => {
  const setNative = eval(setNativeSrc);
  const modal = document.querySelector('.modal');
  const title = [...modal.querySelectorAll('input')].find((i) => !['date', 'time', 'number'].includes(i.type));
  setNative(title, 'Contrôle cohérence', window.HTMLInputElement.prototype);
  setNative([...modal.querySelectorAll('input[type="date"]')][0], date, window.HTMLInputElement.prototype);
  const selects = [...modal.querySelectorAll('select')];
  if (selects[1]) setNative(selects[1], themeId, window.HTMLSelectElement.prototype);
}, setNativeSrc, datePlus4, topicInfo.themeId);
await new Promise((r) => setTimeout(r, 900));
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Enregistrer le contrôle'))?.click(); });
await new Promise((r) => setTimeout(r, 1200));
// mesure du décollage du bouton Générer
const gap = await page.evaluate(() => {
  const p = [...document.querySelectorAll('.exam-created p')][0];
  const btn = [...document.querySelectorAll('.exam-created button')][0];
  if (!p || !btn) return -1;
  return Math.round(btn.getBoundingClientRect().top - p.getBoundingClientRect().bottom);
});
console.log('écart texte → bouton Générer (px) :', gap);
await page.screenshot({ path: '/tmp/shots5/modal-generate.png' });
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Générer mon planning'))?.click(); });
await new Promise((r) => setTimeout(r, 2200));
const checks = await page.evaluate(() => ({
  cards: document.querySelectorAll('.plan-notion-card').length,
  checksOn: document.querySelectorAll('.plan-check--on').length,
  howto: document.body.innerText.includes('notion validée'),
}));
console.log('cartes notions + cases + encart :', JSON.stringify(checks));
await page.screenshot({ path: '/tmp/shots5/plan-notions-v25.png', fullPage: true });

console.log('ERREURS :', errors.length ? errors.slice(0, 6) : 'aucune');
await browser.close();
