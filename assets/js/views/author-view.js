// 작성자 페이지 — 월간 원장보고 per-project structured form
import { ensureSignedIn, isConfigPlaceholder } from '../firebase-init.js';
import {
  subscribeAuthors, subscribeProjects, subscribeCurrent, subscribeRound,
  subscribeSubmissions, getAllSubmissions, saveSubmissionDraft,
  finalSubmitSubmission, unlockSubmission, KIND_NAMES,
} from '../store.js';
import { getState, patchState, subscribe } from '../state.js';
import { renderPreview } from './preview-render.js';
import { renderProgressTable } from './progress-table.js';
import { renderImageUploader } from './image-uploader.js';
import { uuid } from '../util/download.js';
import { buildHwpxBlob, suggestFileName } from '../hwpx/hwpx-builder.js';
import { downloadBlob } from '../util/download.js';

const BUILD_TAG = 'author-monthly-v1';
if (typeof window !== 'undefined') {
  window.__authorViewEntered = true;
  console.log('[author-view.js] module entered, build=', BUILD_TAG);
}

// ────── 모듈 상태 ──────
let mySubmission = null;       // 로컬 편집 중인 submission
let activeProjectId = null;    // 본인이 선택한 과제
let saveTimer = null;
let unsubRound = null;
let unsubSubmissions = null;

// ────── DOM 헬퍼 ──────
function $(s, root = document) { return root.querySelector(s); }
function escape(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// ────── 메인 render ──────
function render() {
  const s = getState();
  renderTopStatus(s);

  const main = $('#main-area');
  if (!main) return;

  // Firebase config placeholder 체크
  if (isConfigPlaceholder()) {
    main.innerHTML = '<div class="banner danger">Firebase config 가 설정되지 않았습니다. SETUP.md 참고.</div>';
    return;
  }

  // 활성 회차 없음
  if (!s.current?.roundId || !s.round) {
    main.innerHTML = '<div class="banner warn">활성 회차가 없습니다. 관리자의 회차 확정을 기다려 주세요.</div>';
    $('#preview-area').innerHTML = '';
    return;
  }

  // 본인(과제 책임자) 선택 안 됨
  if (!activeProjectId) {
    main.innerHTML = '';
    main.appendChild(renderProjectPicker(s));
    $('#preview-area').innerHTML = '';
    return;
  }

  // 본인 선택됨 → submission 로드
  const mine = (s.submissions || []).find(x => x._id === activeProjectId);
  if (!mySubmission || mySubmission._id !== activeProjectId) {
    mySubmission = mine ? cloneSubmission(mine) : freshSubmission(activeProjectId);
  } else if (mine && mine.status !== mySubmission.status) {
    // 원격 status 변경만 동기화 (잠금 해제 등)
    mySubmission.status = mine.status;
    mySubmission.submittedAt = mine.submittedAt;
  }

  // 사용자가 입력 중이면 editor 재빌드 건너뛰기 (포커스 유지)
  const ae = document.activeElement;
  const editing = ae && main.contains(ae)
    && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  if (editing) {
    updatePreviewOnly();
    return;
  }

  main.innerHTML = '';
  main.appendChild(renderProjectForm(s, mySubmission));
  updatePreviewOnly();
}

function cloneSubmission(mine) {
  return {
    ...mine,
    thisMonth: JSON.parse(JSON.stringify(mine.thisMonth ?? [])),
    nextMonth: JSON.parse(JSON.stringify(mine.nextMonth ?? [])),
    progressTable: JSON.parse(JSON.stringify(mine.progressTable ?? {})),
    images: JSON.parse(JSON.stringify(mine.images ?? [])),
    issues: JSON.parse(JSON.stringify(mine.issues ?? [])),
    achievements: JSON.parse(JSON.stringify(mine.achievements ?? [])),
  };
}

function freshSubmission(projectId) {
  return {
    _id: projectId, projectId,
    thisMonth: [], nextMonth: [],
    progressTable: {}, images: [],
    issues: [], achievements: [],
    status: 'idle',
  };
}

// ────── 상단 상태바 ──────
function renderTopStatus(s) {
  const top = $('#round-info');
  if (!top) return;
  if (!s.current?.roundId || !s.round) {
    top.textContent = '활성 회차 없음';
    return;
  }
  const r = s.round;
  const ymStr = r.year && r.month ? `${r.year}년 ${r.month}월` : '';
  let html = `<strong>${escape(ymStr)} 원장보고</strong> · 기준일 ${escape(r.baseDate || '')}`;
  if (activeProjectId) {
    const proj = (r.projectsSnapshot || []).find(p => p.id === activeProjectId);
    if (proj) {
      html += ` · 본인: <strong>${escape(proj.owner)}</strong> <button class="btn small" id="change-proj" style="margin-left:6px">🔄 다른 과제</button>`;
    }
  }
  html += ` · <a href="./help.html" target="_blank" style="color:#1d4ed8;text-decoration:none;font-weight:600">📖 사용법</a>`;
  top.innerHTML = html;
  const btn = $('#change-proj');
  if (btn) btn.addEventListener('click', () => {
    activeProjectId = null;
    mySubmission = null;
    render();
  });
}

// ────── 본인(과제) 선택 화면 ──────
function renderProjectPicker(s) {
  const wrap = document.createElement('div');
  wrap.className = 'panel';
  wrap.innerHTML = '<h2>본인이 책임자인 과제를 선택하세요</h2>';
  const projects = s.round.projectsSnapshot || [];
  if (projects.length === 0) {
    wrap.innerHTML += '<div class="muted">이 회차에 과제가 없습니다. 관리자에게 문의.</div>';
    return wrap;
  }
  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gap = '8px';
  for (const p of projects) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.textAlign = 'left';
    btn.style.padding = '12px';
    btn.innerHTML = `<strong>(${escape(KIND_NAMES[p.kind] || p.kind)})</strong> ${escape(p.title)}<br>
      <span class="muted" style="font-size:12px">책임자: ${escape(p.owner)} · ${escape(p.org || '')}</span>`;
    btn.addEventListener('click', () => {
      activeProjectId = p.id;
      mySubmission = null;
      render();
    });
    list.appendChild(btn);
  }
  wrap.appendChild(list);
  return wrap;
}

// ────── 입력 폼 ──────
function renderProjectForm(s, sub) {
  const proj = (s.round.projectsSnapshot || []).find(p => p.id === activeProjectId);
  if (!proj) {
    const w = document.createElement('div');
    w.innerHTML = '<div class="banner danger">선택한 과제를 찾을 수 없습니다.</div>';
    return w;
  }
  const locked = sub.status === 'submitted' || sub.status === 'approved';
  const wrap = document.createElement('div');

  // 헤더
  const head = document.createElement('div');
  head.className = 'panel';
  head.innerHTML = `
    <h2>(${escape(KIND_NAMES[proj.kind] || proj.kind)}) ${escape(proj.title)}</h2>
    <div class="muted">책임자: ${escape(proj.owner)} · ${escape(proj.org || '')}</div>
    ${locked ? '<div class="banner ok" style="margin-top:8px">제출 완료 — 수정하려면 잠금 해제 필요</div>' : ''}
  `;
  wrap.appendChild(head);

  // 1. 연구 개요 (정적 — readonly)
  wrap.appendChild(renderOverview(proj));

  // 2-1. 기술 정의 및 특징 (정적 — readonly)
  wrap.appendChild(renderTechSection(proj));

  // 2-2. 이번 달 수행 + 다음 달 계획 (동적)
  wrap.appendChild(renderActivitySection(sub, locked));

  // 2-3. 12개월 진행표
  wrap.appendChild(renderProgressSection(proj, sub, locked));

  // 2-4. 이미지 첨부
  wrap.appendChild(renderImageSection(s, sub, locked));

  // 2-5. 주요 현안
  wrap.appendChild(renderListSection('주요 현안', sub, 'issues', '예: 도시철도운영기관 협의체 궤도분과 세미나', locked));

  // 3. 연구 성과
  wrap.appendChild(renderListSection('연구 성과', sub, 'achievements', '예: 논문 게재, 특허 출원 등', locked));

  // 액션 바 + 잠금 해제
  wrap.appendChild(renderActionBar(sub, locked));

  return wrap;
}

// 1. 연구 개요
function renderOverview(proj) {
  const box = document.createElement('div');
  box.className = 'panel';
  box.innerHTML = `
    <h3>1. 연구 개요</h3>
    <div class="muted tight" style="margin-bottom:8px">정적 정보 — 관리자 페이지에서만 수정 가능.</div>
    <ul style="margin:0">
      <li>연구책임자: ${escape(proj.owner)} / ${escape(proj.org || '')}</li>
      <li>연구기간: ${escape(proj.rangeStart || '')} ~ ${escape(proj.rangeEnd || '')}</li>
      <li>연구비: (당해) ${escape(proj.budget?.yearAmount || '___')}백만원, (총) ${escape(proj.budget?.totalAmount || '___')}백만원</li>
      <li>연구목표: ${escape(proj.goal || '(미입력)')}</li>
    </ul>
  `;
  return box;
}

// 2-1. 기술 정의/특징
function renderTechSection(proj) {
  const box = document.createElement('div');
  box.className = 'panel';
  box.innerHTML = `
    <h3>2-1. 기술 정의 및 특징</h3>
    <div class="muted tight" style="margin-bottom:8px">정적 정보 — 관리자 페이지에서만 수정 가능.</div>
    <div style="white-space:pre-wrap">${escape(proj.techDefinition || '(미입력)')}</div>
  `;
  if (Array.isArray(proj.techFeatures) && proj.techFeatures.length > 0) {
    const ul = document.createElement('ul');
    for (const f of proj.techFeatures) {
      const li = document.createElement('li');
      li.textContent = f;
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  return box;
}

// 2-2. 활동 (이번 달 수행 + 다음 달 계획)
function renderActivitySection(sub, locked) {
  const box = document.createElement('div');
  box.className = 'panel';
  box.innerHTML = '<h3>2-2. 연구내용 및 계획 (이번 달 수행 + 다음 달 계획)</h3>';

  for (const [field, label, placeholder] of [
    ['thisMonth', '이번 달 수행 내용', '예: 기존 열화모델 분석 및 열화인자 도출을 위한 DATA 수집'],
    ['nextMonth', '다음 달 계획', '예: 시제품 제작 및 시운전'],
  ]) {
    const sub3 = document.createElement('div');
    sub3.style.marginBottom = '12px';
    sub3.innerHTML = `<div style="font-weight:600;margin:8px 0 4px">[${label}]</div>`;
    const list = document.createElement('div');
    list.className = 'items';
    for (let i = 0; i < (sub[field] || []).length; i++) {
      list.appendChild(renderActivityRow(sub, field, i, locked, placeholder));
    }
    sub3.appendChild(list);
    if (!locked) {
      const add = document.createElement('button');
      add.className = 'btn small';
      add.textContent = `+ ${label} 항목 추가`;
      add.addEventListener('click', () => {
        sub[field] = sub[field] || [];
        sub[field].push({ id: uuid(), content: '', date: '' });
        scheduleSave();
        render();
      });
      sub3.appendChild(add);
    }
    box.appendChild(sub3);
  }
  return box;
}

function renderActivityRow(sub, field, idx, locked, placeholder) {
  const it = sub[field][idx];
  const row = document.createElement('div');
  row.className = 'item-row';
  row.style.gridTemplateColumns = 'minmax(0,1fr) 100px auto';

  const ta = document.createElement('textarea');
  ta.placeholder = placeholder;
  ta.value = it.content || '';
  ta.disabled = locked;
  ta.addEventListener('input', () => { it.content = ta.value; scheduleSave(); updatePreviewOnly(); });

  const dateInp = document.createElement('input');
  dateInp.type = 'text';
  dateInp.placeholder = '예: ~5/1';
  dateInp.value = it.date || '';
  dateInp.disabled = locked;
  dateInp.addEventListener('input', () => { it.date = dateInp.value; scheduleSave(); updatePreviewOnly(); });

  const del = document.createElement('button');
  del.className = 'btn ghost small';
  del.textContent = '✕';
  del.disabled = locked;
  del.addEventListener('click', () => {
    sub[field].splice(idx, 1);
    scheduleSave(); render();
  });

  row.append(ta, dateInp, del);
  return row;
}

// 2-3. 12개월 진행표
function renderProgressSection(proj, sub, locked) {
  const box = document.createElement('div');
  box.className = 'panel';
  box.innerHTML = `<h3>2-3. 12개월 진행표 (셀 클릭 → 음영 토글)</h3>
    <div class="muted tight">활동별로 진행 중이거나 완료된 월의 셀을 클릭. 이전 달 상태는 자동 누적됨.</div>`;
  const tableEl = renderProgressTable({
    activities: proj.activities || [],
    progressTable: sub.progressTable || {},
    onChange: () => { scheduleSave(); updatePreviewOnly(); },
    locked,
  });
  box.appendChild(tableEl);
  return box;
}

// 2-4. 이미지 첨부
function renderImageSection(s, sub, locked) {
  const box = document.createElement('div');
  box.className = 'panel';
  box.innerHTML = `<h3>2-4. 이미지 첨부 (사진, 그림/도표)</h3>
    <div class="muted tight">위치 선택 후 파일 선택. 5MB 이하 PNG/JPEG.</div>`;
  const upEl = renderImageUploader({
    roundId: s.current.roundId,
    projectId: sub._id,
    images: sub.images || [],
    onChange: (newImages) => {
      sub.images = newImages;
      scheduleSave();
      updatePreviewOnly();
    },
    locked,
  });
  box.appendChild(upEl);
  return box;
}

// 단순 리스트 섹션 (주요 현안, 연구 성과)
function renderListSection(title, sub, field, placeholder, locked) {
  const box = document.createElement('div');
  box.className = 'panel';
  box.innerHTML = `<h3>${escape(title)}</h3>`;
  const list = document.createElement('div');
  list.className = 'items';
  for (let i = 0; i < (sub[field] || []).length; i++) {
    list.appendChild(renderSimpleItemRow(sub, field, i, locked, placeholder));
  }
  box.appendChild(list);
  if (!locked) {
    const add = document.createElement('button');
    add.className = 'btn small';
    add.textContent = `+ ${title} 항목 추가`;
    add.addEventListener('click', () => {
      sub[field] = sub[field] || [];
      sub[field].push({ id: uuid(), content: '' });
      scheduleSave();
      render();
    });
    box.appendChild(add);
  }
  return box;
}

function renderSimpleItemRow(sub, field, idx, locked, placeholder) {
  const it = sub[field][idx];
  const row = document.createElement('div');
  row.className = 'item-row';
  row.style.gridTemplateColumns = 'minmax(0,1fr) auto';

  const ta = document.createElement('textarea');
  ta.placeholder = placeholder;
  ta.value = it.content || '';
  ta.disabled = locked;
  ta.addEventListener('input', () => { it.content = ta.value; scheduleSave(); updatePreviewOnly(); });

  const del = document.createElement('button');
  del.className = 'btn ghost small';
  del.textContent = '✕';
  del.disabled = locked;
  del.addEventListener('click', () => {
    sub[field].splice(idx, 1);
    scheduleSave(); render();
  });

  row.append(ta, del);
  return row;
}

// 액션 바
function renderActionBar(sub, locked) {
  const bar = document.createElement('div');
  bar.className = 'action-bar';
  bar.innerHTML = `
    <div class="save-status" id="save-status">${sub.status === 'submitted' ? '최종 제출됨' : sub.status === 'approved' ? '승인됨' : '작성 중'}</div>
    <div>
      ${locked ? `<button class="btn" id="btn-unlock">잠금 해제</button>` : ''}
      <button class="btn" id="btn-save" ${locked ? 'disabled' : ''}>임시저장</button>
      <button class="btn primary" id="btn-submit" ${locked ? 'disabled' : ''}>최종 제출</button>
    </div>
  `;
  setTimeout(() => {
    const sb = $('#btn-save', bar);
    if (sb) sb.addEventListener('click', () => doSave(false));
    const sm = $('#btn-submit', bar);
    if (sm) sm.addEventListener('click', async () => {
      if (!confirm('최종 제출 하시겠습니까? 제출 후에도 잠금 해제로 다시 편집 가능합니다.')) return;
      await doSave(true);
    });
    const ul = $('#btn-unlock', bar);
    if (ul) ul.addEventListener('click', async () => {
      if (!confirm('잠금을 해제하고 다시 편집 가능한 상태로 되돌립니다. 계속할까요?')) return;
      try {
        const s = getState();
        await unlockSubmission(s.current.roundId, sub._id);
      } catch (e) {
        alert('잠금 해제 실패: ' + e.message);
      }
    });
  }, 0);
  return bar;
}

// ────── 저장 ──────
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => doSave(false), 1500);
}

async function doSave(finalize) {
  const s = getState();
  if (!s.current?.roundId || !mySubmission) return;
  const payload = {
    thisMonth: mySubmission.thisMonth,
    nextMonth: mySubmission.nextMonth,
    progressTable: mySubmission.progressTable,
    images: mySubmission.images,
    issues: mySubmission.issues,
    achievements: mySubmission.achievements,
  };
  try {
    if (finalize) {
      // 최소 요건: 이번 달 수행 1개 이상
      const ok = (mySubmission.thisMonth || []).some(i => (i.content || '').trim());
      if (!ok) {
        alert('이번 달 수행 내용을 최소 1개 이상 입력해야 제출할 수 있습니다.');
        return;
      }
      await finalSubmitSubmission(s.current.roundId, mySubmission._id, payload);
    } else {
      await saveSubmissionDraft(s.current.roundId, mySubmission._id, payload);
    }
    setSaveStatus(finalize ? '최종 제출 완료' : '임시저장 완료');
  } catch (e) {
    console.error(e);
    alert('저장 실패: ' + e.message);
  }
}

function setSaveStatus(text) {
  const el = $('#save-status');
  if (el) el.textContent = text;
}

// ────── 미리보기 ──────
function updatePreviewOnly() {
  const s = getState();
  if (!s.round) return;
  const merged = (s.submissions || []).map(x => x._id === activeProjectId ? mySubmission : x);
  if (mySubmission && !merged.some(x => x._id === activeProjectId)) merged.push(mySubmission);
  const previewEl = $('#preview-area');
  if (!previewEl) return;
  previewEl.innerHTML = '';
  previewEl.appendChild(renderPreview(s.round, merged, s.projects));
}

// ────── boot ──────
async function boot() {
  if (isConfigPlaceholder()) {
    document.getElementById('main-area').innerHTML
      = '<div class="banner danger">Firebase config 가 placeholder 입니다. SETUP.md 참고하여 채워주세요.</div>';
    return;
  }
  try {
    await ensureSignedIn();
  } catch (e) {
    document.getElementById('main-area').innerHTML
      = `<div class="banner danger">인증 실패: ${escape(e.message)}</div>`;
    return;
  }
  // subscribe data sources
  subscribeAuthors(items => patchState({ authors: items }));
  subscribeProjects(items => patchState({ projects: items }));
  subscribeCurrent(cur => {
    patchState({ current: cur });
    // round 변경 시 round + submissions subscribe 재설정
    if (unsubRound) unsubRound();
    if (unsubSubmissions) unsubSubmissions();
    if (cur?.roundId) {
      unsubRound = subscribeRound(cur.roundId, r => patchState({ round: r }));
      unsubSubmissions = subscribeSubmissions(cur.roundId, subs => patchState({ submissions: subs }));
    } else {
      patchState({ round: null, submissions: [] });
    }
  });
  subscribe(() => render());
}

boot();
