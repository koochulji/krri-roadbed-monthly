// 주례 예시.hwpx 기반 새 템플릿용 section-builder.
//
// 템플릿 구조 (3개 표):
//   Table 1: 본부명 헤더 (고정 — 변경 안 함)
//   Table 2: 구분/내용/비고 헤더 행 + 주요 보고사항 행 → {{MAIN_BODY_SUBLIST}}
//   Table 3:
//     지난 주 실적 (range) / {{PAST_BODY_SUBLIST}}
//     이번 주 계획 (range) / {{NEXT_BODY_SUBLIST}}
//   "□ 일반 보고사항" 텍스트는 표 사이에 고정으로 들어가 있음.
//
// 라벨 셀 (지난주/이번주) 의 날짜 범위는 매번 갱신해야 하므로 {{PAST_LABEL_SUBLIST}} /
// {{NEXT_LABEL_SUBLIST}} 로 통째로 교체.

import { SECTION_TEMPLATE_XML } from './hwpx-assets.js';
import { PARA, CHAR, LINESEG_PRESET } from './id-map.js';

// ───────────────── 공통 헬퍼 ─────────────────

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function lineseg(presetName) {
  const p = LINESEG_PRESET[presetName] ?? LINESEG_PRESET.body;
  return `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${p.vertsize}" textheight="${p.textheight}" baseline="${p.baseline}" spacing="${p.spacing}" horzpos="${p.horzpos}" horzsize="${p.horzsize}" flags="${p.flags}"/></hp:linesegarray>`;
}

// 단일 run 문단. preset:'auto' (기본) → linesegarray 생략 (한글 재계산).
function P(paraId, charId, text, { preset = 'auto' } = {}) {
  const t = (text === '' || text == null)
    ? '<hp:t/>'
    : `<hp:t>${xmlEscape(text)}</hp:t>`;
  const seg = preset === 'auto' ? '' : lineseg(preset);
  return `<hp:p id="0" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`
    + `<hp:run charPrIDRef="${charId}">${t}</hp:run>`
    + seg
    + `</hp:p>`;
}

// 다중 run 문단 (한 줄에 굵게/일반 혼합)
function Pmulti(paraId, runs, { preset = 'auto' } = {}) {
  const runsXml = runs.map(([cid, text]) => {
    const t = (text === '' || text == null)
      ? '<hp:t/>'
      : `<hp:t>${xmlEscape(text)}</hp:t>`;
    return `<hp:run charPrIDRef="${cid}">${t}</hp:run>`;
  }).join('');
  const seg = preset === 'auto' ? '' : lineseg(preset);
  return `<hp:p id="0" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`
    + runsXml
    + seg
    + `</hp:p>`;
}

// 포맷: "오송시험선로 디지털화를 위한 시험선 답사(4/13, ESNT, 박정준)"
export function formatItem(item) {
  const meta = [item.date, item.org, item.person]
    .filter(x => x && String(x).trim())
    .join(', ');
  const text = (item.text ?? '').trim();
  if (!meta) return text;
  return `${text}(${meta})`;
}

// "2026-04-20" → "04. 20." 형식
function formatRangeDot(a, b) {
  const compact = (s) => {
    const m = String(s ?? '').match(/^\d{4}-(\d{2})-(\d{2})/);
    return m ? `${m[1]}. ${m[2]}.` : (s ?? '');
  };
  if (!a && !b) return '';
  return `${compact(a)} ∼ ${compact(b)}`;
}

// ───────────────── 카테고리 / kind ─────────────────

export const KIND_ORDER = ['basic', 'natl_rnd', 'consign', 'etc'];
export const KIND_NAMES = {
  basic: '기본사업',
  natl_rnd: '국가R&D',
  consign: '수탁사업',
  etc: '기타',
};

function kindHeaderLabel(kind) {
  return `<${KIND_NAMES[kind] ?? kind}>`;
}

// ───────────────── entries 정규화 ─────────────────

// 다양한 entries 형식을 [{categoryId, past, next}] 로 정규화
function flattenSubmissionEntries(sub) {
  const e = sub?.entries;
  if (Array.isArray(e) && e.every(x => 'past' in x || 'next' in x)) {
    return e.map(x => ({
      categoryId: x.categoryId,
      past: Array.isArray(x.past) ? x.past : [],
      next: Array.isArray(x.next) ? x.next : [],
    }));
  }
  if (Array.isArray(e)) {
    return e.map(x => ({
      categoryId: x.categoryId,
      past: Array.isArray(x.items) ? x.items : [],
      next: [],
    }));
  }
  if (e && (Array.isArray(e.past) || Array.isArray(e.next))) {
    const map = new Map();
    for (const ent of (e.past ?? [])) {
      const key = ent?.categoryId;
      if (!key) continue;
      if (!map.has(key)) map.set(key, { categoryId: key, past: [], next: [] });
      map.get(key).past.push(...(ent.items ?? []));
    }
    for (const ent of (e.next ?? [])) {
      const key = ent?.categoryId;
      if (!key) continue;
      if (!map.has(key)) map.set(key, { categoryId: key, past: [], next: [] });
      map.get(key).next.push(...(ent.items ?? []));
    }
    return [...map.values()];
  }
  return [];
}

// 집계: side별 항목 모음 (categoryId → items[])
export function aggregateItems(submissions, { side = 'all', onlyImportant = false } = {}) {
  const out = {};
  const collect = (sub, ce, items) => {
    for (const it of (items ?? [])) {
      if (!it) continue;
      const text = (it.text ?? '').trim();
      if (!text) continue;
      if (onlyImportant && !it.important) continue;
      if (!out[ce.categoryId]) out[ce.categoryId] = [];
      out[ce.categoryId].push({
        text,
        date: (it.date ?? '').trim(),
        org: (it.org ?? '').trim(),
        person: (it.person ?? sub.authorName ?? '').trim(),
        important: !!it.important,
      });
    }
  };
  for (const sub of submissions) {
    const entries = flattenSubmissionEntries(sub);
    for (const ce of entries) {
      if (!ce?.categoryId) continue;
      if (side === 'past' || side === 'all') collect(sub, ce, ce.past);
      if (side === 'next' || side === 'all') collect(sub, ce, ce.next);
    }
  }
  return out;
}

// 회차 categoriesSnapshot + 마스터 합본 (snapshot 우선, 빠진 것만 master 추가)
function mergeCategories(round, masterCategories) {
  const snap = Array.isArray(round.categoriesSnapshot) ? round.categoriesSnapshot : [];
  const master = Array.isArray(masterCategories) ? masterCategories : [];
  const map = new Map();
  for (const c of snap) map.set(c.id, c);
  for (const c of master) if (!map.has(c.id)) map.set(c.id, c);
  return [...map.values()];
}

// ───────────────── 본문 빌더 ─────────────────

// kind > category 그룹핑된 본문 (past 또는 next 단일 시점)
//   <기본사업>
//   (1) 과제명 (책임자)
//    - 항목
//    - 항목
//   (2) 과제명 ...
//   <국가R&D>
//   ...
function buildKindGroupedContent(round, submissions, side, paraId, masterCategories) {
  const categories = mergeCategories(round, masterCategories);
  const itemsByCat = aggregateItems(submissions, { side });
  const existingKinds = KIND_ORDER.filter(k => categories.some(c => c.kind === k));

  const parts = [];
  let projectCounter = 0;

  for (const kind of existingKinds) {
    const kindCats = categories
      .filter(c => c.kind === kind)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const kindHasAny = kindCats.some(c => (itemsByCat[c.id] ?? []).length > 0);
    if (!kindHasAny) continue;

    parts.push(P(paraId, CHAR.ORG_AND_KIND, kindHeaderLabel(kind)));

    for (const cat of kindCats) {
      const items = itemsByCat[cat.id] ?? [];
      if (items.length === 0) continue;
      projectCounter += 1;
      const ownerSuffix = cat.owner ? ` (${cat.owner})` : '';
      parts.push(Pmulti(paraId, [
        [CHAR.ORG_AND_KIND, `(${projectCounter}) `],
        [CHAR.PROJECT_TITLE, `${cat.title}${ownerSuffix}`],
      ]));
      for (const it of items) {
        const charId = it.important ? CHAR.BULLET_BOLD : CHAR.BULLET_TEXT;
        parts.push(P(paraId, charId, ` - ${formatItem(it)}`));
      }
    }
  }
  return parts.join('');
}

// 주요 보고사항 본문 셀 내용:
//   <궤도토목본부장 활동사항>
//   ∘ ...                          (박사님이 한글에서 직접 채움)
//     - ...
//   ----------------------
//   [궤도노반연구실]
//   <궤도노반연구실장 활동사항>
//   ∘ ...
//   ∘ ...
//   ----------------------
//   (자동 생성: important=true 항목들 — 과제별)
const DIVIDER = '----------------------------------------------------------------';
export function buildMainBodySubList(round, submissions, { orgName = '[궤도노반연구실]', masterCategories = [] } = {}) {
  const paraId = PARA.MAIN_BODY;
  const parts = [];

  // 본부장 활동사항 placeholder
  parts.push(P(paraId, CHAR.ORG_AND_KIND, '<궤도토목본부장 활동사항>'));
  parts.push(P(paraId, CHAR.BULLET_TEXT, '∘ '));
  parts.push(P(paraId, CHAR.BULLET_TEXT, '  - '));
  parts.push(P(paraId, CHAR.BULLET_TEXT, ''));
  parts.push(P(paraId, CHAR.ORG_AND_KIND, DIVIDER));
  parts.push(P(paraId, CHAR.BULLET_TEXT, ''));

  // [궤도노반연구실] / 실장 활동사항 placeholder
  parts.push(P(paraId, CHAR.ORG_AND_KIND, orgName));
  parts.push(P(paraId, CHAR.ORG_AND_KIND, '<궤도노반연구실장 활동사항>'));
  parts.push(P(paraId, CHAR.BULLET_TEXT, '∘ '));
  parts.push(P(paraId, CHAR.BULLET_TEXT, '∘ '));
  parts.push(P(paraId, CHAR.BULLET_TEXT, ''));
  parts.push(P(paraId, CHAR.ORG_AND_KIND, DIVIDER));
  parts.push(P(paraId, CHAR.BULLET_TEXT, ''));

  // 자동 생성: important=true 항목 (과제별)
  const categories = mergeCategories(round, masterCategories);
  const itemsByCat = aggregateItems(submissions, { onlyImportant: true });
  const cats = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  let projectCounter = 0;
  for (const cat of cats) {
    const items = itemsByCat[cat.id] ?? [];
    if (items.length === 0) continue;
    projectCounter += 1;
    const kindPrefix = `[${KIND_NAMES[cat.kind] ?? cat.kind}]`;
    const ownerSuffix = cat.owner ? ` (${cat.owner})` : '';
    parts.push(Pmulti(paraId, [
      [CHAR.ORG_AND_KIND, `(${projectCounter}) ${kindPrefix} `],
      [CHAR.PROJECT_TITLE, `${cat.title}${ownerSuffix}`],
    ]));
    for (const it of items) {
      parts.push(P(paraId, CHAR.BULLET_BOLD, ` - ${formatItem(it)}`));
    }
  }

  return parts.join('');
}

// 지난 주(달) 실적 본문 셀 내용
export function buildPastBodySubList(round, submissions, { orgName = '[궤도노반연구실]', masterCategories = [] } = {}) {
  const paraId = PARA.PERIOD_BODY;
  const parts = [];
  parts.push(P(paraId, CHAR.ORG_AND_KIND, orgName));
  const body = buildKindGroupedContent(round, submissions, 'past', paraId, masterCategories);
  if (body) parts.push(body);
  return parts.join('');
}

// 이번 주(달) 계획 본문 셀 내용
export function buildNextBodySubList(round, submissions, { orgName = '[궤도노반연구실]', masterCategories = [] } = {}) {
  const paraId = PARA.PERIOD_BODY;
  const parts = [];
  parts.push(P(paraId, CHAR.ORG_AND_KIND, orgName));
  const body = buildKindGroupedContent(round, submissions, 'next', paraId, masterCategories);
  if (body) parts.push(body);
  return parts.join('');
}

// ───────────────── 라벨 셀 빌더 ─────────────────

// 지난 주 실적 라벨 셀 (3 문단: "지난 주" / "실적" / "(범위)")
export function buildPastLabelSubList(round) {
  const periodWord = round.form === 'monthly' ? '달' : '주';
  const range = formatRangeDot(round.rangeStart, round.rangeEnd);
  const parts = [];
  // "지난 주" 또는 "지난 달" — 14pt bold 휴먼명조
  parts.push(P(PARA.LABEL, CHAR.LABEL_TITLE, `지난 ${periodWord} `));
  parts.push(P(PARA.LABEL, CHAR.LABEL_PERIOD, '실적'));
  if (range) parts.push(P(PARA.LABEL, CHAR.LABEL_RANGE_ALT, `(${range})`));
  return parts.join('');
}

// 이번 주 계획 라벨 셀
export function buildNextLabelSubList(round) {
  const periodWord = round.form === 'monthly' ? '달' : '주';
  const range = formatRangeDot(round.nextRangeStart, round.nextRangeEnd);
  const parts = [];
  parts.push(P(PARA.LABEL, CHAR.LABEL_TITLE, `이번 ${periodWord} `));
  parts.push(P(PARA.LABEL, CHAR.LABEL_PERIOD, '계획'));
  if (range) parts.push(P(PARA.LABEL, CHAR.LABEL_RANGE_ALT, `(${range})`));
  return parts.join('');
}

// ───────────────── 메인 ─────────────────

export function buildSection0Xml(round, submissions, { masterCategories = [] } = {}) {
  const orgName = round.orgName || '[궤도노반연구실]';

  const mainBody = buildMainBodySubList(round, submissions, { orgName, masterCategories });
  const pastLabel = buildPastLabelSubList(round);
  const pastBody = buildPastBodySubList(round, submissions, { orgName, masterCategories });
  const nextLabel = buildNextLabelSubList(round);
  const nextBody = buildNextBodySubList(round, submissions, { orgName, masterCategories });

  return SECTION_TEMPLATE_XML
    .replace('{{MAIN_BODY_SUBLIST}}', mainBody)
    .replace('{{PAST_LABEL_SUBLIST}}', pastLabel)
    .replace('{{PAST_BODY_SUBLIST}}', pastBody)
    .replace('{{NEXT_LABEL_SUBLIST}}', nextLabel)
    .replace('{{NEXT_BODY_SUBLIST}}', nextBody);
}

// 호환: 기존 export 명들 (preview-render 등에서 사용 중)
export function buildMainReportBody(round, submissions, opts) {
  return buildMainBodySubList(round, submissions, opts);
}
export function buildGeneralReportBody(round, submissions, opts) {
  // 기존 호출처 호환용 — past+next 합본을 단일 문자열로
  return buildPastBodySubList(round, submissions, opts) + buildNextBodySubList(round, submissions, opts);
}
