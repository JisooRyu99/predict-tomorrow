import { defineConfig } from "vite";

// 순수 HTML/JS + ES 모듈 앱. index.html이 진입점.
// public/ 의 파일은 루트 경로로 서빙됨 (예: public/today.json → /today.json).
export default defineConfig({
  build: {
    outDir: "dist",
  },
  server: {
    port: 5173,
  },
});
