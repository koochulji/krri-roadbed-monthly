// 주례 예시.hwpx 기반 새 템플릿의 paraPr / charPr ID 매핑.
// header.xml 정의 기반. 변경 시 _scripts/rebuild_assets_v2.py 와 동기화 유지.

export const PARA = {
  // 본문 셀 안에서 paragraph 들이 사용할 paraPrIDRef.
  // 새 템플릿은 본문 셀별로 다른 paraPr 사용:
  //   - 주요 보고사항 본문:    57
  //   - 지난주/이번주 본문:    56
  // 둘 다 13pt 휴먼명조에 적절한 마진 설정.
  MAIN_BODY: 57,
  PERIOD_BODY: 56,

  // 라벨 셀 (지난주실적 / 이번주계획) 의 paragraph 형식
  LABEL: 3,
};

export const CHAR = {
  // 본문 13pt 휴먼명조
  ORG_AND_KIND: 6,    // [궤도노반연구실] / <기본사업> 등 굵게 강조
  PROJECT_TITLE: 7,   // 과제명 (일반)
  BULLET_TEXT: 7,     // 항목 본문 (일반)
  BULLET_BOLD: 6,     // 중요 항목 (굵게)

  // 라벨 셀 14pt 휴먼명조 bold
  LABEL_TITLE: 10,    // "지난 주", "이번 주"
  LABEL_PERIOD: 12,   // "실적", "계획"
  LABEL_RANGE: 11,    // 날짜 범위 (실측 6pt 이지만 그대로 쓰면 너무 작음)
  LABEL_RANGE_ALT: 12, // 날짜 범위 대체 (13pt bold)
};

// linesegarray 프리셋 — 새 템플릿용. horzsize 등은 한글이 재계산하므로 default 값.
export const LINESEG_PRESET = {
  body: {
    vertsize: 1300, textheight: 1300, baseline: 1105, spacing: 392,
    horzpos: 0, horzsize: 36000, flags: 393216,
  },
  bullet: {
    vertsize: 1300, textheight: 1300, baseline: 1105, spacing: 392,
    horzpos: 1500, horzsize: 34500, flags: 2490368,
  },
  label: {
    vertsize: 1400, textheight: 1400, baseline: 1190, spacing: 420,
    horzpos: 200, horzsize: 6000, flags: 393216,
  },
};
