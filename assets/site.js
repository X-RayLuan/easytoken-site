// Shared header and footer, injected so every page stays in sync.
(function(){
  const page = document.body.dataset.page || "";
  const acct = Account.get();
  const coin = `<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.5" fill="var(--brass)"/><circle cx="16" cy="16" r="10.5" fill="none" stroke="var(--paper)" stroke-width="1.6" stroke-dasharray="2.2 2.2"/><rect x="11" y="10" width="10" height="2.6" rx="1.3" fill="var(--paper)"/><rect x="14.7" y="10" width="2.6" height="12" rx="1.3" fill="var(--paper)"/></svg>`;
  const links = [["models","models.html","Models"],["pricing","index.html#pricing","Pricing"],["playground","playground.html","Playground"],["docs","docs.html","Docs"]];
  const h = document.getElementById("site-header");
  if (h) h.outerHTML = `<header class="nav"><div class="wrap">
    <a class="brand" href="index.html">${coin}EasyToken <small>.si</small></a>
    <nav aria-label="Main">${links.map(([k,u,l]) => `<a href="${u}"${k===page?' aria-current="page"':''}>${l}</a>`).join("")}</nav>
    ${acct
      ? `<a class="btn btn-primary" href="dashboard.html">Dashboard</a>`
      : `<a class="nav-login" href="login.html">Log in</a><a class="btn btn-primary" href="signup.html">Get API key</a>`}
  </div></header>`;
  const f = document.getElementById("site-footer");
  if (f) f.outerHTML = `<footer><div class="wrap">
    <a class="brand" href="index.html">${coin.replace(/26/g,"22")}EasyToken</a>
    <nav aria-label="Footer"><a href="models.html">Models</a><a href="index.html#pricing">Pricing</a><a href="docs.html">Docs</a><a href="status.html">Status</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a></nav>
    <span>© 2026 EasyToken · easytoken.si</span>
  </div></footer>`;

  // Copy buttons: <button data-copy="#selector">
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    const el = document.querySelector(b.dataset.copy); if (!el) return;
    const text = el.value ?? el.textContent, old = b.textContent;
    navigator.clipboard.writeText(text).then(() => { b.textContent = "Copied"; setTimeout(() => b.textContent = old, 1400); })
      .catch(() => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  });
})();
