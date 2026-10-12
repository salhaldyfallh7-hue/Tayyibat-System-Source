/* Tayyibat System engine v2.0 — pure scoring and progression rules. */
(function (root) {
  "use strict";
  const CATEGORY_WEIGHTS = Object.freeze({ worship: 20, study: 40, rest: 20, essential: 10, entertainment: 10 });
  const RANKS = Object.freeze([
    { code: "E", label: "مبتدئ", mark: "◇", color: "#94a3b8", desc: "بداية الطريق؛ ركّز على عادة صغيرة قابلة للاستمرار." },
    { code: "D", label: "متدرّب", mark: "◈", color: "#60a5fa", desc: "تتدرّب على بناء إيقاع يومي واقعي." },
    { code: "C", label: "مقاتل", mark: "✦", color: "#38bdf8", desc: "بدأت تحوّل الخطط إلى إنجازات ملموسة." },
    { code: "B", label: "متمرس", mark: "⬟", color: "#34d399", desc: "أداء متزن مع عودة واعية بعد التأجيل." },
    { code: "A", label: "خبير", mark: "✧", color: "#a78bfa", desc: "انضباط قوي وتوازن متقدم بين الأولويات." },
    { code: "S", label: "نخبة", mark: "◆", color: "#818cf8", desc: "إنجاز مرتفع مدعوم باستمرارية واضحة." },
    { code: "SS", label: "نخبة متقدمة", mark: "❖", color: "#c084fc", desc: "أداء استثنائي مع جودة في المهام المهمة." },
    { code: "SSS", label: "أسطورة", mark: "✹", color: "#f0abfc", desc: "أسبوع متميز؛ حافظ على الإيقاع دون إنهاك." },
    { code: "SSS+", label: "أسطورة عليا", mark: "✺", color: "#fbbf24", desc: "ندرة حقيقية: أداء شبه كامل واستمرارية." },
    { code: "MONARCH", label: "الحاكم", mark: "♛", color: "#fde68a", desc: "قمة النظام؛ تُكتسب باستدامة الأداء العالي عبر أسابيع." }
  ]);
  const DEFAULT_RULES = Object.freeze({
    version: 1,
    componentWeights: { completion: 50, priority: 20, consistency: 20, recovery: 10 },
    categoryWeights: { ...CATEGORY_WEIGHTS },
    thresholds: [0, 25, 40, 55, 68, 78, 86, 92, 96, 98]
  });
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
  const parseDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : "";
  const effort = (t) => clamp(t.difficulty || 1, 1, 3) * ({ high: 1.5, low: 0.8 }[t.priority] || 1);
  function localDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function weekStart(date) {
    const d = new Date(`${date}T12:00:00`);
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return localDate(d);
  }
  function addDays(date, amount) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + amount);
    return localDate(d);
  }
  function categoryCompletion(tasks, categoryWeights = CATEGORY_WEIGHTS) {
    let score = 0;
    const byCategory = {};
    for (const [cat, weight] of Object.entries(categoryWeights)) {
      const rows = tasks.filter(t => t.cat === cat);
      const planned = rows.reduce((n, t) => n + effort(t), 0);
      const completed = rows.filter(t => t.done).reduce((n, t) => n + effort(t), 0);
      const ratio = planned ? completed / planned : 0;
      byCategory[cat] = { planned: rows.length, completed: rows.filter(t => t.done).length, ratio: Math.round(ratio * 100), points: Math.round(ratio * weight * 100) / 100 };
      score += ratio * weight;
    }
    return { score: Math.round(score * 100) / 100, byCategory };
  }
  function scoreWeek(allTasks, start, end, rules = DEFAULT_RULES) {
    const weekRows = (allTasks || []).filter(t => {
      const d = parseDate(t.date);
      return d && d >= start && d <= end && t.status !== "cancelled" && !t.cancelled;
    });
    const tasks = weekRows.filter(t => !t.notRequired);
    const category = categoryCompletion(tasks, rules.categoryWeights || CATEGORY_WEIGHTS);
    const high = tasks.filter(t => t.priority === "high");
    const highDone = high.filter(t => t.done).length;
    const priorityRatio = high.length ? highDone / high.length : 0;
    const byDay = new Map();
    for (const t of tasks) {
      if (!byDay.has(t.date)) byDay.set(t.date, []);
      byDay.get(t.date).push(t);
    }
    const activeDays = byDay.size;
    const successfulDays = [...byDay.values()].filter(day => {
      const planned = day.reduce((n, t) => n + effort(t), 0);
      const done = day.filter(t => t.done).reduce((n, t) => n + effort(t), 0);
      return planned > 0 && done / planned >= 0.7;
    }).length;
    // Days without tracked tasks are missing data, not an automatic failure.
    // High ranks still require multiple successful days through explicit rank gates.
    const consistencyRatio = activeDays ? successfulDays / activeDays : 0;
    const deferred = weekRows.filter(t => !t.cancelled && t.status !== "cancelled" && (t.accumulated || t.carried || t.rescheduled || (t.deferCount || 0) > 0));
    // A clean backlog can earn review credit only after a real task completion;
    // merely opening the app (or seeing its generated checklist) earns nothing.
    const recoveryRatio = deferred.length
      ? deferred.filter(t => t.done || t.rescheduled).length / deferred.length
      : (tasks.some(t => t.done) ? 1 : 0);
    const w = rules.componentWeights || DEFAULT_RULES.componentWeights;
    const parts = {
      completion: Math.round(category.score * w.completion) / 100,
      priority: Math.round(priorityRatio * w.priority * 100) / 100,
      consistency: Math.round(consistencyRatio * w.consistency * 100) / 100,
      recovery: Math.round(recoveryRatio * w.recovery * 100) / 100
    };
    const points = Math.round(Object.values(parts).reduce((a, b) => a + b, 0) * 100) / 100;
    return {
      start, end, points, completionPercent: category.score, parts,
      required: tasks.length, completed: tasks.filter(t => t.done).length,
      overdue: tasks.filter(t => !t.done && (t.accumulated || t.carried || (t.deferCount || 0) > 0) && !t.rescheduled).length,
      highRequired: high.length, highCompleted: highDone, activeDays, successfulDays,
      category: category.byCategory, recoveryRatio: Math.round(recoveryRatio * 100)
    };
  }
  function rankFor(evaluation, history = [], rules = DEFAULT_RULES) {
    const thresholds = rules.thresholds || DEFAULT_RULES.thresholds;
    let idx = 0;
    thresholds.forEach((min, i) => { if (evaluation.points >= min) idx = i; });
    if (evaluation.successfulDays < 3) idx = Math.min(idx, 1);
    if (idx >= 5 && (evaluation.successfulDays < 5 || evaluation.completionPercent < 70 || evaluation.highRequired < 1)) idx = 4;
    if (idx >= 6 && (evaluation.successfulDays < 6 || evaluation.highRequired < 1 || evaluation.highCompleted / evaluation.highRequired < 0.7)) idx = 5;
    if (idx >= 7 && (evaluation.successfulDays < 6 || evaluation.points < 92)) idx = 6;
    if (idx >= 8 && (evaluation.successfulDays < 6 || evaluation.points < 96)) idx = 7;
    if (idx >= 9) {
      const qualifyingPast = history.filter(r => r.points >= 96 && (r.rankIndex || 0) >= 8).length;
      if (evaluation.successfulDays < 7 || evaluation.points < 98 || qualifyingPast < 3) idx = 8;
    }
    return clamp(idx, 0, RANKS.length - 1);
  }
  function dailyPercent(tasks, categoryWeights = CATEGORY_WEIGHTS) {
    return categoryCompletion(tasks.filter(t => !t.cancelled && !t.notRequired && t.status !== "cancelled"), categoryWeights).score;
  }
  function adaptation(tasks, today, level) {
    const start = addDays(today, -13);
    const days = new Map();
    tasks.filter(t => t.date >= start && t.date <= today && !t.cancelled && t.status !== "cancelled").forEach(t => {
      if (!days.has(t.date)) days.set(t.date, []);
      days.get(t.date).push(t);
    });
    const ratios = [...days.values()].map(d => {
      const planned = d.reduce((n, t) => n + effort(t), 0);
      return planned ? Math.round(d.filter(t => t.done).reduce((n, t) => n + effort(t), 0) / planned * 100) : 0;
    });
    const avg = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
    const strong = ratios.filter(v => v >= 70).length;
    let next = clamp(level || 1, 1, 5);
    let reason = "حافظ على خطوات صغيرة قابلة للاستمرار.";
    if (strong >= 8 && avg >= 75 && next < 5) { next++; reason = "أداء مستقر خلال أسبوعين؛ زد التحدي خطوة واحدة فقط."; }
    else if ((strong <= 2 || (ratios.length >= 5 && avg < 25)) && next > 1) { next--; reason = "خفّف النظام الحمل المقترح مؤقتًا لتسهيل العودة."; }
    return { level: next, avg: Math.round(avg), successfulDays: strong, activeDays: ratios.length, reason };
  }
  function rankProgress(index, points, rules = DEFAULT_RULES) {
    const thresholds = rules.thresholds || DEFAULT_RULES.thresholds;
    const next = Math.min(index + 1, RANKS.length - 1);
    const currentMin = thresholds[index] || 0;
    const nextMin = thresholds[next] || 100;
    return { nextIndex: next, percent: index === RANKS.length - 1 ? 100 : clamp(((points - currentMin) / Math.max(1, nextMin - currentMin)) * 100, 0, 100), pointsNeeded: Math.max(0, nextMin - points) };
  }
  function xpForTask(task) {
    return Math.round(clamp(task.difficulty || 1, 1, 3) * 10 + (task.priority === "high" ? 5 : 0));
  }
  root.TayyibatEngine = Object.freeze({ CATEGORY_WEIGHTS, RANKS, DEFAULT_RULES, weekStart, addDays, scoreWeek, rankFor, dailyPercent, adaptation, rankProgress, xpForTask });
})(window);
