import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { allModels } from '../worker/catalog.js';

const source = readFileSync(new URL('../assets/data.js', import.meta.url), 'utf8').split('const $ =')[0];
const models = vm.runInNewContext(source + '; MODELS');
const options = m => Object.fromEntries(Object.entries(m.input).filter(([k]) => !['prompt', 'text', 'image_urls'].includes(k)));
const tiers = new Map(allModels().map(m => [m.id, m.pricing]));
const snapshot = JSON.parse(readFileSync(new URL('kie-snapshot.json', import.meta.url), 'utf8'));
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const usd = n => { const s = Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 ? n.toFixed(2) : String(+n.toFixed(6)); return '$' + (!s.includes('.') ? s + '.00' : /\.\d$/.test(s) ? s + '0' : s); };
const off = m => m.official == null ? '–' : usd(m.official);
const saving = m => m.official && m.ours < m.official ? Math.round((1 - m.ours / m.official) * 100) : null;
const pill = m => saving(m) ? `<span class="pill">−${saving(m)}%</span>` : '';
const mark = (file, id, content) => {
  const html = readFileSync(file, 'utf8');
  const start = `<!-- prerender:${id}:start -->`;
  const end = `<!-- prerender:${id}:end -->`;
  if (!html.includes(start) || !html.includes(end)) throw Error(`Missing ${id} markers in ${file}`);
  writeFileSync(file, html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${content}\n${end}`));
};
const date = esc(snapshot.date);
mark('index.html', 'rows', models.map(m => `<tr><td><a class="model" href="/models#${esc(m.id)}">${esc(m.name)}</a><span class="cat">${esc(m.cat)}</span><span class="mono">${esc(m.id)}</span></td><td>${esc(m.unit)} · ${esc(JSON.stringify(options(m)))}</td><td class="r${saving(m) ? ' official' : ''}">${off(m)}</td><td class="r ours">${usd(m.ours)}</td><td class="r">${pill(m)}</td></tr>`).join('\n'));
mark('models.html', 'cards', models.map(m => `<article class="mcard" id="${esc(m.id)}"><header><div><h3>${esc(m.name)}</h3><div class="prov">${esc(m.provider)}</div></div><span class="badge">${esc(m.cat)}</span></header><p>${esc(m.blurb)}</p><div class="price"><b>${usd(m.ours)}</b><span class="muted">Official / Fal price: ${off(m)}</span>${pill(m)}</div><div class="meta"><span>per ${esc(m.unit)}</span><span class="mono">${esc(m.id)}</span></div><p class="small">Example options: <code>${esc(JSON.stringify(Object.fromEntries(Object.entries(m.input).filter(([k]) => !['prompt', 'text', 'image_urls'].includes(k)))))}</code></p><details class="small"><summary>All prices · ${date} snapshot</summary><table class="small">${tiers.get(m.id).map(p => `<tr><td>${esc(p.option)}</td><td class="r">${usd(p.usd)} / ${esc(p.per)}</td></tr>`).join('')}</table></details><div class="actions"><a class="btn btn-primary" href="/playground?model=${esc(m.id)}">Try it</a><a class="btn btn-ghost" href="/docs#tasks">API reference</a></div></article>`).join('\n'));
mark('docs.html', 'models', models.map(m => `<tr><td><a href="/models#${esc(m.id)}"><code>${esc(m.id)}</code></a></td><td>${esc(m.cat)}</td><td><code>/tasks</code></td><td class="r">${usd(m.ours)} <span class="muted small">/ ${esc(m.unit)}</span></td></tr>`).join('\n'));
