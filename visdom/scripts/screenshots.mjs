// Screenshots of the Visdom demo for the slides: 1600x1000, light theme.
// Logs in once as the Keycloak dev user, then visits each page of a plan and
// saves a PNG. Before every shot, e-mail addresses and anything that looks
// like a token or key are replaced in the DOM, so none reach an image.
//
//   PW_PATH=$(npm root -g)/playwright node visdom/scripts/screenshots.mjs plan.json out-dir
//
// plan.json: [{ "file": "l01-agent.png", "url": "http://orchestrator.localhost:18080/...",
//               "wait": "text or css to wait for", "click": ["text=…"], "scroll": "text=…",
//               "delay": 1500, "fullPage": false }]
import { createRequire } from 'module';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const [planFile, outDir] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planFile, 'utf8'));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'light', deviceScaleFactor: 1 });
// The orchestrator UI keeps the selected project in localStorage; pick Hobby Wizard.
if (process.env.VP_PROJECT_ID) {
  await ctx.addInitScript((id) => {
    if (location.hostname.startsWith('orchestrator.')) {
      try { localStorage.setItem('vp.projectSel.global', id); } catch {}
    }
  }, process.env.VP_PROJECT_ID);
}
const page = await ctx.newPage();

async function login(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('text=/Sign in with Visdom|Sign in|Log in/i').first();
    if (await page.locator('#username').count()) break;
    if (await btn.count()) { await btn.click().catch(() => {}); }
    await page.waitForTimeout(1500);
  }
  if (await page.locator('#username').count()) {
    await page.fill('#username', 'dev');
    await page.fill('#password', 'devlocal');
    await page.click('#kc-login');
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
}

async function scrub() {
  await page.evaluate(() => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const secret = /\b(sk-[A-Za-z0-9_-]{8,}|tvk_[A-Za-z0-9_-]{6,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[a-f0-9]{40})\b/g;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue;
      if (email.test(t) || secret.test(t)) n.nodeValue = t.replace(email, 'dev').replace(secret, '••••');
      email.lastIndex = 0; secret.lastIndex = 0;
    }
    for (const el of document.querySelectorAll('input, textarea')) {
      if (email.test(el.value) || secret.test(el.value)) el.value = el.value.replace(email, 'dev').replace(secret, '••••');
      email.lastIndex = 0; secret.lastIndex = 0;
    }
  });
}

const loggedIn = new Set();
for (const s of plan) {
  const origin = new URL(s.url).origin;
  if (!loggedIn.has(origin) && !s.public) { await login(s.url); loggedIn.add(origin); }
  await page.goto(s.url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  if (s.wait) await page.locator(s.wait).first().waitFor({ timeout: 20000 }).catch(() => console.log(`  wait timed out: ${s.wait}`));
  for (const c of s.click || []) {
    await page.locator(c).first().click({ timeout: 10000 }).catch(() => console.log(`  click failed: ${c}`));
    await page.waitForTimeout(800);
  }
  if (s.scroll) {
    await page.locator(s.scroll).first().evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {});
    await page.mouse.wheel(0, s.scrollBy ?? -60);
  }
  await page.waitForTimeout(s.delay ?? 1500);
  await scrub();
  await page.screenshot({ path: join(outDir, s.file), fullPage: !!s.fullPage });
  console.log(`saved ${s.file}`);
}
await browser.close();
