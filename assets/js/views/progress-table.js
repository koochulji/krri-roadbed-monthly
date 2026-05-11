// 12개월 진행표 컴포넌트 — 클릭 토글 음영 + 활동 행 편집
//
// 사용법:
//   const el = renderProgressTable({
//     activities: [{id, name}, ...],
//     progressTable: { activityId: { 1: bool, ..., 12: bool } },
//     onChange: (newProgressTable) => { ... },        // 셀 토글 시
//     onActivitiesChange: (newActivities) => { ... }, // 활동 행 추가/수정/삭제 시 (선택)
//     locked: false,
//     newActivityId: () => string,  // 새 활동 행 ID 생성 함수 (uuid)
//   });

export function renderProgressTable({
  activities = [],
  progressTable = {},
  onChange,
  onActivitiesChange,
  locked = false,
  newActivityId,
}) {
  const wrap = document.createElement('div');
  wrap.className = 'progress-table-wrap';

  // activities 가 mutable 참조여야 일관성 유지
  if (!Array.isArray(activities)) activities = [];

  // 활동 행 추가
  function addActivity() {
    const id = (typeof newActivityId === 'function')
      ? newActivityId()
      : 'act-' + Math.random().toString(36).slice(2, 9);
    activities.push({ id, name: '' });
    onActivitiesChange?.(activities);
    rerender();
  }

  // 활동 행 삭제
  function removeActivity(idx) {
    const removed = activities.splice(idx, 1)[0];
    if (removed && progressTable[removed.id]) delete progressTable[removed.id];
    onActivitiesChange?.(activities);
    onChange?.(progressTable);
    rerender();
  }

  // 활동 이름 변경
  function renameActivity(idx, newName) {
    activities[idx].name = newName;
    onActivitiesChange?.(activities);
  }

  // 셀 토글
  function toggleCell(actId, month, td) {
    const rowState = progressTable[actId] || {};
    rowState[month] = !rowState[month];
    progressTable[actId] = rowState;
    td.classList.toggle('on');
    onChange?.(progressTable);
  }

  function rerender() {
    wrap.innerHTML = '';
    build();
  }

  function build() {
    const table = document.createElement('table');
    table.className = 'progress-table';

    // 헤더
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    trHead.appendChild(makeTh('주요 연구추진내용', 'name-col'));
    for (let m = 1; m <= 12; m++) {
      trHead.appendChild(makeTh(String(m), 'month-col'));
    }
    if (!locked && onActivitiesChange) {
      trHead.appendChild(makeTh('', 'del-col'));  // 삭제 컬럼
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    // body
    const tbody = document.createElement('tbody');
    if (activities.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 13 + (onActivitiesChange ? 1 : 0);
      td.className = 'muted tight';
      td.style.padding = '12px';
      td.style.textAlign = 'center';
      td.textContent = locked
        ? '활동 항목 없음'
        : '활동 항목 없음 — 아래 "+ 활동 추가" 버튼으로 행을 추가하세요.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      activities.forEach((act, idx) => {
        if (!act?.id) return;
        const tr = document.createElement('tr');

        // 활동 이름 — input (편집 가능) 또는 텍스트 (locked)
        const tdName = document.createElement('td');
        tdName.className = 'activity-name';
        if (!locked && onActivitiesChange) {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.value = act.name || '';
          inp.placeholder = '활동 항목 이름';
          inp.style.width = '100%';
          inp.style.border = 'none';
          inp.style.background = 'transparent';
          inp.style.fontSize = '12px';
          inp.style.padding = '4px';
          inp.addEventListener('input', () => renameActivity(idx, inp.value));
          tdName.appendChild(inp);
          tdName.style.padding = '0 4px';
        } else {
          tdName.textContent = act.name || '(제목 없음)';
        }
        tr.appendChild(tdName);

        // 12개월 셀
        const rowState = progressTable[act.id] || {};
        progressTable[act.id] = rowState;
        for (let m = 1; m <= 12; m++) {
          const td = document.createElement('td');
          td.className = 'month-cell';
          if (rowState[m]) td.classList.add('on');
          if (!locked) {
            td.style.cursor = 'pointer';
            td.title = `${m}월 — 클릭하여 토글`;
            td.addEventListener('click', () => toggleCell(act.id, m, td));
          }
          tr.appendChild(td);
        }

        // 삭제 버튼
        if (!locked && onActivitiesChange) {
          const tdDel = document.createElement('td');
          tdDel.style.padding = '0 4px';
          const btn = document.createElement('button');
          btn.className = 'btn ghost small';
          btn.textContent = '✕';
          btn.title = '이 활동 행 삭제';
          btn.addEventListener('click', () => {
            if (confirm(`"${act.name || '(이름 없음)'}" 행을 삭제하시겠어요?`)) {
              removeActivity(idx);
            }
          });
          tdDel.appendChild(btn);
          tr.appendChild(tdDel);
        }
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);

    // 행 추가 버튼
    if (!locked && onActivitiesChange) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn small';
      addBtn.textContent = '+ 활동 추가';
      addBtn.style.marginTop = '6px';
      addBtn.addEventListener('click', addActivity);
      wrap.appendChild(addBtn);
    }
  }

  build();
  return wrap;
}

function makeTh(text, cls) {
  const th = document.createElement('th');
  th.className = cls;
  th.textContent = text;
  return th;
}
