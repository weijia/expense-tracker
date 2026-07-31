/**
 * Expense Tracker Core — v1.0.0
 * 纯数据结构 + 比价逻辑的 JS 库，零依赖。
 * 浏览器：<script src="expense-core.js"></script>  => window.ExpenseCore
 * Node   : const ExpenseCore = require('./expense-core.js')
 * ESM    : import ExpenseCore from './expense-core.js'
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) { define([], factory); }
  else if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.ExpenseCore = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ============================================================
  // 常量
  // ============================================================
  const VERSION = "1.0.0";
  const DEFAULT_CURRENCY = "CNY";

  const PRESET_CATEGORIES = [
    { id: "cat_food",         name: "餐饮美食", icon: "🍜", color: "#ef4444" },
    { id: "cat_grocery",      name: "日常买菜", icon: "🥬", color: "#22c55e" },
    { id: "cat_transport",    name: "交通出行", icon: "🚗", color: "#3b82f6" },
    { id: "cat_shopping",     name: "购物消费", icon: "🛍️", color: "#a855f7" },
    { id: "cat_housing",      name: "住房物业", icon: "🏠", color: "#f97316" },
    { id: "cat_utilities",    name: "水电燃气", icon: "💡", color: "#eab308" },
    { id: "cat_health",       name: "医疗健康", icon: "💊", color: "#ec4899" },
    { id: "cat_education",    name: "教育培训", icon: "📚", color: "#06b6d4" },
    { id: "cat_entertainment",name: "休闲娱乐", icon: "🎮", color: "#8b5cf6" },
    { id: "cat_travel",       name: "旅行度假", icon: "✈️",  color: "#14b8a6" },
    { id: "cat_subscription", name: "订阅服务", icon: "📱", color: "#f59e0b" },
    { id: "cat_office",       name: "办公用品", icon: "🖨️", color: "#64748b" },
    { id: "cat_gift",         name: "人情礼物", icon: "🎁", color: "#f43f5e" },
    { id: "cat_other",        name: "其他",     icon: "📦", color: "#94a3b8" }
  ];

  const _REQUIRED_FIELDS = [
    "id","date","itemName","categoryId","quantity","unitPrice","totalPrice","currency","merchant"
  ];
  const _VALID_PAYMENT = Object.freeze(["cash","wechat","alipay","credit_card","debit_card","other"]);
  const _CSV_HEADERS = [
    "date","itemName","categoryId","quantity","unit","unitPrice","totalPrice",
    "currency","merchant","brand","specification","note","tags"
  ];

  // ============================================================
  // 工具函数
  // ============================================================
  function _uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    // fallback: UUID v4 via Math.random
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function _nowISO() {
    return new Date().toISOString();
  }

  function _todayISO() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function _round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function _deepCopy(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(_deepCopy);
    const out = {};
    for (const k of Object.keys(obj)) out[k] = _deepCopy(obj[k]);
    return out;
  }

  function _compareKeyOf(r) {
    return `${r.itemName || ""}|${r.brand || ""}|${r.specification || ""}`;
  }

  // ============================================================
  // 2.1 数据构造
  // ============================================================
  function createEmptyAppData(currency) {
    const cur = currency || DEFAULT_CURRENCY;
    return {
      version: "1.0",
      records: [],
      categories: PRESET_CATEGORIES.map(c => Object.assign({}, c)),
      meta: {
        lastExportAt: _nowISO(),
        currency: cur
      }
    };
  }

  function createRecord(partial) {
    const p = partial || {};
    const quantity = typeof p.quantity === "number" ? p.quantity : 1;
    const unitPrice = typeof p.unitPrice === "number" ? p.unitPrice : 0;
    const totalPrice = (typeof p.totalPrice === "number")
      ? p.totalPrice
      : _round2(quantity * unitPrice);

    const r = {
      id: p.id || _uuid(),
      date: p.date || _todayISO(),
      itemName: String(p.itemName || ""),
      categoryId: String(p.categoryId || "cat_other"),
      quantity: quantity,
      unit: String(p.unit || "个"),
      unitPrice: _round2(unitPrice),
      totalPrice: _round2(totalPrice),
      currency: String(p.currency || DEFAULT_CURRENCY),
      merchant: String(p.merchant || ""),
    };
    if (p.brand !== undefined) r.brand = String(p.brand);
    if (p.specification !== undefined) r.specification = String(p.specification);
    if (p.paymentMethod !== undefined && _VALID_PAYMENT.indexOf(p.paymentMethod) !== -1) {
      r.paymentMethod = p.paymentMethod;
    }
    if (p.location !== undefined) r.location = String(p.location);
    if (p.note !== undefined) r.note = String(p.note);
    if (Array.isArray(p.tags)) r.tags = p.tags.map(String);
    if (p.receiptUrl !== undefined) r.receiptUrl = String(p.receiptUrl);

    const now = _nowISO();
    r.createdAt = p.createdAt || now;
    r.updatedAt = p.updatedAt || now;
    return r;
  }

  function updateRecord(record, updates) {
    if (!record) return null;
    const merged = Object.assign({}, record, updates || {});
    // quantity 或 unitPrice 变化 → 重算 totalPrice（除非用户明确传了新 totalPrice）
    if (
      (typeof updates.quantity === "number" || typeof updates.unitPrice === "number")
      && typeof updates.totalPrice !== "number"
    ) {
      merged.totalPrice = _round2(
        (typeof merged.quantity === "number" ? merged.quantity : 0) *
        (typeof merged.unitPrice === "number" ? merged.unitPrice : 0)
      );
    } else if (typeof merged.totalPrice === "number") {
      merged.totalPrice = _round2(merged.totalPrice);
    }
    if (typeof merged.unitPrice === "number") merged.unitPrice = _round2(merged.unitPrice);
    merged.updatedAt = _nowISO();
    return merged;
  }

  // ============================================================
  // 2.2 校验
  // ============================================================
  function validateRecord(record) {
    const errors = [];
    if (!record || typeof record !== "object") {
      return ["record 不是对象"];
    }
    for (const f of _REQUIRED_FIELDS) {
      const v = record[f];
      if (v === undefined || v === null || v === "") {
        errors.push(`必填字段缺失: ${f}`);
      }
    }
    if (typeof record.quantity === "number" && record.quantity <= 0) {
      errors.push("quantity 必须 > 0");
    }
    if (typeof record.unitPrice === "number" && record.unitPrice < 0) {
      errors.push("unitPrice 不能为负");
    }
    if (
      typeof record.totalPrice === "number"
      && typeof record.quantity === "number"
      && typeof record.unitPrice === "number"
    ) {
      const expected = _round2(record.quantity * record.unitPrice);
      if (Math.abs(expected - record.totalPrice) > 0.011) {
        errors.push(`totalPrice (${record.totalPrice}) 与 quantity × unitPrice (${expected}) 不匹配`);
      }
    }
    if (record.paymentMethod !== undefined && _VALID_PAYMENT.indexOf(record.paymentMethod) === -1) {
      errors.push(`paymentMethod 无效值: ${record.paymentMethod}`);
    }
    return errors;
  }

  // ============================================================
  // 2.3 比价聚合
  // ============================================================
  function buildCompareIndex(records) {
    const idx = {};
    if (!Array.isArray(records)) return idx;
    for (const r of records) {
      const k = _compareKeyOf(r);
      if (!idx[k]) idx[k] = [];
      idx[k].push(r);
    }
    return idx;
  }

  function getLowestPrice(records, itemName, specification) {
    if (!Array.isArray(records) || !records.length) return null;
    let best = null;
    for (const r of records) {
      if (r.itemName !== itemName) continue;
      if (specification !== undefined && r.specification !== specification) continue;
      if (best === null || r.unitPrice < best.unitPrice) best = r;
    }
    return best;
  }

  // ============================================================
  // 2.4 汇总统计
  // ============================================================
  function sumByCategory(records, categories) {
    const map = {};
    if (Array.isArray(records)) {
      for (const r of records) {
        const cid = r.categoryId || "cat_other";
        if (!map[cid]) map[cid] = 0;
        map[cid] += Number(r.totalPrice) || 0;
      }
    }
    // 如果传入了 categories，按 categories 的 id 顺序输出并携带元信息
    if (Array.isArray(categories) && categories.length) {
      return categories.map(function (c) {
        return {
          id: c.id,
          name: c.name,
          icon: c.icon,
          color: c.color,
          total: _round2(map[c.id] || 0)
        };
      }).filter(function (s) { return s.total > 0; })
        .concat(
          Object.keys(map)
            .filter(function (cid) { return !categories.some(function (c) { return c.id === cid; }); })
            .map(function (cid) {
              return { id: cid, name: "未知分类", icon: "📦", color: "#94a3b8", total: _round2(map[cid]) };
            })
        );
    }
    // 否则返回 {cid: total} 旧格式
    const out = {};
    for (const cid of Object.keys(map)) out[cid] = _round2(map[cid]);
    return out;
  }

  function sumByMonth(records, year) {
    const y = (typeof year === "number") ? year : new Date().getFullYear();
    const buckets = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      buckets[key] = 0;
    }
    if (Array.isArray(records)) {
      for (const r of records) {
        if (!r.date || typeof r.date !== "string" || r.date.length < 7) continue;
        if (!r.date.startsWith(`${y}-`)) continue;
        const key = r.date.substring(0, 7);
        if (buckets[key] === undefined) buckets[key] = 0;
        buckets[key] += Number(r.totalPrice) || 0;
      }
    }
    const out = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      out.push({ month: key, total: _round2(buckets[key] || 0) });
    }
    return out;
  }

  // ============================================================
  // 2.5 筛选查询
  // ============================================================
  function filterByDateRange(records, startDate, endDate) {
    if (!Array.isArray(records)) return [];
    const s = String(startDate || "");
    const e = String(endDate || "");
    return records.filter(function (r) {
      if (!r.date) return false;
      if (s && r.date < s) return false;
      if (e && r.date > e) return false;
      return true;
    });
  }

  function getRecordsByCategory(records, categoryId) {
    if (!Array.isArray(records)) return [];
    return records.filter(function (r) { return r.categoryId === categoryId; });
  }

  // ============================================================
  // 2.6 导入导出
  // ============================================================
  function exportJSON(data) {
    if (!data || typeof data !== "object") {
      throw new Error("exportJSON: data 必须是 AppData 对象");
    }
    const copy = _deepCopy(data);
    copy.meta = Object.assign({}, copy.meta || {}, { lastExportAt: _nowISO() });
    return JSON.stringify(copy, null, 2);
  }

  function importJSON(jsonString, mode, existingAppData) {
    let parsed;
    try { parsed = JSON.parse(jsonString); }
    catch (e) { throw new Error("importJSON: 无效 JSON — " + e.message); }

    const incoming = _normalizeAppData(parsed);
    const m = mode || "replace";

    if (m === "replace") return incoming;
    if (m !== "merge") throw new Error("importJSON: mode 必须是 'merge' 或 'replace'");

    const base = existingAppData
      ? _normalizeAppData(_deepCopy(existingAppData))
      : createEmptyAppData();

    // merge records: id 冲突选 updatedAt 新的
    const recordMap = {};
    for (const r of base.records) recordMap[r.id] = r;
    for (const r of incoming.records) {
      const old = recordMap[r.id];
      if (!old || (r.updatedAt || "") >= (old.updatedAt || "")) recordMap[r.id] = r;
    }
    base.records = Object.keys(recordMap).map(function (k) { return recordMap[k]; });

    // merge categories: id 冲突选新来的（允许用户自定义覆盖预置）
    const catMap = {};
    for (const c of base.categories) catMap[c.id] = c;
    for (const c of incoming.categories) catMap[c.id] = c;
    base.categories = Object.keys(catMap).map(function (k) { return catMap[k]; });

    // meta 继承合并
    base.meta.lastExportAt = _nowISO();
    return base;
  }

  function _normalizeAppData(obj) {
    if (!obj || typeof obj !== "object") return createEmptyAppData();
    return {
      version: obj.version || "1.0",
      records: Array.isArray(obj.records) ? obj.records.map(function (r) {
        // 对入参的每条记录做最低限度补齐，保证有 id/时间戳
        return Object.assign(
          { id: _uuid(), createdAt: _nowISO(), updatedAt: _nowISO(), totalPrice: 0, unitPrice: 0, quantity: 1 },
          r
        );
      }) : [],
      categories: Array.isArray(obj.categories) && obj.categories.length
        ? obj.categories
        : PRESET_CATEGORIES.map(function (c) { return Object.assign({}, c); }),
      meta: Object.assign(
        { lastExportAt: _nowISO(), currency: DEFAULT_CURRENCY },
        obj.meta || {}
      )
    };
  }

  // ============================================================
  // 2.7 CSV
  // ============================================================
  function recordsToCSV(records) {
    if (!Array.isArray(records) || !records.length) {
      return _CSV_HEADERS.join(",");
    }
    const lines = [_CSV_HEADERS.join(",")];
    for (const r of records) {
      const row = _CSV_HEADERS.map(function (h) {
        let v;
        if (h === "tags") {
          v = Array.isArray(r.tags) ? r.tags.join("|") : "";
        } else {
          v = r[h];
          if (v === undefined || v === null) v = "";
          v = String(v);
        }
        // 含逗号 / 双引号 / 换行 → 加引号并转义
        if (/[",\n]/.test(v)) {
          v = '"' + v.replace(/"/g, '""') + '"';
        }
        return v;
      });
      lines.push(row.join(","));
    }
    return lines.join("\n");
  }

  function csvToRecords(csvText) {
    if (!csvText || typeof csvText !== "string") return [];
    const rows = _parseCSV(csvText);
    if (rows.length === 0) return [];
    const headers = rows[0].map(function (h) { return h.trim(); });
    const headerIdx = {};
    for (let i = 0; i < headers.length; i++) headerIdx[headers[i]] = i;
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const get = function (k) {
        const idx = headerIdx[k];
        return idx === undefined ? "" : (row[idx] === undefined ? "" : String(row[idx]));
      };
      const qty = Number(get("quantity"));
      const up = Number(get("unitPrice"));
      const tp = Number(get("totalPrice"));
      const partial = {
        date: get("date"),
        itemName: get("itemName"),
        categoryId: get("categoryId") || "cat_other",
        quantity: isNaN(qty) ? 1 : qty,
        unit: get("unit") || "个",
        unitPrice: isNaN(up) ? 0 : up,
        currency: get("currency") || DEFAULT_CURRENCY,
        merchant: get("merchant") || "",
        brand: get("brand") || undefined,
        specification: get("specification") || undefined,
        note: get("note") || undefined
      };
      if (!isNaN(tp) && tp > 0) partial.totalPrice = tp;
      const tagsStr = get("tags");
      if (tagsStr) {
        const arr = tagsStr.split("|").map(function (s) { return s.trim(); }).filter(Boolean);
        if (arr.length) partial.tags = arr;
      }
      // 跳过空行（无商品名无日期无分类）
      if (!partial.date && !partial.itemName && !partial.merchant) continue;
      out.push(createRecord(partial));
    }
    return out;
  }

  // 简易 CSV 解析：支持双引号包裹、引号转义、换行
  function _parseCSV(text) {
    const rows = [];
    let cur = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ",") { cur.push(field); field = ""; }
        else if (ch === "\n") {
          cur.push(field); rows.push(cur); cur = []; field = "";
        } else if (ch === "\r") {
          // skip
        } else { field += ch; }
      }
    }
    // flush tail
    if (field.length || cur.length) {
      cur.push(field); rows.push(cur);
    }
    // 去掉末尾完全空行
    while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
      rows.pop();
    }
    return rows;
  }

  // ============================================================
  // 导出
  // ============================================================
  return {
    VERSION: VERSION,
    DEFAULT_CURRENCY: DEFAULT_CURRENCY,
    PRESET_CATEGORIES: PRESET_CATEGORIES.map(function (c) { return Object.assign({}, c); }),

    createEmptyAppData: createEmptyAppData,
    createRecord: createRecord,
    updateRecord: updateRecord,
    validateRecord: validateRecord,

    buildCompareIndex: buildCompareIndex,
    getLowestPrice: getLowestPrice,

    sumByCategory: sumByCategory,
    sumByMonth: sumByMonth,

    filterByDateRange: filterByDateRange,
    getRecordsByCategory: getRecordsByCategory,

    exportJSON: exportJSON,
    importJSON: importJSON,

    csvToRecords: csvToRecords,
    recordsToCSV: recordsToCSV
  };
}));
