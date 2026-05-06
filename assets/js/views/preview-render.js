// HTML 미리보기 — 새 HWPX 출력(주례 예시 기반 3-표) 과 동일 구조로 렌더링.
//
// 구조:
//   Table 1: 본부명 + 날짜 (헤더)
//   Table 2: 구분/내용/비고 헤더 + 주요 보고사항
//   "□ 일반 보고사항" 텍스트
//   Table 3: 지난 주 실적 + 이번 주 계획 (각 1 row)

import { aggregateItems, KIND_NAMES, KIND_ORDER, formatItem } from '../hwpx/section-builder.js';

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[1]}. ${m[2]}. ${m[3]}.`;
}

function formatRangeDot(a, b) {
  if (!a && !b) return '';
  const compact = (s) => {
    const m = String(s ?? '').match(/^\d{4}-(\d{2})-(\d{2})/);
    return m ? `${m[1]}. ${m[2]}.` : (s ?? '');
  };
  return `${compact(a)} ∼ ${compact(b)}`;
}

// 카테고리 합본 (snapshot + master)
function mergeCategories(round, master) {
  const snap = Array.isArray(round?.categoriesSnapshot) ? round.categoriesSnapshot : [];
  const m = Array.isArray(master) ? master : [];
  const map = new Map();
  for (const c of snap) map.set(c.id, c);
  for (const c of m) if (!map.has(c.id)) map.set(c.id, c);
  return [...map.values()];
}

// 주요 보고사항 본문
function renderMainBody(orgName, categories, importantByCat) {
  const cats = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  let html = `
    <div class="kind">&lt;궤도토목본부장 활동사항&gt;</div>
    <div class="muted" style="white-space:pre">∘ </div>
    <div class="muted" style="white-space:pre">  - </div>
    <div style="border-top:1px dashed #999;margin:6px 0"></div>
    <div class="org">${escape(orgName)}</div>
    <div class="kind">&lt;궤도노반연구실장 활동사항&gt;</div>
    <div class="muted" style="white-space:pre">∘ </div>
    <div class="muted" style="white-space:pre">∘ </div>
    <div style="border-top:1px dashed #999;margin:6px 0"></div>
  `;
  let counter = 0;
  for (const cat of cats) {
    const items = importantByCat[cat.id] ?? [];
    if (items.length === 0) continue;
    counter += 1;
    const kindPrefix = `[${KIND_NAMES[cat.kind] ?? cat.kind}]`;
    const ownerSuffix = cat.owner ? ` (${escape(cat.owner)})` : '';
    html += `<div class="project">(${counter}) ${escape(kindPrefix)} ${escape(cat.title)}<span class="muted">${ownerSuffix}</span></div>`;
    html += '<ul class="items">';
    for (const it of items) {
      html += `<li class="important">${escape(formatItem(it))}</li>`;
    }
    html += '</ul>';
  }
  return html;
}

// 단일 시점(past 또는 next) 본문 — kind > category 그룹
function renderKindGroupedBody(orgName, categories, itemsByCat) {
  let html = `<div class="org">${escape(orgName)}</div>`;
  const existingKinds = KIND_ORDER.filter(k => categories.some(c => c.kind === k));
  let counter = 0;
  for (const kind of existingKinds) {
    const kindCats = categories
      .filter(c => c.kind === kind)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const kindHasAny = kindCats.some(c => (itemsByCat[c.id] ?? []).length > 0);
    if (!kindHasAny) continue;
    html += `<div class="kind">&lt;${escape(KIND_NAMES[kind] ?? kind)}&gt;</div>`;
    for (const cat of kindCats) {
      const items = itemsByCat[cat.id] ?? [];
      if (items.length === 0) continue;
      counter += 1;
      const ownerSuffix = cat.owner ? ` (${escape(cat.owner)})` : '';
      html += `<div class="project">(${counter}) ${escape(cat.title)}<span class="muted">${ownerSuffix}</span></div>`;
      html += '<ul class="items">';
      for (const it of items) {
        const cls = it.important ? 'important' : '';
        html += `<li class="${cls}">${escape(formatItem(it))}</li>`;
      }
      html += '</ul>';
    }
  }
  if (counter === 0) html += '<div class="muted">(항목 없음)</div>';
  return html;
}

// Public: round + submissions → HTML 문자열 (3-표 구조)
export function renderPreviewHtml(round, submissions, masterCategories) {
  const orgName = round?.orgName || '[궤도노반연구실]';
  const categories = mergeCategories(round, masterCategories);
  const periodWord = round?.form === 'monthly' ? '달' : '주';
  const importantByCat = aggregateItems(submissions, { onlyImportant: true });
  const pastByCat = aggregateItems(submissions, { side: 'past' });
  const nextByCat = aggregateItems(submissions, { side: 'next' });
  const baseDateStr = formatDate(round?.baseDate);
  const pastRange = formatRangeDot(round?.rangeStart, round?.rangeEnd);
  const nextRange = formatRangeDot(round?.nextRangeStart, round?.nextRangeEnd);

  const wide = `<col style="width:14%"/><col style="width:72%"/><col style="width:14%"/>`;

  return `
    <div class="preview-doc">
      <div class="preview-page">

        <div class="preview-header" style="margin-bottom:10px">
          <strong style="font-size:13pt">${escape(orgName)}</strong>
          <span class="muted" style="margin-left:12px">${escape(baseDateStr)}</span>
        </div>

        <table class="preview-table" style="margin-bottom:8px">
          <colgroup>${wide}</colgroup>
          <tbody>
            <tr>
              <th class="label" style="background:#f1f5f9;text-align:center">구 분</th>
              <th class="label" style="background:#f1f5f9;text-align:center">내   용</th>
              <th class="label" style="background:#f1f5f9;text-align:center">비 고</th>
            </tr>
            <tr>
              <td class="label">
                <div class="label-title">주 요</div>
                <div class="label-title">보고사항</div>
              </td>
              <td class="body">${renderMainBody(orgName, categories, importantByCat)}</td>
              <td class="empty"></td>
            </tr>
          </tbody>
        </table>

        <div style="font-weight:700;margin:10px 0 4px">□ 일반 보고사항</div>

        <table class="preview-table">
          <colgroup>${wide}</colgroup>
          <tbody>
            <tr>
              <td class="label">
                <div class="label-title">지난 ${periodWord} 실적</div>
                ${pastRange ? `<div class="label-range">(${escape(pastRange)})</div>` : ''}
              </td>
              <td class="body">${renderKindGroupedBody(orgName, categories, pastByCat)}</td>
              <td class="empty"></td>
            </tr>
            <tr>
              <td class="label">
                <div class="label-title">이번 ${periodWord} 계획</div>
                ${nextRange ? `<div class="label-range">(${escape(nextRange)})</div>` : ''}
              </td>
              <td class="body">${renderKindGroupedBody(orgName, categories, nextByCat)}</td>
              <td class="empty"></td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>
  `;
}

// 호환: DOM Element 반환 (기존 caller가 appendChild 사용)
export function renderPreview(round, submissions, masterCategories) {
  const html = renderPreviewHtml(round, submissions, masterCategories);
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return wrap.firstElementChild ?? wrap;
}

export default renderPreviewHtml;
