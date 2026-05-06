// 이미지 업로더 컴포넌트
// 사용법:
//   const el = renderImageUploader({ roundId, projectId, images, onChange, locked });
//
// 이미지는 Firestore 안에 base64 data URL 로 저장 (Firebase Storage 미사용 — 무료 Spark 플랜).
// 1장당 700KB 이하 권장 (Firestore 1MB 문서 한도 안에서).
//
// images: 현재 이미지 배열 (mutate됨, onChange 콜백으로 전체 배열 전달)
//   각 항목: { id, base64DataUrl, mimeType, widthPx, heightPx, sizeBytes, caption, position, order }
// onChange: (updatedImages) => void  — 변경 시마다 호출
import { uploadImage } from '../storage.js';

const POSITIONS = [
  { value: 'afterPlan',  label: '연구내용·계획 다음 (양식 기본)' },
  { value: 'beforeTable', label: '12개월 표 위' },
  { value: 'afterTable',  label: '12개월 표 다음' },
  { value: 'afterIssues', label: '주요 현안 다음' },
];

export function renderImageUploader({ roundId, projectId, images, onChange, locked = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'image-uploader';

  if (!Array.isArray(images)) images = [];

  // 기존 이미지 목록
  const list = document.createElement('div');
  list.className = 'image-list';
  refreshList();

  function refreshList() {
    list.innerHTML = '';
    const sorted = [...images].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (sorted.length === 0) {
      list.innerHTML = '<div class="muted tight">첨부된 이미지 없음</div>';
      return;
    }
    for (const img of sorted) {
      const card = document.createElement('div');
      card.className = 'image-card';
      const posLabel = (POSITIONS.find(p => p.value === img.position) || {}).label || (img.position || '');
      // base64DataUrl (신) 또는 downloadUrl (구버전 호환)
      const src = img.base64DataUrl || img.downloadUrl || '';
      card.innerHTML = `
        <img src="${src}" alt="" class="image-preview"/>
        <div class="muted tight">위치: ${escape(posLabel)}</div>
        <input type="text" placeholder="캡션 (선택)" value="${escape(img.caption || '')}" class="cap-input"
          ${locked ? 'disabled' : ''}/>
      `;
      const capInput = card.querySelector('.cap-input');
      capInput.addEventListener('input', () => {
        img.caption = capInput.value;
        onChange?.(images);
      });
      if (!locked) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn small danger';
        delBtn.textContent = '삭제';
        delBtn.addEventListener('click', () => {
          if (!confirm('이 이미지를 삭제할까요?')) return;
          // base64 inline 저장이라 외부 Storage 삭제 불필요 — 배열에서만 제거
          const idx = images.indexOf(img);
          if (idx >= 0) images.splice(idx, 1);
          onChange?.(images);
          refreshList();
        });
        card.appendChild(delBtn);
      }
      list.appendChild(card);
    }
  }

  wrap.appendChild(list);

  if (!locked) {
    const ctrl = document.createElement('div');
    ctrl.className = 'image-uploader-ctrl';
    ctrl.innerHTML = `
      <select class="pos-sel">
        ${POSITIONS.map(p => `<option value="${p.value}">${escape(p.label)}</option>`).join('')}
      </select>
      <input type="file" accept="image/png,image/jpeg" class="file-input" />
      <span class="upload-status muted tight"></span>
      <div class="muted tight" style="width:100%">📌 1장당 700KB 이하 (Firestore 무료 한도). 큰 사진은 PC에서 압축 후 업로드.</div>
    `;
    const fileInput = ctrl.querySelector('.file-input');
    const status = ctrl.querySelector('.upload-status');
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      status.textContent = '변환 중...';
      try {
        const meta = await uploadImage(roundId, projectId, file);
        images.push({
          ...meta,
          caption: '',
          position: ctrl.querySelector('.pos-sel').value,
          order: images.length,
        });
        onChange?.(images);
        refreshList();
        status.textContent = '추가 완료';
        setTimeout(() => { status.textContent = ''; }, 2000);
      } catch (e) {
        console.error(e);
        status.textContent = '실패: ' + (e?.message || e);
        alert('실패: ' + (e?.message || e));
      } finally {
        fileInput.value = '';
      }
    });
    wrap.appendChild(ctrl);
  }

  return wrap;
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
