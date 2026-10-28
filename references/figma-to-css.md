# Figma 값 → CSS 변환 규칙과 함정

시안 값과 코드 값을 비교하기 전에 같은 기준으로 맞춘다. 아래 함정을 모르면 맞는 구현을 틀렸다고 하거나 틀린 구현을 놓친다.

## Auto layout → flex

| Figma | CSS / Tailwind |
|---|---|
| Horizontal / Vertical | `flex-row` / `flex-col` |
| Spacing between items = N | `gap-*` (N px) |
| Spacing between = **Auto** | `justify-between` (gap 값은 무의미) |
| Padding T/R/B/L | `pt/pr/pb/pl` 또는 `px/py` |
| Alignment (9칸) | 주축 → `justify-*`, 교차축 → `items-*` |
| Wrap + 행 간격 | `flex-wrap` + `gap-y-*`(교차축 spacing) |
| 자식의 Absolute position | `absolute` (flex 흐름 밖) |
| Hug contents | 내용 크기 (`w-fit`/기본값) |
| Fill container | 주축: `flex-1` / 교차축: `self-stretch`·`w-full` |
| Fixed | `w-[N]`/`h-[N]` 또는 토큰 |
| Min/Max W·H | `min-w-*`, `max-w-*` |

auto-layout이 아닌 프레임(자유 배치)은 좌표 차이로 간격을 계산한다. 이때는 `get_metadata`의 x/y/w/h로 형제 사이 거리를 구해 비교한다.

## 선(stroke)과 border-box — 가장 흔한 1px 오판

- Figma 프레임의 stroke 기본값은 **Inside**이고, inside stroke는 **레이아웃 공간을 차지하지 않는다**. padding은 프레임 바깥 경계에서 잰다.
- Tailwind preflight는 `box-sizing: border-box`라서 CSS `border`는 **박스 안쪽 공간을 차지하고**, padding은 border 안쪽에서 시작한다.
- 따라서 Figma `padding 12 + inside stroke 1`을 정확히 맞추면 CSS는 `p-[11px] border`다. 구현이 `p-3 border`(12px)면 내용이 1px 안쪽으로 밀린다 → **🟢**(의도된 근사로 흔함). 2px 이상 stroke면 🟡 이상으로 본다.
- Center stroke는 절반만 안쪽을 차지하고, Outside stroke는 안쪽에 영향이 없다 → CSS `outline`이나 `ring`(box-shadow라 레이아웃 무영향)에 해당한다.
- 한 면만 있는 stroke(Individual strokes) → `border-b` 등. 구분선이 별도 레이어(Line·Rectangle)로 그려졌으면 `divide-*`·`border-t`·`<hr>`, 어느 것이든 같은 결과면 된다.
- 런타임 측정의 `spacing.inset`은 border를 포함한 실제 내용 위치라서, Figma padding(+inside stroke 무시)과 바로 비교할 수 있다.

## 타이포그래피

- **font-size**: px 그대로 비교한다. 코드 쪽 rem은 root font-size로 환산한다(`tw-resolve`가 처리).
- **line-height**:
  - px → px로 비교한다.
  - % → font-size의 %이므로 `140%` = `leading-[1.4]` = size × 1.4 px.
  - **Auto** → 폰트 고유값(대략 1.2~1.5)이라 CSS `normal`에 해당한다. **Auto는 수치로 비교하지 않는다.** 렌더 결과(텍스트 박스 높이)가 크게 다를 때만 지적한다.
- **letter-spacing**: Figma `%`는 font-size 대비 → `em`으로 바꾼다(`-2%` = `-0.02em` = `tracking-[-0.02em]`). px는 px 그대로. Tailwind `tracking-tight`는 `-0.025em`.
- **weight 이름**: Thin 100 · ExtraLight 200 · Light 300 · Regular 400 · Medium 500 · SemiBold 600 · Bold 700 · ExtraBold 800 · Black 900. `get_design_context`가 `font-['Pretendard:Bold']`처럼 주면 이름에서 숫자를 읽는다.
- **family**: Figma 폰트명과 CSS 변수(`next/font`의 `--font-*`)가 같은 서체인지만 확인한다. 이름 표기 차이는 지적하지 않는다.
- **텍스트 박스와 간격**: Figma 텍스트 노드 높이는 line-height × 줄 수다. 코드의 line-height가 다르면 `gap`이 같아도 **보이는 간격이 달라진다**. 이 경우 gap이 아니라 line-height를 지적한다.
- **Vertical trim**(cap height to baseline): CSS에서 1:1로 재현하기 어렵다(`text-box-trim` 지원 제한). 이로 인한 간격 차이는 🟢.
- **Text case**, **Truncate text / Max lines** → `uppercase`, `truncate` / `line-clamp-N`.
- **Paragraph spacing** → 문단 사이 margin/gap.

## 컬러

- Figma fill의 **fill opacity**는 색 alpha(`bg-black/50`, `#00000080`)이고, **layer opacity**는 자식까지 함께 흐려지는 `opacity-*`다. 둘을 혼동하면 자식 텍스트 색이 달라진다.
- **여러 fill이 겹치면** 위 레이어가 우선이다. 반투명 fill 겹침은 합성 색으로 비교한다(런타임 측정이나 스크린샷으로 확인).
- **변수(Variables)**: `Texts/Primary` ↔ CSS `--texts-primary` ↔ Tailwind `text-texts-primary`처럼 이름이 이어지는 경우가 많다. 모드(Light/Dark)는 `.dark` 등 스코프 값과 비교한다. `get_variable_defs`가 이름 → 값 매핑을 준다.
- **그라디언트**: 색 정지점과 방향만 비교한다(Figma 핸들 각도와 CSS 각도 환산은 근사).
- hex 비교는 채널 차 ±2까지 같은 색으로 본다(색 공간 변환 반올림).

## 효과

- **Drop shadow** `x y blur spread color` → `box-shadow: x y blur spread color`. 숫자는 그대로 대응한다. 여러 개면 순서대로 쉼표로 잇는다.
- **Inner shadow** → `inset` box-shadow.
- **Layer blur / Background blur** → `blur-*` / `backdrop-blur-*`. Figma blur 값과 CSS `blur()` 값은 1:1이 아니다(대략 절반). 수치 대신 스크린샷으로 판단하고 기본 🟢.

## 크기·반올림·좌표

- Figma 값에 소수(15.99, 120.5)가 섞이는 건 스케일링·제약 때문이다. **±0.5px는 노이즈**로 본다.
- 시안 프레임 폭(예: 1440, 375)에서 비교한다. 반응형 코드에서 `w-full`인 요소는 그 폭에서 같은지만 본다.
- `get_design_context`의 생성 코드는 absolute 좌표·고정 크기를 쓰는 프로토타입이다. 레이아웃 판단은 auto-layout 속성과 metadata로 한다.

## 아이콘·이미지

- 아이콘은 **프레임 크기**(예: 20×20)와 **벡터 크기**가 다르다. 코드의 `size-5`는 프레임 크기와 비교한다.
- 아이콘 색은 보통 `currentColor`로 상속되므로 부모의 `text-*`를 확인한다.
- `get_design_context`는 아이콘·작은 점·구분선 같은 벡터를 **색 값 없이 SVG 에셋 URL로만** 준다. 비교하려면 에셋을 받아 `fill`/`stroke` 값을 읽는다. 받지 않고 넘어가면 '확인 불가'로 적는다.
- 이미지 Fill / Fit / Crop → `object-cover` / `object-contain` / 고정 위치.
- corner smoothing(iOS 스타일 둥근 모서리)은 CSS로 재현할 수 없으므로 지적하지 않는다.

## 컴포넌트·변형

- Figma 인스턴스가 variant 속성(Size=M, State=Hover)을 가지면, 코드에서도 **같은 variant prop**을 쓰는지 먼저 본다. 인스턴스마다 클래스로 덮어쓴 구현은 🟡(유지보수)이고, 값이 다르면 🔴.
- 인스턴스 오버라이드(색·텍스트만 바꾼 것)는 그 값만 비교한다.
