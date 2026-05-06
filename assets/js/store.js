// store.js — 월간 원장보고 시스템 데이터 레이어 (per-project schema)
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, runTransaction, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { db, serverTimestamp } from './firebase-init.js';
import { uuid } from './util/download.js';
import { DEFAULT_ORG_NAME } from './firebase-config.js';

// ───── 기본 시드 데이터 ─────

export const DEFAULT_AUTHORS = [
  { name: '김은 책임' },
  { name: '신정열 책임' },
  { name: '고태훈 수석' },
  { name: '정호연 선임' },
];

export const DEFAULT_PROJECTS = [
  {
    kind: 'basic',
    title: '자갈궤도기반 고속철도 운행속도 향상을 위한 궤도인프라 기술연구',
    owner: '김은 책임',
    org: '궤도노반연구실',
    rangeStart: '2026-01-01',
    rangeEnd: '2028-12-31',
    budget: { yearAmount: '', totalAmount: '' },
    goal: '400km/h급 고속철도의 합리적·단계적 구축을 위한 자갈궤도 고속화 핵심기술 확보 및 운영 기준 정립',
    techDefinition: '',
    techFeatures: [],
    activities: [
      { name: '기존 열화모델 분석 및 열화인자 도출을 위한 DATA 수집' },
      { name: '철도운행 조건에 따른 열차주행성능 시뮬레이션 결과검토' },
      { name: '경부고속철도 1단계구간 개량에 따른 경제성 분석 용역 협의' },
    ],
  },
  {
    kind: 'basic',
    title: 'AI-디지털 기반 철도인프라 안전향상 및 건설관리 효율화 기술개발',
    owner: '신정열 책임',
    org: '철도구조연구실',
    rangeStart: '2026-01-01',
    rangeEnd: '2028-12-31',
    budget: { yearAmount: '', totalAmount: '' },
    goal: '철도인프라 경제성·안전성 향상 위한 AI-디지털 기반 철도인프라 핵심기술 개발',
    techDefinition: '',
    techFeatures: [],
    activities: [],
  },
  {
    kind: 'basic',
    title: '철도 폐목침목 재활용 소재 제조 및 자원순환 기술 고도화',
    owner: '고태훈 수석',
    org: '궤도노반연구실',
    rangeStart: '2026-01-01',
    rangeEnd: '2028-12-31',
    budget: { yearAmount: '', totalAmount: '' },
    goal: '',
    techDefinition: '',
    techFeatures: [],
    activities: [],
  },
  {
    kind: 'basic',
    title: '최적 설계기법을 활용한 궤도구성품(레일 체결장치, 침목) 설계 기술 고도화 연구',
    owner: '정호연 선임',
    org: '궤도노반연구실',
    rangeStart: '2026-01-01',
    rangeEnd: '2028-12-31',
    budget: { yearAmount: '', totalAmount: '' },
    goal: '',
    techDefinition: '',
    techFeatures: [],
    activities: [],
  },
];

export const KIND_NAMES = {
  basic: '기본사업',
  natl_rnd: '국가R&D',
  consign: '수탁사업',
  etc: '기타',
};
export const KIND_ORDER = ['basic', 'natl_rnd', 'consign', 'etc'];

// ───── config/authors ─────
const authorsRef = doc(db, 'config', 'authors');
export function subscribeAuthors(cb) {
  return onSnapshot(authorsRef, snap => cb(snap.exists() ? (snap.data().members ?? []) : []));
}
export async function setAuthors(members) {
  await setDoc(authorsRef, { members, updatedAt: serverTimestamp() }, { merge: true });
}
export async function addAuthor(name) {
  const snap = await getDoc(authorsRef);
  const members = snap.exists() ? [...(snap.data().members ?? [])] : [];
  if (members.some(m => m.name === name)) return;
  members.push({ id: uuid(), name, createdAt: new Date().toISOString() });
  await setAuthors(members);
}
export async function removeAuthor(id) {
  const snap = await getDoc(authorsRef);
  const members = snap.exists() ? (snap.data().members ?? []) : [];
  await setAuthors(members.filter(m => m.id !== id));
}
export async function seedDefaultAuthors() {
  const members = DEFAULT_AUTHORS.map(a => ({
    id: uuid(), name: a.name, createdAt: new Date().toISOString(),
  }));
  await setAuthors(members);
}

// ───── config/projects ─────
const projectsRef = doc(db, 'config', 'projects');
export function subscribeProjects(cb) {
  return onSnapshot(projectsRef, snap => cb(snap.exists() ? (snap.data().items ?? []) : []));
}
export async function setProjects(items) {
  await setDoc(projectsRef, { items, updatedAt: serverTimestamp() }, { merge: true });
}
export async function seedDefaultProjects() {
  const items = DEFAULT_PROJECTS.map((p, i) => ({
    id: uuid(),
    ...p,
    isDefault: true,
    order: i,
    activities: (p.activities ?? []).map(a => ({ ...a, id: uuid() })),
  }));
  await setProjects(items);
}
export async function addProject(data) {
  const snap = await getDoc(projectsRef);
  const items = snap.exists() ? [...(snap.data().items ?? [])] : [];
  items.push({ id: uuid(), order: items.length, isDefault: false, activities: [], ...data });
  await setProjects(items);
}
export async function updateProject(id, patch) {
  const snap = await getDoc(projectsRef);
  const items = snap.exists() ? (snap.data().items ?? []) : [];
  await setProjects(items.map(p => p.id === id ? { ...p, ...patch } : p));
}
export async function removeProject(id) {
  const snap = await getDoc(projectsRef);
  const items = snap.exists() ? (snap.data().items ?? []) : [];
  await setProjects(items.filter(p => p.id !== id));
}

// ───── config/current ─────
const currentRef = doc(db, 'config', 'current');
export function subscribeCurrent(cb) {
  return onSnapshot(currentRef, snap => cb(snap.exists() ? snap.data() : { roundId: null }));
}

// ───── rounds ─────
const roundsCol = collection(db, 'rounds');
export function roundRef(roundId) { return doc(db, 'rounds', roundId); }
export function subscribeRound(roundId, cb) {
  return onSnapshot(roundRef(roundId), snap => cb(snap.exists() ? snap.data() : null));
}
export function subscribeRoundList(cb) {
  return onSnapshot(query(roundsCol, orderBy('confirmedAt', 'desc')), qs => {
    cb(qs.docs.map(d => ({ ...d.data(), id: d.id })));
  });
}

// 매월 회차 생성. 전월 데이터 (있으면) progressTable 자동 복사.
export async function createAndConfirmMonthlyRound(params) {
  // params: { year, month, baseDate, orgName, projects, authors, prevRoundId? }
  const roundId = `${params.year}${String(params.month).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6)}`;

  // 전월 submissions 가져오기 (progressTable 누적용)
  const prevSubmissions = {};
  if (params.prevRoundId) {
    try {
      const col = collection(db, 'rounds', params.prevRoundId, 'submissions');
      const qs = await getDocs(col);
      qs.docs.forEach(d => { prevSubmissions[d.id] = d.data(); });
    } catch (e) {
      console.warn('전월 submissions 로드 실패:', e);
    }
  }

  await runTransaction(db, async (tx) => {
    const currentSnap = await tx.get(currentRef);
    const prevRoundId = currentSnap.exists() ? currentSnap.data().roundId : null;
    if (prevRoundId) {
      tx.update(roundRef(prevRoundId), {
        status: 'archived', archivedAt: serverTimestamp(),
      });
    }

    tx.set(roundRef(roundId), {
      year: params.year,
      month: params.month,
      baseDate: params.baseDate,
      orgName: params.orgName || DEFAULT_ORG_NAME,
      projectsSnapshot: params.projects,
      authorsSnapshot: params.authors,
      status: 'active',
      confirmedAt: serverTimestamp(),
    });

    // 각 과제별 submission 생성 — 동적 필드는 빈 값, progressTable 은 전월 누적
    for (const proj of params.projects) {
      const subRef = doc(db, 'rounds', roundId, 'submissions', proj.id);
      const prev = prevSubmissions[proj.id] || {};
      tx.set(subRef, {
        projectId: proj.id,
        ownerName: proj.owner,
        thisMonth: [],
        nextMonth: [],
        progressTable: prev.progressTable ?? {},
        images: [],
        issues: [],
        achievements: [],
        status: 'idle',
        lastSavedAt: serverTimestamp(),
      });
    }

    tx.set(currentRef, { roundId, updatedAt: serverTimestamp() });
  });

  return roundId;
}

export async function archiveCurrentRound() {
  await runTransaction(db, async (tx) => {
    const cs = await tx.get(currentRef);
    if (!cs.exists()) return;
    const rid = cs.data().roundId;
    if (!rid) return;
    tx.update(roundRef(rid), { status: 'archived', archivedAt: serverTimestamp() });
    tx.set(currentRef, { roundId: null, updatedAt: serverTimestamp() });
  });
}

export async function restoreArchivedRound(roundId) {
  await runTransaction(db, async (tx) => {
    const cs = await tx.get(currentRef);
    const curRid = cs.exists() ? cs.data().roundId : null;
    if (curRid && curRid !== roundId) {
      tx.update(roundRef(curRid), { status: 'archived', archivedAt: serverTimestamp() });
    }
    tx.update(roundRef(roundId), { status: 'active', archivedAt: null });
    tx.set(currentRef, { roundId, updatedAt: serverTimestamp() });
  });
}

export async function deleteRoundPermanently(roundId) {
  const col = collection(db, 'rounds', roundId, 'submissions');
  const qs = await getDocs(col);
  const commits = [];
  let batch = writeBatch(db);
  let cnt = 0;
  for (const d of qs.docs) {
    batch.delete(d.ref);
    cnt++;
    if (cnt >= 400) {
      commits.push(batch.commit());
      batch = writeBatch(db);
      cnt = 0;
    }
  }
  if (cnt > 0) commits.push(batch.commit());
  await Promise.all(commits);
  await deleteDoc(roundRef(roundId));
  const cs = await getDoc(currentRef);
  if (cs.exists() && cs.data().roundId === roundId) {
    await setDoc(currentRef, { roundId: null, updatedAt: serverTimestamp() });
  }
}

// ───── submissions ─────
export function submissionRef(roundId, projectId) {
  return doc(db, 'rounds', roundId, 'submissions', projectId);
}
export function subscribeSubmissions(roundId, cb) {
  const col = collection(db, 'rounds', roundId, 'submissions');
  return onSnapshot(col, qs => cb(qs.docs.map(d => ({ ...d.data(), _id: d.id }))));
}
export async function getAllSubmissions(roundId) {
  const col = collection(db, 'rounds', roundId, 'submissions');
  const qs = await getDocs(col);
  return qs.docs.map(d => ({ ...d.data(), _id: d.id }));
}

export async function saveSubmissionDraft(roundId, projectId, payload) {
  const ref = submissionRef(roundId, projectId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists() ? snap.data() : {};
    if (cur.status === 'submitted' || cur.status === 'approved') {
      throw new Error('이미 제출/승인된 상태입니다. 잠금 해제 후 저장하세요.');
    }
    tx.set(ref, { ...cur, ...payload, status: 'draft', lastSavedAt: serverTimestamp() });
  });
}

export async function finalSubmitSubmission(roundId, projectId, payload) {
  const ref = submissionRef(roundId, projectId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists() ? snap.data() : {};
    if (cur.status === 'submitted' || cur.status === 'approved') return;
    tx.set(ref, {
      ...cur, ...payload,
      status: 'submitted',
      submittedAt: serverTimestamp(),
      lastSavedAt: serverTimestamp(),
    });
  });
}

export async function unlockSubmission(roundId, projectId) {
  await updateDoc(submissionRef(roundId, projectId), {
    status: 'draft', submittedAt: null,
  });
}

export async function approveSubmission(roundId, projectId) {
  await updateDoc(submissionRef(roundId, projectId), {
    status: 'approved', approvedAt: serverTimestamp(),
  });
}
