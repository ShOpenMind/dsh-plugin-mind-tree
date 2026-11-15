// 成本估算层单测:高峰/空闲判定、单价折算、格式化、整树聚合。
import { isPeakHour, costOf, priceOf, formatCny, costOfTree, sumCost, MODEL_PRICES } from '../lib/pricing.js';

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}${detail === undefined ? '' : ` → ${detail}`}`);
  }
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---- 构造北京时间基准:先找到一个周一 00:00 (UTC 周日 16:00)----
const base = new Date(Date.UTC(2026, 0, 5)); // 2026-01-05
while (base.getUTCDay() !== 1) base.setUTCDate(base.getUTCDate() + 1);
// 周一 10:00 北京时间 = 周一 02:00 UTC
const mondayPeak = base.getTime() + 2 * 3600 * 1000;
const mondayMidnight = base.getTime() - 16 * 3600 * 1000; // 周一 00:00 北京时间
const saturdayNoon = base.getTime() + (5 * 24 + 4) * 3600 * 1000; // 周六 12:00 北京时间

console.log('[pricing-test] 时段判定');
check('周一 10:00(北京)算高峰', isPeakHour(mondayPeak) === true, String(isPeakHour(mondayPeak)));
check('周一 00:00(北京)算空闲', isPeakHour(mondayMidnight) === false, String(isPeakHour(mondayMidnight)));
check('周六 12:00(北京)算空闲', isPeakHour(saturdayNoon) === false, String(isPeakHour(saturdayNoon)));
check('周一 12:00 之后(13:00)算空闲', isPeakHour(mondayPeak + 3 * 3600 * 1000) === false);
check('周一 14:00 又回到高峰', isPeakHour(mondayPeak + 4 * 3600 * 1000) === true);

console.log('[pricing-test] 单价折算');
// flash 空闲:未命中输入 1 元/百万,输出 4 元/百万,命中 0.02 元/百万
const off = costOf({ input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 }, 'deepseek-flash', mondayMidnight);
check('flash 空闲:100 万输入 + 100 万输出 = ¥5', near(off.cny, 5), String(off.cny));
const peak = costOf({ input: 1_000_000, output: 1_000_000 }, 'deepseek-flash', mondayPeak);
check('flash 高峰:同样 token = ¥10(翻倍)', near(peak.cny, 10), String(peak.cny));
check('高峰标记正确', peak.peak === true && off.peak === false);
const cacheOnly = costOf({ cacheRead: 1_000_000 }, 'deepseek-flash', mondayMidnight);
check('命中缓存按 0.02 元/百万计', near(cacheOnly.cny, 0.02), String(cacheOnly.cny));
const pro = costOf({ input: 1_000_000 }, 'deepseek-v4-pro', mondayMidnight);
check('pro 空闲输入 = ¥4.5', near(pro.cny, 4.5), String(pro.cny));
const unknown = costOf({ input: 1_000_000 }, 'some-other-model', mondayMidnight);
check('未知模型按兜底价并标记 known=false', unknown.known === false && near(unknown.cny, 1), JSON.stringify(unknown));
check('缓存写入按未命中输入计费', near(costOf({ cacheWrite: 1_000_000 }, 'deepseek-flash', mondayMidnight).cny, 1));
check('空 usage 成本为 0', costOf({}, 'deepseek-flash', mondayMidnight).cny === 0);

console.log('[pricing-test] 价格表与格式化');
check('价格表含 flash 与 pro', Boolean(MODEL_PRICES['deepseek-flash'] && MODEL_PRICES['deepseek-v4-pro']));
check('priceOf 返回三元组', ['hit', 'miss', 'out'].every((k) => typeof priceOf('deepseek-flash', mondayPeak)[k] === 'number'));
check('formatCny 0 → ¥0', formatCny(0) === '¥0');
check('formatCny 极小 → <¥0.01', formatCny(0.0001) === '<¥0.01');
check('formatCny 小数 → 三位', formatCny(0.1234) === '¥0.123', formatCny(0.1234));
check('formatCny 大数 → 两位', formatCny(12.345) === '¥12.35', formatCny(12.345));

console.log('[pricing-test] 整树聚合');
const tree = {
  nodes: [
    { id: 't1', kind: 'turn', usage: { input: 1_000_000, output: 0, total: 1_000_000, model: 'deepseek-flash', startedAt: mondayMidnight } },
    { id: 't2', kind: 'turn', usage: { input: 0, output: 1_000_000, total: 1_000_000, model: 'deepseek-flash', startedAt: mondayPeak } },
    { id: 'x', kind: 'assistant', label: '不应计入' },
  ],
};
const total = costOfTree(tree);
check('两轮合计 = ¥1 + ¥8 = ¥9', near(total.cny, 9), String(total.cny));
check('全部已知模型时不标记近似', total.anyUnknown === false);
check('sumCost 汇总未知模型会标记', sumCost([{ cny: 1, known: true }, { cny: 1, known: false }]).anyUnknown === true);

console.log(failures === 0 ? '[pricing-test] 全部通过' : `[pricing-test] ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
