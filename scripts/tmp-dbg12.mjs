import puppeteer from 'puppeteer';
const BASE = 'http://127.0.0.1:8123';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('CONSOLE:', m.type(), m.text().slice(0, 200)));
await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle2' });
const out = await page.evaluate(async () => {
  const res = {};
  const head = await fetch('/music/nodey-no-title.wav', { method: 'HEAD' });
  res.head = { status: head.status, type: head.headers.get('content-type') };
  const a = new Audio('/music/nodey-no-title.wav');
  try { await a.play(); res.play = 'ok'; a.pause(); } catch (e) { res.play = 'ERR: ' + e.name + ' ' + e.message; }
  return res;
});
console.log(JSON.stringify(out));
await browser.close();
