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
