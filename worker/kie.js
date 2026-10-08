// kie.ai market API: one create endpoint, one status endpoint for every media model.
const BASE = "https://api.kie.ai/api/v1/jobs";

export async function submitUpstream(env, { model, input, callbackUrl }) {
  const r = await fetch(`${BASE}/createTask`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.KIE_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input, callBackUrl: callbackUrl }),
  });
  let p = null; try { p = await r.json(); } catch {}
  // kie reports errors in the body `code` with HTTP 200.
  const code = Number(p?.code ?? r.status);
  if (code === 200 && p?.data?.taskId) return { ok: true, upstreamId: p.data.taskId };
  console.error("kie create", model, code, p?.msg);
  // 402/401 are about OUR kie account, so customers see a generic provider error.
  return { ok: false, clientError: code === 422 || code === 400, message: code === 422 || code === 400 ? `Invalid input: ${p?.msg || "rejected by the provider"}.` : "The provider could not start this task." };
}

const parse = v => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return null; } };

// Collect output URLs from the shapes kie uses across models (market, Veo hi-res, Suno tracks).
export function resultUrls(d) {
  const rj = parse(d.resultJson) || {}, resp = parse(d.response) || {};
  const urls = [
    ...(rj.resultUrls || []), ...(rj.data?.result_urls || []), ...(rj.result_urls || []),
    ...(resp.resultUrls || []),
    ...[...(resp.data || []), ...(rj.data && Array.isArray(rj.data) ? rj.data : [])].map(t => t?.audio_url),
  ].filter(u => typeof u === "string" && u.startsWith("https://"));
  return [...new Set(urls)];
}

export async function pollUpstream(env, model, upstreamId) {
  const r = await fetch(`${BASE}/recordInfo?taskId=${encodeURIComponent(upstreamId)}`, { headers: { authorization: `Bearer ${env.KIE_API_KEY}` } });
  const p = await r.json();
  if (Number(p?.code) !== 200 || !p.data) throw new Error(`kie poll ${p?.code} ${p?.msg}`);
  const d = p.data;
  if (d.state === "fail") return { status: "failed", error: d.failMsg || "Generation failed." };
  if (d.state !== "success") return { status: "running" };
  const urls = resultUrls(d);
  if (!urls.length) return { status: "failed", error: "The provider finished without an output file." };
  return { status: "succeeded", result: { url: urls[0], urls, type: model.cat, note: "Download within 14 days; links expire after that." } };
}
