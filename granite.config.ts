import { defineConfig } from "@apps-in-toss/web-framework/config";

// 앱인토스 미니앱 설정 — "내일을 맞혀라"
// ⚠️ 출시 전 콘솔 등록 후 아래 값들을 콘솔과 정확히 일치시킬 것:
//  - appName: 콘솔에 등록한 고유 앱 키와 반드시 일치 (등록 후 수정 불가).
//  - brand.icon: 콘솔 "앱 로고"에 업로드한 static.toss.im URL로 교체 (placeholder면 반려됨).
//  - 게임 카테고리로 등록 → GRAC 등급분류 필요.
export default defineConfig({
  appName: "naeilmatchyeora", // TODO: 콘솔 앱 키와 일치시킬 것
  brand: {
    displayName: "내일을 맞혀라",
    primaryColor: "#3b82f6", // 예측/금융 느낌의 블루 액센트
    // TODO: 콘솔 "앱 로고"에 등록된 URL로 교체 (반려 방지)
    icon: "https://static.toss.im/appsintoss/PLACEHOLDER.png",
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [], // 위치/카메라 등 외부 권한 불필요 (전국 단위 문제라 위치 안 씀)
  outdir: "dist",
});
