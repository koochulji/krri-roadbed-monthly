// HTML 미리보기 — 월간 원장보고 (per-project structured + sub-projects nested)
//
// 계층 처리:
//   - parent project: 1. 연구 개요 + (sub-projects 가 있으면) 2. 연구추진현황 안에 nested,
//                     아니면 parent 자신의 2-1/2-2/표/이미지/현안/성과
//   - sub-project: parent 의 "2. 연구추진현황" 안에 "2-1. ..." / "2-2. ..." 로 inline 렌더
//                   각 sub-project 도 자기 기술 정의/활동/표/현안/성과 가짐

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

// 한 과제의 "기술 정의 + 활동 + 12개월 표 + 이미지 + 현안 + 성과" 블록 렌더 (재사용)
function renderProjectBody(proj, sub, opts = {}) {
  const titlePrefix = opts.titlePrefix || '';  // "2-1. " 같은 prefix
  let h = '';

  // 기술 정의 및 특징
  h += `<div><strong>${titlePrefix}기술 정의 및 특징</strong></div>`;
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

  // 연구내용 및 계획
  h += `<div><strong>${titlePrefix ? '' : '2-2. '}연구내용 및 계획</strong></div>`;
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
      const src = img.base64DataUrl || img.downloadUrl || '';
      h += `<div style="margin:6px 0">
        <img src="${escape(src)}" style="max-width:300px;max-height:200px;border:1px solid #d1d5db;border-radius:4px"/>
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

// 한 과제의 "1. 연구 개요" 블록 (parent / standalone 둘 다 사용)
function renderOverview(proj) {
  let h = `<div><strong>1. 연구 개요</strong></div><ul>`;
  h += `<li>연구책임자: ${escape(proj.owner || '')} / ${escape(proj.org || '')}</li>`;
  h += `<li>연구기간: ${escape(fmtDate(proj.rangeStart))} ~ ${escape(fmtDate(proj.rangeEnd))}</li>`;
  h += `<li>연구비: ${escape(fmtBudget(proj.rangeStart, proj.budget))}</li>`;
  if (proj.goal) h += `<li>연구목표: ${escape(proj.goal)}</li>`;
  h += `</ul>`;
  return h;
}

// Top-level (sub-project 없음)
function renderProjectSection(proj, sub) {
  let h = '';
  h += `<h3>(${escape(KIND_NAMES[proj.kind] || proj.kind)}) ${escape(proj.title)}</h3>`;
  h += renderOverview(proj);
  // 2-1/2-2 prefix 없이 단독 — body 내부에서 `2-1. 기술 정의` 식으로 표시
  h += `<div><strong>2-1. 기술 정의 및 특징</strong></div>`;
  if (proj.techDefinition) {
    h += `<div style="white-space:pre-wrap">${escape(proj.techDefinition)}</div>`;
  }
  if (Array.isArray(proj.techFeatures) && proj.techFeatures.length > 0) {
    h += `<ul>`;
    for (const f of proj.techFeatures) h += `<li>${escape(f)}</li>`;
    h += `</ul>`;
  }
  // 활동 / 표 / 이미지 / 현안 / 성과 — renderProjectBody 의 기술정의 부분 빼고 재사용 어렵
  h += renderActivityAndOthers(proj, sub, '2-2. ');
  return h;
}

// 활동 + 12개월 + 이미지 + 현안 + 성과 (기술 정의 빼고)
function renderActivityAndOthers(proj, sub, planPrefix = '') {
  let h = '';
  h += `<div><strong>${planPrefix}연구내용 및 계획</strong></div>`;
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
  if (Array.isArray(proj.activities) && proj.activities.length > 0) {
    h += `<div><strong>12개월 진행표</strong></div>`;
    h += renderProgressTableHtml(proj.activities, sub.progressTable || {});
  }
  if (Array.isArray(sub.images) && sub.images.length > 0) {
    h += `<div><strong>첨부 이미지</strong></div>`;
    for (const img of sub.images) {
      const src = img.base64DataUrl || img.downloadUrl || '';
      h += `<div style="margin:6px 0">
        <img src="${escape(src)}" style="max-width:300px;max-height:200px;border:1px solid #d1d5db;border-radius:4px"/>
        ${img.caption ? `<div class="muted tight">${escape(img.caption)}</div>` : ''}
      </div>`;
    }
  }
  if (Array.isArray(sub.issues) && sub.issues.some(i => i.content)) {
    h += `<div><strong>주요 현안</strong></div><ul>`;
    for (const it of sub.issues) {
      if (!it.content) continue;
      h += `<li>${escape(it.content)}</li>`;
    }
    h += `</ul>`;
  }
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

// 한 sub-project 를 "2-N. [제목]" 헤더와 함께 렌더 (parent 안에 inline)
function renderSubProject(child, sub, subNum) {
  const titleClean = (child.title || '').replace(/^\[\d+-\d+\]\s*/, '');  // "[2-1]" prefix 제거
  let h = '';
  h += `<div style="margin-top:14px;padding:8px 12px;background:#f8fafc;border-left:3px solid #1d4ed8">
    <strong style="color:#1e40af">2-${subNum}. ${escape(titleClean)} <span class="muted" style="font-weight:normal">(${escape(child.owner || '')})</span></strong>
  </div>`;
  h += `<div style="padding-left:12px">`;
  // 기술 정의
  if (child.techDefinition || (child.techFeatures || []).length > 0) {
    h += `<div><strong>ㅇ 기술 정의 및 특징</strong></div>`;
    if (child.techDefinition) {
      h += `<div style="white-space:pre-wrap">${escape(child.techDefinition)}</div>`;
    }
    if (Array.isArray(child.techFeatures) && child.techFeatures.length > 0) {
      h += `<ul>`;
      for (const f of child.techFeatures) h += `<li>${escape(f)}</li>`;
      h += `</ul>`;
    }
  }
  // 활동 등
  h += renderActivityAndOthers(child, sub, 'ㅇ ');
  h += `</div>`;
  return h;
}

// Parent project + nested sub-projects 렌더
function renderProjectSectionWithChildren(parent, parentSub, children, subMap) {
  let h = '';
  h += `<h3>(${escape(KIND_NAMES[parent.kind] || parent.kind)}) ${escape(parent.title)}</h3>`;
  h += renderOverview(parent);

  // "2. 연구추진현황" 헤더 (sub-projects 가 있을 때 사용)
  h += `<div><strong>2. 연구추진현황</strong></div>`;

  // 각 sub-project 를 nested 로 렌더
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childSub = subMap.get(child.id) || {};
    h += renderSubProject(child, childSub, i + 1);
  }

  // parent 자체 활동 / 현안 / 성과 (sub-project 들 다음)
  // — parent 가 직접 입력한 것 (하위가 아닌 본인 단의 활동) 표시
  const hasParentActivity = (parentSub.thisMonth || []).some(i => i.content)
    || (parentSub.nextMonth || []).some(i => i.content)
    || (parentSub.issues || []).some(i => i.content)
    || (parentSub.achievements || []).some(i => i.content)
    || (parentSub.images || []).length > 0;
  if (hasParentActivity) {
    h += `<div style="margin-top:14px"><strong>※ ${escape(parent.owner)} 본인 사항</strong></div>`;
    h += renderActivityAndOthers(parent, parentSub, 'ㅇ ');
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

  // 계층 분류
  const tops = projects.filter(p => !p.parentProjectId);
  const childrenByParent = new Map();
  for (const p of projects) {
    if (p.parentProjectId) {
      if (!childrenByParent.has(p.parentProjectId)) childrenByParent.set(p.parentProjectId, []);
      childrenByParent.get(p.parentProjectId).push(p);
    }
  }

  let html = `<div class="preview-doc"><div class="preview-page">`;
  html += `<div class="preview-header" style="margin-bottom:10px">
    <strong style="font-size:14pt">${escape(orgName)} 월간 원장보고</strong>
    <span class="muted" style="margin-left:12px">${escape(ymStr)} · ${escape(fmtDate(round?.baseDate))}</span>
  </div>`;

  if (projects.length === 0) {
    html += '<div class="muted">과제 없음. 관리자가 회차 생성 시 과제를 등록해야 합니다.</div>';
  } else {
    // top-level 만 순회. 각 top-level 의 children 은 안에서 inline 렌더.
    for (const proj of tops) {
      const sub = subMap.get(proj.id) || {};
      const children = childrenByParent.get(proj.id) || [];
      if (children.length > 0) {
        html += renderProjectSectionWithChildren(proj, sub, children, subMap);
      } else {
        html += renderProjectSection(proj, sub);
      }
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
