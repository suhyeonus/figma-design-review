---
name: figma-design-review
description: >-
  이미 구현된 React·Next.js + Tailwind CSS 화면/컴포넌트를 Figma 시안(링크·node)과 대조해
  공백(padding·gap·margin)·크기·컬러·텍스트 스타일(size·weight·line-height·letter-spacing)·radius·그림자·
  디자인 토큰 이탈이 시안과 다른 곳을 찾아 🔴🟡🟢 리포트로 내고, 사용자가 고른 범위만 고치는 디자인 리뷰(디자인 QA).
  "피그마랑 비교해줘", "시안대로 됐는지 봐줘", "디자인 리뷰/디자인 QA 해줘", "간격·색·폰트가 시안이랑 다른지 확인",
  "픽셀 차이 찾아줘"처럼 구현 결과를 Figma 링크와 맞춰 검수해 달라는 요청에 사용한다(스킬 이름을 말하지 않아도).
  시안을 새로 구현하거나 "이 디자인대로 바꿔/만들어줘" 같은 구현 요청에는 쓰지 않는다 — 그건 plan-feature나
  figma-design-to-code의 일이다. 어느 저장소에서든 Figma MCP와 Tailwind(v3·v4)를 쓰면 동작한다.
argument-hint: <figma-url> [코드 경로|라우트|컴포넌트] [런타임 URL]
---

# figma-design-review — Figma 시안 ↔ 구현 코드 디자인 리뷰

구현은 대체로 시안을 따르지만 세부 공백·컬러·텍스트 스타일이 가끔 어긋난다. 이 스킬은 **이미 구현된 코드**를 시안과 수치로 대조해 차이를 찾고, 사용자가 고른 것만 고친다. 입력은 Figma 링크(node-id 포함)와 선택적인 코드 대상·런타임 URL, 출력은 🔴🟡🟢 리포트와 (선택 시) 수정이다.

왜 수치 대조냐면: 눈으로 비교하면 2px·한 단계 다른 회색·line-height 차이를 놓치고, Tailwind 클래스를 암산하면 프로젝트의 root font-size(예: `html{font-size:14px}`이면 `p-4`=14px)나 CSS 변수 체인 때문에 틀린다. 그래서 **Figma 값은 MCP에서, 코드 값은 스크립트(정적)와 브라우저 computed style(런타임)에서** 가져와 맞댄다.

## 운영 규칙 (항상)

- **Figma는 읽기 전용.** `use_figma`·Code Connect 등록 등 쓰기 도구는 쓰지 않는다.
- **범위는 링크의 노드뿐.** 노드 밖·리뷰 대상 밖의 기존 불일치는 리포트의 '범위 밖' 줄에 적기만 하고 고치지 않는다.
- **수치는 근거에서만.** 코드 값은 `tw-resolve` 출력이나 `inspect-dom` 측정값을 인용하고 암산하지 않는다. 근거를 못 얻은 항목은 '확인 불가'로 둔다.
- **커밋·push 하지 않는다.** 수정 후 상태를 보고하고 멈춘다.
- **프로젝트 규칙이 우선.** CLAUDE.md·메모리·훅(예: 플랜 게이트, 커밋 게이트)을 따른다. 훅이 수정을 막으면 우회하지 말고 사유를 보고한다.
- 스크립트 경로의 `<스킬>`은 이 스킬 폴더(로드 시 표시되는 Base directory, 보통 `~/.claude/skills/figma-design-review`)다.

## 0단계 — 입력 파싱

- Figma URL에서 `fileKey`와 `nodeId`를 뽑는다: `figma.com/design/<fileKey>/<name>?node-id=1-2` → nodeId `1:2`. `/design/<fileKey>/branch/<branchKey>/…`면 branchKey가 fileKey다. **node-id가 없으면 노드 링크를 달라고 묻는다**(추측 금지).
- 나머지 인자: 코드 대상(파일·디렉터리·컴포넌트명·라우트)과 런타임 URL(`http://localhost:3000/settings`, Storybook story URL 등). 둘 다 선택.
- 링크가 여러 개면(예: 기본·hover·모바일 프레임) 각각을 같은 요소의 상태/브레이크포인트로 다룬다.

## 1단계 — 프로젝트 프로필 (매 실행 자동 탐지)

아래를 짧게 확인하고, 리포트 맨 위 한 줄로 남긴다. 자세한 탐지법은 `references/tailwind.md`.

- `package.json`: next·react·tailwindcss 버전, `clsx`/`tailwind-merge`/`class-variance-authority` 사용 여부.
- Tailwind 토큰 위치: v3 `tailwind.config.*`(theme/extend) + 전역 CSS의 CSS 변수 / v4 전역 CSS의 `@theme`·`:root`·`.dark`.
- root font-size·다크 스코프(`.dark`, `[data-theme]`, `prefers-color-scheme`) — `tw-resolve` 출력 첫 줄에 나온다.
- 공용 UI 컴포넌트 위치: `components.json`(shadcn)의 `aliases.ui`, 없으면 `components/ui`·`shared/ui` 류.
- 프로젝트 규칙: 루트 `CLAUDE.md`(및 하위 CLAUDE.md), 메모리.

```bash
node <스킬>/scripts/tw-resolve.mjs --cwd <프로젝트 루트> resolve "p-4"   # 첫 줄: tailwind 버전 · root font-size · CSS · 스코프
```

## 2단계 — Figma 스펙 수집

1. **도구 찾기**: Figma MCP 도구 이름은 환경마다 접두사가 다르다(`mcp__figma__…`, `mcp__plugin_figma_figma__…`, `mcp__<uuid>__…`). 목록에 없거나 deferred면 ToolSearch로 `get_design_context`·`get_metadata`·`get_variable_defs`·`get_screenshot`을 찾아 로드한다. 연결된 서버가 없거나 인증이 필요하면 `/mcp`로 연결·인증하라고 안내하고 멈춘다.
2. **세션·선행 조건**: 서버가 `create_session`을 요구하면(원격 Figma MCP) fileKey와 "디자인 리뷰(읽기 전용)" 설명으로 먼저 부르고, 이후 호출에 sessionId를 넘긴다. `get_design_context`가 `figma-design-to-code` 로드를 요구하면 그 스킬을 로드하되 **수집 규칙만** 따른다(스크린샷 포함 요청, sparse 응답이면 자식 노드 병렬 요청). 구현 지시는 무시한다.
3. **구조 먼저**: `get_metadata(nodeId)`로 트리·크기를 본다. 섹션이 많으면(대략 8개 초과) 어느 섹션을 볼지 AskUserQuestion으로 묻는다 — 큰 프레임 전체를 한 번에 `get_design_context`로 받으면 컨텍스트가 터진다.
   - 기획 섹션에는 **같은 화면의 상태별 프레임**(Default·40%·80%·120% 등)과 **주석 프레임**(이름이 `Alert`·`Case`인 레드라인·설명 카드, 스크린샷의 빨간 번호 마커)이 섞여 있다. 주석은 비교 대상이 아니다. 대표 상태 하나를 기준 프레임으로 정하고, 다른 상태는 **달라지는 컴포넌트(카드 등)만** 따로 받는다.
   - 인스턴스 안쪽 노드 ID(`I<인스턴스>;<자식>`)는 인스턴스마다 다르다. **추측하지 말고** 그 인스턴스에 `get_metadata`를 불러 자식 ID를 얻는다.
4. **시안 ↔ 코드 대응 확인**: 기준 프레임 스크린샷의 제목·문구가 코드 대상(상수·JSX 문구)과 같은 화면인지 먼저 맞춰 본다. 다르면(링크가 다른 화면을 가리킴) 더 수집하지 말고 멈춰서 사용자에게 링크를 다시 확인받는다.
5. **세부 값**: 섹션(또는 리뷰할 노드)별로 `get_design_context`를 **한 메시지에서 병렬로** 부른다. 사이드바 등 범위 밖 영역까지 포함한 큰 노드는 응답이 잘리므로(약 25k 토큰) 콘텐츠 컨테이너·카드 단위로 좁히고, 스크린샷을 이미 받았으면 `excludeScreenshot`으로 아낀다. 이어서 `get_variable_defs(nodeId)`(변수명 → 값), `get_screenshot`(세부 확인이 필요하면 `maxDimension` 2048). 스크린샷이 URL로 오면 curl로 스크래치 디렉터리에 받아 Read로 본다.
6. **SVG 에셋 색**: 아이콘·점·구분선은 생성 코드에 색 값 없이 SVG 에셋 URL로만 온다. 비교할 에셋을 curl로 받아 `grep -oE '(fill|stroke)="[^"]+"'`로 색을 읽는다(놓치기 쉬운 불일치가 여기서 나온다).
7. **스펙 시트로 정리**: 요소마다 ID를 붙여 아래처럼 적는다. 변수명이 있으면 hex와 함께 적는다(토큰 대조에 필요).
   ```
   [S1] 카드 (12:34) frame · auto-layout V · padding 20/24/20/24 · gap 12 · align start · w fill · h hug
        fill Background/Primary #FFFFFF · stroke Line/Normal #ECECEE 1 inside · radius 8 · shadow 0 2 6 1 #0000000F
   [S1.1] 제목 "요금제 및 한도" text · Title/Tertiary Bold 18/140%/700 · ls 0 · Texts/Primary #303030
   ```
   `get_design_context`가 돌려주는 코드는 **값(색·폰트·padding·gap·radius·변수명, `data-node-id`)만 믿고 구조(absolute 배치·고정 좌표)는 믿지 않는다** — 프로토타입용 생성 코드다.

## 3단계 — 코드 매핑

- 대상이 지정됐으면 그 파일부터. 없으면 다음을 함께 써서 찾는다: 현재 브랜치 diff 파일(`git diff --name-only <base>...HEAD`), 시안 텍스트 문구 grep(가장 확실함), `get_code_connect_map`, 레이어명 ↔ 컴포넌트명.
- 스펙 시트의 각 요소에 JSX 위치 `file:line`을 붙인다. 공용 컴포넌트(`<Button size="md">` 등)는 **컴포넌트 파일 안까지** 따라가 기본 클래스·cva 변형을 확인한다.
- 매핑이 모호하면(같은 문구가 여러 곳 등) AskUserQuestion으로 묻는다. 코드에서 못 찾은 시안 요소는 '누락 의심'으로 표시해 둔다.

## 4단계 — 정적 대조 (항상)

1. **최종 클래스 집합 산출** — 요소마다 실제로 적용될 클래스를 모은다(규칙은 `references/tailwind.md`): `cn`/`twMerge`는 충돌 시 뒤가 이김, cva는 base + variant + compoundVariants + `className`, 조건부 클래스는 시안 상태에 맞는 분기, 반응형 접두사는 시안 프레임 폭에 맞는 것, 텍스트 색·폰트처럼 **상속되는 값은 조상 요소에서** 가져온다. 전역 base 스타일(`body{@apply …}`)도 기본값이 된다. **색 클래스가 없는 텍스트 요소는 반드시 조상과 `body`까지 올라가 색을 정한다** — 공용 제목 컴포넌트가 body 기본색(`text-foreground` 등)을 물려받아 시안 토큰과 달라지는 경우가 흔하고, 정적 대조에서 가장 놓치기 쉽다.
2. **해석** — 모은 클래스를 한 번에 해석한다(암산 금지):
   ```bash
   node <스킬>/scripts/tw-resolve.mjs --cwd <루트> resolve "px-5 py-4 gap-3 text-title-tertiary-bold text-texts-primary rounded-md border border-line-normal"
   ```
   출력은 `속성: 원값 → 해석값 | .dark: 값`. `(생성된 CSS 없음)`이면 오타·미등록 토큰·Tailwind 밖 클래스다 — 그 자체가 지적 대상일 수 있다.
3. **비교** — 스펙 시트와 해석값을 `references/checklist.md`의 항목·심각도 기준으로 비교하고, `references/figma-to-css.md`의 변환 함정(inside stroke + border-box, Auto line-height, letter-spacing %, 레이어 opacity 등)으로 오탐을 거른다.
4. **토큰 대조** — Figma 변수가 있는 값은 코드가 **같은 의미의 토큰**을 쓰는지 본다. 값만 같고 하드코딩(`text-[#303030]`, 팔레트 직접 사용)이면 다크모드·테마 변경 때 깨지므로 🟡.
5. **수정 제안** — 시안 값을 내는 프로젝트 토큰을 역조회해 제안한다. 일치 토큰이 없으면 arbitrary value를 제안하고 '토큰 없음'을 적는다.
   ```bash
   node <스킬>/scripts/tw-resolve.mjs --cwd <루트> find spacing 12      # color #303030 | font-size 18 | radius 8 | font-weight 500 | line-height 24 | shadow
   ```

## 5단계 — 런타임 확인 (가능할 때만)

정적 대조는 상속·런타임 덮어쓰기·레이아웃 결과(실제로 보이는 간격)를 놓칠 수 있다. 화면을 열 수 있으면 측정으로 확인한다.

- **조건**: 런타임 URL이 주어졌거나, dev 서버/Storybook을 띄워(프로젝트의 launch 설정·`dev` 스크립트) 해당 화면에 도달할 수 있어야 한다. 로그인·특정 데이터·권한이 필요하면 사용자에게 방법을 묻고, 불가능하면 건너뛰고 리포트에 `런타임 ✗(사유)`로 적는다. 자격 증명을 직접 입력하지 않는다.
- **열기**: 사용 가능한 브라우저 도구(앱 내 브라우저 프리뷰, Chrome 확장, Playwright MCP 등)로 연다. 뷰포트 폭을 **Figma 프레임 폭**에 맞추고, 시안이 다크 모드면 테마도 맞춘다. 컴포넌트 단위면 Storybook story(`iframe.html?id=…`)가 가장 깨끗하다.
- **측정**: `<스킬>/scripts/inspect-dom.js`를 Read로 읽어 **파일 내용 전체 + 마지막 줄에 호출**을 붙여 브라우저 JS 도구로 실행한다.
  ```js
  __designReview.inspect({ text: '요금제 및 한도', depth: 2 })   // 대상 + 조상 2단계: padding·gap·색·폰트·실측 간격
  __designReview.tree({ text: '요금제 및 한도', up: 2, depth: 3 })  // 섹션 전체 구조 덤프
  ```
  `spacing.between`(형제 사이 실측 간격)과 `spacing.inset`(부모 안쪽 실측 여백)은 margin·leading·border까지 반영된 '보이는' 간격이라 Figma의 gap/padding과 직접 비교된다.
- **데이터 상태**: 실데이터 화면은 시안의 상태(예: 프로모션·80%·초과)와 다를 수 있다. 상태와 무관한 레이아웃·타이포는 런타임으로, 그 상태에서만 보이는 요소는 정적으로 판정하고 리포트 머리에 어느 상태를 런타임으로 봤는지 적는다. mock·테스트 토글·Storybook story로 상태를 바꿀 수 있으면 쓴다.
- 같은 문구가 여러 곳(사이드바 메뉴·페이지 제목·카드 제목)에 있으면 `index`나 `selector`로 대상을 고정한다.
- **판정**: 정적 🔴 후보를 측정값으로 확정하거나 기각하고, 정적 대조가 놓친 차이를 추가한다. 리포트의 `확인` 열에 `런타임`/`정적`을 적는다.
- **시각 비교**: 브라우저 스크린샷과 Figma 스크린샷을 나란히 보고 누락 요소·정렬·순서를 확인한다(수치는 측정값으로만 말한다).

## 6단계 — 리포트

```markdown
## 디자인 리뷰 — <화면/컴포넌트> (Figma <nodeId>)
프로필: Tailwind <버전> · root <N>px · 토큰 <위치> · 스코프 <.dark 등> · 런타임 <✓ URL | ✗ 사유>

| # | 등급 | 요소 (Figma → 코드) | 속성 | Figma | 코드 (해석값) | 수정 제안 | 확인 |
|---|---|---|---|---|---|---|---|
| 1 | 🔴 | S1 카드 → [Card.tsx:42](src/…/Card.tsx:42) | padding-top | 20px | 16px (`pt-4`) | `pt-5` (20px) | 런타임 |
| 2 | 🟡 | S1.1 제목 → [Card.tsx:45](…) | color | Texts/Primary #303030 | #303030 (`text-[#303030]`) | `text-texts-primary` | 정적 |

요약: 🔴 N · 🟡 N · 🟢 N · 확인 불가 N
누락 의심: <코드에서 못 찾은 시안 요소>
범위 밖(지적만): <노드 밖·기존 불일치>
```

- 값에는 단위를 붙이고, 코드 값은 해석값과 원 클래스를 함께 적는다.
- 같은 원인이 여러 요소에 반복되면(예: 공용 컴포넌트 padding) 한 행으로 묶고 영향 요소를 나열한다.
- 과장하지 않는다. 확신이 없으면 🟢 또는 '확인 불가'로 둔다.

## 7단계 — 수정 범위 선택

리포트 뒤 **반드시 AskUserQuestion**으로 고르게 한다(텍스트로 선택지를 나열하지 않는다). 지적이 0건이면 이 단계와 8단계를 건너뛰고 끝낸다.

1차 — question `"🔴 N · 🟡 N · 🟢 N. 수정 방식을 선택해주세요."`, header `"수정 방식"`:
- `묶음 수정` — 등급 범위를 다음 질문에서 선택
- `개별 선택` — 지적을 하나씩 보고 수정/스킵
- `전부 수정` — 🔴+🟡+🟢 전체
- `수정 없음` — 리포트만 남기고 종료 (🔴·🟡가 0건이면 `(Recommended)`)

2차(묶음) — header `"수정 등급"`: `🔴만 (N건)` / `🔴 + 🟡 (N건)` / `🔴 + 🟡 + 🟢 (N건)`. 🟢는 타당한 것만 고친다.
2차(개별) — 지적마다 question `"[등급] #n 요약"`, options `수정` / `스킵`. 4건씩 묶어 한 번에 물어도 된다.

## 8단계 — 반영 + 재검증

- **고른 항목만** 고친다. 클래스 교체가 기본이고, 구조(`cn`·cva·조건부 분기)는 유지한다.
- **토큰 우선**: `find`로 찾은 토큰을 쓴다. 토큰이 없으면 arbitrary value로 넣고, 토큰 추가는 제안만 한다(설정 파일 수정은 묻고 나서).
- **공용 컴포넌트**(공용 UI 디렉터리, 여러 화면이 쓰는 컴포넌트)를 고쳐야 하면, 사용처 수(grep)를 알리고 AskUserQuestion으로 '공용 컴포넌트 수정 / 이 화면에서만 className으로 덮어쓰기' 중 고르게 한다.
- **재검증**: 고친 요소의 클래스를 `tw-resolve resolve`로 다시 해석해 시안 값과 같은지 보고, 런타임을 썼다면 다시 측정한다. 이어서 `package.json` 스크립트 중 타입체크·린트(예: `tsc --noEmit`, `lint`)를 돌린다. 실패하면 출력 그대로 보고한다.
- 마지막에 고친 항목·남은 항목(스킵·확인 불가)을 표로 정리한다. **커밋·push는 하지 않는다.**

## 참고 파일

- `references/checklist.md` — 비교 항목, 심각도 기준(🔴🟡🟢), 오탐 제외 목록. **4단계 전에 읽는다.**
- `references/figma-to-css.md` — Figma 값 → CSS 변환 규칙과 함정. **4단계 전에 읽는다.**
- `references/tailwind.md` — v3/v4 토큰 탐지, 최종 클래스 산출 규칙, `tw-resolve` 사용·문제 해결, 수동 해석 절차.
- `scripts/tw-resolve.mjs` — 클래스 → px/hex 해석(`resolve`), 값 → 토큰 역조회(`find`). 프로젝트에 설치된 tailwindcss로 컴파일한다.
- `scripts/inspect-dom.js` — 브라우저 주입용 측정 스니펫(`inspect`, `tree`).
