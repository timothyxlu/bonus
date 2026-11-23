/**
 * All UI strings live here. To add English, add an `en` dictionary with the same
 * keys and switch `locale`.
 */
const zhCN = {
  appName: "Bonus",
  tagline: "信用卡 · 开户奖励 · 福利追踪",

  "nav.dashboard": "概览",
  "nav.accounts": "账户",
  "nav.benefits": "福利",
  "nav.eligibility": "资格检查",
  "nav.settings": "设置",

  "common.save": "保存",
  "common.cancel": "取消",
  "common.delete": "删除",
  "common.edit": "编辑",
  "common.add": "添加",
  "common.close": "关闭",
  "common.loading": "加载中…",
  "common.none": "暂无",
  "common.search": "搜索…",
  "common.all": "全部",
  "common.confirmDelete": "确定删除？此操作不可撤销。",
  "common.optional": "可选",
  "common.days": "{n} 天",
  "common.error": "出错了：{msg}",
  "common.today": "今天",

  "kind.credit_card": "信用卡",
  "kind.bank_account": "银行账户",
  "kind.gift_card": "礼品卡",
  "ownerType.personal": "个人",
  "ownerType.business": "商业",
  "status.pending": "审批中",
  "status.open": "使用中",
  "status.closed": "已关闭",
  "status.denied": "被拒",

  "event.applied": "申请",
  "event.approved": "批准",
  "event.denied": "被拒",
  "event.product_change": "转卡 (PC)",
  "event.downgrade": "降级",
  "event.upgrade": "升级",
  "event.closed": "关卡",
  "event.bonus_earned": "奖励到账",
  "event.note": "备注",

  "req.spend": "消费",
  "req.direct_deposit": "直接存款",
  "req.balance": "存款余额",
  "req.other": "其他",
  "unit.points": "积分",
  "unit.miles": "里程",
  "unit.USD": "美元",
  "bonusStatus.in_progress": "进行中",
  "bonusStatus.met": "已达标",
  "bonusStatus.posted": "已到账",
  "bonusStatus.failed": "未完成",
  "bonusStatus.cancelled": "已取消",
  "period.monthly": "每月",
  "period.quarterly": "每季度",
  "period.semiannual": "每半年",
  "period.annual": "每年（自然年）",
  "period.cardmember_year": "每卡年（周年）",

  "dash.five24": "Chase 5/24",
  "dash.five24.sub": "过去 24 个月新开个人卡",
  "dash.five24.under": "低于 5/24，可申请 Chase",
  "dash.five24.over": "已达 5/24，{date} 回到 4/24",
  "dash.nextDrop": "下次减少：{date}",
  "dash.noDrop": "暂无即将掉出的卡",
  "dash.deadlines": "即将到期的开卡奖励",
  "dash.noDeadlines": "没有进行中的奖励",
  "dash.unused": "本期未用福利",
  "dash.noUnused": "本期福利都已用完 🎉",
  "dash.openAccounts": "使用中账户",
  "dash.total": "共 {n} 个账户（含已关闭）",
  "dash.annualFees": "年费合计",
  "dash.activeBonuses": "进行中奖励",
  "dash.counted": "计入 5/24 的卡",
  "dash.dropsOn": "{date} 掉出",
  "dash.unknownDates": "{n} 张卡缺少开卡日期，计数可能偏低",

  "acct.title": "账户",
  "acct.new": "新增账户",
  "acct.edit": "编辑账户",
  "acct.empty": "还没有账户。点击“新增账户”或在设置中导入。",
  "acct.col.name": "卡片",
  "acct.col.issuer": "发卡行",
  "acct.col.last4": "尾号",
  "acct.col.status": "状态",
  "acct.col.opened": "开卡日期",
  "acct.col.fee": "年费",
  "acct.col.bonus": "奖励进度",
  "acct.col.benefits": "未用福利",
  "acct.product": "产品",
  "acct.productPlaceholder": "选择产品…",
  "acct.customProduct": "不在列表中（仅选发卡机构）",
  "acct.institution": "发卡机构",
  "acct.nickname": "昵称",
  "acct.last4": "卡号后四位",
  "acct.last4Hint": "只保存后四位，切勿输入完整卡号",
  "acct.ownerType": "类型",
  "acct.status": "状态",
  "acct.appliedAt": "申请日期",
  "acct.openedAt": "开卡日期",
  "acct.closedAt": "关卡日期",
  "acct.au": "附属卡 (AU)",
  "acct.notes": "备注",
  "acct.select": "选择左侧账户查看详情",
  "acct.annualFee": "年费 ${n}",
  "acct.currency": "积分体系",

  "detail.timeline": "时间线",
  "detail.bonuses": "开卡奖励",
  "detail.benefits": "福利",
  "detail.addEvent": "记录事件",
  "detail.addBonus": "添加奖励",
  "detail.addBenefit": "添加福利",
  "detail.noEvents": "暂无事件",
  "detail.noBonuses": "暂无奖励",
  "detail.noBenefits": "暂无福利",
  "detail.markUsed": "标记已用",
  "detail.used": "本期已用 ${used} / ${amount}",
  "detail.periodEnds": "{date} 重置",
  "detail.progress": "进度",
  "detail.updateProgress": "更新进度",
  "detail.daysLeft": "剩 {n} 天",
  "detail.overdue": "已过期 {n} 天",
  "detail.deadline": "截止日期",
  "detail.toProduct": "转为产品",

  "bonus.description": "描述",
  "bonus.requirementType": "要求类型",
  "bonus.amountRequired": "要求金额 ($)",
  "bonus.progress": "当前进度 ($)",
  "bonus.deadline": "截止日期",
  "bonus.rewardAmount": "奖励数量",
  "bonus.rewardUnit": "单位",
  "bonus.status": "状态",
  "bonus.earnedAt": "到账日期",

  "benefit.name": "名称",
  "benefit.amount": "金额 ($)",
  "benefit.period": "周期",
  "benefit.resetRule": "重置规则",
  "benefit.title": "福利",
  "benefit.unusedOnly": "只看未用",
  "benefit.empty": "没有福利",
  "benefit.useAmount": "使用金额",

  "event.type": "事件类型",
  "event.date": "日期",
  "event.note.label": "备注",

  "elig.title": "资格检查",
  "elig.product": "选择产品",
  "elig.asOf": "日期",
  "elig.countAU": "附属卡计入 5/24",
  "elig.precise": "精确日期（不按月取整）",
  "elig.check": "检查",
  "elig.overview": "所有产品一览",
  "elig.status.eligible": "可以申请",
  "elig.status.blocked": "暂不符合",
  "elig.status.uncertain": "不确定",
  "elig.eligibleFrom": "最早 {date} 可申请",
  "elig.noDate": "需先关闭/转换现有卡，无固定日期",
  "elig.reasons": "规则说明",

  "settings.title": "设置",
  "settings.me": "当前用户",
  "settings.import": "导入历史",
  "settings.importHint": "上传 JSON 或 CSV（格式见 docs/IMPORT.md）。真实数据只通过这里导入，不会进入 Git。",
  "settings.dryRun": "预览（不写入）",
  "settings.doImport": "导入",
  "settings.importResult": "新增 {created}，跳过 {skipped}，错误 {errors}",
  "settings.catalog": "产品目录",
  "settings.syncCatalog": "同步内置目录",
  "settings.synced": "已同步 {n} 个产品",
  "settings.customProduct": "新增自定义产品",
  "settings.productName": "产品名称",
  "settings.family": "产品系列（规则用）",
  "settings.mcp": "MCP 连接",
  "settings.mcpHint": "在 Claude.ai 或 Claude Code 中添加远程 MCP 服务器：",
  "settings.language": "语言",
} as const;

export type MessageKey = keyof typeof zhCN;
const dictionaries: Record<string, Partial<Record<MessageKey, string>>> = { "zh-CN": zhCN };
let locale = "zh-CN";

export function setLocale(l: string) {
  if (dictionaries[l]) locale = l;
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = dictionaries[locale]?.[key] ?? zhCN[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

/** Has a translation for a dynamic key (e.g. `event.${type}`). */
export function td(key: string, params?: Record<string, string | number>): string {
  return key in zhCN ? t(key as MessageKey, params) : key;
}

/** Chinese explanations for rule-engine reasons, keyed by rule id. Falls back to the English message. */
const ruleText: Record<string, (p: Record<string, string | number>, outcome: string) => string> = {
  chase_5_24: (p, o) =>
    o === "block" ? `Chase 5/24：过去 24 个月新开 ${p.count} 张个人卡（需少于 5 张）。${p.eligibleFrom} 降到 4/24。` : `Chase 5/24：目前 ${p.count}/24。`,
  missing_open_dates: (p) => `${p.count} 张已开卡片没有开卡日期，5/24 计数可能偏低。`,
  chase_sapphire_holding: (p) => `Chase Sapphire：你目前持有 ${p.cards}。需先关卡或转为非 Sapphire 系列。`,
  chase_sapphire_48: (p) => `Chase Sapphire：${p.lastBonus} 拿过 Sapphire 开卡奖励，48 个月内不能再拿，${p.eligibleFrom} 起可申请。`,
  chase_sapphire: () => "Chase Sapphire：未持有 Sapphire，且 48 个月内未拿过 Sapphire 奖励。",
  chase_popup: () => "Chase 可能在申请时弹窗提示不发奖励，请仔细阅读后再确认。",
  current_holder: (p) => `你目前持有该产品（${p.cards}），现有持卡人通常不能拿开卡奖励。`,
  bonus_cooldown: (p, o) =>
    o === "block"
      ? `${p.months} 个月奖励规则（${p.scope === "family" ? "按系列" : "按产品"}）：上次奖励 ${p.lastBonus}，${p.eligibleFrom} 起可再拿。`
      : o === "uncertain"
        ? `${p.months} 个月奖励规则：${p.cards} 在窗口内开卡但没有奖励记录。如已拿奖励，请记录“奖励到账”事件。`
        : `${p.months} 个月奖励规则：窗口内没有拿过奖励。`,
  citi_48: (p, o) =>
    o === "block"
      ? `Citi 48 个月规则（${p.scope === "family" ? "按系列" : "按产品"}）：上次奖励 ${p.lastBonus}，${p.eligibleFrom} 起可再拿。`
      : o === "uncertain"
        ? `Citi 48 个月规则：${p.cards} 在 48 个月内开卡但没有奖励记录，无法确定。`
        : "Citi 48 个月规则：48 个月内没有拿过该产品奖励。",
  amex_lifetime: (p, o) => (o === "block" ? `Amex 终身一次：你以前持有过该卡（${p.cards}），通常不能再拿开卡奖励。` : "Amex 终身一次 / 家族规则：没有相关历史。"),
  amex_family: (p) => `Amex 家族规则：你持有过同系列同级或更高级的卡（${p.cards}），该卡奖励不可用。`,
  amex_popup: () => "Amex 仍可能弹窗提示不符合奖励资格；弹窗时可取消申请，不会查询信用。",
  amex_credit_limit: (p, o) =>
    o === "block" ? `Amex 信用卡上限：已持有 ${p.count} 张 Amex 信用卡（不含签账卡），上限约 5 张，需先关一张。` : `Amex 信用卡上限：已持有 ${p.count}/5 张。`,
  amex_1_5: (p) => `Amex 1/5：5 天内已批一张 Amex 信用卡，${p.eligibleFrom} 后再申请。`,
  amex_2_90: (p) => `Amex 2/90：90 天内已批 ${p.count} 张 Amex 信用卡，${p.eligibleFrom} 后再申请。`,
  citi_1_8: (p, o) => (o === "block" ? `Citi 1/8：8 天内已申请过 Citi 卡，${p.eligibleFrom} 后再申请。` : "Citi 1/8：8 天内没有申请 Citi 卡。"),
  citi_2_65: (p, o) => (o === "block" ? `Citi 2/65：65 天内已申请 ${p.count} 张 Citi 个人卡，${p.eligibleFrom} 后再申请。` : `Citi 2/65：65 天内申请了 ${p.count} 张。`),
  boa_2_3_4: (p, o) => (o === "block" ? `BoA 2/3/4：过去 ${p.months} 个月已开 ${p.count} 张 BoA 卡（上限 ${Number(p.limit) - 1}），${p.eligibleFrom} 后再申请。` : `BoA 2/3/4：${p.counts}。`),
  barclays_6_24: (p, o) =>
    o === "block"
      ? `Barclays 6/24：过去 24 个月新开 ${p.count} 个账户（超过 6），${p.eligibleFrom} 回到 6。`
      : o === "uncertain"
        ? "Barclays 6/24：正好 6 个新账户，处于边缘。"
        : `Barclays 6/24：过去 24 个月新开 ${p.count} 个账户。`,
  no_rules: (p) => `尚未为 ${p.issuer} 建立规则，请自行查看条款。`,
};

export function ruleMessage(r: { rule: string; outcome: string; message: string; params?: Record<string, string | number> }) {
  const fn = ruleText[r.rule];
  return fn ? fn(r.params ?? {}, r.outcome) : r.message;
}
