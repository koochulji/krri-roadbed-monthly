// 12개월 진행표 컴포넌트 — 클릭 토글 음영
//
// 사용법:
//   const el = renderProgressTable({
//     activities: [{id, name}, ...],
//     progressTable: { activityId: { 1: bool, ..., 12: bool } },
//     onChange: (newProgressTable) => { ... },
//     locked: false,
//   });
//   parent.appendChild(el);
//
// activities: 표 행으로 표시될 활동 목록 (project.activities 에서 가져옴)
// progressTable: 활동별 월별 ON/OFF 상태 — 클릭 시 onChange 호출
// onChange: 매번 클릭 직후 호출됨. progressTable 객체가 mutate된 채로 그대로 전달됨.
// locked: true 면 클릭 불가 (제출/승인 후)

export function renderProgressTable({ activities = [], progressTable = {}, onChange, locked = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'progress-table-wrap';

  if (!Array.isArray(activities) || activities.length === 0) {
    wrap.innerHTML = '<div class="muted tight">활동 항목이 정의되지 않음. 관리자가 과제 관리 탭에서 활동 항목을 추가해야 표시됩니다.</div>';
    return wrap;
  }

  const table = document.createElement('table');
  table.className = 'progress-table';

  // 헤더
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  trHead.appendChild(makeTh('주요 연구추진내용', 'name-col'));
  for (let m = 1; m <= 12; m++) {
    trHead.appendChild(makeTh(String(m), 'month-col'));
  }
  thead.appendChild(trHead);
  table.appendChild(thead);

  // body
  const tbody = document.createElement('tbody');
  for (const act of activities) {
    if (!act?.id) continue;
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.className = 'activity-name';
    tdName.textContent = act.name || '(제목 없음)';
    tr.appendChild(tdName);

    const rowState = progressTable[act.id] || {};
    progressTable[act.id] = rowState;  // 누락된 행 초기화
    for (let m = 1; m <= 12; m++) {
      const td = document.createElement('td');
      td.className = 'month-cell';
      if (rowState[m]) td.classList.add('on');
      if (!locked) {
        td.style.cursor = 'pointer';
        td.title = `${m}월 — 클릭하여 토글`;
        td.addEventListener('click', () => {
          rowState[m] = !rowState[m];
          td.classList.toggle('on');
          if (typeof onChange === 'function') onChange(progressTable);
        });
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function makeTh(text, cls) {
  const th = document.createElement('th');
  th.className = cls;
  th.textContent = text;
  return th;
}
