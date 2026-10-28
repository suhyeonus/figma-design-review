// 디자인 리뷰 런타임 측정 스니펫 — 브라우저 JS 도구(앱 내 프리뷰·Chrome·Playwright evaluate)에 그대로 주입.
// 이 파일 내용 뒤에 호출 한 줄을 붙여 실행하면 결과 JSON이 반환된다.
//   __designReview.inspect({ text: '저장하기', depth: 2 })        시안 문구로 대상 찾기 (기본)
//   __designReview.inspect({ selector: '[data-testid=card]', index: 0 })
//   __designReview.tree({ text: '요금제', up: 2, depth: 3 })       섹션 전체 구조 + 핵심 스타일 덤프
// 값: px는 소수 1자리, 색은 #RRGGBB(+ αN). 기본값(0·none·투명)은 생략해 출력이 짧다.

window.__designReview = (() => {
  const r1 = n => Math.round(n * 10) / 10;
  const px = v => (v && v.endsWith('px') ? r1(parseFloat(v)) : v);

  let ctx;
  function hex(color) {
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null;
    let rgba;
    const m = color.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      rgba = [p[0], p[1], p[2], p[3] ?? 1];
    } else {
      // oklch·color() 등 → 캔버스로 sRGB 환산
      ctx = ctx || Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      rgba = [d[0], d[1], d[2], d[3] / 255];
    }
    if (rgba[3] === 0) return null;
    const h = '#' + rgba.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
    return rgba[3] >= 0.999 ? h : `${h} α${Math.round(rgba[3] * 100) / 100}`;
  }
  const colorsIn = v => v.replace(/(rgba?|oklch|oklab|color|hsla?)\([^)]*\)/g, c => hex(c) ?? 'transparent');

  const box4 = (cs, prop) => {
    const sides = ['top', 'right', 'bottom', 'left'].map(s => px(cs.getPropertyValue(prop.replace('*', s))));
    if (sides.every(v => v === 0)) return undefined;
    const [t, r, b, l] = sides;
    if (t === r && r === b && b === l) return t;
    if (t === b && r === l) return `${t} ${r}`;
    return sides.join(' ');
  };

  function label(el) {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`;
  }

  function ownText(el) {
    return [...el.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function styles(el) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const o = { el: label(el), box: { w: r1(rect.width), h: r1(rect.height), x: r1(rect.left), y: r1(rect.top + scrollY) } };
    const text = ownText(el);
    if (text) o.text = text.slice(0, 60);

    if (/flex|grid/.test(cs.display)) {
      o.layout = { display: cs.display };
      if (cs.display.includes('flex')) o.layout.direction = cs.flexDirection;
      if (cs.justifyContent !== 'normal') o.layout.justify = cs.justifyContent;
      if (cs.alignItems !== 'normal') o.layout.align = cs.alignItems;
      if (cs.flexWrap !== 'nowrap') o.layout.wrap = cs.flexWrap;
      const gp = v => (v === 'normal' ? 0 : px(v));
      const rg = gp(cs.rowGap), cg = gp(cs.columnGap);
      if (rg || cg) o.layout.gap = rg === cg ? rg : `${rg} ${cg}`;
    }
    const pcs = el.parentElement && getComputedStyle(el.parentElement);
    if (pcs && pcs.display.includes('flex')) {
      const f = `${cs.flexGrow} ${cs.flexShrink} ${cs.flexBasis}`;
      if (f !== '0 1 auto') o.flex = f;
      if (cs.alignSelf !== 'auto') o.alignSelf = cs.alignSelf;
    }
    const pad = box4(cs, 'padding-*');
    if (pad !== undefined) o.padding = pad;
    const mar = box4(cs, 'margin-*');
    if (mar !== undefined) o.margin = mar;
    const bw = box4(cs, 'border-*-width');
    if (bw !== undefined && cs.borderStyle !== 'none') o.border = `${bw} ${cs.borderTopStyle} ${hex(cs.borderTopColor) ?? 'transparent'}`;
    const rad = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(c => px(cs.getPropertyValue(`border-${c}-radius`)));
    if (rad.some(v => v !== 0)) o.radius = rad.every(v => v === rad[0]) ? rad[0] : rad.join(' ');

    const bg = hex(cs.backgroundColor);
    if (bg) o.background = bg;
    if (cs.backgroundImage !== 'none') o.backgroundImage = colorsIn(cs.backgroundImage).slice(0, 120);
    if (cs.boxShadow !== 'none') o.shadow = colorsIn(cs.boxShadow);
    if (cs.opacity !== '1') o.opacity = Number(cs.opacity);

    // 텍스트를 직접 가진 요소만 타이포 출력
    if (text) {
      o.font = {
        size: px(cs.fontSize),
        lineHeight: cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight),
        weight: Number(cs.fontWeight),
        family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        color: hex(cs.color),
      };
      if (cs.letterSpacing !== 'normal' && px(cs.letterSpacing) !== 0) o.font.letterSpacing = px(cs.letterSpacing);
      if (cs.textTransform !== 'none') o.font.transform = cs.textTransform;
      if (cs.textAlign !== 'start' && cs.textAlign !== 'left') o.font.align = cs.textAlign;
      if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none') o.font.truncate = cs.webkitLineClamp !== 'none' ? `line-clamp ${cs.webkitLineClamp}` : 'ellipsis';
    } else if (cs.color && el.querySelector('svg') === null && el.children.length === 0) {
      o.color = hex(cs.color);
    }
    if (el.tagName === 'svg' || el.tagName === 'IMG') o.color = hex(cs.color);
    return o;
  }

  // 자식 사이 실측 간격 + 첫/마지막 자식의 안쪽 여백 (margin·space-y·leading까지 반영된 '보이는' 간격)
  function spacing(el) {
    if (el.tagName.toLowerCase() === 'svg') return undefined;
    const kids = [...el.children].filter(k => {
      const r = k.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(k).position !== 'absolute' && getComputedStyle(k).position !== 'fixed';
    });
    if (!kids.length) return undefined;
    const pr = el.getBoundingClientRect();
    const rects = kids.map(k => k.getBoundingClientRect());
    const first = rects[0], last = rects[rects.length - 1];
    const vertical = rects.length < 2 || rects[1].top >= rects[0].bottom - 1;
    const between = rects.slice(1).map((r, i) => r1(vertical ? r.top - rects[i].bottom : r.left - rects[i].right));
    return {
      axis: vertical ? 'vertical' : 'horizontal',
      inset: { top: r1(Math.min(...rects.map(r => r.top)) - pr.top), right: r1(pr.right - Math.max(...rects.map(r => r.right))), bottom: r1(pr.bottom - Math.max(...rects.map(r => r.bottom))), left: r1(Math.min(...rects.map(r => r.left)) - pr.left) },
      between: between.length ? (between.every(b => b === between[0]) ? between[0] : between) : undefined,
      children: kids.map(label).slice(0, 12),
      first: { w: r1(first.width), h: r1(first.height) },
      last: { w: r1(last.width), h: r1(last.height) },
    };
  }

  function find({ text, selector, index = 0 }) {
    if (selector) return document.querySelectorAll(selector)[index] ?? null;
    const want = String(text).replace(/\s+/g, ' ').trim();
    const all = [...document.body.querySelectorAll('*')].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
    const exact = all.filter(e => ownText(e) === want);
    if (exact.length) return exact[index] ?? exact[0];
    // 자식 노드로 쪼개진 문구 → 텍스트 전체가 일치하는 가장 깊은 요소
    const whole = all.filter(e => e.textContent.replace(/\s+/g, ' ').trim() === want);
    const deepest = whole.filter(e => !whole.some(o => o !== e && e.contains(o)));
    if (deepest.length) return deepest[index] ?? deepest[0];
    // placeholder·aria-label 등 속성 문구 (입력창 안내 문구는 텍스트 노드가 아님)
    const attr = all.filter(e => ['placeholder', 'aria-label', 'title', 'alt'].some(a => e.getAttribute(a)?.replace(/\s+/g, ' ').trim() === want));
    if (attr.length) return attr[index] ?? attr[0];
    const partial = all.filter(e => ownText(e).includes(want));
    return partial[index] ?? null;
  }

  function env() {
    return {
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      rootFontSize: px(getComputedStyle(document.documentElement).fontSize),
      theme: document.documentElement.className.match(/\b(dark|light)\b/)?.[0] ?? document.documentElement.dataset.theme ?? 'default',
    };
  }

  function inspect(q) {
    const { depth = 2 } = q;
    const el = find(q);
    if (!el) return { env: env(), error: `대상을 찾지 못함: ${JSON.stringify(q)}` };
    const chain = [];
    for (let cur = el, i = 0; cur && cur !== document.body && i <= depth; cur = cur.parentElement, i++) {
      chain.push({ level: i === 0 ? 'target' : `parent+${i}`, ...styles(cur), spacing: spacing(cur) });
    }
    return { env: env(), chain };
  }

  function tree(q) {
    const { up = 0, depth = 3, maxNodes = 80 } = q;
    let el = find(q);
    if (!el) return { env: env(), error: `대상을 찾지 못함: ${JSON.stringify(q)}` };
    for (let i = 0; i < up && el.parentElement && el.parentElement !== document.body; i++) el = el.parentElement;
    let count = 0;
    const walk = (node, d) => {
      if (count++ >= maxNodes) return { truncated: true };
      const o = { ...styles(node), spacing: spacing(node) };
      if (d < depth) {
        const kids = [...node.children].filter(k => k.getBoundingClientRect().width > 0);
        if (kids.length) o.children = kids.map(k => walk(k, d + 1));
      }
      return o;
    };
    return { env: env(), root: walk(el, 0) };
  }

  return { inspect, tree, styles, spacing, hex };
})();
