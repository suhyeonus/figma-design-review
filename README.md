# figma-design-review

이미 구현된 **React·Next.js + Tailwind CSS** 화면을 **Figma 시안**과 수치로 대조하는 Claude Code 스킬이다. 공백(padding·gap·margin), 크기, 컬러, 텍스트 스타일, radius, 그림자, 디자인 토큰 이탈을 찾아 🔴🟡🟢 리포트로 내고, 사용자가 고른 범위만 고친다.

- Figma 값은 Figma MCP에서 가져온다.
- 코드 값은 두 경로로 얻는다. 정적으로는 프로젝트에 설치된 tailwindcss로 클래스를 컴파일해 px/hex로 해석하고, 런타임으로는 브라우저 computed style과 실측 간격을 잰다.
- root font-size(예: `html { font-size: 14px }`), CSS 변수 체인, 다크 스코프를 반영하므로 클래스를 암산할 때 생기는 오판이 없다.

## 요구사항

| 항목 | 내용 |
|---|---|
| Claude Code | 스킬을 지원하는 버전 |
| Figma MCP | `get_design_context`·`get_metadata`·`get_screenshot`·`get_variable_defs`를 제공하는 Figma MCP 서버 (아래 '연결') |
| Node.js | 18 이상 (`scripts/tw-resolve.mjs`) |
| 대상 프로젝트 | `node_modules`에 `tailwindcss` v3 또는 v4가 설치되어 있어야 한다. v3는 `postcss`, v4는 `@tailwindcss/postcss`·`vite`·`cli` 중 하나가 필요하며, 보통 이미 설치되어 있다. |
| 선택 | 런타임 확인용 브라우저 도구(Claude 앱 내 브라우저, Chrome 확장, Playwright MCP 등) |

## 설치

사용자 전역에 설치하면 모든 프로젝트에서 쓸 수 있다.

```bash
git clone https://github.com/suhyeonus/figma-design-review.git ~/.claude/skills/figma-design-review
```

private 저장소라 clone할 때 GitHub 인증이 필요하다(`gh auth login` 또는 SSH 키). 다음 세션부터 `/figma-design-review`로 쓸 수 있다.

특정 프로젝트에만 쓰려면 그 프로젝트의 `.claude/skills/figma-design-review`에 clone한다. 그 프로젝트 저장소에 커밋되지 않게 `.gitignore`를 확인한다.

### 업데이트

```bash
git -C ~/.claude/skills/figma-design-review pull
```

## Figma MCP 연결

둘 중 하나로 연결한다.

1. **Figma 공식 플러그인**(권장): `figma-design-to-code` 등 Figma 스킬이 함께 설치된다.
   ```bash
   claude plugin install figma@claude-plugins-official
   ```
2. **원격 MCP 서버만**: [`examples/mcp.json`](examples/mcp.json)을 프로젝트 `.mcp.json`으로 쓰거나 아래 명령으로 추가한다.
   ```bash
   claude mcp add --transport http figma https://mcp.figma.com/mcp
   ```

연결한 뒤 Claude Code에서 `/mcp`로 Figma 인증을 마친다. 스킬은 도구 이름의 접두사(`mcp__plugin_figma_figma__…`, `mcp__figma__…` 등)에 의존하지 않고, 필요하면 ToolSearch로 찾는다.

## 설정 예시 (선택)

[`examples/settings.json`](examples/settings.json)은 Figma 플러그인 활성화와 **읽기 전용** Figma 도구·해석 스크립트의 권한 허용 예시다. 리뷰할 때 권한 창을 줄이고 싶으면 `~/.claude/settings.json`에 병합한다(JSON에 주석을 달 수 없어 설명은 여기에 둔다).

- 원격 MCP로 연결했다면 도구 이름의 접두사를 `mcp__figma__`로 바꾼다.
- Claude가 스크립트를 절대 경로로 실행하면 `Bash(...)` 규칙에 걸리지 않을 수 있다. 그때 권한 창이 뜬다.
- 쓰기 도구(`use_figma` 등)는 허용 목록에 넣지 않는다. 스킬은 Figma를 읽기만 한다.

## 사용법

```
/figma-design-review <figma-url(node-id 포함)> [코드 경로|라우트|컴포넌트] [런타임 URL]
```

예: `/figma-design-review https://www.figma.com/design/<fileKey>/<name>?node-id=123-456 src/features/billing http://localhost:3000/billing`

"피그마랑 간격 맞는지 봐줘", "시안대로 됐는지 디자인 QA 해줘"처럼 말해도 실행된다. 시안을 **새로 구현**하는 요청에는 쓰지 않는다.

진행 순서:
1. 프로젝트 프로필을 자동으로 탐지한다(Tailwind 버전, root font-size, 토큰 위치, 다크 스코프).
2. Figma 스펙을 수집한다. 시안과 코드가 같은 화면인지 먼저 확인하고, 상태별 프레임을 정리하고, SVG 에셋의 색까지 읽는다.
3. 시안 요소를 코드 위치(`file:line`)에 매핑한다.
4. 정적 대조: `tw-resolve`로 클래스를 해석하고 토큰을 대조한다.
5. 런타임 확인(가능할 때만): `inspect-dom.js`로 computed style과 실측 간격을 잰다.
6. 🔴🟡🟢 리포트를 낸 뒤 수정 범위를 묻는다. 고른 항목만 고치고 다시 검증한다. 커밋·push는 하지 않는다.

## 구성

| 파일 | 역할 |
|---|---|
| `SKILL.md` | 워크플로우 본문 (Claude가 읽는 스킬) |
| `references/checklist.md` | 비교 항목, 심각도 기준(🔴🟡🟢), 오탐 제외 목록 |
| `references/figma-to-css.md` | Figma 값 → CSS 변환 규칙과 함정(inside stroke + border-box, Auto line-height 등) |
| `references/tailwind.md` | v3/v4 토큰 탐지, 최종 클래스 산출 규칙(twMerge·cva·상속), `tw-resolve` 사용법 |
| `scripts/tw-resolve.mjs` | 클래스 → px/hex 해석(`resolve`), Figma 값 → 프로젝트 토큰 역조회(`find`) |
| `scripts/inspect-dom.js` | 브라우저 주입용 측정 스니펫(`inspect`, `tree`) |
| `examples/` | Figma MCP·권한 설정 예시 |

## 스크립트 단독 사용

```bash
S=~/.claude/skills/figma-design-review/scripts/tw-resolve.mjs
node $S --cwd <프로젝트 루트> resolve "p-4 gap-sm text-texts-primary rounded-md"
node $S --cwd <프로젝트 루트> find spacing 12
node $S --cwd <프로젝트 루트> find color "#303030"
node $S --help
```

## 한계

- 클래스 해석은 Tailwind 클래스만 다룬다. 인라인 `style`·CSS Modules·styled-components는 수동으로 읽거나 런타임 측정으로 확인한다.
- 런타임 확인은 해당 화면에 도달할 수 있을 때만 한다(로그인·데이터 상태). 시안 상태와 실데이터가 다르면 그 부분은 정적 판정으로 남는다.
- Figma blur·corner smoothing·vertical trim처럼 CSS로 1:1 재현되지 않는 값은 🟢(근사)로 다룬다.
