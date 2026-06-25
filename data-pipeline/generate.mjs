// 매일 1회 실행: 공개 API로 오늘 값을 가져와
//  (1) 어제 낸 문제의 정답을 확정하고
//  (2) 오늘의 새 문제를 만들어
//  site/today.json 으로 출력한다. 상태는 data-pipeline/state.json 에 보존.
//
// 모델: 매 실행(날짜 T)마다
//   - 어제(pendingDate) 문제 채점: 비교형은 O(T) vs 저장된 base, 날씨는 강수량(T) > 0
//   - 오늘(T) 문제 생성 + base = O(T) 저장
// 모두 키 없는 무료 API 사용.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const STATE_PATH = "data-pipeline/state.json";
const OUT_PATH = "site/today.json";

const kstToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD

/* ─────────────  공개 API (키 불필요)  ───────────── */
async function fetchExchangeUSDKRW() {
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=KRW");
    const j = await r.json();
    return j?.rates?.KRW ?? null;
  } catch (e) { console.warn("환율 fetch 실패", e); return null; }
}

async function fetchKospi() {
  try {
    const r = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?interval=1d&range=1d",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const j = await r.json();
    return j?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch (e) { console.warn("코스피 fetch 실패", e); return null; }
}

async function fetchSeoulPrecip() {
  try {
    const r = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978" +
      "&daily=precipitation_sum&timezone=Asia%2FSeoul&forecast_days=1"
    );
    const j = await r.json();
    return j?.daily?.precipitation_sum?.[0] ?? null; // 오늘 강수량(mm)
  } catch (e) { console.warn("날씨 fetch 실패", e); return null; }
}

/* ─────────────  종목 정의  ───────────── */
// kind: "compare" = 오늘값 > 어제 base ? up : down / "rain" = 강수량 > 0
const TOPICS = [
  { id: "exchange", emoji: "💵", topic: "환율", kind: "compare",
    q: "내일 원/달러 환율, 오를까?", options: ["오른다", "내린다"], fetch: fetchExchangeUSDKRW },
  { id: "kospi", emoji: "📈", topic: "코스피", kind: "compare",
    q: "내일 코스피, 오를까?", options: ["오른다", "내린다"], fetch: fetchKospi },
  { id: "weather", emoji: "🌧️", topic: "날씨", kind: "rain",
    q: "내일 수도권에 비가 올까?", options: ["온다", "안 온다"], fetch: fetchSeoulPrecip },
];

function resolveAnswer(topic, current, base) {
  if (current == null) return null;
  if (topic.kind === "compare") {
    if (base == null) return null;
    return current > base ? topic.options[0] : topic.options[1]; // 오른다 / 내린다
  }
  if (topic.kind === "rain") {
    return current > 0 ? topic.options[0] : topic.options[1]; // 온다 / 안 온다
  }
  return null;
}

async function readJSON(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

async function writeJSON(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(obj, null, 2) + "\n");
}

/* ─────────────  메인  ───────────── */
async function main() {
  const state = await readJSON(STATE_PATH, { pendingDate: null, base: {} });

  // 1) 오늘 값 수집
  const current = {};
  for (const t of TOPICS) current[t.id] = await t.fetch();

  // 2) 어제 문제 채점 → answers (정답이 나온 종목만)
  let answers = null;
  if (state.pendingDate) {
    answers = { date: state.pendingDate };
    for (const t of TOPICS) {
      const a = resolveAnswer(t, current[t.id], state.base?.[t.id]);
      if (a != null) answers[t.id] = a;
    }
  }

  // 3) 오늘 문제 생성 (값을 가져온 종목만)
  const questions = TOPICS
    .filter((t) => current[t.id] != null)
    .map((t) => ({ id: t.id, emoji: t.emoji, topic: t.topic, q: t.q, options: t.options }));

  // 4) 상태 갱신: 비교형은 오늘 값을 내일 채점용 base로 저장
  const newBase = {};
  for (const t of TOPICS) if (t.kind === "compare" && current[t.id] != null) newBase[t.id] = current[t.id];

  await writeJSON(OUT_PATH, { date: kstToday, questions, answers });
  await writeJSON(STATE_PATH, { pendingDate: kstToday, base: newBase, lastValues: current });

  console.log("생성 완료:", kstToday);
  console.log("  현재값:", current);
  console.log("  어제 정답:", answers);
  console.log("  오늘 문제 수:", questions.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
