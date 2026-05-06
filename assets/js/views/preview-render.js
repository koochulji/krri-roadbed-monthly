// HTML 미리보기 — 월간 원장보고 (4과제 per-project structured)
import { KIND_NAMES } from '../store.js';

function escape(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function fmtDate(s) {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}. ${m[2]}. ${m[3]}.` : '';
}

function fmtBudget(rangeStart, budget) {
  const m = String(rangeStart ?? '').match(/^\d{2}(\d{2})/);
  const yr = m ? m[1] : '';
  const yAmt = budget?.yearAmount || '___';
  const tAmt = budget?.totalAmount || '___';
  return `(\`${yr}) ${yAmt}백만원, (총) ${tAmt}백만원`;
}

function renderProjectSection(proj, sub) {
  let h = '';
  h += `<h3>(${escape(KIND_NAMES[proj.kind] || proj.kind)}) ${escape(proj.title)}</h3>`;

  // 1. 연구 개요
  h += `<div><strong>1. 연구 개요</strong></div><ul>`;
  h += `<li>연구책임자: ${escape(proj.owner || '')} / ${escape(proj.org || '')}</li>`;
  h += `<li>연구기간: ${escape(fmtDate(proj.rangeStart))} ~ ${escape(fmtDate(proj.rangeEnd))}</li>`;
  h += `<li>연구비: ${escape(fmtBudget(proj.rangeStart, proj.budget))}</li>`;
  if (proj.goal) h += `<li>연구목표: ${escape(proj.goal)}</li>`;
  h += `</ul>`;

  // 2-1. 기술 정의 및 특징
  h += `<div><strong>2-1. 기술 정의 및 특징</strong></div>`;
  if (proj.techDefinition) {
    h += `<div style="white-space:pre-wrap">${escape(proj.techDefinition)}</div>`;
  }
  if (Array.isArray(proj.techFeatures) && proj.techFeatures.length > 0) {
    h += `<ul>`;
    for (const f of proj.techFeatures) {
      h += `<li>${escape(f)}</li>`;
    }
    h += `</ul>`;
  }

  // 2-2. 이번 달 수행 + 다음 달 계획
  h += `<div><strong>2-2. 연구내용 및 계획</strong></div>`;
  h += `<div>이번 달 수행:</div><ul>`;
  for (const it of (sub.thisMonth || [])) {
    if (!it.content) continue;
    h += `<li>${escape(it.content)}${it.date ? ` (${escape(it.date)})` : ''}</li>`;
  }
  h += `</ul>`;
  h += `<div>다음 달 계획:</div><ul>`;
  for (const it of (sub.nextMonth || [])) {
    if (!it.content) continue;
    h += `<li>${escape(it.content)}${it.date ? ` (${escape(it.date)})` : ''}</li>`;
  }
  h += `</ul>`;

  // 12개월 진행표
  if (Array.isArray(proj.activities) && proj.activities.length > 0) {
    h += `<div><strong>12개월 진행표</strong></div>`;
    h += renderProgressTableHtml(proj.activities, sub.progressTable || {});
  }

  // 이미지
  if (Array.isArray(sub.images) && sub.images.length > 0) {
    h += `<div><strong>첨부 이미지</strong></div>`;
    for (const img of sub.images) {
      h += `<div style="margin:6px 0">
        <img src="${escape(img.downloadUrl)}" style="max-width:300px;max-height:200px;border:1px solid #d1d5db;border-radius:4px"/>
        ${img.caption ? `<div class="muted tight">${escape(img.caption)}</div>` : ''}
      </div>`;
    }
  }

  // 주요 현안
  if (Array.isArray(sub.issues) && sub.issues.some(i => i.content)) {
    h += `<div><strong>주요 현안</strong></div><ul>`;
    for (const it of sub.issues) {
      if (!it.content) continue;
      h += `<li>${escape(it.content)}</li>`;
    }
    h += `</ul>`;
  }

  // 연구 성과
  if (Array.isArray(sub.achievements) && sub.achievements.some(i => i.content)) {
    h += `<div><strong>연구 성과</strong></div><ul>`;
    for (const it of sub.achievements) {
      if (!it.content) continue;
      h += `<li>${escape(it.content)}</li>`;
    }
    h += `</ul>`;
  }

  return h;
}

function renderProgressTableHtml(activities, progressTable) {
  let h = '<table class="progress-table" style="margin:8px 0"><thead><tr><th class="name-col">주요 연구추진내용</th>';
  for (let m = 1; m <= 12; m++) h += `<th class="month-col">${m}</th>`;
  h += '</tr></thead><tbody>';
  for (const act of activities) {
    if (!act?.id) continue;
    h += `<tr><td class="activity-name">${escape(act.name || '')}</td>`;
    const row = progressTable[act.id] || {};
    for (let m = 1; m <= 12; m++) {
      h += `<td class="month-cell ${row[m] ? 'on' : ''}"></td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  return h;
}

export function renderPreviewHtml(round, submissions, masterProjects) {
  const orgName = round?.orgName || '[궤도노반연구실]';
  const projects = round?.projectsSnapshot || masterProjects || [];
  const subMap = new Map((submissions || []).map(s => [s._id, s]));
  const ymStr = round?.year && round?.month ? `${round.year}년 ${round.month}월` : '';

  let html = `<div class="preview-doc"><div class="preview-page">`;
  html += `<div class="preview-header" style="margin-bottom:10px">
    <strong style="font-size:14pt">${escape(orgName)} 월간 원장보고</strong>
    <span class="muted" style="margin-left:12px">${escape(ymStr)} · ${escape(fmtDate(round?.baseDate))}</span>
  </div>`;

  if (projects.length === 0) {
    html += '<div class="muted">과제 없음. 관리자가 회차 생성 시 과제를 등록해야 합니다.</div>';
  } else {
    for (const proj of projects) {
      const sub = subMap.get(proj.id) || {};
      html += renderProjectSection(proj, sub);
      html += '<hr style="margin:16px 0;border:none;border-top:1px solid #d1d5db"/>';
    }
  }

  html += `</div></div>`;
  return html;
}

// 호환: DOM Element 반환
export function renderPreview(round, submissions, masterProjects) {
  const html = renderPreviewHtml(round, submissions, masterProjects);
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return wrap.firstElementChild ?? wrap;
}

export default renderPreviewHtml;
