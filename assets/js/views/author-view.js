// 작성자 페이지 로직
import { ensureSignedIn, isConfigPlaceholder } from '../firebase-init.js';
import {
  subscribeAuthors, subscribeCategories, subscribeCurrent,
  subscribeRound, subscribeSubmissions, subscribeRoundList,
  saveDraft, finalSubmit, submissionRef, unlockSubmission,
  getAllSubmissions, kindLabelKor, KIND_ORDER,
  addCategoryToActiveRound,
} from '../store.js';
import { getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getState, patchState, subscribe } from '../state.js';
import { renderPreview } from './preview-render.js';
import { relativeTimeLabel } from '../util/date.js';
import { uuid, downloadBlob } from '../util/download.js';
import { buildHwpxBlob, suggestFileName } from '../hwpx/hwpx-builder.js';

const BUILD_TAG = 'author-v9-2026-04-22';
if (typeof window !== 'undefined') {
  window.__authorViewEntered = true;
  console.log('[author-view.js] module entered, build=', BUILD_TAG);
}

let activeTab = 'current';   // 'current' | 'archive'

// 기본 입력 본체 구조
function emptyItem(person) {
  return { id: uuid(), text: '', date: '', org: '', person: person || '', important: false };
}
// 새 형식: { categoryId, past: [item], next: [item] }
//   past = 지난 주(달) 실적, next = 이번 주(달) 계획
//   주요 보고사항은 past+next 통합에서 important=true 항목만 추림
function emptyEntry(categoryId, person) {
  return { categoryId, past: [emptyItem(person)], next: [] };
}

// Compat: 다양한 entries 형식을 새 {past, next} 배열로 정규화.
//   1) 매우 옛날: { past: [{categoryId, items}], next: [{categoryId, items}] }
//   2) 최근(통합): [{ categoryId, items: [...] }]   ← 모두 past 로 취급
//   3) 새 형식:   [{ categoryId, past: [...], next: [...] }]
function normalizeEntries(raw) {
  // 3) 새 형식 그대로
  if (Array.isArray(raw) && raw.every(e => 'past' in e || 'next' in e)) {
    return raw.map(e => ({
      categoryId: e.categoryId,
      past: Array.isArray(e.past) ? e.past : [],
      next: Array.isArray(e.next) ? e.next : [],
    }));
  }
  // 2) 최근 통합 형식 → 모두 past 로
  if (Array.isArray(raw)) {
    return raw.map(e => ({
      categoryId: e.categoryId,
      past: Array.isArray(e.items) ? e.items : [],
      next: [],
    }));
  }
  // 1) 매우 옛날 형식
  if (raw && (Array.isArray(raw.past) || Array.isArray(raw.next))) {
    const map = new Map();
    for (const ent of (raw.past ?? [])) {
      const key = ent?.categoryId;
      if (!key) continue;
      if (!map.has(key)) map.set(key, { categoryId: key, past: [], next: [] });
      map.get(key).past.push(...(ent.items ?? []));
    }
    for (const ent of (raw.next ?? [])) {
      const key = ent?.categoryId;
      if (!key) continue;
      if (!map.has(key)) map.set(key, { categoryId: key, past: [], next: [] });
      map.get(key).next.push(...(ent.items ?? []));
    }
    return [...map.values()];
  }
  return [];
}

// 내 submission 문서 데이터 캐시
let mySubmission = null;
let saveTimer = null;
let skipNextLocal = false;
let lastKnownRemoteSavedMs = 0;  // 마지막으로 "내가 관찰한" 원격 lastSavedAt (ms)
let warnedRemoteChange = false;  // 같은 라운드에서 경고를 반복하지 않도록

// 깊은 복사가 필요한 것은 entries 만 (사용자가 편집하는 대상).
// Firestore Timestamp 객체는 toMillis() 같은 메서드를 가지므로 JSON 직렬화로 잃어선 안 됨.
// 구버전(past/next) submission 도 normalizeEntries 로 단일 배열로 평탄화.
function cloneForLocalEdit(mine) {
  return {
    ...mine,
    entries: JSON.parse(JSON.stringify(normalizeEntries(mine.entries))),
  };
}

function timestampMs(t) {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function renderShellMessage(text, mode = 'banner') {
  const root = $('#main-area');
  root.innerHTML = `<div class="${mode}">${text}</div>`;
}

function statusText(s) {
  return { idle: '작성전', draft: '작성중 (임시저장)', submitted: '작성완료 (제출됨)' }[s] || '';
}

async function mountApp() {
  if (isConfigPlaceholder()) {
    renderShellMessage(
      'Firebase 설정이 아직 비어 있습니다. <code>assets/js/firebase-config.js</code> 파일에 프로젝트 config 객체를 넣어주세요. 자세한 방법은 README.md 참고.',
      'banner danger',
    );
    return;
  }

  renderShellMessage('Firebase 연결 중…', 'banner');

  try {
    await ensureSignedIn();
  } catch (e) {
    console.error('익명 로그인 실패', e);
    const code = e?.code || e?.name || 'Error';
    const msg = e?.message || String(e);
    renderShellMessage(
      `<strong>Firebase 익명 로그인 실패</strong><br/><code>${escapeHtml(code)}</code>: ${escapeHtml(msg)}<br/><br/>`
      + `Firebase 콘솔 → Authentication → Sign-in method 에서 <strong>익명(Anonymous)</strong> 로그인을 사용 설정했는지 확인하세요.`,
      'banner danger',
    );
    return;
  }

  // 구독 등록
  subscribeAuthors((authors) => patchState({ authors }));
  subscribeCategories((categories) => patchState({ categories }));
  subscribeCurrent((current) => patchState({ current }));
  subscribeRoundList((list) => patchState({ roundList: list }));

  let unsubRound = null;
  let unsubSubs = null;

  subscribe((s) => {
    const rid = s.current.roundId || null;
    if (!rid) {
      if (unsubRound) { unsubRound(); unsubRound = null; }
      if (unsubSubs) { unsubSubs(); unsubSubs = null; }
      if (s.round !== null || (s.submissions && s.submissions.length > 0)) {
        patchState({ round: null, submissions: [] });
      }
      return;
    }
    if (!unsubRound || s.round?.__rid !== rid) {
      if (unsubRound) unsubRound();
      unsubRound = subscribeRound(rid, (r) => {
        patchState({ round: r ? { ...r, __rid: rid } : null });
      });
      if (unsubSubs) unsubSubs();
      unsubSubs = subscribeSubmissions(rid, (subs2) => {
        patchState({ submissions: subs2 });
        const myId = getState().activeAuthorId;
        if (!myId) return;

        const mine = subs2.find(x => x._id === myId);
        if (!mine) { render(); return; }

        const remoteMs = timestampMs(mine.lastSavedAt);

        // 내가 방금 저장해 돌아온 에코는 무시
        if (skipNextLocal) {
          mySubmission = cloneForLocalEdit(mine);
          lastKnownRemoteSavedMs = remoteMs;
          skipNextLocal = false;
          render();
          return;
        }

        // 로컬 캐시가 없으면 원격을 그대로 로드
        if (!mySubmission || mySubmission._id !== myId) {
          mySubmission = cloneForLocalEdit(mine);
          lastKnownRemoteSavedMs = remoteMs;
          render();
          return;
        }

        // 로컬 편집 중인데 원격이 더 새로우면 — 다른 기기/탭에서 저장된 상황.
        // 로컬 변경사항 보존을 우선하고 사용자에게 한 번만 경고.
        if (remoteMs > lastKnownRemoteSavedMs) {
          if (!warnedRemoteChange) {
            warnedRemoteChange = true;
            console.warn('[author] 다른 기기/탭에서 이 회차가 수정되었습니다.');
            setTimeout(() => {
              const ok = confirm(
                '다른 기기나 탭에서 본인 작성자로 새 내용이 저장되었습니다.\n\n'
                + '[확인]  외부 저장본을 불러와 현재 화면을 덮어씁니다 (로컬 편집 내용 유실).\n'
                + '[취소] 현재 화면을 유지합니다 (다음 저장 시 외부 저장본 덮어씀).',
              );
              if (ok) {
                mySubmission = cloneForLocalEdit(mine);
                lastKnownRemoteSavedMs = remoteMs;
                warnedRemoteChange = false;
                render();
              } else {
                lastKnownRemoteSavedMs = remoteMs;
                warnedRemoteChange = false;
              }
            }, 0);
          }
          // status 만은 항상 동기화 (관리자 잠금 해제 등 반영)
          if (mySubmission.status !== mine.status) {
            mySubmission.status = mine.status;
            mySubmission.submittedAt = mine.submittedAt;
          }
        } else {
          // 원격 변화 없음 — status 만 동기화
          if (mySubmission.status !== mine.status) {
            mySubmission.status = mine.status;
            mySubmission.submittedAt = mine.submittedAt;
          }
        }
        render();
      });
    }
  });

  // 탭 전환 버튼 바인딩 (한 번만)
  const tabBar = document.getElementById('author-tabs');
  if (tabBar && !tabBar.__bound) {
    tabBar.__bound = true;
    for (const btn of tabBar.querySelectorAll('.tab')) {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        for (const b of tabBar.querySelectorAll('.tab')) {
          b.classList.toggle('active', b === btn);
        }
        document.getElementById('tab-current').hidden = (activeTab !== 'current');
        document.getElementById('tab-archive').hidden = (activeTab !== 'archive');
        render();
      });
    }
  }

  // 랜딩 시점: 본인 선택 상태 초기화 (요청사항: 항상 작성자 선택 화면이 첫 랜딩)
  patchState({ activeAuthorId: null });

  subscribe(() => render());
}

function render() {
  const s = getState();
  renderTopStatus(s);

  if (activeTab === 'archive') {
    renderArchiveTab(s);
    return;
  }

  // 현재 회차 작성 탭
  const main = $('#main-area');

  // 활성 회차 없음
  if (!s.current.roundId || !s.round) {
    main.innerHTML = '';
    main.appendChild(elMsg('현재 작성 가능한 회차가 없습니다. 관리자의 확정을 기다려 주세요.', 'banner warn'));
    $('#preview-area').innerHTML = '';
    return;
  }

  // 본인 선택 필요 — 랜딩 시마다 매번 수행
  if (!s.activeAuthorId) {
    main.innerHTML = '';
    main.appendChild(renderAuthorPicker(s));
    $('#preview-area').innerHTML = '';
    return;
  }

  // 명단에서 본인이 사라진 경우
  if (!s.round.authorsSnapshot?.some(a => a.id === s.activeAuthorId)) {
    main.innerHTML = '';
    main.appendChild(elMsg(
      `선택된 본인(${s.activeAuthorId})이 이번 회차 명단에 없습니다. 다른 이름을 선택하세요.`,
      'banner warn',
    ));
    main.appendChild(renderAuthorPicker(s));
    return;
  }

  // 내 submission 로드 (구독으로 들어온 것 사용)
  const mine = s.submissions.find(x => x._id === s.activeAuthorId);
  if (!mySubmission || mySubmission._id !== s.activeAuthorId) {
    if (mine) {
      mySubmission = cloneForLocalEdit(mine);
      lastKnownRemoteSavedMs = timestampMs(mine.lastSavedAt);
    } else {
      mySubmission = {
        _id: s.activeAuthorId,
        authorId: s.activeAuthorId,
        authorName: (s.authors.find(a => a.id === s.activeAuthorId) || {}).name || '',
        entries: [],
        status: 'idle',
      };
      lastKnownRemoteSavedMs = 0;
    }
    warnedRemoteChange = false;

    // 본인 선택 직후, 본인이 담당자/공동책임자로 등록된 카테고리 중
    // 아직 entries 에 없는 것만 자동 추가. 입력 부담 줄이기 위함.
    // 이미 있는 entries 는 안 건드림 (사용자 입력 데이터 보존).
    // 사용자가 손대기 전엔 자동 저장 안 함 (입력하면 그때 저장됨).
    if (Array.isArray(mySubmission.entries)) {
      const myName = (s.round.authorsSnapshot?.find(a => a.id === s.activeAuthorId)?.name
                      || mySubmission.authorName || '').trim();
      if (myName) {
        // 직급 접미사 제거한 핵심 이름 추출 (예: "지구철 선임" → "지구철")
        const coreName = myName.replace(/\s*(선임|책임|수석|연구원|박사|책임자|책임연구원)\s*$/, '').trim();
        // 합본 카테고리 목록 (snapshot + master)
        const snap = Array.isArray(s.round.categoriesSnapshot) ? s.round.categoriesSnapshot : [];
        const master = Array.isArray(s.categories) ? s.categories : [];
        const catMap = new Map();
        for (const c of snap) catMap.set(c.id, c);
        for (const c of master) if (!catMap.has(c.id)) catMap.set(c.id, c);
        const allCats = [...catMap.values()];
        // 본인 이름이 owner 에 포함된 카테고리
        const myCats = allCats.filter(c => {
          const owner = (c.owner || '').trim();
          if (!owner) return false;
          return owner.includes(myName) || (coreName && owner.includes(coreName));
        });
        // 이미 entries 에 들어있는 categoryId 셋
        const existingIds = new Set(mySubmission.entries.map(e => e.categoryId));
        // 빠진 본인 담당 과제만 추가
        const missingCats = myCats.filter(c => !existingIds.has(c.id));
        if (missingCats.length > 0) {
          // 카테고리 order 기준으로 정렬해서 추가
          missingCats.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          for (const cat of missingCats) {
            mySubmission.entries.push({
              categoryId: cat.id,
              past: [emptyItem(myName)],
              next: [],
            });
          }
        }
      }
    }
  } else if (mine && mine.status !== mySubmission.status) {
    // 원격에서 잠금 해제 반영 등 상태만 동기화
    mySubmission.status = mine.status;
    mySubmission.submittedAt = mine.submittedAt;
  }

  // 사용자가 입력 중이면 editor 재빌드 건너뛰기 (포커스 유지).
  // 자동저장 후 Firestore snapshot echo로 인한 강제 재렌더링이 input을 파괴해
  // 커서가 빠지는 버그 방지. 미리보기와 상태바만 업데이트.
  const ae = document.activeElement;
  const editorIsFocused = ae && main.contains(ae)
    && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  if (editorIsFocused) {
    updatePreviewOnly();
    updateSaveStatus(mySubmission);
    return;
  }

  main.innerHTML = '';
  main.appendChild(renderSubmissionEditor(s, mySubmission));

  // 미리보기 업데이트 (내 기여 + 다른 사람 기여 모두)
  const previewEl = $('#preview-area');
  previewEl.innerHTML = '';
  // 내 로컬 편집을 반영한 병합 submissions 생성
  const merged = s.submissions.map(x => x._id === s.activeAuthorId ? mySubmission : x);
  if (!merged.some(x => x._id === s.activeAuthorId)) merged.push(mySubmission);
  previewEl.appendChild(renderPreview(s.round, merged, s.categories));
}

function renderTopStatus(s) {
  const top = $('#round-info');
  if (!s.current.roundId || !s.round) {
    top.textContent = '활성 회차 없음';
    return;
  }
  const form = s.round.form === 'monthly' ? '월례' : '주례';
  const periodWord = s.round.form === 'monthly' ? '달' : '주';
  const range = `${s.round.rangeStart} ~ ${s.round.rangeEnd}`;
  const nextRange = (s.round.nextRangeStart && s.round.nextRangeEnd)
    ? ` · 이번 ${periodWord} ${s.round.nextRangeStart} ~ ${s.round.nextRangeEnd}` : '';
  const name = s.activeAuthorId
    ? (s.round.authorsSnapshot?.find(a => a.id === s.activeAuthorId)?.name || '(알 수 없음)')
    : '';
  top.innerHTML = `<strong>${form}</strong> · 기준일 ${s.round.baseDate} · 지난 ${periodWord} ${range}${nextRange}`
    + (name ? ` · 본인: <strong>${escapeHtml(name)}</strong> <button class="btn small" id="change-author" style="margin-left:6px" title="다른 작성자로 변경">🔄 본인 변경</button>` : '')
    + ` · <a href="./help.html" target="_blank" style="color:#1d4ed8;text-decoration:none;font-weight:600">📖 사용법</a>`;
  const change = $('#change-author');
  if (change) change.addEventListener('click', () => {
    mySubmission = null;
    lastKnownRemoteSavedMs = 0;
    warnedRemoteChange = false;
    patchState({ activeAuthorId: null });
  });
}

function elMsg(text, cls) {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = text;
  return d;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderAuthorPicker(s) {
  const box = document.createElement('div');
  box.className = 'panel';
  box.innerHTML = '<h2>본인을 선택하세요</h2>';
  const authors = s.round?.authorsSnapshot ?? s.authors ?? [];
  if (authors.length === 0) {
    box.appendChild(elMsg('이번 회차 작성자 명단이 비어 있습니다. 관리자에게 문의하세요.', 'banner warn'));
    return box;
  }
  const wrap = document.createElement('div');
  wrap.className = 'row';
  for (const a of authors) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = a.name;
    btn.addEventListener('click', () => {
      mySubmission = null;
      lastKnownRemoteSavedMs = 0;
      warnedRemoteChange = false;
      patchState({ activeAuthorId: a.id });
    });
    wrap.appendChild(btn);
  }
  box.appendChild(wrap);
  return box;
}

function renderSubmissionEditor(s, sub) {
  const locked = sub.status === 'submitted';
  const wrap = document.createElement('div');
  wrap.className = 'panel' + (locked ? ' author-block locked' : '');

  const header = document.createElement('h2');
  header.innerHTML = `수행 내용 입력 <span class="status-chip ${sub.status}">${statusText(sub.status)}</span>`;
  wrap.appendChild(header);

  if (locked) {
    const lockBox = document.createElement('div');
    lockBox.className = 'banner';
    lockBox.innerHTML = '이미 최종 제출된 상태입니다. 추가 수정이 필요하면 <strong>잠금 해제</strong> 버튼으로 다시 편집 가능한 상태로 돌릴 수 있습니다. ';
    const unlockBtn = document.createElement('button');
    unlockBtn.className = 'btn small'; unlockBtn.textContent = '잠금 해제';
    unlockBtn.addEventListener('click', async () => {
      if (!confirm('최종 제출을 해제하고 다시 편집 가능한 상태로 되돌립니다. 계속할까요?')) return;
      try {
        await unlockSubmission(getState().current.roundId, sub._id);
        // 구독이 자동으로 상태를 draft 로 반영 — render() 는 구독 콜백에서 호출됨
      } catch (e) {
        alert('잠금 해제 실패: ' + e.message);
      }
    });
    lockBox.appendChild(unlockBtn);
    wrap.appendChild(lockBox);
  }

  // 단일 섹션 렌더 (과제별)
  wrap.appendChild(renderEntriesSection(s, sub, locked));

  // 액션 바
  const bar = document.createElement('div');
  bar.className = 'action-bar';
  bar.innerHTML = `
    <div class="save-status" id="save-status"></div>
    <div>
      <button class="btn" id="btn-save" ${locked ? 'disabled' : ''}>임시저장</button>
      <button class="btn primary" id="btn-submit" ${locked ? 'disabled' : ''}>최종 제출</button>
    </div>`;
  wrap.appendChild(bar);
  updateSaveStatus(sub);

  $('#btn-save', wrap).addEventListener('click', async () => {
    await doSave(sub, false);
  });
  $('#btn-submit', wrap).addEventListener('click', async () => {
    if (!confirm('최종 제출 후에도 본인 또는 관리자가 잠금 해제를 통해 다시 수정할 수 있습니다. 제출할까요?')) return;
    await doSave(sub, true);
  });

  return wrap;
}

function renderEntriesSection(s, sub, locked) {
  const box = document.createElement('div');
  box.className = 'author-block';
  box.innerHTML = `<h3>활동 항목 (과제별) <span class="muted tight">(${s.round.rangeStart} ~ ${s.round.rangeEnd})</span></h3>`;
  const entries = sub.entries ?? [];
  // 회차의 categoriesSnapshot 과 마스터 카테고리(s.categories) 합본 — id로 dedupe.
  // 회차 생성 시점 이후 추가/편집된 마스터 카테고리도 작성자에게 보이도록.
  const snap = Array.isArray(s.round.categoriesSnapshot) ? s.round.categoriesSnapshot : [];
  const master = Array.isArray(s.categories) ? s.categories : [];
  const merged = new Map();
  for (const c of snap) merged.set(c.id, c);
  for (const c of master) if (!merged.has(c.id)) merged.set(c.id, c);
  const catList = [...merged.values()];
  const usedCatIds = new Set(entries.map(e => e.categoryId));

  for (let eIdx = 0; eIdx < entries.length; eIdx++) {
    box.appendChild(renderCategoryBlock(s, sub, eIdx, locked));
  }

  if (!locked) {
    const addWrap = document.createElement('div');
    addWrap.className = 'row';
    const sel = document.createElement('select');
    // 관리자 카테고리 관리 탭과 동일한 순서:
    //   kind 순서(KIND_ORDER: basic → natl_rnd → consign → etc) + 각 kind 내부 order 오름차순
    const sortedCats = [];
    for (const k of KIND_ORDER) {
      const inKind = catList
        .filter(c => c.kind === k && !usedCatIds.has(c.id))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      sortedCats.push(...inKind);
    }
    const knownKinds = new Set(KIND_ORDER);
    const unknowns = catList
      .filter(c => !knownKinds.has(c.kind) && !usedCatIds.has(c.id))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    sortedCats.push(...unknowns);

    sel.innerHTML = '<option value="">+ 기존 과제 선택</option>'
      + sortedCats
        .map(c => `<option value="${c.id}">[${kindLabelKor(c.kind)}] ${escapeHtml(c.title)}${c.owner ? ' (' + escapeHtml(c.owner) + ')' : ''}</option>`)
        .join('');
    addWrap.appendChild(sel);
    sel.addEventListener('change', () => {
      const v = sel.value;
      if (!v) return;
      const myName = s.round.authorsSnapshot?.find(a => a.id === sub._id)?.name || '';
      if (!Array.isArray(sub.entries)) sub.entries = [];
      sub.entries.push(emptyEntry(v, myName));
      scheduleSave();
      render();
    });

    // 새 과제 만들기 버튼 (목록에 없는 과제를 직접 추가)
    const addNewBtn = document.createElement('button');
    addNewBtn.className = 'btn';
    addNewBtn.textContent = '🆕 새 과제 만들기';
    addNewBtn.addEventListener('click', () => openNewCategoryDialog(s, sub));
    addWrap.appendChild(addNewBtn);
    box.appendChild(addWrap);
  }
  return box;
}

function renderCategoryBlock(s, sub, eIdx, locked) {
  const entry = sub.entries[eIdx];
  // categoriesSnapshot 우선, 없으면 마스터(s.categories)에서 fallback
  const snapCats = Array.isArray(s.round.categoriesSnapshot) ? s.round.categoriesSnapshot : [];
  const masterCats = Array.isArray(s.categories) ? s.categories : [];
  const cat = snapCats.find(c => c.id === entry.categoryId)
    || masterCats.find(c => c.id === entry.categoryId);
  const box = document.createElement('div');
  box.className = 'cat-block';
  const title = cat
    ? `<span class="chip kind-${cat.kind}">${kindLabelKor(cat.kind)}</span> ${escapeHtml(cat.title)}${cat.owner ? ' <span class="muted">(' + escapeHtml(cat.owner) + ')</span>' : ''}`
    : `<span class="muted">(알 수 없는 카테고리: ${escapeHtml(entry.categoryId)})</span>`;
  const head = document.createElement('header');
  head.innerHTML = `<div>${title}</div>`;
  if (!locked) {
    const rm = document.createElement('button');
    rm.className = 'btn ghost small'; rm.textContent = '카테고리 삭제';
    rm.addEventListener('click', () => {
      if (!confirm('이 카테고리와 입력한 수행내용들을 삭제합니다.')) return;
      sub.entries.splice(eIdx, 1);
      scheduleSave(); render();
    });
    head.appendChild(rm);
  }
  box.appendChild(head);

  // 안전: past/next 배열 보장
  if (!Array.isArray(entry.past)) entry.past = [];
  if (!Array.isArray(entry.next)) entry.next = [];

  const periodWord = s.round.form === 'monthly' ? '달' : '주';

  // 두 sub-section: 지난 X 실적 / 이번 X 계획
  const sections = [
    { side: 'past', label: `지난 ${periodWord} 실적`, items: entry.past },
    { side: 'next', label: `이번 ${periodWord} 계획`, items: entry.next },
  ];

  for (const sec of sections) {
    const subBox = document.createElement('div');
    subBox.className = 'period-block';
    subBox.style.marginTop = '8px';
    const subHead = document.createElement('div');
    subHead.className = 'muted tight';
    subHead.style.fontWeight = '600';
    subHead.style.margin = '4px 0';
    subHead.textContent = `[${sec.label}]`;
    subBox.appendChild(subHead);

    const itemsBox = document.createElement('div');
    itemsBox.className = 'items';
    for (let i = 0; i < sec.items.length; i++) {
      itemsBox.appendChild(renderItemRow(s, sub, eIdx, sec.side, i, locked));
    }
    subBox.appendChild(itemsBox);

    if (!locked) {
      const add = document.createElement('button');
      add.className = 'btn small';
      add.textContent = `+ ${sec.label} 항목 추가`;
      add.addEventListener('click', () => {
        const myName = s.round.authorsSnapshot?.find(a => a.id === sub._id)?.name || '';
        entry[sec.side].push(emptyItem(myName));
        scheduleSave(); render();
      });
      subBox.appendChild(add);
    }
    box.appendChild(subBox);
  }
  return box;
}

function renderItemRow(s, sub, eIdx, side, itemIdx, locked) {
  const entry = sub.entries[eIdx];
  const arr = entry[side];
  const it = arr[itemIdx];
  const row = document.createElement('div');
  row.className = 'item-row';

  const taText = document.createElement('textarea');
  taText.placeholder = '수행내용 (필수)';
  taText.value = it.text || '';
  taText.disabled = locked;
  taText.addEventListener('input', () => { it.text = taText.value; scheduleSave(); updatePreviewOnly(); });

  const iDate = document.createElement('input');
  iDate.type = 'text'; iDate.placeholder = '예: 4/13 (선택)';
  iDate.value = it.date || '';
  iDate.disabled = locked;
  iDate.addEventListener('input', () => { it.date = iDate.value; scheduleSave(); updatePreviewOnly(); });

  const iOrg = document.createElement('input');
  iOrg.type = 'text'; iOrg.placeholder = '협업 기업/기관 (선택)';
  iOrg.value = it.org || '';
  iOrg.disabled = locked;
  iOrg.addEventListener('input', () => { it.org = iOrg.value; scheduleSave(); updatePreviewOnly(); });

  const iPerson = document.createElement('input');
  iPerson.type = 'text'; iPerson.placeholder = '수행자명 (필수)';
  iPerson.value = it.person || '';
  iPerson.disabled = locked;
  iPerson.addEventListener('input', () => { it.person = iPerson.value; scheduleSave(); updatePreviewOnly(); });

  const impLabel = document.createElement('label');
  impLabel.className = 'imp-toggle';
  impLabel.title = '중요 — 체크 시 출력 HWPX와 미리보기에서 강조 표시';
  const impBox = document.createElement('input');
  impBox.type = 'checkbox';
  impBox.checked = !!it.important;
  impBox.disabled = locked;
  impBox.addEventListener('change', () => { it.important = impBox.checked; scheduleSave(); updatePreviewOnly(); });
  const impText = document.createElement('span');
  impText.textContent = '중요';
  impLabel.append(impBox, impText);

  const up = document.createElement('button');
  up.className = 'btn ghost small'; up.textContent = '↑'; up.disabled = locked || itemIdx === 0;
  up.addEventListener('click', () => {
    [arr[itemIdx - 1], arr[itemIdx]] = [arr[itemIdx], arr[itemIdx - 1]];
    scheduleSave(); render();
  });

  const down = document.createElement('button');
  down.className = 'btn ghost small'; down.textContent = '↓';
  down.disabled = locked || itemIdx === arr.length - 1;
  down.addEventListener('click', () => {
    [arr[itemIdx + 1], arr[itemIdx]] = [arr[itemIdx], arr[itemIdx + 1]];
    scheduleSave(); render();
  });

  const del = document.createElement('button');
  del.className = 'btn ghost small'; del.textContent = '✕'; del.title = '삭제'; del.disabled = locked;
  del.addEventListener('click', () => {
    arr.splice(itemIdx, 1);
    // past/next 둘 다 비었으면 카테고리 자체 삭제
    if (entry.past.length === 0 && entry.next.length === 0) sub.entries.splice(eIdx, 1);
    scheduleSave(); render();
  });

  row.append(taText, iDate, iOrg, iPerson, impLabel, up, down, del);
  return row;
}

function updatePreviewOnly() {
  const s = getState();
  if (!s.round) return;
  const merged = s.submissions.map(x => x._id === s.activeAuthorId ? mySubmission : x);
  if (!merged.some(x => x._id === s.activeAuthorId)) merged.push(mySubmission);
  const previewEl = $('#preview-area');
  previewEl.innerHTML = '';
  previewEl.appendChild(renderPreview(s.round, merged, s.categories));
}

// 새 과제 만들기 모달.
// 작성자가 즉석에서 새 과제(카테고리)를 추가할 때 사용.
// 작성된 과제는 마스터 카테고리 목록 + 활성 회차 categoriesSnapshot 양쪽에 동시 반영.
function openNewCategoryDialog(s, sub) {
  // 이미 열린 다이얼로그 있으면 제거
  const old = document.getElementById('new-category-dialog');
  if (old) old.remove();

  const dlg = document.createElement('dialog');
  dlg.id = 'new-category-dialog';
  dlg.innerHTML = `
    <div class="dlg-header">새 과제 만들기</div>
    <div class="dlg-body">
      <div class="field">
        <label>사업 종류</label>
        <select id="nc-kind">
          <option value="basic">기본사업</option>
          <option value="natl_rnd">국가R&D</option>
          <option value="consign">수탁사업</option>
          <option value="etc">기타</option>
        </select>
      </div>
      <div class="field">
        <label>과제명</label>
        <input id="nc-title" type="text" placeholder="예: 새 연구 과제명" />
      </div>
      <div class="field">
        <label>책임자 (선택)</label>
        <input id="nc-owner" type="text" placeholder="예: 홍길동 책임" />
      </div>
      <div class="muted tight">
        ※ 추가하면 모든 작성자에게 즉시 보입니다. 수정·삭제는 관리자만 가능합니다.
      </div>
    </div>
    <div class="dlg-actions">
      <button class="btn" id="nc-cancel">취소</button>
      <button class="btn primary" id="nc-confirm">추가</button>
    </div>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();

  const titleInput = dlg.querySelector('#nc-title');
  titleInput.focus();

  const close = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector('#nc-cancel').addEventListener('click', close);

  dlg.querySelector('#nc-confirm').addEventListener('click', async () => {
    const kind = dlg.querySelector('#nc-kind').value;
    const title = dlg.querySelector('#nc-title').value.trim();
    const owner = dlg.querySelector('#nc-owner').value.trim();
    if (!title) {
      alert('과제명을 입력해주세요.');
      return;
    }
    const btn = dlg.querySelector('#nc-confirm');
    btn.disabled = true;
    btn.textContent = '추가 중…';
    try {
      const newCat = await addCategoryToActiveRound({ kind, title, owner });
      // 새로 만든 과제로 곧바로 항목 입력 시작
      const myName = s.round.authorsSnapshot?.find(a => a.id === sub._id)?.name || '';
      if (!Array.isArray(sub.entries)) sub.entries = [];
      sub.entries.push(emptyEntry(newCat.id, myName));
      scheduleSave();
      close();
      render();
    } catch (e) {
      console.error('과제 추가 실패', e);
      alert('과제 추가 실패: ' + (e.message || e));
      btn.disabled = false;
      btn.textContent = '추가';
    }
  });

  // ESC로도 닫기
  dlg.addEventListener('cancel', close);
}

function updateSaveStatus(sub) {
  const el = $('#save-status');
  if (!el) return;
  if (sub.status === 'submitted') {
    el.textContent = `최종 제출 완료 · ${relativeTimeLabel(sub.submittedAt?.toMillis?.() ?? sub.lastSavedAt) }`;
  } else if (sub.status === 'draft') {
    el.textContent = `임시저장 · ${relativeTimeLabel(sub.lastSavedAt?.toMillis?.() ?? null)}`;
  } else {
    el.textContent = '아직 저장 안됨';
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { doSave(mySubmission, false).catch(e => console.error(e)); }, 800);
}

async function doSave(sub, finalize) {
  const s = getState();
  if (!s.current.roundId) return;
  try {
    skipNextLocal = true;
    if (finalize) {
      // 최소 요구: 수행내용 + 수행자명이 채워진 항목이 1개 이상
      const hasAny = (sub.entries ?? []).some(e =>
        ((e.past ?? []).concat(e.next ?? []))
          .some(i => (i.text || '').trim() && (i.person || '').trim())
      );
      if (!hasAny) {
        alert('수행내용과 수행자명을 최소 1개 입력해야 제출할 수 있습니다.');
        return;
      }
      await finalSubmit(s.current.roundId, s.activeAuthorId, {
        authorName: sub.authorName,
        entries: sub.entries,
      });
      sub.status = 'submitted';
    } else {
      await saveDraft(s.current.roundId, s.activeAuthorId, {
        authorName: sub.authorName,
        entries: sub.entries,
      });
      sub.status = 'draft';
    }
    updateSaveStatus(sub);
    // 저장 성공 후 상태 반영
    render();
  } catch (e) {
    console.error(e);
    alert('저장 실패: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// 아카이브 탭 (작성자용 — 조회 + HWPX 출력만)
// ─────────────────────────────────────────────
function renderArchiveTab(s) {
  const root = $('#archive-area');
  if (!root) return;
  root.innerHTML = '';

  const box = document.createElement('div');
  box.className = 'panel';
  box.innerHTML = '<h2>아카이브된 회차</h2>';
  root.appendChild(box);

  const rounds = (s.roundList || []).filter(r => r.status === 'archived');
  if (!rounds.length) {
    const d = document.createElement('div');
    d.className = 'muted';
    d.textContent = '아직 아카이브된 회차가 없습니다.';
    box.appendChild(d);
    return;
  }

  const tbl = document.createElement('table');
  tbl.className = 'data';
  tbl.innerHTML = `<thead><tr>
    <th>양식</th><th>기준일</th><th>기간</th><th>아카이브 시각</th><th style="width:220px">동작</th>
  </tr></thead><tbody></tbody>`;
  const tb = tbl.querySelector('tbody');
  for (const r of rounds) {
    const form = r.form === 'monthly' ? '월례' : '주례';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${form}</td>
      <td>${escapeHtml(r.baseDate || '')}</td>
      <td>${escapeHtml(r.rangeStart)} ~ ${escapeHtml(r.rangeEnd)}</td>
      <td>${r.archivedAt ? relativeTimeLabel(r.archivedAt.toMillis?.() ?? r.archivedAt) : '-'}</td>
      <td></td>`;
    const act = tr.querySelector('td:last-child');

    const view = document.createElement('button');
    view.className = 'btn small';
    view.textContent = '내용 보기';
    view.style.marginRight = '4px';
    view.addEventListener('click', async () => {
      await showArchiveViewer(r);
    });
    act.appendChild(view);

    const dl = document.createElement('button');
    dl.className = 'btn small primary';
    dl.textContent = 'HWPX 출력';
    dl.addEventListener('click', async () => {
      try {
        const subs = await getAllSubmissions(r.id);
        const blob = await buildHwpxBlob(r, subs);
        downloadBlob(blob, suggestFileName(r));
      } catch (e) {
        alert('출력 실패: ' + e.message);
      }
    });
    act.appendChild(dl);

    tb.appendChild(tr);
  }
  box.appendChild(tbl);

  // 미리보기 컨테이너 (내용 보기 클릭 시 채워짐)
  const viewer = document.createElement('div');
  viewer.className = 'panel';
  viewer.id = 'archive-viewer';
  viewer.style.display = 'none';
  root.appendChild(viewer);
}

async function showArchiveViewer(round) {
  const viewer = document.getElementById('archive-viewer');
  if (!viewer) return;
  viewer.style.display = '';
  viewer.innerHTML = `<h2>회차 내용 미리보기</h2><div class="muted">로딩 중…</div>`;
  try {
    const subs = await getAllSubmissions(round.id);
    viewer.innerHTML = '';
    const head = document.createElement('div');
    const form = round.form === 'monthly' ? '월례' : '주례';
    head.innerHTML = `<h2>회차 내용 미리보기 — ${form} ${escapeHtml(round.baseDate || '')}
      <button class="btn ghost small" id="archive-viewer-close" style="float:right">닫기</button></h2>
      <div class="muted tight">지난 ${form === '월례' ? '달' : '주'} ${escapeHtml(round.rangeStart)} ~ ${escapeHtml(round.rangeEnd)}</div>`;
    viewer.appendChild(head);
    viewer.appendChild(renderPreview(round, subs));
    document.getElementById('archive-viewer-close').addEventListener('click', () => {
      viewer.style.display = 'none';
      viewer.innerHTML = '';
    });
    viewer.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    viewer.innerHTML = `<div class="banner danger">불러오기 실패: ${escapeHtml(e.message)}</div>`;
  }
}

mountApp();
