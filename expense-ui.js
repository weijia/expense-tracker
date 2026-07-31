/**
 * Expense Tracker UI — v1.0.0
 * 纯 SVG 图表渲染层，零外部库。
 * 依赖：expense-core.js（仅用于数据结构的语义约定，实际不调用 API）
 *
 *   <script src="expense-ui.js"></script>
 *   => window.ExpenseUI
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) { define([], factory); }
  else if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.ExpenseUI = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- 通用工具 ----------
  function _qs(selector) {
    if (typeof document === "undefined") throw new Error("ExpenseUI: 只能在浏览器 DOM 环境使用");
    if (typeof selector === "string") {
      const el = document.querySelector(selector);
      if (!el) throw new Error("ExpenseUI: 找不到挂载点 " + selector);
      return el;
    }
    return selector; // 允许直接传 DOM 元素
  }
  function _empty(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function _ns(tag, attrs, text) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function _round2(n) { return Math.round(Number(n) * 100) / 100; }

  // ---------- 1) 分类饼图 ----------
  // summary: [{ id, name, icon, color, total }, ...]（即 sumByCategory 的带元信息返回值）
  function renderPieChart(selector, summary, options) {
    const mount = _qs(selector);
    _empty(mount);
    const opts = options || {};
    const W = opts.width || 400;
    const H = opts.height || 300;
    const title = opts.title || "";
    const R = Math.min(W / 2 - 10, H * 0.55);
    const cx = W / 2;
    const cy = H / 2 + (title ? 16 : 0);

    const data = (summary && Array.isArray(summary) ? summary : [])
      .filter(function (s) { return s.total > 0; });
    const total = data.reduce(function (acc, s) { return acc + s.total; }, 0);

    const svg = _ns("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: "font-family:system-ui,sans-serif;" });

    // 标题
    if (title) {
      svg.appendChild(_ns("text", {
        x: W / 2, y: 22, "text-anchor": "middle",
        "font-size": "15", "font-weight": "600", fill: "#0f172a"
      }, title));
    }

    if (total === 0 || data.length === 0) {
      svg.appendChild(_ns("circle", { cx, cy, r: R, fill: "none", stroke: "#e2e8f0", "stroke-width": 2 }));
      svg.appendChild(_ns("text", {
        x: cx, y: cy, "text-anchor": "middle",
        "font-size": "14", fill: "#94a3b8"
      }, "暂无数据"));
      mount.appendChild(svg);
      return;
    }

    // 饼图 slices
    let accAngle = -Math.PI / 2; // 从顶部开始
    for (let i = 0; i < data.length; i++) {
      const s = data[i];
      const share = s.total / total;
      const endAngle = accAngle + share * Math.PI * 2;
      // 避免 single slice 路径为空
      const large = share > 0.5 ? 1 : 0;
      const x1 = cx + R * Math.cos(accAngle);
      const y1 = cy + R * Math.sin(accAngle);
      const x2 = cx + R * Math.cos(endAngle);
      const y2 = cy + R * Math.sin(endAngle);
      let d;
      if (data.length === 1) {
        // 整圆
        d = `M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy} A ${R} ${R} 0 1 1 ${cx - R} ${cy} Z`;
      } else {
        d = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
      }
      svg.appendChild(_ns("path", {
        d, fill: s.color, stroke: "#fff", "stroke-width": 2,
        title: `${s.name}: ${s.total}`
      }));
      accAngle = endAngle;
    }

    // 图例（右侧或底部）
    const legendX = 12;
    const legendY = H - 16 - Math.ceil(data.length / 2) * 18;
    data.forEach(function (s, i) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = legendX + col * ((W - 24) / 2);
      const y = H - 10 - row * 18;
      const pct = (s.total / total * 100).toFixed(1);
      svg.appendChild(_ns("rect", { x, y: y - 9, width: 10, height: 10, fill: s.color, rx: 2 }));
      svg.appendChild(_ns("text", {
        x: x + 14, y: y, "font-size": "11", fill: "#475569"
      }, `${s.icon || ""}${s.name} ${pct}%`));
    });

    mount.appendChild(svg);
  }

  // ---------- 2) 月度柱状图 ----------
  // monthlyData: [{ month: "2026-01", total: 0 }, ..., "2026-12"]
  function renderBarChart(selector, monthlyData, options) {
    const mount = _qs(selector);
    _empty(mount);
    const opts = options || {};
    const W = opts.width || 600;
    const H = opts.height || 240;
    const title = opts.title || "";
    const barColor = opts.barColor || "#6366f1";

    const svg = _ns("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: "font-family:system-ui,sans-serif;" });
    if (title) {
      svg.appendChild(_ns("text", {
        x: W / 2, y: 22, "text-anchor": "middle",
        "font-size": "15", "font-weight": "600", fill: "#0f172a"
      }, title));
    }

    const data = Array.isArray(monthlyData) ? monthlyData : [];
    const maxVal = data.reduce(function (m, d) { return Math.max(m, d.total || 0); }, 0);
    const topY = title ? 40 : 20;
    const bottomY = H - 28;
    const leftX = 40;
    const rightX = W - 12;
    const chartH = bottomY - topY;
    const chartW = rightX - leftX;

    // Y 轴基线
    svg.appendChild(_ns("line", {
      x1: leftX, y1: bottomY, x2: rightX, y2: bottomY,
      stroke: "#cbd5e1", "stroke-width": 1
    }));

    if (maxVal === 0 || data.length === 0) {
      svg.appendChild(_ns("text", {
        x: (leftX + rightX) / 2, y: (topY + bottomY) / 2,
        "text-anchor": "middle", "font-size": "13", fill: "#94a3b8"
      }, "暂无数据");
      mount.appendChild(svg);
      return;
    }

    // 柱宽度
    const count = data.length;
    const slot = chartW / count;
    const bw = Math.max(4, slot * 0.62);

    for (let i = 0; i < count; i++) {
      const d = data[i];
      const h = Math.max(1, (d.total || 0) / maxVal * chartH);
      const x = leftX + i * slot + (slot - bw) / 2;
      const y = bottomY - h;
      svg.appendChild(_ns("rect", {
        x, y, width: bw, height: h,
        fill: barColor, rx: 2, ry: 2,
        opacity: 0.9
      }));
      // 数值标注（如果柱够高）
      if (h > 22) {
        svg.appendChild(_ns("text", {
          x: x + bw / 2, y: y + 14, "text-anchor": "middle",
          "font-size": "10", fill: "#fff", "font-weight": "600"
        }, _round2(d.total || 0)));
      } else {
        svg.appendChild(_ns("text", {
          x: x + bw / 2, y: y - 3, "text-anchor": "middle",
          "font-size": "10", fill: "#475569"
        }, _round2(d.total || 0)));
      }
      // X 轴标签（只显示每月）
      const label = typeof d.month === "string" && d.month.length >= 7
        ? d.month.substring(5, 7) + "月"
        : String(d.month || "");
      svg.appendChild(_ns("text", {
        x: x + bw / 2, y: bottomY + 14, "text-anchor": "middle",
        "font-size": "10", fill: "#64748b"
      }, label));
    }

    // Y 轴刻度（0 + max + 中间一个）
    svg.appendChild(_ns("text", { x: leftX - 6, y: bottomY + 4, "text-anchor": "end", "font-size": "10", fill: "#64748b" }, "0"));
    svg.appendChild(_ns("text", { x: leftX - 6, y: topY + 6, "text-anchor": "end", "font-size": "10", fill: "#64748b" }, _round2(maxVal)));

    mount.appendChild(svg);
  }

  // ---------- 3) 比价对比表 ----------
  function renderCompareTable(selector, compareRecords, options) {
    const mount = _qs(selector);
    _empty(mount);
    const opts = options || {};
    const unitLabel = opts.unitLabel || "元";
    const records = Array.isArray(compareRecords) ? compareRecords.slice() : [];

    // 按 unitPrice 升序（最低价在前面）
    records.sort(function (a, b) { return (a.unitPrice || 0) - (b.unitPrice || 0); });
    const lowest = records.length ? records[0].unitPrice : 0;

    if (!records.length) {
      const div = document.createElement("div");
      div.style.cssText = "padding:24px;text-align:center;color:#94a3b8;font-size:14px;";
      div.textContent = "该商品暂无历史购买记录";
      mount.appendChild(div);
      return;
    }

    const wrap = document.createElement("div");
    wrap.style.cssText = "background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;font-family:system-ui,sans-serif;font-size:13px;";

    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;";

    // thead
    const thead = document.createElement("thead");
    thead.style.cssText = "background:#f8fafc;color:#475569;font-size:12px;";
    const thRow = document.createElement("tr");
    ["日期", "商家/渠道", "规格", "品牌", `单价(${unitLabel})`, "数量", "总价", "比价差异"].forEach(function (h) {
      const th = document.createElement("th");
      th.style.cssText = "padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-weight:600;";
      th.textContent = h;
      thRow.appendChild(th);
    });
    thead.appendChild(thRow);
    table.appendChild(thead);

    // tbody
    const tbody = document.createElement("tbody");
    records.forEach(function (r) {
      const tr = document.createElement("tr");
      const isLowest = r.unitPrice === lowest && records.length > 1;
      if (isLowest) tr.style.cssText = "background:#ecfdf5;color:#065f46;";
      else tr.style.cssText = "border-bottom:1px solid #f1f5f9;";
      const cells = [
        r.date || "-",
        r.merchant || "-",
        r.specification || "-",
        r.brand || "-",
        _round2(r.unitPrice).toFixed(2),
        (r.quantity || 0) + (r.unit ? " " + r.unit : ""),
        _round2(r.totalPrice).toFixed(2),
        (function () {
          if (!isLowest && lowest > 0) {
            const pct = ((r.unitPrice - lowest) / lowest * 100).toFixed(1);
            const span = document.createElement("span");
            span.style.cssText = `color:#dc2626;background:#fef2f2;padding:2px 8px;border-radius:9999px;font-size:12px;`;
            span.textContent = `+${pct}%`;
            return span;
          } else if (isLowest) {
            const span = document.createElement("span");
            span.style.cssText = `background:#10b981;color:#fff;padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;`;
            span.textContent = "★ 最低价";
            return span;
          }
          return "-";
        })()
      ];
      cells.forEach(function (c) {
        const td = document.createElement("td");
        td.style.cssText = "padding:10px 12px;vertical-align:middle;";
        if (typeof c === "object" && c.nodeType) td.appendChild(c);
        else td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    mount.appendChild(wrap);
  }

  return {
    renderPieChart: renderPieChart,
    renderBarChart: renderBarChart,
    renderCompareTable: renderCompareTable
  };
}));
