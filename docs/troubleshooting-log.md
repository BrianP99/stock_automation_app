# 트러블슈팅 로그

버그/장애가 발생했을 때 **날짜, 증상, 근본 원인, 해결 방법**을 기록하는 문서입니다.
새 이슈를 진단·해결할 때마다 최상단에 새 항목을 추가하세요 (최신순 정렬).

이 파일은 `docs/` 아래에 있어서 `netlify.toml`의 `ignore` 설정에 의해 **이 파일만 수정해도 Netlify 배포는 발생하지 않습니다** (배포 크레딧 절약).

---

## 2026-08-24 — `netlify dev`가 5173 포트 타임아웃으로 시작 실패

**증상:** `npm run netlify:dev` 실행 시 "Waiting for framework dev server to be ready on port 5173" 상태로 멈췄다가 `Timed out waiting for port '5173' to be open` 에러로 종료됨.

**근본 원인:** `netlify.toml`에 `[dev]` 섹션이 없어서, `netlify dev`가 dev 서버 실행 명령을 알 수 없었고 `[build].command`(프로덕션 빌드 명령 `npm run build:client`)를 그대로 dev 명령으로 재사용함. 이 명령은 빌드 후 바로 종료되는 일회성 스크립트라 5173 포트를 절대 열지 않음.

**해결:** `netlify.toml`에 아래 추가:
```toml
[dev]
  command = "npx vite"
  targetPort = 5173
```
`@netlify/vite-plugin`이 이미 vite.config.ts에 설정되어 있어서, 이렇게 하면 `netlify dev`가 진짜 Vite dev 서버(HMR 포함)를 띄우고 그 안에서 Functions/Blobs를 에뮬레이트함. PR #21.

**확인:** `DISCORD_WEBHOOK_URL`이 정상 주입됨(로그에 `Injected project settings env vars: DISCORD_WEBHOOK_URL` 출력 확인), `/api/session/state`가 로컬 Functions 파이프라인을 통해 정상 응답.

---

## 2026-08-24 — Discord 웹훅 알림이 전송되지 않음

**증상:** 매수/매도 체결, "지금 포트폴리오 요약 보내기" 버튼을 눌러도 Discord 채널에 메시지가 오지 않음. 알림 로그에는 `DISCORD_WEBHOOK_URL이 설정되지 않았습니다` 에러만 계속 쌓임.

**근본 원인 (두 가지가 겹쳐 있었음):**
1. `fetch()`는 4xx/5xx 응답에도 예외를 던지지 않아서, 웹훅 전송 실패를 성공으로 오인하고 있었음 (1차 버그, PR #14에서 수정).
2. `DISCORD_WEBHOOK_URL` 환경변수를 `envVarIsSecret: true`로 저장했더니, Netlify Functions 런타임(`Netlify.env.get()`)에 값이 아예 주입되지 않음 — 이 사이트/플랜에서는 secret 플래그가 런타임 주입과 호환되지 않는 것으로 보임.
3. secret 플래그를 껐지만(`envVarIsSecret: false`) 여전히 실패 — 이미 배포된 함수 번들이 예전 값을 그대로 물고 있었기 때문. Netlify Functions는 **배포 시점에 환경변수를 번들에 굽는 방식**이라, 값만 바꾼다고 즉시 반영되지 않고 **재배포가 필요**함.
4. 재배포를 시도했는데 (커밋 push, 수동 `deploy-site` 트리거 모두) **Netlify 팀 계정의 이번 결제 주기 빌드 크레딧이 이미 소진**되어 있어서, 모든 배포 요청이 `"Skipped due to account credit usage exceeded"` 상태로 조용히 스킵되고 있었음. 원인은 배포 1회당 15크레딧이 소모되는데, 이 세션에서 PR을 잘게 쪼개서 건마다 바로 머지(자동배포)하다 보니 월 300크레딧(Free 플랜)을 며칠 만에 다 써버린 것.

**해결:**
- `envVarIsSecret: false`로 재설정 (PR #16 debug 코드로 진단 → PR #18에서 정리).
- 사용자가 Netlify 팀을 Free → **Personal 플랜(월 1,000크레딧)**으로 업그레이드.
- 업그레이드 직후 `netlify-mcp` CLI로 수동 배포 트리거 → 정상 반영 확인, `/api/session/notify-summary` 라이브 테스트로 `ok:true` 확인.

**교훈 / 재발 방지:**
- Netlify Functions 환경변수는 **재배포 전까지 반영되지 않는다** — env var만 바꾸고 "왜 안 되지"라고 헷갈리지 말 것. 값 변경 후에는 항상 실제 코드 diff가 있는 커밋으로 재배포까지 확인해야 함.
- **PR을 잘게 쪼개서 건마다 바로 머지하지 말 것.** 배포 1회 = 15크레딧. 여러 수정을 한 브랜치에 모아 한 번에 머지하는 습관 필요 (자세한 내용은 세션 메모리 `netlify-credit-constraint` 참고).
- 크레딧 소진 시 증상은 "빌드가 시작조차 안 되고 `currentDeploy.id`가 그대로"임 — Netlify MCP `get-deploy-for-site`의 `error_message` 필드에 정확한 사유가 나온다.

---

## 2026-08-23 — 계좌 입력 필드에서 숫자가 입력 중 깨짐

**증상:** 직접 투자금액 입력란에 "123456789"를 입력하면 화면에 "100,000,123,456,789" 같은 이상한 값으로 표시됨.

**근본 원인:** `Math.max(100000, value)` 최소값 클램프를 `onChange`(키 입력마다)에 걸어놨더니, 콤마 포맷팅을 다시 계산하는 controlled input과 충돌하면서 값이 누적/중복됨.

**해결:** 클램프를 `onBlur`(입력 완료 후 포커스 아웃 시)로만 이동. PR #11.

---

## 2026-08-23 — "원" 글자가 입력 숫자와 겹침

**증상:** 직접 입력 금액 필드에서 절대 위치로 배치한 "원" 라벨이 입력한 숫자 뒷자리와 겹쳐 보임.

**근본 원인:** input에 "원" 라벨을 위한 오른쪽 여백(padding)이 없었음.

**해결:** `pr-10` 패딩 + `top-1/2 -translate-y-1/2`로 위치 보정. PR #11.

---

## 2026-08-23 — 프리셋 금액 버튼 텍스트가 단어 중간에서 줄바꿈됨

**증상:** "100만원" 같은 프리셋 버튼 라벨이 "100 만" / "원"처럼 이상한 위치에서 줄바꿈됨. "1,000만원"도 어색한 표기.

**근본 원인:** 한글(CJK) 텍스트는 브라우저가 기본적으로 아무 글자 사이에서나 줄바꿈을 허용함 (라틴 텍스트처럼 단어 경계가 없음). 라벨에 있던 공백이 문제를 더 키움.

**해결:** 라벨에서 공백 제거("100 만원" → "100만원", "1,000만원" → "1000만원"), `whitespace-nowrap break-keep` 추가. PR #10, #12.

---

## 2026-08-23 — Windows에서 국기 이모지가 텍스트로 표시됨

**증상:** 한국/미국 종목 옆에 붙인 국기 이모지(🇰🇷/🇺🇸)가 Windows에서 "KR"/"US" 같은 텍스트로만 보임.

**근본 원인:** Windows 기본 이모지 폰트에 국기 글리프가 없음.

**해결:** 국기 이모지 완전히 제거, 색상 배지 + 한글 텍스트("한국"/"미국")만 사용하는 방식으로 변경. PR #7, #8.

---

## 2026-08-23 — Netlify 프로덕션 빌드 실패 (devDependencies 누락)

**증상:** Netlify 배포 시 빌드가 실패함. `vite`, `@netlify/vite-plugin`, `tailwindcss`를 찾을 수 없다는 에러.

**근본 원인:** Netlify가 빌드 시 기본적으로 `NODE_ENV=production`을 설정하는데, 이 상태에서 `npm ci`가 devDependencies를 건너뜀. 하지만 `vite.config.ts`는 빌드 타임에 이 패키지들이 필요함.

**해결:** `@netlify/vite-plugin`, `tailwindcss`, `autoprefixer`를 devDependencies에서 dependencies로 이동 + `netlify.toml`에 `NPM_FLAGS = "--include=dev"` 추가. PR #2.

---

## 2026-08-23 (세션 초반) — GitHub push 403 에러

**증상:** Claude가 생성한 브랜치를 GitHub에 push할 때 403 에러 발생.

**근본 원인:** "Claude" GitHub App이 OAuth 권한은 있었지만 실제로 설치(install)는 안 되어 있었음.

**해결:** 사용자가 github.com/apps/claude 에서 GitHub App을 설치.
