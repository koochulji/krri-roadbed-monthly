// 이미지 업로더 컴포넌트
// 사용법:
//   const el = renderImageUploader({ roundId, projectId, images, onChange, locked });
// images: 현재 이미지 배열 (mutate됨, onChange 콜백으로 전체 배열 전달)
// onChange: (updatedImages) => void  — 변경 시마다 호출
import { uploadImage, deleteImage } from '../storage.js';

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
      card.innerHTML = `
        <img src="${img.downloadUrl}" alt="" class="image-preview"/>
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
        delBtn.addEventListener('click', async () => {
          if (!confirm('이 이미지를 삭제할까요?')) return;
          try { await deleteImage(img.storagePath); } catch (e) { /* ignore */ }
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
    `;
    const fileInput = ctrl.querySelector('.file-input');
    const status = ctrl.querySelector('.upload-status');
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        alert('파일 크기는 5MB 이하만 가능합니다.');
        fileInput.value = '';
        return;
      }
      status.textContent = '업로드 중...';
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
        status.textContent = '업로드 완료';
        setTimeout(() => { status.textContent = ''; }, 2000);
      } catch (e) {
        console.error(e);
        status.textContent = '실패: ' + (e?.message || e);
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
