/**
 * Expense Tracker Store — v1.0.0
 * 存储适配层：localStorage（默认，零依赖）/ zen-fs-config（可选，IndexedDB + 多端同步）
 *
 * 依赖：必须先引入 expense-core.js
 *   <script src="expense-core.js"></script>
 *   <script src="expense-store.js"></script>
 *
 * 暴露：window.ExpenseStore
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) { define([], factory); }
  else if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.ExpenseStore = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 依赖 ExpenseCore（全局挂载 / require 两种场景）
  function _getCore() {
    if (typeof ExpenseCore !== "undefined") return ExpenseCore;
    try { return require("./expense-core.js"); } catch (e) {}
    throw new Error("ExpenseStore: 请先引入 expense-core.js");
  }

  // ============================================================
  // Backend 1: LocalStorageAdapter（零依赖默认实现）
  // ============================================================
  class LocalStorageAdapter {
    constructor(appId) {
      this.appId = appId;
      this._lsOk = (typeof localStorage !== "undefined");
      this._memory = null;
      if (!this._lsOk) this._memory = {};
    }
    _key() { return `expense-tracker:${this.appId}:data`; }
    async read() {
      if (this._lsOk) {
        const raw = localStorage.getItem(this._key());
        return raw || null;
      }
      return this._memory[this._key()] || null;
    }
    async write(jsonString) {
      if (this._lsOk) { localStorage.setItem(this._key(), jsonString); return; }
      this._memory[this._key()] = jsonString;
    }
    async clear() {
      if (this._lsOk) { localStorage.removeItem(this._key()); return; }
      delete this._memory[this._key()];
    }
  }

  // ============================================================
  // Backend 2: ZenFsConfigAdapter（检测到全局 zenFsConfig 时启用）
  // ============================================================
  class ZenFsConfigAdapter {
    constructor(appId, options) {
      this.appId = appId;
      this.options = options || {};
      this.repo = null;
      this._ready = false;
      this._fsPath = "/app-data.json";
    }
    async init() {
      const coreMod = _resolveZenFsConfig();
      if (!coreMod) throw new Error("ExpenseStore: 未检测到 zen-fs-config 运行时，请先通过 CDN 引入 @zenfs/core + @zenfs/dom + zen-fs-cache + zen-fs-sync + zen-fs-config");
      const { createConfigRepo, LOCAL_IDB_BACKEND_ID } = coreMod;
      const repoOpts = {
        appId: this.appId,
        idbStoreName: this.options.idbStoreName || `zen-fs-config-${this.appId}`,
      };
      if (this.options.syncPollIntervalMs) repoOpts.syncPollIntervalMs = this.options.syncPollIntervalMs;
      if (this.options.cache) repoOpts.cache = this.options.cache;
      if (this.options.backendInfo) repoOpts.backendInfo = this.options.backendInfo;
      if (this.options.onConflict) repoOpts.onConflict = this.options.onConflict;
      if (this.options.nodeId) repoOpts.nodeId = this.options.nodeId;
      this.repo = await createConfigRepo(repoOpts);
      this._ready = true;
    }
    _check() {
      if (!this._ready) throw new Error("ExpenseStore: ZenFsConfigAdapter 未初始化，请先调用 init()");
    }
    async read() {
      this._check();
      try {
        const v = this.repo.getConfig(this._fsPath);
        return typeof v === "string" ? v : JSON.stringify(v);
      } catch (e) {
        // 文件不存在
        return null;
      }
    }
    async write(jsonString) {
      this._check();
      // setConfig 会内部写 FS（但同步是异步的），这里立即 flush 一次
      this.repo.setConfig(this._fsPath, jsonString);
      try { await this.repo.flush(); } catch (e) { /* ignore sync error */ }
    }
    async clear() {
      this._check();
      try { await this.repo.deleteFile(this._fsPath); } catch (e) {}
    }
    getSyncStatuses() {
      this._check();
      return this.repo.getSyncStatuses();
    }
    listConflicts() {
      this._check();
      return this.repo.listConflicts();
    }
  }

  function _resolveZenFsConfig() {
    // 支持多种挂载方式：window.ZenFsConfig / window.zenFsConfig / window.createConfigRepo
    const g = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : {}));
    if (g.ZenFsConfig && g.ZenFsConfig.createConfigRepo) return g.ZenFsConfig;
    if (g.zenFsConfig && g.zenFsConfig.createConfigRepo) return g.zenFsConfig;
    if (typeof g.createConfigRepo === "function") {
      return { createConfigRepo: g.createConfigRepo, LOCAL_IDB_BACKEND_ID: g.LOCAL_IDB_BACKEND_ID };
    }
    return null;
  }

  // ============================================================
  // Store 主类
  // ============================================================
  class Store {
    constructor(opts) {
      this.appId = opts.appId;
      this.backend = opts.backend;
      this._data = null;
    }
    getData() {
      if (!this._data) throw new Error("ExpenseStore: 尚未 load()，请先 await store.load()");
      return this._data;
    }
    async load() {
      const Core = _getCore();
      const raw = await this.backend.read();
      if (raw) {
        try { this._data = Core.importJSON(raw, "replace"); }
        catch (e) {
          // 坏数据，回退为空
          console.warn("ExpenseStore: 读取到损坏的存储数据，已重置为空", e);
          this._data = Core.createEmptyAppData();
        }
      } else {
        this._data = Core.createEmptyAppData();
      }
      return this._data;
    }
    async save() {
      const Core = _getCore();
      if (!this._data) this._data = Core.createEmptyAppData();
      const json = Core.exportJSON(this._data);
      await this.backend.write(json);
    }
    async addRecord(record) {
      const Core = _getCore();
      if (!this._data) await this.load();
      // 如果传入的是 partial，自动补全
      let r;
      if (record && record.id && record.createdAt) {
        const errors = Core.validateRecord(record);
        if (errors.length) throw new Error("ExpenseStore.addRecord 校验失败: " + errors.join("; "));
        r = record;
      } else {
        r = Core.createRecord(record || {});
      }
      this._data.records.push(r);
      await this.save();
      return r;
    }
    async updateRecord(id, updates) {
      const Core = _getCore();
      if (!this._data) await this.load();
      const idx = this._data.records.findIndex(function (r) { return r.id === id; });
      if (idx === -1) return null;
      const next = Core.updateRecord(this._data.records[idx], updates);
      this._data.records[idx] = next;
      await this.save();
      return next;
    }
    async deleteRecord(id) {
      if (!this._data) await this.load();
      const before = this._data.records.length;
      this._data.records = this._data.records.filter(function (r) { return r.id !== id; });
      const removed = this._data.records.length !== before;
      if (removed) await this.save();
      return removed;
    }
    /**
     * 批量导入记录。
     * @param {ExpenseRecord[]} newRecords
     * @param {"merge"|"replace"} mode
     * @param {object} [opts]
     * @param {string} [opts.dedupeBy]  "dedupe"|"compareKey"|"none"
     *   仅在 merge 模式下生效；指定后会对 newRecords 与现有记录做业务键去重，
     *   重复的直接丢弃（不更新不新增）。不指定则走原 merge 行为（按 id 合并）。
     */
    async importRecords(newRecords, mode, opts) {
      const Core = _getCore();
      if (!this._data) await this.load();
      if (!Array.isArray(newRecords)) throw new Error("importRecords: 必须传入数组");
      const m = mode === "replace" ? "replace" : "merge";

      // 去重路径：用 previewImport 选出真正要新增的，再走 merge 流程
      if (m === "merge" && opts && opts.dedupeBy && opts.dedupeBy !== "none") {
        const preview = Core.previewImport(newRecords, this._data, { dedupeBy: opts.dedupeBy });
        // 把要更新的也带进去（merge 会按 id 选新版本）
        const effective = preview.toAdd.concat(preview.toUpdate);
        const fakeAppData = Core.createEmptyAppData();
        fakeAppData.version = this._data.version;
        fakeAppData.categories = this._data.categories.slice();
        fakeAppData.records = effective;
        const json = Core.exportJSON(fakeAppData);
        this._data = Core.importJSON(json, "merge", this._data);
        await this.save();
        return this._data;
      }

      // 默认路径（保留原行为）
      const fakeAppData = Core.createEmptyAppData();
      fakeAppData.version = this._data.version;
      fakeAppData.categories = this._data.categories.slice();
      fakeAppData.records = newRecords.slice();
      const json = Core.exportJSON(fakeAppData);
      const merged = Core.importJSON(json, m, this._data);
      this._data = merged;
      await this.save();
      return this._data;
    }
    async replaceData(newData) {
      const Core = _getCore();
      // 做一次规范化导入，保证结构正确
      const json = Core.exportJSON(newData);
      this._data = Core.importJSON(json, "replace");
      await this.save();
    }
    // 仅 zen-fs-config 后端有效
    getSyncStatuses() {
      return this.backend.getSyncStatuses ? this.backend.getSyncStatuses() : new Map();
    }
    listConflicts() {
      return this.backend.listConflicts ? this.backend.listConflicts() : Promise.resolve([]);
    }
  }

  // ============================================================
  // 工厂函数
  // ============================================================
  async function create(options) {
    const opts = options || {};
    if (!opts.appId) throw new Error("ExpenseStore.create: 必填 appId");
    const backendName = opts.backend || "local";
    let backend;
    if (backendName === "zen-fs-config") {
      backend = new ZenFsConfigAdapter(opts.appId, opts.zenfsOptions || {});
      await backend.init();
    } else if (backendName === "local") {
      backend = new LocalStorageAdapter(opts.appId);
    } else {
      throw new Error("ExpenseStore.create: 未知 backend: " + backendName + "，可选: 'local' | 'zen-fs-config'");
    }
    const store = new Store({ appId: opts.appId, backend: backend });
    // 不自动 load，让用户显式调用（首次使用会创建空结构）
    return store;
  }

  return {
    create: create,
    LocalStorageAdapter: LocalStorageAdapter,
    ZenFsConfigAdapter: ZenFsConfigAdapter,
    Store: Store
  };
}));
