/**
 * expense-core.js 单元测试
 * 运行方式：node test-expense-core.js
 * 无外部依赖，使用 Node 内置 assert。
 */
"use strict";
const assert = require("assert");
const ExpenseCore = require("./expense-core.js");

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    failures.push({ name, error: e });
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}
function eq(a, b, msg) { assert.deepStrictEqual(a, b, msg); }
function ok(cond, msg) { assert.ok(cond, msg); }

console.log("\n📦 ExpenseCore v" + ExpenseCore.VERSION);
console.log("========================================================");

// ---------- 1. 常量 ----------
console.log("\n1. 常量");
test("VERSION 是字符串", () => {
  ok(typeof ExpenseCore.VERSION === "string" && ExpenseCore.VERSION.length > 0);
});
test("PRESET_CATEGORIES 有 14 个预置分类", () => {
  eq(ExpenseCore.PRESET_CATEGORIES.length, 14);
});
test("预置分类 ID 完整稳定", () => {
  const ids = ExpenseCore.PRESET_CATEGORIES.map(c => c.id);
  const expected = [
    "cat_food","cat_grocery","cat_transport","cat_shopping",
    "cat_housing","cat_utilities","cat_health","cat_education",
    "cat_entertainment","cat_travel","cat_subscription","cat_office",
    "cat_gift","cat_other"
  ];
  eq(ids, expected);
});
test("预置分类字段齐全", () => {
  for (const c of ExpenseCore.PRESET_CATEGORIES) {
    ok(c.id && c.name && c.icon && c.color, `分类 ${c.id} 字段缺失`);
  }
});
test("DEFAULT_CURRENCY === 'CNY'", () => {
  eq(ExpenseCore.DEFAULT_CURRENCY, "CNY");
});

// ---------- 2. 数据构造 ----------
console.log("\n2. 数据构造");
test("createEmptyAppData() 返回完整骨架", () => {
  const d = ExpenseCore.createEmptyAppData();
  eq(d.version, "1.0");
  eq(d.records.length, 0);
  eq(d.categories.length, 14);
  eq(d.meta.currency, "CNY");
  ok(typeof d.meta.lastExportAt === "string");
});
test("createEmptyAppData('USD') 自定义货币", () => {
  const d = ExpenseCore.createEmptyAppData("USD");
  eq(d.meta.currency, "USD");
});
test("createRecord() 自动补全字段", () => {
  const r = ExpenseCore.createRecord({
    date: "2026-07-31",
    itemName: "纯牛奶",
    categoryId: "cat_grocery",
    merchant: "盒马",
    unitPrice: 3.5,
    quantity: 2
  });
  // 必填字段都存在
  ["id","date","itemName","categoryId","quantity","unit","unitPrice",
    "totalPrice","currency","merchant","createdAt","updatedAt"].forEach(f => {
      ok(r[f] !== undefined && r[f] !== null && r[f] !== "", `缺少字段: ${f}`);
    });
  ok(/^[0-9a-f-]{36}$/i.test(r.id), "ID 应该是 UUID v4");
  eq(r.totalPrice, 7.0);
  eq(r.currency, "CNY");
  eq(r.unit, "个");
  ok(r.createdAt && r.updatedAt);
});
test("createRecord() totalPrice 优先用用户显式传入值", () => {
  const r = ExpenseCore.createRecord({
    date: "2026-01-01", itemName: "X", categoryId: "cat_other",
    merchant: "M", unitPrice: 10, quantity: 3, totalPrice: 25 // 折扣价
  });
  eq(r.totalPrice, 25);
});
test("createRecord() tags 保持数组", () => {
  const r = ExpenseCore.createRecord({
    date: "2026-01-01", itemName: "X", categoryId: "cat_other",
    merchant: "M", unitPrice: 1, quantity: 1, tags: ["促销", "临期"]
  });
  eq(r.tags, ["促销", "临期"]);
});
test("updateRecord() 刷新 updatedAt + 重算总价", () => {
  const r = ExpenseCore.createRecord({
    date: "2026-01-01", itemName: "X", categoryId: "cat_other",
    merchant: "M", unitPrice: 10, quantity: 2
  });
  const oldUpd = r.updatedAt;
  // 稍等一会保证时间戳不同
  const r2 = ExpenseCore.updateRecord(r, { quantity: 3, merchant: "京东" });
  eq(r2.quantity, 3);
  eq(r2.merchant, "京东");
  eq(r2.unitPrice, 10);
  eq(r2.totalPrice, 30);
  // updatedAt 应该更晚
  ok(new Date(r2.updatedAt).getTime() >= new Date(oldUpd).getTime());
});
test("updateRecord() 显式传 totalPrice 不被重算覆盖", () => {
  const r = ExpenseCore.createRecord({
    date: "2026-01-01", itemName: "X", categoryId: "cat_other",
    merchant: "M", unitPrice: 10, quantity: 2
  });
  const r2 = ExpenseCore.updateRecord(r, { quantity: 4, totalPrice: 35 });
  eq(r2.totalPrice, 35);
});

// ---------- 3. 校验 ----------
console.log("\n3. 校验");
test("validateRecord() 通过完整记录", () => {
  const r = ExpenseCore.createRecord({
    date: "2026-07-31", itemName: "X", categoryId: "cat_other",
    merchant: "M", unitPrice: 1, quantity: 1
  });
  eq(ExpenseCore.validateRecord(r).length, 0);
});
test("validateRecord() 检测缺失必填字段", () => {
  const errors = ExpenseCore.validateRecord({ itemName: "X" });
  ok(errors.length > 0);
  ok(errors.some(e => e.includes("date")), `应检测缺失 date，实际: ${errors}`);
  ok(errors.some(e => e.includes("merchant")), `应检测缺失 merchant`);
});
test("validateRecord() 检测非法 paymentMethod", () => {
  const r = ExpenseCore.createRecord({
    date: "2026-01-01", itemName: "X", categoryId: "cat_other",
    merchant: "M", unitPrice: 1, quantity: 1
  });
  r.paymentMethod = "bad_value";
  const errs = ExpenseCore.validateRecord(r);
  ok(errs.some(e => e.includes("paymentMethod")));
});
test("validateRecord() 检测 totalPrice 不匹配", () => {
  const r = ExpenseCore.createRecord({
    date: "2026-01-01", itemName: "X", categoryId: "cat_other",
    merchant: "M", unitPrice: 10, quantity: 3, totalPrice: 9999
  });
  const errs = ExpenseCore.validateRecord(r);
  ok(errs.some(e => e.includes("totalPrice")), "总价与乘积不匹配应被检测到");
});
test("validateRecord() 检测非对象", () => {
  ok(ExpenseCore.validateRecord(null).length > 0);
  ok(ExpenseCore.validateRecord("string").length > 0);
});

// ---------- 4. 比价 ----------
console.log("\n4. 比价聚合");
test("buildCompareIndex 按 itemName|brand|specification 分组", () => {
  const records = [
    ExpenseCore.createRecord({
      date:"2026-06-01", itemName:"纯牛奶", brand:"特仑苏", specification:"250ml",
      categoryId:"cat_grocery", merchant:"盒马", unitPrice:3.5, quantity:1
    }),
    ExpenseCore.createRecord({
      date:"2026-07-01", itemName:"纯牛奶", brand:"特仑苏", specification:"250ml",
      categoryId:"cat_grocery", merchant:"京东", unitPrice:3.2, quantity:2
    }),
    ExpenseCore.createRecord({
      date:"2026-07-05", itemName:"纯牛奶", brand:"蒙牛", specification:"250ml",
      categoryId:"cat_grocery", merchant:"盒马", unitPrice:3.0, quantity:1
    })
  ];
  const idx = ExpenseCore.buildCompareIndex(records);
  eq(idx["纯牛奶|特仑苏|250ml"].length, 2);
  eq(idx["纯牛奶|蒙牛|250ml"].length, 1);
});
test("getLowestPrice 找到最低价", () => {
  const records = [
    ExpenseCore.createRecord({
      date:"2026-06-01", itemName:"纯牛奶", specification:"250ml",
      categoryId:"cat_grocery", merchant:"盒马", unitPrice:3.5, quantity:1
    }),
    ExpenseCore.createRecord({
      date:"2026-07-01", itemName:"纯牛奶", specification:"250ml",
      categoryId:"cat_grocery", merchant:"京东", unitPrice:3.2, quantity:2
    }),
    ExpenseCore.createRecord({
      date:"2026-07-05", itemName:"纯牛奶", specification:"1L",
      categoryId:"cat_grocery", merchant:"盒马", unitPrice:8, quantity:1
    })
  ];
  const best = ExpenseCore.getLowestPrice(records, "纯牛奶", "250ml");
  ok(best, "应能找到 250ml 规格最低价");
  eq(best.unitPrice, 3.2);
  eq(best.merchant, "京东");
});
test("getLowestPrice 空数据返回 null", () => {
  eq(ExpenseCore.getLowestPrice([], "X"), null);
  eq(ExpenseCore.getLowestPrice(null, "X"), null);
});
test("getLowestPrice 不匹配规格返回 null", () => {
  const records = [ExpenseCore.createRecord({
    date:"2026-01-01", itemName:"A", specification:"1kg",
    categoryId:"cat_other", merchant:"M", unitPrice:1, quantity:1
  })];
  eq(ExpenseCore.getLowestPrice(records, "A", "2kg"), null);
});

// ---------- 5. 汇总统计 ----------
console.log("\n5. 汇总统计");
test("sumByCategory 按分类汇总 + 返回结构化数据", () => {
  const data = ExpenseCore.createEmptyAppData();
  data.records.push(
    ExpenseCore.createRecord({
      date:"2026-01-01", itemName:"A", categoryId:"cat_food",
      merchant:"M", unitPrice:50, quantity:1
    }),
    ExpenseCore.createRecord({
      date:"2026-01-02", itemName:"B", categoryId:"cat_food",
      merchant:"M", unitPrice:25, quantity:2  // total 50
    }),
    ExpenseCore.createRecord({
      date:"2026-01-03", itemName:"C", categoryId:"cat_transport",
      merchant:"M", unitPrice:10, quantity:3  // total 30
    })
  );
  const summary = ExpenseCore.sumByCategory(data.records, data.categories);
  // 找到餐饮和交通
  const food = summary.find(s => s.id === "cat_food");
  const trans = summary.find(s => s.id === "cat_transport");
  eq(food.total, 100);
  eq(food.name, "餐饮美食");
  eq(food.icon, "🍜");
  eq(trans.total, 30);
});
test("sumByCategory 不传 categories 退化为 {cid: total}", () => {
  const records = [
    ExpenseCore.createRecord({
      date:"2026-01-01", itemName:"A", categoryId:"cat_food",
      merchant:"M", unitPrice:10, quantity:1
    })
  ];
  const out = ExpenseCore.sumByCategory(records);
  eq(out.cat_food, 10);
});
test("sumByMonth 输出 12 个月，空月为 0", () => {
  const records = [
    ExpenseCore.createRecord({
      date:"2026-01-05", itemName:"A", categoryId:"cat_food",
      merchant:"M", unitPrice:10, quantity:1
    }),
    ExpenseCore.createRecord({
      date:"2026-07-15", itemName:"B", categoryId:"cat_food",
      merchant:"M", unitPrice:100, quantity:1
    })
  ];
  const m = ExpenseCore.sumByMonth(records, 2026);
  eq(m.length, 12);
  eq(m[0].month, "2026-01");
  eq(m[0].total, 10);
  eq(m[6].total, 100);  // 7月 index=6
  eq(m[11].total, 0);   // 12月
});

// ---------- 6. 筛选 ----------
console.log("\n6. 筛选查询");
test("filterByDateRange 闭区间", () => {
  const records = ["2026-06-30","2026-07-01","2026-07-15","2026-07-31","2026-08-01"].map(d =>
    ExpenseCore.createRecord({
      date:d, itemName:"X", categoryId:"cat_other",
      merchant:"M", unitPrice:1, quantity:1
    })
  );
  const j = ExpenseCore.filterByDateRange(records, "2026-07-01", "2026-07-31");
  eq(j.length, 3);
  eq(j[0].date, "2026-07-01");
  eq(j[2].date, "2026-07-31");
});
test("filterByDateRange 单边", () => {
  const records = ["2026-01-01","2026-06-01","2026-12-31"].map(d =>
    ExpenseCore.createRecord({
      date:d, itemName:"X", categoryId:"cat_other",
      merchant:"M", unitPrice:1, quantity:1
    })
  );
  const r1 = ExpenseCore.filterByDateRange(records, "2026-06-01", "");
  eq(r1.length, 2);
  const r2 = ExpenseCore.filterByDateRange(records, "", "2026-06-01");
  eq(r2.length, 2);
});
test("getRecordsByCategory", () => {
  const records = [
    ExpenseCore.createRecord({
      date:"2026-01-01", itemName:"A", categoryId:"cat_food",
      merchant:"M", unitPrice:1, quantity:1
    }),
    ExpenseCore.createRecord({
      date:"2026-01-01", itemName:"B", categoryId:"cat_transport",
      merchant:"M", unitPrice:1, quantity:1
    })
  ];
  eq(ExpenseCore.getRecordsByCategory(records, "cat_food").length, 1);
  eq(ExpenseCore.getRecordsByCategory(records, "cat_xxx").length, 0);
});

// ---------- 7. JSON 导入导出 ----------
console.log("\n7. JSON 导入导出");
test("exportJSON 返回格式化字符串 + 更新 lastExportAt", () => {
  const data = ExpenseCore.createEmptyAppData();
  data.records.push(ExpenseCore.createRecord({
    date:"2026-01-01", itemName:"X", categoryId:"cat_other",
    merchant:"M", unitPrice:10, quantity:1
  }));
  const before = data.meta.lastExportAt;
  const json = ExpenseCore.exportJSON(data);
  const parsed = JSON.parse(json);
  ok(parsed.records.length === 1);
  ok(parsed.meta.lastExportAt >= before);
});
test("importJSON replace 模式", () => {
  const a = ExpenseCore.createEmptyAppData();
  a.records.push(ExpenseCore.createRecord({
    date:"2026-01-01", itemName:"A", categoryId:"cat_food",
    merchant:"M", unitPrice:1, quantity:1, id:"R-1"
  }));
  const b = ExpenseCore.createEmptyAppData();
  b.records.push(ExpenseCore.createRecord({
    date:"2026-01-02", itemName:"B", categoryId:"cat_food",
    merchant:"M", unitPrice:2, quantity:1, id:"R-2"
  }));
  const json = ExpenseCore.exportJSON(b);
  const replaced = ExpenseCore.importJSON(json, "replace", a);
  eq(replaced.records.length, 1);
  eq(replaced.records[0].id, "R-2");
});
test("importJSON merge 模式按 updatedAt 选择新版本", () => {
  const oldRec = ExpenseCore.createRecord({
    date:"2026-01-01", itemName:"OLD", categoryId:"cat_food",
    merchant:"M", unitPrice:1, quantity:1, id:"R-1"
  });
  oldRec.updatedAt = "2026-01-01T00:00:00.000Z";
  const a = ExpenseCore.createEmptyAppData();
  a.records.push(oldRec);

  const newRec = ExpenseCore.createRecord({
    date:"2026-01-01", itemName:"NEW", categoryId:"cat_food",
    merchant:"M", unitPrice:99, quantity:1, id:"R-1"  // 同 ID
  });
  newRec.updatedAt = "2026-07-01T00:00:00.000Z";
  const b = ExpenseCore.createEmptyAppData();
  b.records.push(newRec);

  const merged = ExpenseCore.importJSON(ExpenseCore.exportJSON(b), "merge", a);
  eq(merged.records.length, 1);
  eq(merged.records[0].itemName, "NEW");
  eq(merged.records[0].unitPrice, 99);
});
test("importJSON merge 保留双方不冲突记录", () => {
  const a = ExpenseCore.createEmptyAppData();
  a.records.push(ExpenseCore.createRecord({
    date:"2026-01-01", itemName:"A", categoryId:"cat_food",
    merchant:"M", unitPrice:1, quantity:1, id:"R-A"
  }));
  const b = ExpenseCore.createEmptyAppData();
  b.records.push(ExpenseCore.createRecord({
    date:"2026-01-02", itemName:"B", categoryId:"cat_food",
    merchant:"M", unitPrice:2, quantity:1, id:"R-B"
  }));
  const m = ExpenseCore.importJSON(ExpenseCore.exportJSON(b), "merge", a);
  eq(m.records.length, 2);
});
test("importJSON 非法 JSON 抛错", () => {
  let threw = false;
  try { ExpenseCore.importJSON("{not valid json", "replace"); }
  catch (e) { threw = true; }
  ok(threw, "非法 JSON 应抛错");
});
test("importJSON 对损坏的入参做规范化", () => {
  // 传入一个缺少 categories 的对象字符串 → 应该补全预置分类
  const json = JSON.stringify({ version: "1.0", records: [], meta: {} });
  const out = ExpenseCore.importJSON(json, "replace");
  eq(out.categories.length, 14);
  eq(out.records.length, 0);
  eq(out.version, "1.0");
});

// ---------- 8. CSV ----------
console.log("\n8. CSV 双向转换");
test("recordsToCSV 输出带 BOM 友好的表头", () => {
  const records = [
    ExpenseCore.createRecord({
      date:"2026-07-31", itemName:"纯牛奶", categoryId:"cat_grocery",
      quantity:2, unit:"盒", unitPrice:3.5, totalPrice:7, currency:"CNY",
      merchant:"盒马", brand:"特仑苏", specification:"250ml*12",
      note:"促销", tags:["囤货","临期"]
    })
  ];
  const csv = ExpenseCore.recordsToCSV(records);
  const lines = csv.split("\n");
  eq(lines[0], "date,itemName,categoryId,quantity,unit,unitPrice,totalPrice,currency,merchant,brand,specification,note,tags");
  // 第二行: tags 使用 | 分隔
  ok(lines[1].includes("囤货|临期"), `tags 应该用 | 分隔: ${lines[1]}`);
  ok(lines[1].includes("cat_grocery"), `categoryId 应该是 ID，不是中文: ${lines[1]}`);
});
test("csvToRecords 解析并补全字段", () => {
  const csv = `date,itemName,categoryId,quantity,unit,unitPrice,totalPrice,currency,merchant,brand,specification,note,tags
2026-07-31,纯牛奶,cat_grocery,2,盒,3.5,7.0,CNY,盒马,特仑苏,250ml*12,促销,囤货|临期`;
  const records = ExpenseCore.csvToRecords(csv);
  eq(records.length, 1);
  const r = records[0];
  eq(r.itemName, "纯牛奶");
  eq(r.brand, "特仑苏");
  eq(r.specification, "250ml*12");
  eq(r.categoryId, "cat_grocery");
  eq(r.merchant, "盒马");
  eq(r.unitPrice, 3.5);
  eq(r.quantity, 2);
  eq(r.unit, "盒");
  eq(r.tags, ["囤货", "临期"]);
  ok(r.id && /^[0-9a-f-]{36}$/i.test(r.id), "CSV 解析应自动补 UUID");
  ok(r.createdAt && r.updatedAt, "CSV 解析应自动补时间戳");
});
test("CSV 空记录和空数组", () => {
  eq(ExpenseCore.recordsToCSV([]), "date,itemName,categoryId,quantity,unit,unitPrice,totalPrice,currency,merchant,brand,specification,note,tags");
  eq(ExpenseCore.csvToRecords("").length, 0);
});
test("CSV 含逗号 / 引号字段双向", () => {
  const records = [ExpenseCore.createRecord({
    date:"2026-01-01", itemName:'带"引号",逗号', categoryId:"cat_other",
    merchant:"M", unitPrice:1, quantity:1, note:'笔记,"重要"'
  })];
  const csv = ExpenseCore.recordsToCSV(records);
  const back = ExpenseCore.csvToRecords(csv);
  eq(back.length, 1);
  eq(back[0].itemName, '带"引号",逗号');
  eq(back[0].note, '笔记,"重要"');
});
test("CSV → records → CSV 往返（去掉动态字段后等价）", () => {
  const original = [
    ExpenseCore.createRecord({
      date:"2026-06-01", itemName:"牛奶", categoryId:"cat_grocery",
      merchant:"盒马", brand:"A", specification:"500ml",
      unitPrice:5, quantity:2, totalPrice:10, unit:"瓶",
      note:"测试", tags:["T1","T2"]
    })
  ];
  const csv = ExpenseCore.recordsToCSV(original);
  const parsed = ExpenseCore.csvToRecords(csv);
  eq(parsed.length, 1);
  const p = parsed[0];
  eq(p.date, original[0].date);
  eq(p.itemName, original[0].itemName);
  eq(p.categoryId, original[0].categoryId);
  eq(p.quantity, original[0].quantity);
  eq(p.unit, original[0].unit);
  eq(p.unitPrice, original[0].unitPrice);
  eq(p.totalPrice, original[0].totalPrice);
  eq(p.merchant, original[0].merchant);
  eq(p.brand, original[0].brand);
  eq(p.specification, original[0].specification);
  eq(p.note, original[0].note);
  eq(p.tags, original[0].tags);
});

// ---------- 结果汇总 ----------
console.log("\n========================================================");
console.log(`📊 ${pass} 通过 · ${fail} 失败`);
if (fail > 0) {
  console.log("\n失败明细:");
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error.message}`));
  process.exit(1);
} else {
  console.log("🎉 所有测试通过！\n");
  process.exit(0);
}
