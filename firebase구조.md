> ⚠️ **미채택 (대안 B).** 2026-06-25 랭킹은 **토스 게임센터**로 결정 → 채택안은 `아키텍처.md` 참고.
> 이 문서는 "직접 Firebase로 구현했을 때"의 참고용으로만 남겨둠. (전국민 % 같은 커스텀 기능을 나중에 붙일 때 재활용 가능)

# Firebase 구조 설계 (무조건 무료 기준) — 대안 B (미채택)

> 제약: **Spark(무료) 플랜만 사용. Cloud Functions(Blaze 유료) 안 씀.**
> 핵심 과제: 전국 랭킹 + "채점을 공짜로, 조작 안 당하게".

---

## 1. 큰 그림

```
[토스 미니앱 클라이언트]
   ├─ 예측 제출 → Firestore에 내 베팅 기록
   ├─ 랭킹/결과 읽기 ← Firestore
   └─ 내 개인기록은 토스 Storage(로컬)에도 캐시

[GitHub Actions 크론 (무료)]   ← 채점 담당
   매일 정답 확정 시각에 1번 실행:
   1. 외부 API에서 진짜 정답 가져옴 (환율 등)
   2. rounds/{날짜}.answer 기록
   3. 그 날 베팅 전부 읽어서 채점 → 유저 점수/스트릭 갱신
   4. 집계(전국민 %) 기록
```

**왜 GitHub Actions?** Firebase Cloud Functions는 자동 실행(크론)에 유료 플랜이 필요해. 대신 **GitHub Actions 예약 워크플로우는 무료**고, Firebase Admin SDK로 Firestore에 붙을 수 있어. 채점을 서버(Admin 권한)에서 하니까 **유저가 점수 조작 불가** → 무료 + 안전 둘 다 잡음.

> MVP를 더 빨리 내고 싶으면 §6의 "클라이언트 채점"으로 시작해도 됨(조작 위험 감수). 랭킹 신뢰가 중요해지면 GitHub Actions로 전환.

---

## 2. Firestore 컬렉션 구조

> 포맷이 **"오늘의 3종 예측"**(하루 O/X 3문제)이라, 하루(round) 밑에 문제(question) 3개가 매달리는 구조.

### `rounds/{date}` — 하루치 세트 (date = `2026-06-25`)
```jsonc
{
  "status": "open",          // open → closed(마감) → settled(채점완료)
  "closeAt": <timestamp>,    // 예측 마감 시각
  "settleAt": <timestamp>    // 정답 확정 시각
}
```

### `rounds/{date}/questions/{qid}` — 그날의 문제 1개 (qid: `exchange`/`kospi`/`weather`…)
```jsonc
{
  "type": "exchange",
  "target": "USD/KRW",
  "question": "내일 원/달러 환율, 오를까?",
  "options": ["오른다", "내린다"],
  "baseValue": 1382.4,       // 비교 기준값 (오늘 종가 등) — Admin이 기록
  "answer": null,            // 채점 후 "오른다" 등 (Admin만)
  "tally": { "오른다": 0, "내린다": 0 }  // 전국민 선택 집계
}
```

### `users/{uid}` — 유저 프로필 + 누적 스탯
```jsonc
{
  "nickname": "예측왕",
  "totalScore": 120,
  "weeklyScore": 30,        // 주간 랭킹용 (매주 리셋)
  "currentStreak": 4,       // 연속 "참여"일 (출석 스트릭)
  "maxStreak": 9,
  "correctCount": 31,
  "totalCount": 45,         // 적중률 = correct/total (문제 단위 누적)
  "lastPlayedDate": "2026-06-25",
  "byTopic": {              // 종목별 적중률 ("나 환율은 잘 맞히네")
    "exchange": { "correct": 12, "total": 15 },
    "kospi":    { "correct": 9,  "total": 15 }
  }
}
```

### `users/{uid}/bets/{date}` — 유저의 그날 예측 (3문제 한 묶음)
```jsonc
{
  "answers": {              // 문제별 내 선택
    "exchange": "오른다",
    "kospi":    "내린다",
    "weather":  "온다"
  },
  "createdAt": <timestamp>,
  "scored": false,          // 채점 여부 (Admin만 변경)
  "results": null,          // 채점 후 {exchange:true, kospi:false, ...} (Admin만)
  "gained": 0               // 그날 획득 점수 (Admin만)
}
```

> **스트릭 정의**: 하루 3문제라 "적중 연속"이 모호 → 스트릭은 **연속 참여일(출석)** 로 잡고, "적중"은 종목별 적중률(`byTopic`)로 보여줌. (원하면 "하루 3문제 다 맞힌 날 연속" 같은 별도 스트릭 추가 가능)

---

## 3. 랭킹 처리 (무료로 가볍게)

- **전체 랭킹**: `users` 컬렉션을 `totalScore desc limit 100` 쿼리 → 상위 100명. (인덱스 1개)
- **주간 랭킹**: `weeklyScore desc limit 100`. 주간 리셋은 GitHub Actions가 월요일에 처리.
- **내 순위(정확값)**: `count()`로 "나보다 점수 높은 유저 수 + 1" → 비용 낮음. 부담되면 "상위 N%"로 근사.
- **랭킹 캐싱**: 매 요청마다 쿼리하지 말고, 클라이언트에서 N분간 캐시 → 읽기 횟수 절약.

---

## 4. 집계 "전국민 중 몇 %" 처리

- 베팅 제출 시 `rounds/{id}.tally.{choice}` 를 `increment(1)`.
- ⚠️ 한 문서 동시 쓰기는 초당 ~1회 한계 → 트래픽 폭증 시 핫스팟.
  - **무료 회피책**: 초기엔 단일 increment로 충분. 커지면 (a) shard 카운터로 분산, 또는 (b) 집계를 GitHub Actions가 정답 확정 때 베팅 전수 읽어 한 번에 계산.

---

## 5. 보안 규칙 (조작 방지의 핵심)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 라운드 + 문제: 누구나 읽기 OK, 쓰기는 Admin(크론)만
    match /rounds/{date} {
      allow read: if true;
      allow write: if false;   // Admin SDK는 규칙 우회하므로 정답/집계 기록 가능
      match /questions/{qid} {
        allow read: if true;
        allow write: if false;
      }
    }

    // 유저 프로필: 누구나 읽기(랭킹), 점수 필드는 본인도 못 씀
    match /users/{uid} {
      allow read: if true;
      // 닉네임 정도만 본인이 수정 허용, 점수류는 차단
      allow create: if request.auth.uid == uid;
      allow update: if request.auth.uid == uid
        && !request.resource.data.diff(resource.data).affectedKeys()
             .hasAny(['totalScore','weeklyScore','currentStreak',
                      'maxStreak','correctCount','totalCount']);
    }

    // 베팅: 본인만 생성, 결과 필드는 못 건드림 (채점은 Admin만)
    match /users/{uid}/bets/{date} {
      allow read: if request.auth.uid == uid;
      allow create: if request.auth.uid == uid
        && request.resource.data.scored == false
        && request.resource.data.results == null
        && request.resource.data.gained == 0;
      allow update, delete: if false;  // 한 번 내면 수정 불가
    }
  }
}
```

→ 점수·채점 결과는 **오직 GitHub Actions(Admin SDK)** 만 쓸 수 있음. 클라이언트는 "예측 제출"과 "읽기"만. 그래서 무료인데도 랭킹이 안 털림.

---

## 6. 대안: 클라이언트 채점 (MVP 초고속 버전)

GitHub Actions 세팅도 미루고 가장 빨리 출시하려면:
- 정답(`rounds/{id}.answer`)만 내가 수동/간단 스크립트로 채움.
- 유저가 앱 열면 클라이언트가 정답 읽고 → 본인 베팅과 비교 → 본인 점수 갱신.
- **장점**: Functions·Actions 다 필요 없음, 즉시 가능.
- **단점**: 유저가 맘만 먹으면 본인 점수 조작 가능(보안규칙으로 점수 쓰기를 막으면 채점 자체가 안 됨 → 트레이드오프). 가상 보상뿐이라 초기엔 감수 가능.

**추천 경로**: MVP는 §6로 빠르게 → 유저 늘고 랭킹 경쟁 생기면 §1~5(GitHub Actions)로 승급.

---

## 7. 무료 유지 체크리스트

- [ ] Cloud Functions 안 씀 (크론은 GitHub Actions)
- [ ] Firestore 읽기 5만/쓰기 2만/일 안에서 → 랭킹 캐싱 + 배치 채점으로 절약
- [ ] Firebase 콘솔에서 예산 알림/한도 설정 (실수로 Blaze 안 켜지게)
- [ ] 인덱스: `totalScore desc`, `weeklyScore desc` 2개만
