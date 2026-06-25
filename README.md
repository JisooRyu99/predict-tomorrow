# 내일을 맞혀라

매일 환율·코스피·날씨를 O/X로 예측하고, 다음 영업일 정답으로 점수·랭킹을 쌓는 앱인토스 미니앱.

> 기획: `기획안.md` · 아키텍처: `아키텍처.md` (랭킹=토스 게임센터, 정답=GitHub Actions→Pages, 개인=토스 Storage. **서버·DB 0개, 무료**)

## 구조

```
index.html          홈 화면(마크업+스타일)
src/main.js          앱 로직 — 데이터 로드 / 어제 채점 / 3종 예측 / 점수·랭킹 제출
src/sdk.js           앱인토스 SDK 래퍼 (Storage·게임센터·광고, 브라우저 폴백 내장)
src/config.js        DATA_URL·광고 ID·점수 규칙
public/today.json    개발용 목업 데이터 (배포 시 GitHub Pages가 진짜를 서빙)
data-pipeline/
  generate.mjs       공개 API로 정답 확정 + 오늘 문제 생성 → site/today.json
  state.json         채점용 직전 값 보존 (워크플로우가 갱신)
.github/workflows/daily.yml   매일 16:00 KST 자동 실행 → Pages 배포
```

## 개발

```bash
npm install
npm run dev      # http://localhost:5173 (브라우저: 광고·게임센터는 자동 스킵, 저장은 localStorage)
npm run build    # dist/ 생성 (vite)
```

데이터 파이프라인 단독 테스트:
```bash
node data-pipeline/generate.mjs   # 무료 API 호출 → site/today.json 생성 (키 불필요)
```

## 배포 전 TODO (체크리스트)

- [ ] **GitHub 레포 생성 후 push** → Actions 탭에서 워크플로우 1회 수동 실행(Run workflow)
- [ ] **Settings → Pages**: Source를 `gh-pages` 브랜치로 설정
- [ ] `src/config.js`의 **`DATA_URL`을 본인 Pages 주소**로 교체
      (`https://<id>.github.io/<repo>/today.json`)
- [ ] **앱인토스 콘솔에 "내일을 맞혀라" 등록** (게임 카테고리) → `granite.config.ts`의 `appName`·`brand.icon`을 콘솔 값과 일치
- [ ] **광고 ID**: `src/config.js`의 테스트 ID(`ait-ad-test-*`)를 콘솔 발급 실제 ID로 교체 (출시 시점에만)
- [ ] **게임센터 리더보드**: 콘솔에서 "최고 점수" 모드로 생성 (기기변경 대비)
- [ ] **사업자 등록** (광고 정산 조건) · **GRAC 게임물 등급분류** (게임 카테고리, 10~15일)
- [ ] 토스 앱에서 앱 이름 "내일을 맞혀라" 중복 없는지 최종 확인
- [ ] 빌드 후 배포: `npx ait build` → `.ait` 콘솔 업로드

## 데이터 흐름

1. 워크플로우(매일) → 공개 API로 어제 정답 확정 + 오늘 문제 생성 → `today.json`을 Pages에 배포
2. 앱 → `today.json` fetch → 어제 내 예측 채점(토스 Storage) → 누적 점수 게임센터 제출
3. 광고: 결과 후 전면 / "점수 2배" 리워드 / 홈 하단 배너

## 무료 API (키 불필요)

- 환율 USD/KRW: Frankfurter `api.frankfurter.app`
- 코스피(^KS11): Yahoo Finance `query1.finance.yahoo.com`
- 서울 강수: Open-Meteo `api.open-meteo.com`
