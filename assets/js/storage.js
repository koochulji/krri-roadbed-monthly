// Firebase Storage 헬퍼 — 이미지 업로드/삭제/URL 조회
import {
  ref, uploadBytes, getDownloadURL, deleteObject,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';
import { storage } from './firebase-init.js';
import { uuid } from './util/download.js';

/**
 * 이미지 업로드.
 * path: rounds/{roundId}/submissions/{projectId}/images/{filename}
 * @returns {{id, storagePath, downloadUrl, mimeType, widthPx, heightPx}}
 */
export async function uploadImage(roundId, projectId, file) {
  const id = uuid();
  const ext = (file.type || '').includes('png') ? 'png' : 'jpg';
  const storagePath = `rounds/${roundId}/submissions/${projectId}/images/${id}.${ext}`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, file, { contentType: file.type });
  const downloadUrl = await getDownloadURL(fileRef);

  // 이미지 픽셀 크기 추출 (HWPX 출력 시 활용)
  const dims = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
    img.onerror = () => reject(new Error('이미지 크기 추출 실패'));
    img.src = URL.createObjectURL(file);
  });

  return {
    id,
    storagePath,
    downloadUrl,
    mimeType: file.type,
    widthPx: dims.widthPx,
    heightPx: dims.heightPx,
  };
}

export async function deleteImage(storagePath) {
  try {
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
  } catch (e) {
    // 이미 삭제된 경우 등은 무시
    console.warn('이미지 삭제 실패 (이미 없을 수 있음):', e?.code || e?.message);
  }
}

/**
 * 이미지를 ArrayBuffer 로 가져오기 (HWPX 빌드 시 BinData 삽입에 사용).
 */
export async function fetchImageBytes(downloadUrl) {
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`이미지 fetch 실패: ${res.status}`);
  return await res.arrayBuffer();
}
