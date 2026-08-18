import { chromium } from 'playwright-core';
const tema = process.argv[2] || 'dark';
const salida = process.argv[3] || `/tmp/${tema}.png`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1500, height: 2400 }, deviceScaleFactor: 2 });
await p.goto(`http://localhost:3000/vista-previa?tema=${tema}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2600);
await p.screenshot({ path: salida, fullPage: true });
await b.close();
