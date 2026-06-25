import { DATA_URL, LOCAL_DATA_URL, AD_IDS, POINTS_PER_CORRECT, PERFECT_BONUS } from "./config.js";
import { getJSON, setJSON, submitScore, openLeaderboard, showFullScreenAd, attachBanner } from "./sdk.js";

/* ─────────────  데이터 로드  ───────────── */
async function loadData() {
  const sim = new URLSearchParams(location.search).get("sim"); // ?sim=tomorrow → 다음날 미리보기
  const sources = sim === "tomorrow" ? ["/tomorrow.json"] : [DATA_URL, LOCAL_DATA_URL];
  for (const url of sources) {
    try { const res = await fetch(url, { cache: "no-store" }); if (res.ok) return await res.json(); }
    catch (_) {}
  }
  throw new Error("데이터를 불러오지 못했어요.");
}

/* ─────────────  프로필 / 채점  ───────────── */
const DEFAULT_PROFILE = {
  totalScore: 0, currentStreak: 0, maxStreak: 0,
  correctCount: 0, totalCount: 0, byTopic: {}, lastScoredDate: null, lastResult: null,
};
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

async function scoreYesterday(data, profile) {
  const ans = data.answers;
  if (!ans || !ans.date) return null;
  const bet = await getJSON("bet:" + ans.date);
  if (!bet || bet.scored) return null;

  const confirmedMap = bet.confirmed || null;
  let correct = 0, total = 0, gain = 0;
  for (const [qid, choice] of Object.entries(bet.answers)) {
    if (confirmedMap && !confirmedMap[qid]) continue;
    if (ans[qid] == null) continue;
    total++;
    const t = profile.byTopic[qid] || { correct: 0, total: 0 };
    t.total++;
    if (choice === ans[qid]) { correct++; gain += POINTS_PER_CORRECT; t.correct++; }
    profile.byTopic[qid] = t;
  }
  if (total === 0) return null;

  const resolvedCount = Object.keys(ans).length - 1;
  const perfect = correct === total && total === resolvedCount && resolvedCount >= 2;
  const bonus = perfect ? PERFECT_BONUS : 0;
  gain += bonus;

  profile.totalScore += gain;
  profile.correctCount += correct;
  profile.totalCount += total;
  if (profile.lastScoredDate && daysBetween(profile.lastScoredDate, ans.date) <= 3) profile.currentStreak++;
  else profile.currentStreak = 1;
  profile.maxStreak = Math.max(profile.maxStreak, profile.currentStreak);
  profile.lastScoredDate = ans.date;
  profile.lastResult = { date: ans.date, correct, total, gain, bonus, perfect, doubled: false };

  bet.scored = true;
  await setJSON("bet:" + ans.date, bet);
  await setJSON("profile", profile);
  submitScore(profile.totalScore);
  return profile.lastResult;
}

async function getYesterdayResults(data) {
  const out = {};
  const ans = data.answers;
  if (!ans || !ans.date) return out;
  const bet = await getJSON("bet:" + ans.date);
  if (!bet) return out;
  const confirmedMap = bet.confirmed || null;
  for (const [qid, choice] of Object.entries(bet.answers)) {
    if (confirmedMap && !confirmedMap[qid]) continue;
    if (ans[qid] == null) continue;
    out[qid] = { choice, answer: ans[qid], correct: choice === ans[qid] };
  }
  return out;
}

/* ─────────────  '오늘' 화면 렌더  ───────────── */
function renderHeader(profile) {
  const streak = profile.currentStreak > 0
    ? `<div class="streak-big">🔥 ${profile.currentStreak}일 연속<small>적중 도전 중</small></div>`
    : `<div class="streak-big" style="color:var(--muted)">예측 시작<small>오늘 첫 예측 해보기</small></div>`;
  document.getElementById("hdr").innerHTML =
    streak + `<div class="total">총점<b>${profile.totalScore.toLocaleString()}</b></div>`;
}

function renderYesterdayStrip(profile, data, fresh) {
  const r = profile.lastResult;
  const strip = document.getElementById("ystrip");
  if (!r || !data.answers || r.date !== data.answers.date) { strip.classList.remove("show"); return; }

  const base = r.gain - r.bonus;
  const detail = r.perfect ? `🔥올킬! +${base} + 보너스 ${r.bonus} = ` : "";
  document.getElementById("ystrip-main").innerHTML =
    `${r.correct}/${r.total} 적중 · <span class="g">${detail}+${r.gain}점</span>`;

  // 2배 버튼 (안 받았을 때만)
  const old = document.getElementById("double-btn");
  if (old) old.remove();
  if (r.gain > 0 && !r.doubled) {
    const btn = document.createElement("button");
    btn.id = "double-btn";
    btn.textContent = `🎬 +${r.gain} 2배`;
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "광고…";
      const earned = await showFullScreenAd(AD_IDS.rewarded, { rewarded: true });
      if (earned) {
        profile.totalScore += r.gain; r.doubled = true;
        await setJSON("profile", profile); submitScore(profile.totalScore);
        renderHeader(profile);
        document.getElementById("ystrip-main").innerHTML += ` <span class="g">→2배!</span>`;
        btn.remove();
      } else { btn.disabled = false; btn.textContent = `🎬 +${r.gain} 2배`; }
    });
    strip.appendChild(btn);
  }
  strip.classList.add("show");
  if (fresh) showFullScreenAd(AD_IDS.interstitial); // 채점된 순간 1회
}

function renderToday(ctx) {
  const { data, bet, yResults } = ctx;
  const confirmedCount = data.questions.filter((q) => bet.confirmed[q.id]).length;
  const total = data.questions.length;
  const allDone = confirmedCount >= total;

  document.getElementById("today-title").innerHTML =
    `오늘의 예측<span>${confirmedCount}/${total} 완료</span>`;
  document.getElementById("olkill").textContent = allDone
    ? `🔥 ${total}종 올킬 도전! 다 맞히면 보너스 +${PERFECT_BONUS}점`
    : `🔥 ${total}종 모두 적중하면 올킬 보너스 +${PERFECT_BONUS}점`;

  // 진행 칩
  const chips = document.getElementById("chips");
  chips.innerHTML = "";
  data.questions.forEach((q) => {
    const done = !!bet.confirmed[q.id];
    const c = document.createElement("button");
    c.className = "chip" + (q.id === ctx.activeId ? " cur" : "") + (done ? " done" : "");
    c.textContent = `${done ? "✓" : "·"} ${q.topic}`;
    c.addEventListener("click", () => { ctx.activeId = q.id; renderToday(ctx); });
    chips.appendChild(c);
  });

  const q = data.questions.find((x) => x.id === ctx.activeId);
  const root = document.getElementById("current-card");
  root.innerHTML = "";
  if (!q) return;
  const confirmed = !!bet.confirmed[q.id];
  const selected = bet.answers[q.id] ?? null;

  const card = document.createElement("div");
  card.className = "qcard" + (confirmed ? " locked" : "");
  card.innerHTML = `
    <div class="qhead"><span class="qemoji">${q.emoji || "❓"}</span><span class="qtopic">${q.topic || ""}</span></div>
    <div class="qtext">${q.q}</div>
    <div class="opts"></div>`;
  const opts = card.querySelector(".opts");
  q.options.forEach((label) => {
    const b = document.createElement("button");
    b.className = "opt" + (selected === label ? " sel" : "");
    b.textContent = label;
    if (!confirmed) b.addEventListener("click", () => ctx.select(q.id, label));
    opts.appendChild(b);
  });

  if (confirmed) {
    const row = document.createElement("div");
    row.className = "lock-row";
    row.innerHTML = `<span class="lk">✅ 예측 완료</span>`;
    const edit = document.createElement("button");
    edit.className = "edit-btn"; edit.textContent = "✏️ 다시 수정";
    edit.addEventListener("click", () => ctx.edit(q.id));
    row.appendChild(edit);
    card.appendChild(row);
  } else {
    const cb = document.createElement("button");
    cb.className = "confirm-btn"; cb.disabled = selected == null;
    cb.textContent = selected == null ? "오른다 / 내린다를 선택하세요" : "예측 확정하기";
    if (selected != null) cb.addEventListener("click", () => ctx.confirm(q.id));
    card.appendChild(cb);
  }

  const yr = yResults[q.id];
  if (yr) {
    const y = document.createElement("div");
    y.className = "yline";
    y.innerHTML = yr.correct
      ? `어제 정답 '${yr.answer}' · 적중 <span class="ok">✓ +${POINTS_PER_CORRECT}점</span>`
      : `어제 정답 '${yr.answer}' · 내 예측 '${yr.choice}' <span class="no">✗ 빗나감</span>`;
    card.appendChild(y);
  }
  root.appendChild(card);
}

/* ─────────────  '기록' 화면 렌더  ───────────── */
function renderRecord(profile, data) {
  const acc = profile.totalCount > 0 ? Math.round((profile.correctCount / profile.totalCount) * 100) : 0;
  const topicLabels = {};
  (data?.questions || []).forEach((q) => (topicLabels[q.id] = `${q.emoji || ""} ${q.topic}`));
  const labelOf = (id) => topicLabels[id] || id;

  let topicRows = Object.entries(profile.byTopic || {})
    .map(([id, t]) => {
      const p = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
      return `<div class="topic-row">
        <span class="tn">${labelOf(id)}</span>
        <span class="bar"><i style="width:${p}%"></i></span>
        <span class="tp">${p}%</span>
      </div>`;
    }).join("");
  if (!topicRows) topicRows = `<div class="rec-empty">아직 채점된 예측이 없어요.<br/>오늘 예측하고 내일 확인해요.</div>`;

  document.getElementById("screen-record").innerHTML = `
    <div class="rec-title">📊 내 기록</div>
    <div class="rec-row">
      <div class="rec-box"><div class="rl">총점</div><div class="rv">${profile.totalScore.toLocaleString()}</div></div>
      <div class="rec-box"><div class="rl">최고 연속</div><div class="rv">🔥 ${profile.maxStreak}일</div></div>
    </div>
    <div class="rec-row">
      <div class="rec-box"><div class="rl">전체 적중률</div><div class="rv">${acc}%</div></div>
      <div class="rec-box"><div class="rl">맞힌 예측</div><div class="rv">${profile.correctCount}/${profile.totalCount}</div></div>
    </div>
    <div class="rec-sec">종목별 적중률</div>
    ${topicRows}`;
}

/* ─────────────  네비게이션  ───────────── */
function setScreen(name) {
  if (name === "rank") { openLeaderboard(); return; } // 랭킹은 게임센터 웹뷰
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");
  document.querySelectorAll(".nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.screen === name));
  document.querySelector(".scroll").scrollTop = 0;
}

/* ─────────────  메인  ───────────── */
async function main() {
  if (new URLSearchParams(location.search).has("reset")) { // 개발용 초기화
    try { localStorage.clear(); } catch (_) {}
    location.replace(location.pathname); return;
  }

  let data;
  try { data = await loadData(); }
  catch (e) { document.getElementById("current-card").innerHTML = `<div class="loading">${e.message}</div>`; return; }

  const profile = await getJSON("profile", { ...DEFAULT_PROFILE });
  if (!profile.byTopic) profile.byTopic = {};

  const fresh = await scoreYesterday(data, profile);
  const yResults = await getYesterdayResults(data);

  let bet = (await getJSON("bet:" + data.date)) || { date: data.date, answers: {}, confirmed: {}, scored: false };
  if (!bet.confirmed) bet.confirmed = {};

  const ctx = {
    data, bet, yResults,
    activeId: (data.questions.find((q) => !bet.confirmed[q.id]) || data.questions[0]).id,
    async select(id, label) { bet.answers[id] = label; await setJSON("bet:" + data.date, bet); renderToday(ctx); },
    async confirm(id) { bet.confirmed[id] = true; await setJSON("bet:" + data.date, bet); renderToday(ctx); },
    async edit(id) { bet.confirmed[id] = false; await setJSON("bet:" + data.date, bet); renderToday(ctx); },
  };

  renderHeader(profile);
  renderYesterdayStrip(profile, data, fresh);
  renderToday(ctx);
  renderRecord(profile, data);

  document.querySelectorAll(".nav button").forEach((b) =>
    b.addEventListener("click", () => setScreen(b.dataset.screen)));
  attachBanner(AD_IDS.banner, document.getElementById("banner"));
}

main();
