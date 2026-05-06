// 관리자 페이지 — 월간 원장보고 (회차/과제/책임자 관리 + 검수)
import {
  ensureAdminSignedIn, signOutAdmin, currentUser, isAnonymousUser,
  isConfigPlaceholder, db,
} from '../firebase-init.js';
import {
  subscribeAuthors, subscribeProjects, subscribeCurrent,
  subscribeRound, subscribeSubmissions, subscribeRoundList,
  addAuthor, removeAuthor, seedDefaultAuthors,
  addProject, updateProject, removeProject, seedDefaultProjects,
  createAndConfirmMonthlyRound, archiveCurrentRound,
  restoreArchivedRound, deleteRoundPermanently,
  unlockSubmission, approveSubmission, getAllSubmissions,
  KIND_NAMES, DEFAULT_PROJECTS, DEFAULT_AUTHORS,
} from '../store.js';
import { getState, patchState, subscribe } from '../state.js';
import { renderPreview } from './preview-render.js';
import { buildHwpxBlob, suggestFileName } from '../hwpx/hwpx-builder.js';
import { downloadBlob, uuid } from '../util/download.js';

const BUILD_TAG = 'admin-monthly-v1';
if (typeof window !== 'undefined') {
  window.__adminViewEntered = true;
  console.log('[admin-view.js] module entered, build=', BUILD_TAG);
}

let activeTab = 'round';  // 'round' | 'projects' | 'authors' | 'archive'
let unsubRound = null, unsubSubs = null;

function $(s, root = document) { return root.querySelector(s); }
function escape(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// ────── 메인 render ──────
function render() {
  const s = getState();
  const root = $('#app-root');
  if (!root) return;

  if (isConfigPlaceholder()) {
    root.innerHTML = '<div class="banner danger">Firebase config 가 설정되지 않았습니다. SETUP.md 참고.</div>';
    return;
  }

  if (!s.adminAuthenticated) {
    root.innerHTML = '';
    root.appendChild(renderAuthLanding());
    return;
  }

  // 본문 — 탭 + 컨텐츠
  root.innerHTML = '';

  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  for (const [key, label] of [
    ['round', '현재 회차'],
    ['projects', '과제 관리'],
    ['authors', '책임자 명단'],
    ['archive', '아카이브'],
  ]) {
    const btn = document.createElement('button');
    btn.className = 'tab' + (activeTab === key ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { activeTab = key; render(); });
    tabs.appendChild(btn);
  }
  root.appendChild(tabs);

  const panel = document.createElement('div');
  panel.className = 'tab-panels';
  if (activeTab === 'round') panel.appendChild(renderRoundTab(s));
  else if (activeTab === 'projects') panel.appendChild(renderProjectsTab(s));
  else if (activeTab === 'authors') panel.appendChild(renderAuthorsTab(s));
  else if (activeTab === 'archive') panel.appendChild(renderArchiveTab(s));
  root.appendChild(panel);
}

// ────── 인증 랜딩 ──────
function renderAuthLanding() {
  const wrap = document.createElement('div');
  wrap.className = 'panel';
  wrap.innerHTML = `
    <h2>관리자 로그인</h2>
    <p>Google 계정으로 로그인 후 화이트리스트에 등록되어야 진입할 수 있습니다.</p>
    <button class="btn primary" id="btn-login">Google로 로그인</button>
    <div id="login-msg" class="muted tight" style="margin-top:8px"></div>
  `;
  setTimeout(() => {
    const btn = $('#btn-login', wrap);
    if (btn) btn.addEventListener('click', async () => {
      try {
        await ensureAdminSignedIn();
        patchState({ adminAuthenticated: true });
      } catch (e) {
        if (e?.code === 'auth/not-admin') {
          renderNotAdmin(e);
          return;
        }
        $('#login-msg', wrap).innerHTML = `<span style="color:#b91c1c">로그인 실패: ${escape(e.message)}</span>`;
      }
    });
  }, 0);
  return wrap;
}

function renderNotAdmin(err) {
  const root = $('#app-root');
  if (!root) return;
  root.innerHTML = `
    <div class="panel">
      <h2 style="color:#b91c1c">관리자 권한이 없습니다</h2>
      <p>로그인은 성공했지만 이 계정은 관리자 목록에 등록되어 있지 않습니다.</p>
      <p>로그인 이메일: <strong>${escape(err.attemptedEmail || '')}</strong></p>
      <p>Firebase uid: <code>${escape(err.attemptedUid || '')}</code></p>
      <h3>관리자 등록 방법 (최초 1회)</h3>
      <ol>
        <li>위 uid 문자열을 복사합니다.</li>
        <li>Firebase 콘솔 → Firestore Database → <code>config</code> 컬렉션 → <code>admins</code> 문서를 엽니다. 없으면 "문서 추가"로 생성.</li>
        <li><code>uids</code> 라는 Array 필드에 방금 복사한 uid 를 string 으로 추가합니다.</li>
        <li>저장 후 이 페이지에서 "다시 시도" 버튼을 누르세요.</li>
      </ol>
      <button class="btn primary" id="btn-retry">다시 시도</button>
    </div>
  `;
  $('#btn-retry').addEventListener('click', () => location.reload());
}

// ────── 현재 회차 탭 ──────
function renderRoundTab(s) {
  const box = document.createElement('div');
  if (s.current?.roundId && s.round) {
    box.appendChild(renderActiveRoundInfo(s));
  } else {
    box.appendChild(elBanner('warn', '활성 회차가 없습니다. 아래에서 새 회차를 만들어 주세요.'));
  }
  box.appendChild(renderNewRoundForm(s));
  return box;
}

function renderActiveRoundInfo(s) {
  const r = s.round;
  const info = document.createElement('div');
  info.className = 'panel';
  const ymStr = r.year && r.month ? `${r.year}년 ${r.month}월` : '';
  info.innerHTML = `
    <h2>현재 활성 회차</h2>
    <div><strong>${escape(ymStr)} 원장보고</strong> · 기준일 ${escape(r.baseDate || '')}</div>
    <div class="muted">조직명: ${escape(r.orgName || '')}</div>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" id="btn-hwpx">HWPX 출력</button>
      <button class="btn" id="btn-archive">회차 종료 & 아카이브</button>
    </div>
  `;
  setTimeout(() => {
    const hbtn = $('#btn-hwpx', info);
    if (hbtn) hbtn.addEventListener('click', async () => {
      try {
        const subs = (s.submissions && s.submissions.length)
          ? s.submissions
          : await getAllSubmissions(s.current.roundId);
        const blob = await buildHwpxBlob(s.round, subs, { masterProjects: s.projects });
        downloadBlob(blob, suggestFileName(s.round));
      } catch (e) {
        console.error(e);
        alert('HWPX 출력 실패: ' + e.message);
      }
    });
    const abtn = $('#btn-archive', info);
    if (abtn) abtn.addEventListener('click', async () => {
      if (!confirm('현재 회차를 종료하고 아카이브로 이동합니다. 계속할까요?')) return;
      try { await archiveCurrentRound(); } catch (e) { alert('실패: ' + e.message); }
    });
  }, 0);

  // 제출 현황 보드
  const boardWrap = document.createElement('div');
  boardWrap.className = 'panel';
  boardWrap.innerHTML = '<h3>제출 현황</h3>';
  const tbl = document.createElement('table');
  tbl.className = 'data';
  tbl.innerHTML = `<thead><tr>
    <th>과제</th><th>책임자</th><th>상태</th><th style="width:200px">조치</th>
  </tr></thead><tbody></tbody>`;
  const tb = tbl.querySelector('tbody');
  const projects = s.round.projectsSnapshot || [];
  const subMap = new Map((s.submissions || []).map(x => [x._id, x]));
  for (const p of projects) {
    const sub = subMap.get(p.id);
    const tr = document.createElement('tr');
    const stColor = sub?.status === 'submitted' ? '#15803d' : sub?.status === 'approved' ? '#1d4ed8' : sub?.status === 'draft' ? '#d97706' : '#6b7280';
    tr.innerHTML = `
      <td>${escape(p.title.slice(0, 40))}</td>
      <td>${escape(p.owner)}</td>
      <td><span style="color:${stColor};font-weight:600">${sub?.status || 'idle'}</span></td>
      <td></td>
    `;
    const actCell = tr.lastElementChild;
    if (sub?.status === 'submitted') {
      const aBtn = document.createElement('button');
      aBtn.className = 'btn small primary';
      aBtn.textContent = '승인';
      aBtn.addEventListener('click', async () => {
        try { await approveSubmission(s.current.roundId, p.id); }
        catch (e) { alert('승인 실패: ' + e.message); }
      });
      actCell.appendChild(aBtn);
    }
    if (sub?.status === 'submitted' || sub?.status === 'approved') {
      const uBtn = document.createElement('button');
      uBtn.className = 'btn small';
      uBtn.textContent = '잠금 해제';
      uBtn.style.marginLeft = '4px';
      uBtn.addEventListener('click', async () => {
        if (!confirm('이 제출을 다시 편집 가능한 상태로 되돌립니다. 계속할까요?')) return;
        try { await unlockSubmission(s.current.roundId, p.id); }
        catch (e) { alert('해제 실패: ' + e.message); }
      });
      actCell.appendChild(uBtn);
    }
    tb.appendChild(tr);
  }
  boardWrap.appendChild(tbl);

  const wrap = document.createElement('div');
  wrap.appendChild(info);
  wrap.appendChild(boardWrap);
  return wrap;
}

function renderNewRoundForm(s) {
  const box = document.createElement('div');
  box.className = 'panel';
  box.innerHTML = `
    <h3>새 회차 만들기</h3>
    <div class="row">
      <div class="field"><label>년도</label><input id="nm-year" type="number" min="2025" max="2099" value="${new Date().getFullYear()}"/></div>
      <div class="field"><label>월</label><input id="nm-month" type="number" min="1" max="12" value="${new Date().getMonth() + 1}"/></div>
      <div class="field grow"><label>회의 기준일</label><input id="nm-base" type="date" value="${new Date().toISOString().slice(0,10)}"/></div>
    </div>
    <div class="field"><label>조직명</label><input id="nm-org" type="text" value="[궤도노반연구실]"/></div>
    <div class="row" style="margin-top:8px">
      <button class="btn primary" id="nm-confirm">회차 확정</button>
    </div>
    <div class="muted tight" style="margin-top:6px">전월 회차의 12개월 진행표 데이터는 자동 누적됩니다.</div>
  `;
  setTimeout(() => {
    const btn = $('#nm-confirm', box);
    if (btn) btn.addEventListener('click', async () => {
      const year = parseInt($('#nm-year', box).value, 10);
      const month = parseInt($('#nm-month', box).value, 10);
      const baseDate = $('#nm-base', box).value;
      const orgName = $('#nm-org', box).value.trim() || '[궤도노반연구실]';
      if (!year || !month || !baseDate) {
        alert('년도/월/기준일 모두 입력하세요.');
        return;
      }
      const st = getState();
      if (!st.projects || st.projects.length === 0) {
        if (!confirm(`과제 명단이 비어 있습니다. 디폴트 ${DEFAULT_PROJECTS.length}개로 시드하고 계속할까요?`)) return;
        await seedDefaultProjects();
      }
      if (!st.authors || st.authors.length === 0) {
        if (!confirm(`책임자 명단이 비어 있습니다. 디폴트 ${DEFAULT_AUTHORS.length}명으로 시드하고 계속할까요?`)) return;
        await seedDefaultAuthors();
      }
      if (st.current?.roundId) {
        if (!confirm('현재 활성 회차가 있습니다. 아카이브하고 새 회차로 교체할까요?')) return;
      }
      try {
        await createAndConfirmMonthlyRound({
          year, month, baseDate, orgName,
          projects: getState().projects,
          authors: getState().authors,
          prevRoundId: st.current?.roundId || null,
        });
        alert('회차 확정 완료');
      } catch (e) {
        console.error(e);
        alert('실패: ' + e.message);
      }
    });
  }, 0);
  return box;
}

// ────── 과제 관리 탭 ──────
function renderProjectsTab(s) {
  const box = document.createElement('div');
  box.innerHTML = '<h2>과제 관리</h2>';

  const toolbar = document.createElement('div');
  toolbar.className = 'row';
  toolbar.style.marginBottom = '8px';
  toolbar.innerHTML = `
    <button class="btn" id="btn-seed-projects">디폴트 ${DEFAULT_PROJECTS.length}개로 리셋 / 시드</button>
    <span class="muted tight">양식 기본 ${DEFAULT_PROJECTS.length}개 과제 (top-level ${DEFAULT_PROJECTS.filter(p => !p.parentTitle).length}개 + sub-project ${DEFAULT_PROJECTS.filter(p => p.parentTitle).length}개).</span>
  `;
  box.appendChild(toolbar);
  setTimeout(() => {
    const b = $('#btn-seed-projects', toolbar);
    if (b) b.addEventListener('click', async () => {
      if (!confirm(`과제 명단을 디폴트 ${DEFAULT_PROJECTS.length}개로 덮어씁니다. 계속할까요?`)) return;
      await seedDefaultProjects();
    });
  }, 0);

  if (!s.projects || s.projects.length === 0) {
    box.appendChild(elMuted('과제가 없습니다. 위 시드 버튼 또는 아래 추가 버튼 사용.'));
  } else {
    const tbl = document.createElement('table');
    tbl.className = 'data';
    tbl.innerHTML = `<thead><tr>
      <th style="width:90px">종류</th>
      <th>제목</th>
      <th style="width:140px">책임자</th>
      <th style="width:120px">소속</th>
      <th style="width:160px"></th>
    </tr></thead><tbody></tbody>`;
    const tb = tbl.querySelector('tbody');
    // 계층 정렬: top-level 먼저, 각 top-level 바로 다음에 그 하위 sub-project 들 indent
    const sorted = [...s.projects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const tops = sorted.filter(p => !p.parentProjectId);
    const childrenByParent = new Map();
    for (const p of sorted) {
      if (p.parentProjectId) {
        if (!childrenByParent.has(p.parentProjectId)) childrenByParent.set(p.parentProjectId, []);
        childrenByParent.get(p.parentProjectId).push(p);
      }
    }
    const renderRow = (p, isChild = false) => {
      const tr = document.createElement('tr');
      const indent = isChild ? '<span style="color:#9ca3af;margin-right:6px">└─</span>' : '';
      const titleStyle = isChild ? 'padding-left:18px;color:#374151' : '';
      tr.innerHTML = `
        <td>${escape(KIND_NAMES[p.kind] || p.kind)}</td>
        <td style="${titleStyle}">${indent}${escape(p.title || '')}</td>
        <td>${escape(p.owner || '')}</td>
        <td>${escape(p.org || '')}</td>
        <td>
          <button class="btn small" data-act="edit">✏️ 수정</button>
          <button class="btn small danger" data-act="del">삭제</button>
        </td>
      `;
      tr.querySelector('[data-act="edit"]').addEventListener('click', () => openEditProjectDialog(p));
      tr.querySelector('[data-act="del"]').addEventListener('click', async () => {
        if (!confirm(`"${p.title}" 을(를) 삭제할까요?`)) return;
        await removeProject(p.id);
      });
      tb.appendChild(tr);
    };
    for (const p of tops) {
      renderRow(p, false);
      const children = childrenByParent.get(p.id) || [];
      for (const c of children) renderRow(c, true);
    }
    box.appendChild(tbl);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'btn primary';
  addBtn.style.marginTop = '12px';
  addBtn.textContent = '+ 새 과제 추가';
  addBtn.addEventListener('click', () => openEditProjectDialog(null));
  box.appendChild(addBtn);

  return box;
}

function openEditProjectDialog(proj) {
  const old = document.getElementById('edit-project-dlg');
  if (old) old.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'edit-project-dlg';
  dlg.style.maxWidth = '560px';
  dlg.style.width = 'min(560px, 90vw)';
  dlg.innerHTML = `
    <div class="dlg-header">${proj ? '과제 수정' : '새 과제 추가'}</div>
    <div class="dlg-body">
      <div class="field"><label>종류</label>
        <select id="ep-kind">
          <option value="basic">기본사업</option>
          <option value="natl_rnd">국가R&D</option>
          <option value="consign">수탁사업</option>
          <option value="etc">기타</option>
        </select>
      </div>
      <div class="field"><label>과제명</label><input id="ep-title" type="text"/></div>
      <div class="field"><label>책임자</label><input id="ep-owner" type="text" placeholder="예: 김은 책임"/></div>
      <div class="field"><label>소속실</label><input id="ep-org" type="text" placeholder="예: 궤도노반연구실"/></div>
      <div class="row">
        <div class="field grow"><label>연구 시작일</label><input id="ep-start" type="date"/></div>
        <div class="field grow"><label>연구 종료일</label><input id="ep-end" type="date"/></div>
      </div>
      <div class="row">
        <div class="field grow"><label>당해 연구비 (백만원)</label><input id="ep-y-amt" type="text"/></div>
        <div class="field grow"><label>총 연구비 (백만원)</label><input id="ep-t-amt" type="text"/></div>
      </div>
      <div class="field"><label>연구목표</label><textarea id="ep-goal" rows="3"></textarea></div>
      <div class="field"><label>기술 정의 및 특징</label><textarea id="ep-tech-def" rows="3"></textarea></div>
      <div class="field"><label>기술 세부 항목 (한 줄에 하나씩)</label><textarea id="ep-tech-feats" rows="3"></textarea></div>
      <div class="field"><label>활동 항목 (12개월 표 행 — 한 줄에 하나씩)</label><textarea id="ep-activities" rows="4"></textarea></div>
    </div>
    <div class="dlg-actions">
      <button class="btn" id="ep-cancel">취소</button>
      <button class="btn primary" id="ep-confirm">저장</button>
    </div>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();

  const fill = proj || {};
  $('#ep-kind', dlg).value = fill.kind ?? 'basic';
  $('#ep-title', dlg).value = fill.title ?? '';
  $('#ep-owner', dlg).value = fill.owner ?? '';
  $('#ep-org', dlg).value = fill.org ?? '';
  $('#ep-start', dlg).value = fill.rangeStart ?? '';
  $('#ep-end', dlg).value = fill.rangeEnd ?? '';
  $('#ep-y-amt', dlg).value = fill.budget?.yearAmount ?? '';
  $('#ep-t-amt', dlg).value = fill.budget?.totalAmount ?? '';
  $('#ep-goal', dlg).value = fill.goal ?? '';
  $('#ep-tech-def', dlg).value = fill.techDefinition ?? '';
  $('#ep-tech-feats', dlg).value = (fill.techFeatures ?? []).join('\n');
  $('#ep-activities', dlg).value = (fill.activities ?? []).map(a => a.name).join('\n');
  $('#ep-title', dlg).focus();

  const close = () => { dlg.close(); dlg.remove(); };
  $('#ep-cancel', dlg).addEventListener('click', close);
  dlg.addEventListener('cancel', close);

  $('#ep-confirm', dlg).addEventListener('click', async () => {
    const data = {
      kind: $('#ep-kind', dlg).value,
      title: $('#ep-title', dlg).value.trim(),
      owner: $('#ep-owner', dlg).value.trim(),
      org: $('#ep-org', dlg).value.trim(),
      rangeStart: $('#ep-start', dlg).value,
      rangeEnd: $('#ep-end', dlg).value,
      budget: {
        yearAmount: $('#ep-y-amt', dlg).value.trim(),
        totalAmount: $('#ep-t-amt', dlg).value.trim(),
      },
      goal: $('#ep-goal', dlg).value.trim(),
      techDefinition: $('#ep-tech-def', dlg).value.trim(),
      techFeatures: $('#ep-tech-feats', dlg).value.split('\n').map(s => s.trim()).filter(Boolean),
      activities: $('#ep-activities', dlg).value.split('\n').map(s => s.trim()).filter(Boolean)
        .map(name => ({
          id: (proj?.activities || []).find(a => a.name === name)?.id || uuid(),
          name,
        })),
    };
    if (!data.title) { alert('과제명을 입력하세요.'); return; }
    try {
      if (proj) await updateProject(proj.id, data);
      else await addProject(data);
      close();
    } catch (e) { alert('실패: ' + e.message); }
  });
}

// ────── 책임자 명단 탭 ──────
function renderAuthorsTab(s) {
  const box = document.createElement('div');
  box.innerHTML = '<h2>책임자 명단</h2>';

  const toolbar = document.createElement('div');
  toolbar.className = 'row';
  toolbar.style.marginBottom = '8px';
  toolbar.innerHTML = `
    <button class="btn" id="btn-seed-authors">디폴트 ${DEFAULT_AUTHORS.length}명으로 리셋 / 시드</button>
    <span class="muted tight">양식 기본 4명. 추가 책임자가 있으면 아래에서 추가.</span>
  `;
  box.appendChild(toolbar);
  setTimeout(() => {
    const b = $('#btn-seed-authors', toolbar);
    if (b) b.addEventListener('click', async () => {
      if (!confirm(`책임자 명단을 디폴트 ${DEFAULT_AUTHORS.length}명으로 덮어씁니다. 계속할까요?`)) return;
      await seedDefaultAuthors();
    });
  }, 0);

  if (!s.authors || s.authors.length === 0) {
    box.appendChild(elMuted('아직 책임자가 없습니다. 위 시드 버튼 또는 아래에서 추가.'));
  } else {
    const tbl = document.createElement('table');
    tbl.className = 'data';
    tbl.innerHTML = `<thead><tr><th>이름</th><th style="width:120px"></th></tr></thead><tbody></tbody>`;
    const tb = tbl.querySelector('tbody');
    for (const a of s.authors) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escape(a.name)}</td><td></td>`;
      const btn = document.createElement('button');
      btn.className = 'btn small danger';
      btn.textContent = '삭제';
      btn.addEventListener('click', async () => {
        if (!confirm(`${a.name} 을 삭제합니다.`)) return;
        await removeAuthor(a.id);
      });
      tr.lastElementChild.appendChild(btn);
      tb.appendChild(tr);
    }
    box.appendChild(tbl);
  }

  const addBox = document.createElement('div');
  addBox.className = 'row';
  addBox.style.marginTop = '12px';
  addBox.innerHTML = `
    <input id="new-author-name" type="text" placeholder="이름 입력 (예: 홍길동 책임)"/>
    <button class="btn primary" id="btn-add-author">추가</button>
  `;
  box.appendChild(addBox);
  setTimeout(() => {
    const b = $('#btn-add-author', addBox);
    if (b) b.addEventListener('click', async () => {
      const name = $('#new-author-name', addBox).value.trim();
      if (!name) return;
      await addAuthor(name);
      $('#new-author-name', addBox).value = '';
    });
  }, 0);
  return box;
}

// ────── 아카이브 탭 ──────
function renderArchiveTab(s) {
  const box = document.createElement('div');
  box.innerHTML = '<h2>아카이브</h2>';
  if (!s.roundList || s.roundList.length === 0) {
    box.appendChild(elMuted('아카이브된 회차가 없습니다.'));
    return box;
  }
  const tbl = document.createElement('table');
  tbl.className = 'data';
  tbl.innerHTML = `<thead><tr>
    <th>회차</th><th>기준일</th><th>상태</th><th style="width:240px"></th>
  </tr></thead><tbody></tbody>`;
  const tb = tbl.querySelector('tbody');
  for (const r of s.roundList) {
    const ymStr = r.year && r.month ? `${r.year}년 ${r.month}월` : r.id;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escape(ymStr)}</td>
      <td>${escape(r.baseDate || '')}</td>
      <td>${escape(r.status || '')}</td>
      <td></td>
    `;
    const cell = tr.lastElementChild;
    if (r.status === 'archived') {
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn small';
      restoreBtn.textContent = '활성으로 복원';
      restoreBtn.addEventListener('click', async () => {
        if (!confirm('이 회차를 활성으로 복원합니다. 현재 활성 회차가 있으면 자동 아카이브됩니다.')) return;
        try { await restoreArchivedRound(r.id); } catch (e) { alert('실패: ' + e.message); }
      });
      cell.appendChild(restoreBtn);
    }
    const delBtn = document.createElement('button');
    delBtn.className = 'btn small danger';
    delBtn.textContent = '삭제';
    delBtn.style.marginLeft = '4px';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`${ymStr} 회차를 영구 삭제합니다. 모든 데이터가 사라집니다. 계속?`)) return;
      try { await deleteRoundPermanently(r.id); } catch (e) { alert('실패: ' + e.message); }
    });
    cell.appendChild(delBtn);
    tb.appendChild(tr);
  }
  box.appendChild(tbl);
  return box;
}

// ────── 헬퍼 ──────
function elBanner(cls, text) {
  const d = document.createElement('div');
  d.className = `banner ${cls}`;
  d.textContent = text;
  return d;
}
function elMuted(text) {
  const d = document.createElement('div');
  d.className = 'muted';
  d.textContent = text;
  return d;
}

// ────── boot ──────
async function boot() {
  if (isConfigPlaceholder()) {
    document.getElementById('app-root').innerHTML
      = '<div class="banner danger">Firebase config 가 placeholder 입니다. SETUP.md 참고하여 채워주세요.</div>';
    return;
  }
  // subscribe
  subscribeAuthors(items => patchState({ authors: items }));
  subscribeProjects(items => patchState({ projects: items }));
  subscribeCurrent(cur => {
    patchState({ current: cur });
    if (unsubRound) unsubRound();
    if (unsubSubs) unsubSubs();
    if (cur?.roundId) {
      unsubRound = subscribeRound(cur.roundId, r => patchState({ round: r }));
      unsubSubs = subscribeSubmissions(cur.roundId, subs => patchState({ submissions: subs }));
    } else {
      patchState({ round: null, submissions: [] });
    }
  });
  subscribeRoundList(list => patchState({ roundList: list }));
  subscribe(() => render());

  // 자동 진입 시도 (이미 로그인된 관리자)
  try {
    const u = currentUser();
    if (u && !isAnonymousUser()) {
      // 화이트리스트 검증은 ensureAdminSignedIn 내부에서 처리되지만,
      // 여기선 자동 진입은 하지 않고 사용자가 버튼 클릭하도록 함 (간단)
    }
  } catch (e) { /* ignore */ }

  // 초기 화면
  render();
}

boot();
