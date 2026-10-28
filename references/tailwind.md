# Tailwind 토큰 탐지 · 최종 클래스 산출 · tw-resolve

## 버전과 토큰 위치

| | v3 | v4 |
|---|---|---|
| 판별 | `tailwind.config.{ts,js,cjs,mjs}` 존재, 전역 CSS에 `@tailwind base` | 전역 CSS에 `@import "tailwindcss"`, `@theme {}`, devDeps에 `@tailwindcss/postcss`(또는 vite) |
| 토큰 정의 | config `theme`/`theme.extend` (spacing·colors·fontSize·borderRadius·boxShadow…) | CSS `@theme { --color-*, --spacing, --text-*, --radius-*, --shadow-* }` |
| 테마 값 | config가 `rgba(var(--x))`·`hsl(var(--x))`로 CSS 변수 참조 → 전역 CSS `:root`/`.dark`에 실제 값 | `:root`/`.dark` 변수 + `@theme inline { --color-background: var(--background) }`(shadcn 패턴) |
| 기본 spacing | 키 단위 0.25rem (`p-4` = 1rem), 정의된 키만 사용 가능 | `--spacing: 0.25rem`의 배수, 아무 숫자 가능(`p-13` = 3.25rem) |
| 다크 | `darkMode: 'class'` → `dark:`가 `.dark` 조상 기준 | 기본 `prefers-color-scheme`, `@custom-variant dark (&:is(.dark *))`로 바꾼 경우 많음 |

- **rem은 프로젝트의 root font-size 기준이다.** `html { font-size: 14px }`이면 `p-4`는 14px, `text-sm`(0.875rem)은 12.25px다. 16을 가정하지 않는다.
- 단, **미디어 쿼리 안의 rem은 html font-size가 아니라 브라우저 기본값(16px) 기준**이다. v4의 `md:`(48rem)는 root를 14px로 줄여도 768px에서 켜진다.
- shadcn/ui: `components.json`의 `aliases.ui`가 공용 컴포넌트 위치, `cssVariables: true`면 `bg-background`·`text-muted-foreground` 같은 시맨틱 토큰을 쓴다.
- 디자인 토큰 파이프라인(Style Dictionary·Tokens Studio·`tokens/*.json`)이 있으면 Figma 변수명과 CSS 변수명이 대응되는 경우가 많다. 이름을 맞대 보는 데 쓴다.

### v3 습관이 v4에서 값이 다른 클래스

AI가 v3 지식으로 구현했을 때 v4 프로젝트에서 시안과 어긋나는 흔한 원인이다.

| 클래스 | v3 | v4 |
|---|---|---|
| `shadow-sm` / `shadow` | 작은 그림자 / 기본 | 한 단계씩 밀림 (`shadow-xs`가 v3의 `shadow-sm`) |
| `rounded-sm` / `rounded` | 2px / 4px | `rounded-xs` 2px / `rounded-sm` 4px |
| `blur-sm` / `blur` | — | 한 단계씩 밀림 (`blur-xs`가 v3의 `blur-sm`) |
| `ring` | 3px, blue-500 | 1px, currentColor (`ring-3`이 v3의 `ring`) |
| `border`(색 미지정) | gray-200 (theme `borderColor.DEFAULT`) | **currentColor** |

## 최종 클래스 산출 규칙 (정적 대조 4단계)

한 요소에 실제 적용되는 클래스를 모을 때:

1. **`cn()` = `twMerge(clsx(...))`**: 같은 속성을 놓고 충돌하는 클래스는 **뒤에 온 것이 이긴다**(`cn('p-4', className)`에 `p-2`를 넘기면 `p-2`). `clsx`만 쓰고 twMerge가 없으면 둘 다 출력되고, 승자는 클래스 순서가 아니라 **생성된 CSS 순서**로 정해진다 → 충돌 공존 자체를 🟡로 지적한다.
   - **커스텀 `text-*` 토큰 함정**: tailwind-merge는 config의 커스텀 fontSize 키를 모르면(`extendTailwindMerge`에 `font-size` 그룹 미등록) `text-title-bold`(크기)와 `text-texts-primary`(색)를 **같은 색 그룹으로 보고 앞의 것을 지운다**. 이런 프로젝트는 보통 `!text-title-bold text-texts-primary`처럼 `!`로 피해 간다. 최종 클래스를 셀 때 `cn` 안에서 크기·색 토큰이 둘 다 `!` 없이 있으면 하나가 사라졌는지 확인하고, 수정 제안도 같은 방식(`!`)을 따른다. `lib/utils`의 `extendTailwindMerge` 설정으로 판별한다.
2. **cva**: `base` → `variants[prop][value]` → 조건이 맞는 `compoundVariants` → 호출 시 `className`(보통 cn으로 병합). `defaultVariants`도 확인한다. 화면에서 넘기는 prop 값을 따라간다.
3. **조건부 클래스**(`isActive && 'bg-x'`, 삼항): 시안이 그린 상태와 맞는 분기를 고른다. 상태가 여러 개 그려졌으면 상태별로 따로 비교한다.
4. **상태 변형** `hover:`·`focus-visible:`·`disabled:`·`aria-*:`·`data-[state=open]:`·`group-hover:`: 기본 상태 비교에서는 빼고, 해당 상태 시안이 있을 때만 비교한다.
5. **반응형 접두사** `sm: md: lg:`: 시안 프레임 폭에서 켜지는 것만 적용한다. 기본 브레이크포인트는 640/768/1024/1280/1536px이고, 커스텀이면 v3 `theme.screens`, v4 `--breakpoint-*`를 본다.
6. **상속**: `color`, `font-*`, `line-height`, `letter-spacing`은 부모에서 상속된다. 텍스트 요소에 클래스가 없으면 조상을 따라 올라가 출처를 찾는다. 아이콘 색은 `currentColor`로 부모 `text-*`를 따른다.
7. **전역 base 스타일**: 전역 CSS의 `body { @apply … }`, `* { @apply border-border }`, 엘리먼트 기본 스타일(`h1`, `button`)이 기본값이 된다.
8. **Tailwind 밖 스타일**: `style={{…}}`, CSS Modules, `@apply` 클래스, styled-components는 `tw-resolve`가 해석하지 못한다. 직접 읽어 값을 적거나 런타임 측정으로 확인한다.
9. **`!` 접두사**(`!p-0`, v4는 `p-0!`)는 important라서 다른 규칙을 이긴다.

## tw-resolve 사용법

```bash
S=<스킬>/scripts/tw-resolve.mjs
node $S --cwd <루트> resolve "<공백으로 구분한 클래스들>"   # 한 번에 여러 개 — 요소별로 나눠 부르지 않는다
node $S --cwd <루트> find spacing 12          # 12px를 내는 spacing 토큰
node $S --cwd <루트> find color "#303030"     # hex·rgb() 가능, 시맨틱(테마 대응) 토큰이 먼저 나온다
node $S --cwd <루트> find font-size 18        # 사이즈가 같은 텍스트 스타일 토큰들(line-height·weight 함께 표시)
node $S --cwd <루트> find radius 8 | find font-weight 500 | find line-height 24 | find shadow
```

옵션: `--css <파일>`(전역 CSS·v4 엔트리 지정, 여러 번 가능), `--config <파일>`(v3 설정), `--root-px <N>`(root font-size 강제), `--json`.

출력 읽기:
- 첫 줄: `tailwind 버전 · root font-size (출처) · CSS 파일 · 대체 스코프`. root font-size 출처가 `기본값`인데 프로젝트가 html font-size를 다른 곳(레이아웃 인라인 스타일 등)에서 바꾼다면 `--root-px`로 고친다.
- `속성: 원값 → 해석값 | .dark: 값` — 스코프별로 값이 다를 때만 덧붙는다. `dark:` 변형 클래스는 `.dark 전용:` 값만 보인다.
- `[:hover]`, `[@media …]` 같은 대괄호는 그 규칙의 적용 조건이다.
- 무단위 line-height는 같은 클래스의 font-size가 있으면 `(= Npx)`를 병기한다.
- `(생성된 CSS 없음)`: 오타, 등록되지 않은 토큰, Tailwind 클래스가 아님(커스텀 CSS 클래스), 또는 v3에서 config에 없는 키.
- `find`의 `≈ 차이`: ±0.5px(색은 채널 ±2) 안이면 '일치'로 묶이되 차이를 표시한다.

문제 해결:
- **monorepo**: `--cwd`를 앱 디렉터리(그 앱의 package.json이 있는 곳)로 준다. node_modules는 상위로 올라가며 찾는다.
- **pnpm**: `@tailwindcss/node`가 루트에 호이스팅되지 않아도 `@tailwindcss/postcss`·`vite`·`cli` 경유로 찾는다.
- **엔트리 CSS 여러 개**(앱·스토리북 등): 첫 줄의 CSS 목록을 보고 맞지 않으면 `--css`로 지정한다.
- **v3 < 3.3**: TS 설정을 못 읽으면 JS 설정 경로를 `--config`로 준다.
- 실패하면 아래 수동 절차로 해석하고, 리포트에 '수동 해석'이라고 적는다.

## 수동 해석 절차 (스크립트 실패 시)

1. root font-size를 확인한다: 전역 CSS의 `html`/`:root { font-size }`, 없으면 16px.
2. 클래스 키로 토큰 값을 찾는다: v3는 config `theme.extend` → 없으면 Tailwind 기본값, v4는 `@theme` → 없으면 `node_modules/tailwindcss/theme.css`.
3. `var(--x)`를 전역 CSS의 `:root` → `.dark` 순으로 따라가 최종 값을 얻는다(체인이 여러 단계일 수 있다).
4. rem × root font-size = px. `calc(var(--spacing) * n)`는 `--spacing` × n이다.
5. `rgba(48, 48, 48)` → `#303030`, `oklch()`는 런타임 측정(`inspect-dom.js`의 hex)으로 확인한다.
