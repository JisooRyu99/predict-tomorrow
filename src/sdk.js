// 앱인토스 SDK 래퍼.
// 토스 웹뷰 안에서는 실제 SDK를, 브라우저 개발 중에는 폴백(localStorage 등)을 사용한다.
// 덕분에 `vite dev`로 일반 브라우저에서도 UI를 확인할 수 있다.
import * as Toss from "@apps-in-toss/web-framework";

const inToss = typeof Toss?.Storage?.getItem === "function";

/* ─────────────────────────  저장소  ───────────────────────── */
// 토스 Storage는 문자열만 저장. 토스 밖(브라우저)에서는 localStorage로 폴백.
export async function storageGet(key) {
  try {
    if (inToss) return await Toss.Storage.getItem(key);
  } catch (e) {
    console.warn("Storage.getItem 실패, localStorage 폴백", e);
  }
  return localStorage.getItem(key);
}

export async function storageSet(key, value) {
  try {
    if (inToss) return await Toss.Storage.setItem(key, value);
  } catch (e) {
    console.warn("Storage.setItem 실패, localStorage 폴백", e);
  }
  localStorage.setItem(key, value);
}

// 객체 편의 헬퍼 (JSON 직렬화)
export async function getJSON(key, fallback = null) {
  const raw = await storageGet(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
export async function setJSON(key, obj) {
  await storageSet(key, JSON.stringify(obj));
}

/* ─────────────────────────  게임센터 리더보드  ───────────────────────── */
// 누적 점수 제출 (게임 카테고리 전용, 토스앱 5.221.0+). 점수는 문자열.
export async function submitScore(totalScore) {
  try {
    if (typeof Toss.submitGameCenterLeaderBoardScore !== "function") return false;
    const result = await Toss.submitGameCenterLeaderBoardScore({ score: String(totalScore) });
    if (!result) return false; // 미지원 버전
    return result.statusCode === "SUCCESS";
  } catch (e) {
    console.warn("점수 제출 실패", e);
    return false;
  }
}

// 게임센터 랭킹 웹뷰 열기 (열면 미니앱은 백그라운드로 전환됨)
// 토스 앱 안 + 미니앱 정보 승인 + 콘솔에 리더보드 생성 시에만 실제로 뜬다.
export function openLeaderboard() {
  if (!inToss || typeof Toss.openGameCenterLeaderboard !== "function") {
    alert("전국 랭킹은 토스 앱에서만 볼 수 있어요.\n(개발 환경/브라우저에서는 표시되지 않아요)");
    return;
  }
  try {
    Toss.openGameCenterLeaderboard();
  } catch (e) {
    console.warn("리더보드 열기 실패", e);
    alert("랭킹을 여는 중 문제가 생겼어요.");
  }
}

/* ─────────────────────────  전면/리워드 광고  ───────────────────────── */
// 리워드 광고를 보여주고, 시청 완료(userEarnedReward) 시에만 true로 resolve.
// 전면 광고도 같은 함수로 쓰되 onReward 없이 닫힘만 기다리면 된다.
export function showFullScreenAd(adGroupId, { rewarded = false } = {}) {
  return new Promise((resolve) => {
    if (!inToss || typeof Toss.loadFullScreenAd !== "function" || !Toss.loadFullScreenAd.isSupported?.()) {
      // 미지원 환경(브라우저 개발 등): 광고 없이 통과 (멈춤 방지)
      console.info("[ad] 미지원 환경 — 광고 스킵", adGroupId);
      return resolve(rewarded ? true : false);
    }
    let earned = false;
    const show = () =>
      Toss.showFullScreenAd({
        options: { adGroupId },
        onEvent: (event) => {
          if (event.type === "userEarnedReward") earned = true; // 시청 완료 시에만 보상
          if (event.type === "dismissed") resolve(rewarded ? earned : true);
          if (event.type === "failedToShow") resolve(false);
        },
        onError: () => resolve(false),
      });
    // load → (loaded) → show
    Toss.loadFullScreenAd({
      options: { adGroupId },
      onEvent: (event) => {
        if (event.type === "loaded") show();
      },
      onError: () => resolve(false),
    });
  });
}

/* ─────────────────────────  배너 광고  ───────────────────────── */
// el(컨테이너)에 배너를 부착. 반환 객체의 destroy()로 제거. 토스앱 5.241.0+.
let bannerInitialized = false;
export function attachBanner(adGroupId, el) {
  try {
    if (!Toss.TossAds || !Toss.TossAds.initialize?.isSupported?.()) {
      console.info("[banner] 미지원 환경 — 배너 스킵");
      return { destroy() {} };
    }
    if (!bannerInitialized) {
      Toss.TossAds.initialize({
        callbacks: { onInitialized: () => { bannerInitialized = true; } },
      });
    }
    return (
      Toss.TossAds.attachBanner(adGroupId, el, {
        theme: "auto",
        tone: "blackAndWhite",
        variant: "expanded",
      }) ?? { destroy() {} }
    );
  } catch (e) {
    console.warn("배너 부착 실패", e);
    return { destroy() {} };
  }
}

export const isInToss = inToss;
