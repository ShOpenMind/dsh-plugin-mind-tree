// 成本估算层:把 token 消耗折算成人民币。
// 单价来源:DeepSeek 官方「模型 & 价格」页(抓取于 2026-11-15),单位:元 / 百万 tokens。
// 高峰时段:北京时间 周一至周五(不含法定节假日)9:00–12:00、14:00–18:00;其余为**空闲时段**,价格减半。
// 说明:法定节假日无法从本地推断,此处只按"工作日 + 时段"近似。
//
// 纯函数、无依赖,客户端(界面显示)与宿主(mind_tree 工具)共用。

/** 单价表版本标记(改了数字就更新它,便于界面/文档追溯)。 */
export const PRICING_VERSION = '2026-11-15';

/**
 * 每百万 token 单价(元)。每个字段是 [空闲时段, 高峰时段]。
 * hit = 缓存命中输入;miss = 缓存未命中输入;out = 输出。
 */
export const MODEL_PRICES = {
  'deepseek-flash': { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
  'deepseek-v4-flash': { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
  'deepseek-v4-flash-vision-exp': { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
  'deepseek-v4-pro': { hit: [0.15, 0.3], miss: [4.5, 9], out: [13.5, 27] },
};

/** 未知模型时的兜底单价(按 flash 计,界面用 ≈ 标注)。 */
export const FALLBACK_PRICE = MODEL_PRICES['deepseek-flash'];

const BJ_OFFSET_MS = 8 * 3600 * 1000;

/** 是否处于高峰时段(按北京时间近似判断,忽略法定节假日)。 */
export function isPeakHour(atMs) {
  const at = typeof atMs === 'number' && Number.isFinite(atMs) ? atMs : Date.now();
  const shifted = new Date(at + BJ_OFFSET_MS);
  const day = shifted.getUTCDay(); // 0=周日 … 6=周六
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const weekday = day >= 1 && day <= 5;
  const inMorning = minutes >= 9 * 60 && minutes < 12 * 60;
  const inAfternoon = minutes >= 14 * 60 && minutes < 18 * 60;
  return weekday && (inMorning || inAfternoon);
}

/** 取某个模型在某时段的单价三元组。 */
export function priceOf(model, atMs) {
  const table = MODEL_PRICES[model] ?? FALLBACK_PRICE;
  const slot = isPeakHour(atMs) ? 1 : 0;
  return {
    model: MODEL_PRICES[model] ? model : null,
    peak: slot === 1,
    hit: table.hit[slot],
    miss: table.miss[slot],
    out: table.out[slot],
  };
}

/**
 * 一次 token 消耗折算成元。
 * @param usage - { input, output, cacheRead, cacheWrite }(单位 token;input 为**未命中缓存**部分)
 * @param model - 模型 id,如 deepseek-v4-pro;未知模型按兜底价并标记 known=false
 * @param atMs  - 该次调用时间(毫秒),用于判断高峰/空闲;缺省按当前时间
 * @returns { cny, peak, model, known }
 */
export function costOf(usage, model, atMs) {
  const input = Math.max(0, Number(usage?.input) || 0);
  const output = Math.max(0, Number(usage?.output) || 0);
  const cacheRead = Math.max(0, Number(usage?.cacheRead) || 0);
  const cacheWrite = Math.max(0, Number(usage?.cacheWrite) || 0);
  const price = priceOf(model, atMs);
  // 缓存写入按"未命中输入"计费;缓存读取按"命中输入"计费。
  const cny = ((input + cacheWrite) * price.miss + cacheRead * price.hit + output * price.out) / 1_000_000;
  return { cny, peak: price.peak, model: price.model, known: price.model !== null };
}

/** 汇总多份成本。 */
export function sumCost(entries) {
  let cny = 0;
  let anyUnknown = false;
  for (const entry of entries ?? []) {
    if (!entry) continue;
    cny += Number(entry.cny) || 0;
    if (entry.known === false) anyUnknown = true;
  }
  return { cny, anyUnknown };
}

/** 人民币显示:小于 1 分显示 <¥0.01,其余两位小数。 */
export function formatCny(value) {
  const cny = Number(value) || 0;
  if (cny <= 0) return '¥0';
  if (cny < 0.005) return '<¥0.01';
  if (cny < 1) return `¥${cny.toFixed(3)}`;
  return `¥${cny.toFixed(2)}`;
}

/** 从整棵树聚合成本(按轮 usage + 模型)。 */
export function costOfTree(tree) {
  const entries = [];
  for (const node of tree?.nodes ?? []) {
    if (node?.kind !== 'turn' || !node.usage) continue;
    entries.push(costOf(node.usage, node.usage.model, node.usage.startedAt));
  }
  return sumCost(entries);
}
