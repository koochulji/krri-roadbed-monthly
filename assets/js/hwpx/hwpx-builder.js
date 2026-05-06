// hwpx-builder.js — JSZip 으로 양식 자산 + 동적 section0.xml 패키징
//
// 1차 구현: PrvImage.png 가 양식 HWPX 에 없을 수도 있으니 optional 처리.
// 이미지 임베딩 (BinData/) 은 추후 작업.

import { ASSETS, PREV_IMAGE_URL } from './hwpx-assets.js';
import { buildSection0Xml } from './section-builder.js';

function getJSZip() {
  if (typeof window !== 'undefined' && window.JSZip) return window.JSZip;
  throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');
}

let _prvImageCache = null;
async function loadPrvImage() {
  if (_prvImageCache) return _prvImageCache;
  try {
    const res = await fetch(PREV_IMAGE_URL);
    if (!res.ok) {
      _prvImageCache = null;
      return null;
    }
    _prvImageCache = await res.arrayBuffer();
  } catch {
    _prvImageCache = null;
  }
  return _prvImageCache;
}

/**
 * 월간 원장보고 HWPX Blob 생성.
 *
 * @param round — 회차 (year, month, baseDate, projectsSnapshot, ...)
 * @param submissions — 제출 데이터 배열
 * @param options.masterProjects — 마스터 projects (snapshot 부족 시 fallback)
 */
export async function buildHwpxBlob(round, submissions, options = {}) {
  const JSZip = getJSZip();
  const zip = new JSZip();

  // 1) mimetype 맨 먼저 (STORE 압축)
  const mimetypeEntry = ASSETS.find(a => a.path === 'mimetype');
  if (mimetypeEntry) {
    zip.file(mimetypeEntry.path, mimetypeEntry.content, { compression: 'STORE' });
  }

  // 2) 나머지 불변 파츠
  for (const a of ASSETS) {
    if (a.path === 'mimetype') continue;
    zip.file(a.path, a.content, { compression: 'DEFLATE' });
  }

  // 3) Preview/PrvImage.png (있으면)
  const prvImage = await loadPrvImage();
  if (prvImage) {
    zip.file('Preview/PrvImage.png', prvImage, { compression: 'STORE' });
  }

  // 4) 동적 section0.xml — 사용자 입력 치환
  const sectionXml = buildSection0Xml(round, submissions, options);
  zip.file('Contents/section0.xml', sectionXml, { compression: 'DEFLATE' });

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/hwp+zip',
    compression: 'DEFLATE',
  });
  return blob;
}

/**
 * 다운로드 파일명 제안.
 * 예: "2026-05_원장보고_궤도노반연구실.hwpx"
 */
export function suggestFileName(round) {
  const ym = round?.year && round?.month
    ? `${round.year}-${String(round.month).padStart(2, '0')}`
    : (round?.baseDate || 'unknown');
  return `${ym}_원장보고_궤도노반연구실.hwpx`;
}
