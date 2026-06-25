// 앱 상수.

// 매일 GitHub Actions가 갱신하는 정답/문제 JSON (GitHub Pages, CORS 허용).
// ⚠️ 실제 배포 전 본인 GitHub Pages 주소로 교체할 것.
// 개발 중에는 이 URL이 없거나 실패하면 번들에 포함된 /today.json(목업)으로 폴백한다.
export const DATA_URL =
  "https://JisooRyu99.github.io/predict-tomorrow/today.json"; // GitHub Pages (gh-pages 배포 후 활성화)
export const LOCAL_DATA_URL = "/today.json"; // 개발용 목업 (public/today.json)

// 광고 그룹 ID — 개발 단계에서는 반드시 테스트 ID 사용. 출시 시 콘솔 발급 ID로 교체.
export const AD_IDS = {
  interstitial: "ait-ad-test-interstitial-id", // 전면 (결과 확인 후)
  rewarded: "ait-ad-test-rewarded-id", // 리워드 (점수 2배 / 스트릭 보호 / 힌트)
  banner: "ait-ad-test-banner-id", // 배너 (홈 하단)
};

// 점수 규칙
export const POINTS_PER_CORRECT = 10;
export const PERFECT_BONUS = 20; // 그날 전 종목 답하고 전부 적중(올킬) 시 가산점
