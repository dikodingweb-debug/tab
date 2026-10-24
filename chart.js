/* Grafik garis naik-turun harga menabung.
   Data diambil dari riwayat transaksi (nominal tiap transaksi = harga saat itu)
   ditambah harga aktif sekarang. Tidak memakai library & tidak memanggil server. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const $ = id => document.getElementById(id);
  const rupiah = n => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n || 0));
  const compact = n => {
    const v = Math.abs(n), s = n < 0 ? "-" : "";
    if (v >= 1e9) return s + (v / 1e9).toFixed(v % 1e9 ? 1 : 0).replace(".", ",") + "M";
    if (v >= 1e6) return s + (v / 1e6).toFixed(v % 1e6 ? 1 : 0).replace(".", ",") + "jt";
    if (v >= 1e3) return s + (v / 1e3).toFixed(v % 1e3 ? 1 : 0).replace(".", ",") + "rb";
    return s + String(Math.round(v));
  };
  const DAY = 864e5;
  const RANGES = { "7": 7 * DAY, "30": 30 * DAY, all: Infinity };
  let range = "all", data = { tx: [], price: 0 }, hover = null, raf = 0;

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function buildPoints() {
    const now = Date.now(), limit = RANGES[range];
    const pts = (data.tx || [])
      .map(t => ({ t: new Date(t.created_at).getTime(), v: Number(t.amount) }))
      .filter(p => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0 && now - p.t <= limit)
      .sort((a, b) => a.t - b.t);
    if (!pts.length) return [];
    if (data.price > 0) pts.push({ t: Math.max(now, pts[pts.length - 1].t), v: data.price, now: true });
    return pts;
  }

  function niceScale(min, max) {
    if (min === max) { const pad = Math.max(min * 0.2, 10000); min -= pad; max += pad; }
    const span = max - min, pad = span * 0.12;
    min = Math.max(0, min - pad); max = max + pad;
    const rough = (max - min) / 4, mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rough) || rough;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
    return { lo, hi, ticks };
  }

  function fmtDate(ms, withTime) {
    const d = new Date(ms);
    return withTime
      ? d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  }

  function renderStats(pts) {
    const box = $("chartStats"); if (!box) return;
    if (!pts.length) { box.innerHTML = ""; return; }
    const vals = pts.map(p => p.v), first = vals[0], last = vals[vals.length - 1], diff = last - first;
    const pct = first ? Math.round((diff / first) * 1000) / 10 : 0;
    const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    const label = dir === "up" ? "▲ Naik" : dir === "down" ? "▼ Turun" : "● Stabil";
    const detail = dir === "flat" ? "tidak berubah" : `${rupiah(Math.abs(diff))} (${Math.abs(pct).toString().replace(".", ",")}%)`;
    box.innerHTML =
      `<div class="chart-stat"><span>Harga sekarang</span><strong>${rupiah(data.price > 0 ? data.price : last)}</strong></div>` +
      `<div class="chart-stat"><span>Tertinggi</span><strong>${rupiah(Math.max(...vals))}</strong></div>` +
      `<div class="chart-stat"><span>Terendah</span><strong>${rupiah(Math.min(...vals))}</strong></div>` +
      `<div class="chart-stat"><span>Perubahan periode ini</span><strong class="trend-pill trend-${dir}">${label} ${detail}</strong></div>`;
  }

  function draw() {
    raf = 0;
    const wrap = $("priceChart"); if (!wrap) return;
    const pts = buildPoints();
    renderStats(pts);
    wrap.innerHTML = "";
    if (pts.length < 2) {
      wrap.innerHTML = `<div class="empty-state">${(data.tx || []).length ? "Belum ada transaksi pada rentang ini." : "Grafik akan muncul setelah ada transaksi menabung."}</div>`;
      return;
    }
    const W = Math.max(280, wrap.clientWidth), H = W < 520 ? 230 : 290;
    const m = { l: W < 520 ? 44 : 54, r: 18, t: 16, b: 30 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t, tspan = t1 - t0;
    const { lo, hi, ticks } = niceScale(Math.min(...pts.map(p => p.v)), Math.max(...pts.map(p => p.v)));
    const X = (p, i) => m.l + (tspan > 0 ? (p.t - t0) / tspan : i / (pts.length - 1)) * iw;
    const Y = v => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    const xy = pts.map((p, i) => [X(p, i), Y(p.v)]);

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", class: "chart-svg",
      "aria-label": `Grafik harga menabung dari ${fmtDate(t0)} sampai ${fmtDate(t1)}, ${pts.length} titik data. Harga terendah ${rupiah(Math.min(...pts.map(p => p.v)))}, tertinggi ${rupiah(Math.max(...pts.map(p => p.v)))}.` });
    const defs = el("defs", {}, svg);
    const g = el("linearGradient", { id: "pcFill", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: "0%", "stop-color": "#14705a", "stop-opacity": ".28" }, g);
    el("stop", { offset: "100%", "stop-color": "#14705a", "stop-opacity": "0" }, g);

    ticks.forEach(v => {
      const y = Y(v);
      el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: "chart-grid" }, svg);
      const tx = el("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", class: "chart-axis" }, svg); tx.textContent = compact(v);
    });
    const withTime = tspan < 2 * DAY, n = W < 520 ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), tx = el("text", { x: m.l + f * iw, y: H - 8, class: "chart-axis", "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle" }, svg);
      tx.textContent = fmtDate(t0 + f * tspan, withTime && false);
    }

    const line = xy.map((c, i) => (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1)).join(" ");
    el("path", { d: `${line} L${xy[xy.length - 1][0].toFixed(1)} ${m.t + ih} L${xy[0][0].toFixed(1)} ${m.t + ih} Z`, fill: "url(#pcFill)" }, svg);
    el("path", { d: line, class: "chart-line", fill: "none" }, svg);
    if (pts.length <= 40) xy.forEach((c, i) => el("circle", { cx: c[0], cy: c[1], r: pts[i].now ? 5 : 3.5, class: pts[i].now ? "chart-dot chart-dot-now" : "chart-dot" }, svg));

    const guide = el("line", { y1: m.t, y2: m.t + ih, class: "chart-guide", visibility: "hidden" }, svg);
    const mark = el("circle", { r: 6, class: "chart-mark", visibility: "hidden" }, svg);
    const tip = document.createElement("div"); tip.className = "chart-tooltip"; tip.hidden = true;
    wrap.appendChild(svg); wrap.appendChild(tip);

    const show = ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
      let best = 0; xy.forEach((c, i) => { if (Math.abs(c[0] - px) < Math.abs(xy[best][0] - px)) best = i; });
      const [cx, cy] = xy[best], p = pts[best];
      guide.setAttribute("x1", cx); guide.setAttribute("x2", cx); mark.setAttribute("cx", cx); mark.setAttribute("cy", cy);
      guide.setAttribute("visibility", "visible"); mark.setAttribute("visibility", "visible");
      tip.innerHTML = `<strong>${rupiah(p.v)}</strong><span>${p.now ? "Harga aktif sekarang" : fmtDate(p.t, true)}</span>`;
      tip.hidden = false;
      const left = Math.min(Math.max(cx * (r.width / W), 70), r.width - 70);
      tip.style.left = left + "px"; tip.style.top = Math.max(cy * (r.height / H) - 56, 0) + "px";
    };
    const hide = () => { guide.setAttribute("visibility", "hidden"); mark.setAttribute("visibility", "hidden"); tip.hidden = true; };
    svg.addEventListener("pointermove", show); svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", hide); svg.addEventListener("pointercancel", hide);
  }

  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function init() {
    document.querySelectorAll("[data-chart-range]").forEach(b => {
      b.addEventListener("click", () => {
        range = b.dataset.chartRange;
        document.querySelectorAll("[data-chart-range]").forEach(x => { const on = x === b; x.classList.toggle("active", on); x.setAttribute("aria-pressed", on); });
        schedule();
      });
    });
    const wrap = $("priceChart");
    if (wrap && "ResizeObserver" in window) { let w = 0; new ResizeObserver(() => { if (wrap.clientWidth !== w) { w = wrap.clientWidth; schedule(); } }).observe(wrap); }
    else window.addEventListener("resize", schedule);
  }

  window.PriceChart = { update(tx, price) { data = { tx: tx || [], price: Number(price) || 0 }; schedule(); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
