# Expense Tracker Core

> 纯数据结构 + 比价逻辑的 JS 库，零依赖，可嵌入任意 SPA / 单页 HTML / PWA / Electron / WebView。
>
> 设计原则：**无 UI、无框架依赖、数据优先、比价逻辑内建、ID 稳定、支持增量导入**。

## 快速开始

```html
<!-- 引入核心库（必须） -->
<script src="expense-core.js"></script>

<!-- 引入存储层（可选，零配置 localStorage / zen-fs-config 双适配） -->
<script src="expense-store.js"></script>

<!-- 引入图表层（可选，纯 SVG 渲染） -->
<script src="expense-ui.js"></script>

<script>
  // 创建一条花销记录
  const record = ExpenseCore.createRecord({
    date: "2026-07-31",
    itemName: "纯牛奶",
    brand: "特仑苏",
    specification: "250ml*12",
    merchant: "盒马",
    unitPrice: 3.5,
    quantity: 2,
    categoryId: "cat_grocery"
  });

  // 比价：找最低价
  const lowest = ExpenseCore.getLowestPrice(allRecords, "纯牛奶", "250ml*12");

  // 按分类汇总
  const summary = ExpenseCore.sumByCategory(allRecords);
</script>
```

## 目录结构

| 文件 | 引入方式 | 说明 |
|------|----------|------|
| `expense-core.js` | 必须 | 纯数据 + 逻辑（无 DOM，零依赖） |
| `expense-store.js` | 可选 | 存储适配层（localStorage 默认 / zen-fs-config 可选） |
| `expense-ui.js` | 可选 | 纯 SVG 图表渲染（饼图 / 柱状图 / 比价表） |
| `index.html` | 示例 | 示范单页应用，展示所有 API 用法 |
| `test-expense-core.js` | Node | 核心库单元测试（Node 可直接运行） |

---

## 一、核心数据模型

### 1.1 ExpenseRecord（花销记录）

```typescript
interface ExpenseRecord {
  id: string;                    // UUID v4
  date: string;                  // ISO 8601，如 "2026-07-31"
  itemName: string;              // 商品名称（比价聚合 Key）
  categoryId: string;            // 关联 Category.id
  quantity: number;              // 数量
  unit: string;                  // 单位：个 / 瓶 / kg / 件 / 盒 ...
  unitPrice: number;             // 单价（不含税）
  totalPrice: number;            // 总价 = quantity × unitPrice
  currency: string;              // ISO 4217，默认 "CNY"
  merchant: string;              // 商家 / 渠道（比价核心字段）
  brand?: string;                // 品牌（增强比价）
  specification?: string;        // 规格：如 "250ml" "500g"（比价核心字段）
  paymentMethod?:                // 支付方式
    | "cash" | "wechat" | "alipay"
    | "credit_card" | "debit_card" | "other";
  location?: string;             // 消费地点（城市 / 商圈）
  note?: string;                 // 备注
  tags?: string[];               // 标签，如 ["囤货", "促销", "临期"]
  receiptUrl?: string;           // 小票图片 URL / base64
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

**比价聚合 Key（推荐）：**
```
`${itemName}|${brand || ""}|${specification || ""}`
```

### 1.2 Category（分类）

```typescript
interface Category {
  id: string;                    // 稳定 ID（见下方预置分类）
  name: string;                  // 分类名称
  icon: string;                  // Emoji 图标
  color: string;                 // CSS 颜色值（用于图表）
  parentId?: string;             // 父分类 ID（支持二级分类）
  monthlyBudget?: number;        // 月度预算（可选）
}
```

**预置分类 ID（稳定，不建议修改）：**

| ID | 名称 | 图标 |
|----|------|------|
| `cat_food` | 餐饮美食 | 🍜 |
| `cat_grocery` | 日常买菜 | 🥬 |
| `cat_transport` | 交通出行 | 🚗 |
| `cat_shopping` | 购物消费 | 🛍️ |
| `cat_housing` | 住房物业 | 🏠 |
| `cat_utilities` | 水电燃气 | 💡 |
| `cat_health` | 医疗健康 | 💊 |
| `cat_education` | 教育培训 | 📚 |
| `cat_entertainment` | 休闲娱乐 | 🎮 |
| `cat_travel` | 旅行度假 | ✈️ |
| `cat_subscription` | 订阅服务 | 📱 |
| `cat_office` | 办公用品 | 🖨️ |
| `cat_gift` | 人情礼物 | 🎁 |
| `cat_other` | 其他 | 📦 |

访问方式：`ExpenseCore.PRESET_CATEGORIES`

### 1.3 AppData（根数据结构）

```typescript
interface AppData {
  version: "1.0";
  records: ExpenseRecord[];
  categories: Category[];
  meta: {
    lastExportAt: string;        // ISO 8601
    currency: string;            // 默认货币，默认 "CNY"
  };
}
```

这是 JSON / CSV / Excel 导入导出的**统一根结构**。

---

## 二、expense-core.js — API 参考

### 2.1 常量

| 名称 | 类型 | 说明 |
|------|------|------|
| `ExpenseCore.VERSION` | `string` | 库版本号，如 `"1.0.0"` |
| `ExpenseCore.PRESET_CATEGORIES` | `Category[]` | 14 个预置分类 |
| `ExpenseCore.DEFAULT_CURRENCY` | `string` | 默认货币 `"CNY"` |

### 2.2 数据构造

#### `ExpenseCore.createEmptyAppData(currency?)` → `AppData`

创建空的 AppData 骨架，categories 已预置 14 个分类。

```js
const data = ExpenseCore.createEmptyAppData();
// 或指定货币
const data = ExpenseCore.createEmptyAppData("USD");
```

#### `ExpenseCore.createRecord(partial)` → `ExpenseRecord`

生成完整记录，自动补：`id`(UUID)、`createdAt`、`updatedAt`、`totalPrice`=qty×unitPrice、`currency`(默认 CNY)、`unit`(默认 "个")。

```js
const r = ExpenseCore.createRecord({
  date: "2026-07-31",
  itemName: "纯牛奶",
  categoryId: "cat_grocery",
  unitPrice: 3.5,
  quantity: 2,
  merchant: "盒马",
  brand: "特仑苏",
  specification: "250ml*12"
});
// r.totalPrice === 7.0
// r.id 自动生成 UUID
```

#### `ExpenseCore.updateRecord(record, updates)` → `ExpenseRecord`

返回新对象，自动刷新 `updatedAt`。如果修改了 quantity 或 unitPrice 会重新计算 totalPrice。

```js
const updated = ExpenseCore.updateRecord(r, { quantity: 3, merchant: "京东" });
```

### 2.3 校验

#### `ExpenseCore.validateRecord(record)` → `string[]`

校验必填字段（id, date, itemName, categoryId, quantity, unitPrice, totalPrice, currency, merchant），返回错误信息数组。空数组表示校验通过。

```js
const errors = ExpenseCore.validateRecord(record);
if (errors.length) console.error(errors);
```

### 2.4 比价聚合

#### `ExpenseCore.buildCompareIndex(records)` → `{ [compareKey]: ExpenseRecord[] }`

按 `itemName|brand|specification` 聚合所有购买记录。

```js
const index = ExpenseCore.buildCompareIndex(data.records);
console.log(index["纯牛奶|特仑苏|250ml*12"]);  // 该商品的所有购买记录
```

#### `ExpenseCore.getLowestPrice(records, itemName, specification?)` → `ExpenseRecord | null`

找某商品的**最低价**记录（按 unitPrice 比较）。

```js
const best = ExpenseCore.getLowestPrice(data.records, "纯牛奶", "250ml*12");
// best.unitPrice 是该商品历史最低单价
```

### 2.5 汇总统计

#### `ExpenseCore.sumByCategory(records, categories?)` → `CategorySummary[]`

按分类汇总金额，返回带分类名称/图标/颜色的结构化数据（UI 直接用）。

```js
const summary = ExpenseCore.sumByCategory(data.records, data.categories);
// [{ id: "cat_food", name: "餐饮美食", icon: "🍜", color: "#ef4444", total: 1234.5 }, ...]
```

#### `ExpenseCore.sumByMonth(records, year?)` → `MonthSummary[]`

按月汇总（默认当前年份）。

```js
const monthly = ExpenseCore.sumByMonth(data.records, 2026);
// [{ month: "2026-01", total: 0 }, ..., { month: "2026-07", total: 850 }]
```

### 2.6 筛选查询

#### `ExpenseCore.filterByDateRange(records, startDate, endDate)` → `ExpenseRecord[]`

按日期区间过滤（闭区间，ISO 8601 日期字符串）。

```js
const jul = ExpenseCore.filterByDateRange(
  data.records, "2026-07-01", "2026-07-31"
);
```

#### `ExpenseCore.getRecordsByCategory(records, categoryId)` → `ExpenseRecord[]`

获取指定分类下的全部记录。

### 2.7 导入导出

#### `ExpenseCore.exportJSON(data)` → `string`

将 AppData 序列化为格式化 JSON，自动更新 `meta.lastExportAt`。

#### `ExpenseCore.importJSON(jsonString, mode, existingAppData?)` → `AppData`

- **mode = `"replace"`**：直接用新 JSON 覆盖（用于纯恢复场景）
- **mode = `"merge"`**：按 `id` 合并 records/categories，以新数据 `updatedAt` 较新者为准

```js
// 从备份恢复
const backup = JSON.stringify(data);
const restored = ExpenseCore.importJSON(backup, "replace");

// 增量导入（把另一份数据合并进来）
const merged = ExpenseCore.importJSON(anotherJson, "merge", currentData);
```

### 2.8 CSV 转换

#### CSV 格式约定

```
date,itemName,categoryId,quantity,unit,unitPrice,totalPrice,currency,merchant,brand,specification,note,tags
2026-07-31,纯牛奶,cat_grocery,2,盒,3.5,7.0,CNY,盒马,特仑苏,250ml*12,促销,囤货|临期
```

- `categoryId` 用 ID，不用中文
- `tags` 用 `|` 分隔
- 空字段留空

#### `ExpenseCore.csvToRecords(csvText)` → `ExpenseRecord[]`

CSV → 记录数组（核心字段）。自动为每条记录生成 `id/createdAt/updatedAt`。

#### `ExpenseCore.recordsToCSV(records)` → `string`

记录数组 → CSV 文本。

---

## 三、expense-store.js — 存储适配层（可选）

零配置启动，内置双后端：**localStorage**（默认，零依赖）和 **zen-fs-config**（启用后自动切换，支持 IndexedDB + 多端同步）。

### 3.1 快速使用

```html
<!-- 先引 expense-core.js，再引 expense-store.js -->
<script src="expense-core.js"></script>
<script src="expense-store.js"></script>
<script>
  const store = await ExpenseStore.create({ appId: "my-expense-app" });
  const data = await store.load();          // 从存储加载 AppData
  await store.addRecord(record);            // 追加记录并自动保存
  await store.updateRecord(id, updates);    // 更新记录
  await store.deleteRecord(id);             // 删除记录
  await store.importRecords(records, "merge");  // 批量导入
  await store.save();                       // 手动触发保存
</script>
```

### 3.2 完整 API

#### `ExpenseStore.create(options)` → `Promise<Store>`

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `appId` | `string` | 必填 | 应用唯一标识，用于存储键隔离 |
| `backend` | `"local" \| "zen-fs-config"` | `"local"` | 存储后端选择 |
| `zenfsOptions` | `object` | `{}` | zen-fs-config 的额外配置（如 `backendInfo` 用于远程同步） |

**启用 zen-fs-config（支持 IndexedDB + Gitee/GitHub 同步）：**

```js
// 先通过 CDN 引入 zen-fs-config 相关依赖
const store = await ExpenseStore.create({
  appId: "my-expense-app",
  backend: "zen-fs-config",
  zenfsOptions: {
    // 可选：指定远程仓库作为同步后端
    backendInfo: {
      type: "gitee",
      options: { owner: "your-name", repo: "expense-sync", token: "xxx" }
    }
  }
});
```

#### Store 实例方法

| 方法 | 返回 | 说明 |
|------|------|------|
| `store.load()` | `Promise<AppData>` | 从存储加载数据，首次会创建空 AppData |
| `store.save()` | `Promise<void>` | 手动保存到存储（add/update/delete/import 会自动调用） |
| `store.getData()` | `AppData` | 获取内存中的当前数据（只读引用前请拷贝） |
| `store.addRecord(record)` | `Promise<ExpenseRecord>` | 追加记录并保存 |
| `store.updateRecord(id, updates)` | `Promise<ExpenseRecord \| null>` | 按 ID 更新并保存 |
| `store.deleteRecord(id)` | `Promise<boolean>` | 按 ID 删除并保存 |
| `store.importRecords(newRecords, mode)` | `Promise<AppData>` | 批量导入，mode=`merge`/`replace` |
| `store.replaceData(newData)` | `Promise<void>` | 整体替换 AppData 并保存 |

---

## 四、expense-ui.js — 图表层（可选）

纯 SVG 绘制，零外部库。所有渲染函数接受一个**选择器字符串**（挂载点）。

### 4.1 API

#### `ExpenseUI.renderPieChart(selector, summary, options?)`

渲染分类饼图，带图例和百分比标签。

```js
const summary = ExpenseCore.sumByCategory(data.records, data.categories);
ExpenseUI.renderPieChart("#pie-chart", summary, {
  width: 400,       // 默认 400
  height: 300,      // 默认 300
  title: "分类占比" // 可选标题
});
```

#### `ExpenseUI.renderBarChart(selector, monthlyData, options?)`

渲染月度趋势柱状图，带数值标注。

```js
const monthly = ExpenseCore.sumByMonth(data.records, 2026);
ExpenseUI.renderBarChart("#bar-chart", monthly, {
  width: 600,
  height: 240,
  title: "2026 月度支出",
  barColor: "#6366f1"
});
```

#### `ExpenseUI.renderCompareTable(selector, compareRecords, options?)`

渲染比价对比表，最低价记录整行绿色高亮，展示差价百分比。

```js
const records = ExpenseCore.buildCompareIndex(data.records)["纯牛奶|特仑苏|250ml*12"] || [];
ExpenseUI.renderCompareTable("#compare-table", records, {
  unitLabel: "元/盒"
});
```

---

## 五、AI 常见集成模式

### 5.1 React / Vue SPA 集成

```js
// React: 自定义 Hook
import { useEffect, useState } from "react";
import ExpenseCore from "./expense-core.js";

export function useExpenseData() {
  const [data, setData] = useState(() => ExpenseCore.createEmptyAppData());
  useEffect(() => {
    const saved = localStorage.getItem("expense-data");
    if (saved) setData(ExpenseCore.importJSON(saved, "replace"));
  }, []);
  const addRecord = (partial) => {
    const r = ExpenseCore.createRecord(partial);
    const next = { ...data, records: [...data.records, r] };
    localStorage.setItem("expense-data", ExpenseCore.exportJSON(next));
    setData(next);
  };
  return { data, addRecord };
}
```

### 5.2 接 IndexedDB（原生，不用 zen-fs-config）

```js
const db = await idb.openDB("expense", 1, {
  upgrade(db) { db.createObjectStore("records", { keyPath: "id" }); }
});
// 写入：db.put("records", record)
// 读出：db.getAll("records") 然后用 ExpenseCore 做汇总
```

### 5.3 扩展自定义分类

```js
const myCategory = {
  id: "cat_baby",
  name: "母婴用品",
  icon: "🍼",
  color: "#ec4899"
};
const data = ExpenseCore.createEmptyAppData();
data.categories.push(myCategory);
```

---

## 六、测试

```bash
# 使用 Node 直接运行测试（无额外依赖）
node test-expense-core.js
```

测试覆盖：构造函数、校验、比价索引、分类汇总、JSON 导入导出（merge/replace）、CSV 双向转换等核心场景。

## License

MIT
