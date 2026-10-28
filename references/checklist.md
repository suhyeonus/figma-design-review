# 비교 항목 · 심각도 기준 · 오탐 제외

## 비교 항목

요소마다 아래 항목 중 시안에 값이 있는 것만 비교한다. "Figma 근거"는 스펙 시트, "코드 근거"는 `tw-resolve` 해석값이나 `inspect-dom` 측정값이다.

| 영역 | 비교 대상 | Figma 근거 | 코드 근거 |
|---|---|---|---|
| 레이아웃 | 방향, 정렬(주축·교차축), wrap | auto-layout direction / alignment | `flex-row/col`, `justify-*`, `items-*` · 측정 `layout` |
| 공백 | padding T/R/B/L, gap(행·열), 형제 간 간격, 섹션 간 간격 | auto-layout padding·spacing, 프레임 간 거리 | `p*-`, `gap-*`, `space-*`, `m*-` · 측정 `spacing.inset/between` |
| 크기 | 너비·높이, min/max, hug/fill/fixed | layout sizing, w/h | `w-*`, `h-*`, `size-*`, `flex-1`, `min-w-*` · 측정 `box` |
| 컬러 | 배경, 텍스트, 아이콘 | fill + 변수명 | `bg-*`, `text-*`, `fill/stroke-*`, `currentColor` |
| 선 | 두께, 색, 위치(inside/center/outside), 일부 면만 | stroke | `border*`, `ring-*`, `outline-*`, `divide-*` |
| 모서리 | radius(모서리별) | corner radius | `rounded-*` |
| 효과 | 그림자, blur, 투명도 | effects, layer/fill opacity | `shadow-*`, `blur-*`, `opacity-*`, 색 alpha |
| 타이포 | family, size, weight, line-height, letter-spacing, 대소문자, 정렬, 말줄임 | text style + 변수명 | `text-*`(size·스타일 토큰), `font-*`, `leading-*`, `tracking-*`, `uppercase`, `truncate/line-clamp-*` |
| 아이콘·이미지 | 크기, 색, 비율, object-fit | 프레임/벡터 크기, fill | `size-*`/`w-h`, `text-*`, `object-*` |
| 구조 | 요소 누락·추가·순서, 구분선 유무 | 레이어 트리 | JSX 구조 · 스크린샷 |
| 상태 | hover·active·disabled·selected·focus·empty 등 | 시안에 **그려진** 상태 프레임/변형만 | `hover:` `disabled:` `data-[state=…]:` 조건부 클래스 |
| 토큰 | 같은 값이어도 같은 의미의 토큰을 쓰는가 | 변수명(`Texts/Primary`) | 클래스 토큰(`text-texts-primary`) vs 하드코딩 |

## 심각도 기준

| 등급 | 기준 | 예 |
|---|---|---|
| 🔴 반드시 수정 | **렌더 값이 시안과 다름** — 사용자가 보면 다르다 | 공백·크기 차이 ≥ 2px · 색이 눈에 띄게 다름(채널 차 > 8 또는 alpha 차 > 0.05) · font-size/weight 다름 · line-height 차이 ≥ 2px · radius 다름(≥ 2px) · 요소 누락/순서 다름 · 그려진 상태 미구현 · 그림자 유무 다름 |
| 🟡 수정 권장 | **값은 거의 같지만 유지보수·테마에서 깨짐**, 또는 경계값 | Figma 변수가 있는데 하드코딩(`text-[#303030]`, `bg-gray-100`, `p-[12px]` 대신 토큰 존재) · 근사 색(채널 차 3~8 — 보통 토큰 대신 비슷한 hex를 쓴 경우) · 1px 차이 · letter-spacing 누락/다름 · 같은 hex지만 다른 의미 토큰(예: 본문색에 `texts-secondary`) · twMerge 없이 충돌 클래스 공존 |
| 🟢 선택 | 변환 노이즈·취향·근사 | ≤ 0.5px · inside stroke로 생긴 1px(figma-to-css 참고) · Figma `Auto` line-height · corner smoothing · blur 근사 · 다크 모드 시안 없이 추정만 가능한 값 |

판단이 애매하면 한 단계 낮춘다. 렌더 결과가 같은데 🔴로 올리지 않는다.

## 오탐 제외 · 지적하지 않는 것

- **동적 내용**: API 데이터 문구·숫자·이미지, 사용자 입력, 날짜. 시안의 더미 텍스트와 코드 문구가 다른 것은 지적하지 않는다(정적 카피가 명백히 다르면 '참고'로만).
- **범위 밖**: 링크된 노드 밖 요소, 리뷰 대상 파일 밖에서 온 차이(→ '범위 밖' 줄에만).
- **생성 코드의 구조**: `get_design_context` 코드의 `absolute`·`left-[…]`·고정 `w/h`는 프로토타입이다. 코드가 flex/반응형으로 같은 결과를 내면 지적하지 않는다.
- **반응형 폭**: 시안 프레임 폭에서 같은 결과면 `w-full`·`flex-1`·`max-w-*` 차이는 지적하지 않는다.
- **브라우저 기본/폰트 렌더링 차이**: 안티앨리어싱, 글리프 폭으로 생긴 텍스트 박스 폭 차이.
- **시안끼리의 불일치**: 같은 컴포넌트가 프레임마다 다르게 그려졌으면 코드를 탓하지 말고 '시안 확인 필요'로 적는다.
- **이미 같은 원인으로 묶은 항목**: 공용 컴포넌트 하나 때문에 여러 곳이 다르면 한 행으로 묶는다.

## 행 작성 규칙

- `Figma` 열: 값 + 단위, 변수명이 있으면 `Texts/Primary #303030`처럼 함께 적는다.
- `코드` 열: 해석값 + 원 클래스. 예: `16px (pt-4)`, `#303030 (text-[#303030])`. 상속된 값이면 출처를 적는다: `#777778 (부모 Card.tsx:40 text-texts-secondary)`.
- `수정 제안` 열: 토큰 클래스 우선(`find` 결과), 없으면 arbitrary value + "토큰 없음".
- `확인` 열: `정적` / `런타임` / `확인 불가(사유)`.
