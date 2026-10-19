import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { allModels } from '../worker/catalog.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const models = vm.runInNewContext(read('assets/data.js').split('const $ =')[0] + '; MODELS');

test('sitemap entries are indexable canonical static assets', () => {
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  const urls = [...sitemap.matchAll(/<loc>https:\/\/easytoken\.si\/(.*?)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(urls, ['', 'models.html', 'docs.html', 'privacy.html', 'terms.html']);
  for (const url of urls) {
    const html = read(url || 'index.html');
    assert.ok(html.includes(`<link rel="canonical" href="https://easytoken.si/${url}">`));
    assert.doesNotMatch(html, /<meta name="robots" content="noindex/);
    assert.match(html, /<nav aria-label="Main"><a href="models.html">/);
  }
  assert.match(read('robots.txt'), /Sitemap: https:\/\/easytoken\.si\/sitemap.xml/);
  for (const page of ['login', 'signup', 'dashboard', 'playground', 'status'])
    assert.match(read(`${page}.html`), /<meta name="robots" content="noindex,follow">/);
});

test('HTML pricing and docs model IDs match the source catalog without JS', () => {
  const home = read('index.html');
  const catalog = read('models.html');
  const fallback = catalog.split('<!-- prerender:cards:start -->')[1].split('<!-- prerender:cards:end -->')[0];
  const docs = read('docs.html');
  assert.equal((fallback.match(/<article class="mcard" id="/g) || []).length, allModels().length);
  for (const m of models) {
    assert.ok(catalog.includes(`<article class="mcard" id="${m.id}">`), m.id);
    assert.ok(home.includes(`href="models.html#${m.id}"`), m.id);
    assert.ok(docs.includes(`<a href="models.html#${m.id}"><code>${m.id}</code></a>`), m.id);
    const card = fallback.split(`<article class="mcard" id="${m.id}">`)[1]?.split('</article>')[0];
    assert.ok(card, m.id);
    const price = '$' + (Number.isInteger(m.ours * 100) ? m.ours.toFixed(2) : String(+m.ours.toFixed(6)));
    assert.ok(card.includes(`<b>${price}</b>`), `${m.id} price`);
    assert.ok(card.includes(m.official == null ? 'Official / Fal price: –' : 'Official / Fal price: $'), `${m.id} comparison`);
    assert.ok(card.includes('All prices · 2026-10-10 snapshot'), `${m.id} provenance`);
  }
  assert.match(catalog, /2026-10-10 snapshot/);
  assert.match(home, /snapshot 2026-10-10/);
  assert.equal((docs.match(/<h1>/g) || []).length, 1);
});

test('robot groups allow search and AI crawlers to read public pages while excluding API routes', () => {
  const robots = read('robots.txt');
  const groups = robots.split(/\n\s*\n/).filter(g => g.includes('User-agent:'));
  const bots = ['*', 'Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'Claude-User', 'GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot'];
  for (const bot of bots) {
    const group = groups.find(g => g.split('\n').includes(`User-agent: ${bot}`));
    assert.ok(group, bot);
    assert.match(group, /^Allow: \/$/m);
    assert.match(group, /^Disallow: \/api\/$/m);
    assert.match(group, /^Disallow: \/v1\/$/m);
    assert.doesNotMatch(group, /Disallow: \/(?:models|docs|privacy|terms|login)\.html/);
  }
});

test('public raw HTML exposes legal identity and parseable Organization schema', () => {
  const home = read('index.html');
  const schema = JSON.parse(home.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1]);
  assert.deepEqual(schema, {
    '@context': 'https://schema.org', '@type': 'Organization', name: 'EasyToken',
    legalName: 'AI AGENT AUTOMATION LLC', email: 'hello@easytoken.si', url: 'https://easytoken.si/'
  });
  for (const file of ['index.html', 'models.html', 'docs.html', 'privacy.html', 'terms.html']) {
    const html = read(file);
    assert.match(html, /<footer class="legal-footer wrap">/);
    assert.match(html, /AI AGENT AUTOMATION LLC · 30 N Gould St Ste R, Sheridan, WY 82801, USA/);
    assert.match(html, /mailto:hello@easytoken\.si/);
  }
  for (const file of ['privacy.html', 'terms.html']) {
    assert.match(read(file), /Last updated: 2026-10-19/);
    assert.doesNotMatch(read(file), /Template text|legal@easytoken|privacy@easytoken/);
  }
});
