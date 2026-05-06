// 이미지 헬퍼 — Firebase Storage 미사용, Firestore 안에 base64 data URL 로 저장.
// Spark (무료) 플랜으로도 동작 (Storage 활성화 불필요).
//
// 제약:
//   - Firestore 문서 1개 최대 1MB
//   - base64 인코딩으로 ~33% 부풀음 → 원본 이미지는 ~600KB 이하 권장
//   - 한 submission 의 images[] 합산이 1MB 넘으면 저장 실패
//
// 권장: PNG 는 700KB 이하, JPEG 는 1MB 이하. 파일 매우 크면 PC 에서 압축 후 업로드.

import { uuid } from './util/download.js';

const MAX_PER_IMAGE_BYTES = 700 * 1024;   // 700KB pre-encode (≈ 930KB base64 — 1MB 안)

/**
 * 이미지 파일을 base64 data URL 로 변환하고 메타데이터와 함께 반환.
 *
 * @param _roundId, _projectId — API 호환 위해 받지만 사용 안 함 (Storage 시절 흔적)
 * @param file — File 객체 (image/png, image/jpeg)
 * @returns {{id, base64DataUrl, mimeType, widthPx, heightPx, sizeBytes}}
 */
export async function uploadImage(_roundId, _projectId, file) {
  if (!file) throw new Error('파일이 없습니다.');
  if (file.size > MAX_PER_IMAGE_BYTES) {
    throw new Error(
      `파일이 너무 큽니다 (${(file.size / 1024).toFixed(0)}KB). ` +
      `${(MAX_PER_IMAGE_BYTES / 1024).toFixed(0)}KB 이하로 압축해 주세요.`
    );
  }

  const id = uuid();

  // 1) base64 data URL 변환
  const base64DataUrl = await fileToDataUrl(file);

  // 2) 픽셀 크기 추출
  const dims = await loadImageDimensions(base64DataUrl);

  return {
    id,
    base64DataUrl,
    mimeType: file.type || 'image/png',
    widthPx: dims.widthPx,
    heightPx: dims.heightPx,
    sizeBytes: file.size,
  };
}

/**
 * 이미지 삭제 — Firestore 안 base64 라서 따로 외부 삭제 작업 없음.
 * 호환을 위해 함수만 남김 (no-op).
 */
export async function deleteImage(_anyMetadata) {
  // base64 는 submission 문서 안에 있으니, submission.images 배열에서
  // 항목 제거 + saveSubmissionDraft() 만 호출하면 끝. 여기선 할 일 없음.
  return;
}

/**
 * data URL ("data:image/png;base64,...") → ArrayBuffer
 * (HWPX 빌드 시 BinData 삽입용 — Phase 2에서 사용)
 */
export async function fetchImageBytes(base64DataUrl) {
  const m = String(base64DataUrl ?? '').match(/^data:[^;]+;base64,(.+)$/);
  if (!m) throw new Error('유효한 base64 data URL 이 아닙니다.');
  const binStr = atob(m[1]);
  const len = binStr.length;
  const buf = new ArrayBuffer(len);
  const view = new Uint8Array(buf);
  for (let i = 0; i < len; i++) view[i] = binStr.charCodeAt(i);
  return buf;
}

// ───── 내부 헬퍼 ─────

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
    img.onerror = () => reject(new Error('이미지 디코딩 실패'));
    img.src = dataUrl;
  });
}
