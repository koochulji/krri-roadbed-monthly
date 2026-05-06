// Firestore repository. onSnapshot 구독 + 간단 CRUD.
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, writeBatch, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { db, serverTimestamp } from './firebase-init.js';
import { uuid } from './util/download.js';
import { DEFAULT_ORG_NAME } from './firebase-config.js';

export const DEFAULT_CATEGORIES = [
  // 기본사업
  { kind: 'basic',    title: '철도 폐목침목 재활용 소재 제조 및 자원순환 기술 고도화', owner: '고태훈 수석, 이성혁 수석' },
  { kind: 'basic',    title: '장대레일 성능기반 유지관리 체계 구축', owner: '배영훈 책임, 지구철 선임' },
  { kind: 'basic',    title: '도시철도 콘크리트 궤도의 지속 가능한 유지보수를 위한 고내구성 방진체결장치 개발', owner: '배영훈 책임' },
  { kind: 'basic',    title: '철도 화물역의 지역물류 거점화를 위한 인터모달 스마트 철도물류 터미널 모델 개발', owner: '최찬용 책임' },
  { kind: 'basic',    title: '매니플레이터를 이용한 친환경 터널굴착 기술 개발', owner: '고태훈 수석' },
  { kind: 'basic',    title: '철도건널목용 사전제작형 아스팔트콘크리트 궤도구조 개발', owner: '이성혁 수석' },
  { kind: 'basic',    title: '최적 설계기법을 활용한 궤도구성품(레일 체결장치, 침목) 설계 기술 고도화 연구', owner: '정호연 선임, 지구철 선임' },
  { kind: 'basic',    title: '자갈궤도기반 고속철도 운행속도 향상을 위한 궤도인프라 기술연구', owner: '김은 책임' },

  // 국가R&D
  { kind: 'natl_rnd', title: '차세대 철도시스템 하이퍼튜브 구현을 위한 핵심기술개발', owner: '김만철 수석, 김대상 수석' },
  { kind: 'natl_rnd', title: '초고속 하이퍼튜브 아진공 핵심기술 개발', owner: '배영훈 책임' },

  // 수탁사업
  { kind: 'consign',  title: '미래 기후변화를 고려한 장대레일 안전성 강화 방안 연구용역', owner: '김만철 수석' },
  { kind: 'consign',  title: '철도교 캠버량을 고려한 교량 및 궤도분야 관련 설계기준 정립 연구', owner: '황성호 책임' },
  { kind: 'consign',  title: '철도구조물 유리섬유보강근(GFRP) 적용 확대방안 연구 용역', owner: '배영훈 책임' },
  { kind: 'consign',  title: '운행선 인접 지하구간 철도건설사업을 위한 자갈궤도 진동허용기준 수립용역', owner: '최찬용 책임, 정호연 선임' },
  { kind: 'consign',  title: '철도 시설분야 유지관리 기준 합리화 용역', owner: '김만철 수석, 정호연 선임' },
  { kind: 'consign',  title: '수서고속철도 에폭시 직결궤도 안전성 검토 설계', owner: '배영훈 책임' },

  // 기타
  { kind: 'etc',      title: '전략연구사업 (400kph 인프라 ~)', owner: '김은 책임' },
];

export const DEFAULT_AUTHORS = [
  { name: '지구철 선임' },
  { name: '배영훈 책임' },
  { name: '고태훈 수석' },
  { name: '이성혁 수석' },
  { name: '정호연 선임' },
  { name: '김은 책임' },
  { name: '김만철 수석' },
  { name: '김대상 수석' },
  { name: '황성호 책임' },
  { name: '최찬용 책임' },
];

// kind 표시명. 보고서의 대분류 표기 순서도 이 객체의 key 순서를 따른다.
export const KIND_ORDER = ['basic', 'natl_rnd', 'consign', 'etc'];
export const KIND_NAMES = {
  basic: '기본사업',
  natl_rnd: '국가R&D',
  consign: '수탁사업',
  etc: '기타',
};
export function kindLabelKor(kind) {
  return KIND_NAMES[kind] ?? kind;
}

// ───── config/authors ─────
const authorsRef = doc(db, 'config', 'authors');
export function subscribeAuthors(cb) {
  return onSnapshot(authorsRef, (snap) => {
    cb(snap.exists() ? (snap.data().members ?? []) : []);
  });
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
    id: uuid(),
    name: a.name,
    createdAt: new Date().toISOString(),
  }));
  await setAuthors(members);
}

// ───── config/categories ─────
const categoriesRef = doc(db, 'config', 'categories');
export function subscribeCategories(cb) {
  return onSnapshot(categoriesRef, (snap) => {
    cb(snap.exists() ? (snap.data().items ?? []) : []);
  });
}
export async function setCategories(items) {
  await setDoc(categoriesRef, { items, updatedAt: serverTimestamp() }, { merge: true });
}
export async function seedDefaultCategories() {
  const items = DEFAULT_CATEGORIES.map((c, i) => ({
    id: uuid(), kind: c.kind, title: c.title, owner: c.owner,
    isDefault: true, order: i,
  }));
  await setCategories(items);
}
export async function addCategory(data) {
  const snap = await getDoc(categoriesRef);
  const items = snap.exists() ? [...(snap.data().items ?? [])] : [];
  items.push({ id: uuid(), isDefault: false, order: items.length, ...data });
  await setCategories(items);
}

// 작성자가 활성 회차에서 새 과제를 추가할 때 호출.
// 마스터 카테고리(/config/categories)와 활성 회차의 categoriesSnapshot 양쪽에 동일 ID로 추가.
// 회차 진행 중에도 작성자가 실시간으로 새 과제를 잡을 수 있게 한다.
export async function addCategoryToActiveRound(data) {
  const newCat = {
    id: uuid(),
    kind: data.kind,
    title: data.title,
    owner: data.owner ?? '',
    isDefault: false,
  };

  // 1) 마스터 카테고리에 append
  const cSnap = await getDoc(categoriesRef);
  const masterItems = cSnap.exists() ? [...(cSnap.data().items ?? [])] : [];
  await setCategories([...masterItems, { ...newCat, order: masterItems.length }]);

  // 2) 현재 활성 회차의 categoriesSnapshot 에도 append (회차 즉시 반영)
  const curSnap = await getDoc(currentRef);
  const roundId = curSnap.exists() ? curSnap.data().roundId : null;
  if (roundId) {
    await runTransaction(db, async (tx) => {
      const rs = await tx.get(roundRef(roundId));
      if (!rs.exists()) return;
      const snap = rs.data().categoriesSnapshot ?? [];
      tx.update(roundRef(roundId), {
        categoriesSnapshot: [...snap, { ...newCat, order: snap.length }],
      });
    });
  }
  return newCat;
}
export async function updateCategory(id, patch) {
  const snap = await getDoc(categoriesRef);
  const items = snap.exists() ? (snap.data().items ?? []) : [];
  await setCategories(items.map(i => i.id === id ? { ...i, ...patch } : i));
}

// 두 카테고리의 order 를 한 번의 쓰기로 교환.
// updateCategory 를 두 번 호출하면 onSnapshot 사이에 일관성이 깨질 수 있어 atomic swap 사용.
export async function swapCategoryOrder(idA, idB) {
  const snap = await getDoc(categoriesRef);
  if (!snap.exists()) return;
  const items = [...(snap.data().items ?? [])];
  const a = items.find(i => i.id === idA);
  const b = items.find(i => i.id === idB);
  if (!a || !b) return;
  const tmp = a.order ?? 0;
  a.order = b.order ?? 0;
  b.order = tmp;
  await setCategories(items);
}
export async function removeCategory(id) {
  const snap = await getDoc(categoriesRef);
  const items = snap.exists() ? (snap.data().items ?? []) : [];
  await setCategories(items.filter(i => i.id !== id));
}

// ───── config/current ─────
const currentRef = doc(db, 'config', 'current');
export function subscribeCurrent(cb) {
  return onSnapshot(currentRef, (snap) => cb(snap.exists() ? snap.data() : { roundId: null }));
}

// ───── rounds ─────
const roundsCol = collection(db, 'rounds');
export function roundRef(roundId) { return doc(db, 'rounds', roundId); }
export function subscribeRound(roundId, cb) {
  return onSnapshot(roundRef(roundId), (snap) => cb(snap.exists() ? snap.data() : null));
}
export function subscribeRoundList(cb) {
  return onSnapshot(query(roundsCol, orderBy('confirmedAt', 'desc')), (qs) => {
    cb(qs.docs.map(d => ({ ...d.data(), id: d.id })));
  });
}

export async function createAndConfirmRound(params) {
  // params: { form, baseDate, rangeStart, rangeEnd, nextRangeStart, nextRangeEnd,
  //           orgName, authors, categories }
  // 두 관리자가 거의 동시에 확정해도 current 포인터가 한쪽으로만 정착되도록 transaction 사용.
  const roundId = `${(params.baseDate || '').replace(/-/g, '')}-${params.form}-${Math.random().toString(36).slice(2, 6)}`;

  await runTransaction(db, async (tx) => {
    // 트랜잭션 안에서 current 읽기 (다른 세션의 확정 시도 감지)
    const currentSnap = await tx.get(currentRef);
    const prevRoundId = currentSnap.exists() ? currentSnap.data().roundId : null;

    if (prevRoundId) {
      tx.update(roundRef(prevRoundId), {
        status: 'archived',
        archivedAt: serverTimestamp(),
      });
    }

    tx.set(roundRef(roundId), {
      form: params.form,
      baseDate: params.baseDate,
      rangeStart: params.rangeStart,
      rangeEnd: params.rangeEnd,
      nextRangeStart: params.nextRangeStart ?? null,
      nextRangeEnd: params.nextRangeEnd ?? null,
      orgName: params.orgName || DEFAULT_ORG_NAME,
      authorsSnapshot: params.authors,
      categoriesSnapshot: params.categories,
      status: 'active',
      confirmedAt: serverTimestamp(),
    });

    // 각 작성자 submission 초기화 — 트랜잭션은 최대 500 operations 까지
    // 회차 + 아카이브 처리 + current 업데이트 3건 제외하면 작성자 497명까지 수용.
    for (const a of params.authors) {
      const subRef = doc(db, 'rounds', roundId, 'submissions', a.id);
      tx.set(subRef, {
        authorId: a.id,
        authorName: a.name,
        entries: [],   // [{ categoryId, items: [{ id, content, important }] }]
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
    const currentSnap = await tx.get(currentRef);
    if (!currentSnap.exists()) return;
    const rid = currentSnap.data().roundId;
    if (!rid) return;
    tx.update(roundRef(rid), { status: 'archived', archivedAt: serverTimestamp() });
    tx.set(currentRef, { roundId: null, updatedAt: serverTimestamp() });
  });
}

// 아카이브된 회차를 다시 활성 회차로 복원.
// 기존 활성 회차가 있으면 아카이브 처리 후, 대상 회차를 active 로 전환.
export async function restoreArchivedRound(roundId) {
  await runTransaction(db, async (tx) => {
    const cs = await tx.get(currentRef);
    const curRid = cs.exists() ? cs.data().roundId : null;
    if (curRid && curRid !== roundId) {
      tx.update(roundRef(curRid), {
        status: 'archived',
        archivedAt: serverTimestamp(),
      });
    }
    tx.update(roundRef(roundId), {
      status: 'active',
      archivedAt: null,
    });
    tx.set(currentRef, { roundId, updatedAt: serverTimestamp() });
  });
}

// 회차를 영구 삭제. 하위 submissions 컬렉션까지 모두 삭제한다.
// ⚠ Firestore 보안 규칙이 rounds/** 에 대해 delete 를 허용해야 동작한다.
export async function deleteRoundPermanently(roundId) {
  // 1) 하위 submissions 배치 삭제
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

  // 2) round 문서 삭제
  await deleteDoc(roundRef(roundId));

  // 3) 혹시 current 포인터가 이 회차를 가리키고 있으면 null 로
  const cs = await getDoc(currentRef);
  if (cs.exists() && cs.data().roundId === roundId) {
    await setDoc(currentRef, { roundId: null, updatedAt: serverTimestamp() });
  }
}

// ───── submissions ─────
export function submissionRef(roundId, authorId) {
  return doc(db, 'rounds', roundId, 'submissions', authorId);
}
export function subscribeSubmissions(roundId, cb) {
  const col = collection(db, 'rounds', roundId, 'submissions');
  return onSnapshot(col, (qs) => cb(qs.docs.map(d => ({ ...d.data(), _id: d.id }))));
}
export async function getAllSubmissions(roundId) {
  const col = collection(db, 'rounds', roundId, 'submissions');
  const qs = await getDocs(col);
  return qs.docs.map(d => ({ ...d.data(), _id: d.id }));
}
export async function saveDraft(roundId, authorId, payload) {
  const ref = submissionRef(roundId, authorId);
  // 제출 잠금 체크 + 쓰기를 원자적으로 묶어 race 상황에서도 submitted 덮어쓰기 방지.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists() ? snap.data() : {};
    if (cur.status === 'submitted') {
      throw new Error('이미 최종 제출되어 수정할 수 없습니다. 잠금 해제 후 저장해 주세요.');
    }
    tx.set(ref, {
      ...cur,
      ...payload,
      status: 'draft',
      lastSavedAt: serverTimestamp(),
    });
  });
}

export async function finalSubmit(roundId, authorId, payload) {
  const ref = submissionRef(roundId, authorId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists() ? snap.data() : {};
    if (cur.status === 'submitted') return; // 이미 제출된 상태면 noop
    tx.set(ref, {
      ...cur,
      ...payload,
      status: 'submitted',
      lastSavedAt: serverTimestamp(),
      submittedAt: serverTimestamp(),
    });
  });
}

export async function unlockSubmission(roundId, authorId) {
  await updateDoc(submissionRef(roundId, authorId), {
    status: 'draft',
    submittedAt: null,
  });
}
