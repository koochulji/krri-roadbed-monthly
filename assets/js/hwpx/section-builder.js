// section-builder.js — 월간 원장보고 HWPX section0.xml 빌더
//
// 양식의 4개 과제 블록 안에서 빨간/파란 charPr 를 가진 텍스트를
// 사용자 입력 (project + submission) 으로 치환.
//
// 1차 구현 (Phase 1):
//   - 정적 필드 (연구기간/연구비/연구목표/기술 정의/세부 항목) 치환
//   - 동적 필드 (이번 달 수행 / 주요 현안) 치환 (보수적)
//   - 12개월 진행표 셀 음영 — 후속 (양식 표 구조 유지)
//   - 이미지 임베딩 — 후속

import { SECTION_TEMPLATE_XML } from './hwpx-assets.js';
import { RED_CHARPR_IDS, BLUE_CHARPR_IDS, PROJECT_BLOCKS } from './template-map.js';

// ───────── 헬퍼 ─────────

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtDate(s) {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}.` : '';
}

function fmtYear2(s) {
  const m = String(s ?? '').match(/^\d{2}(\d{2})/);
  return m ? m[1] : '';
}

function fmtResearchPeriod(start, end) {
  return `${fmtDate(start)}~ ${fmtDate(end)}`;
}

function fmtBudget(rangeStart, budget) {
  const yr = fmtYear2(rangeStart);
  const yAmt = (budget?.yearAmount || '000').toString();
  const tAmt = (budget?.totalAmount || '0000').toString();
  return `(\`${yr}) ${yAmt}백만원, (총) ${tAmt}백만원  `;
}

// ───────── 텍스트 치환 ─────────

/**
 * 특정 charPr 의 hp:t 첫 번째 매치를 새 텍스트로 교체.
 */
function replaceFirstByCharPr(blockXml, charPrId, newText) {
  const re = new RegExp(
    `(<hp:run charPrIDRef="${charPrId}"[^>]*><hp:t>)([^<]*)(</hp:t></hp:run>)`
  );
  return blockXml.replace(re, `$1${xmlEscape(newText)}$3`);
}

/**
 * 특정 charPr 의 hp:t 가 패턴에 매칭되면 새 텍스트로 교체. 모든 매치.
 */
function replaceCharPrByPattern(blockXml, charPrId, pattern, newText) {
  const re = new RegExp(
    `(<hp:run charPrIDRef="${charPrId}"[^>]*><hp:t>)([^<]*)(</hp:t></hp:run>)`,
    'g'
  );
  return blockXml.replace(re, (match, open, text, close) => {
    const ok = (pattern instanceof RegExp) ? pattern.test(text) : (text === pattern);
    return ok ? `${open}${xmlEscape(newText)}${close}` : match;
  });
}

// ───────── 한 과제 블록 치환 ─────────

function substituteProjectBlock(blockXml, project, submission) {
  let xml = blockXml;

  // 1. 연구기간 — "2026.01.01.~ 2028.12.31." 패턴 (charPr 30)
  if (project.rangeStart && project.rangeEnd) {
    const periodPat = /^\d{4}\.\d{2}\.\d{2}\.~\s*\d{4}\.\d{2}\.\d{2}\.$/;
    xml = replaceCharPrByPattern(xml, '30', periodPat, fmtResearchPeriod(project.rangeStart, project.rangeEnd));
  }

  // 2. 연구비 — "(`26) 000백만원, (총) 0000백만원  " 패턴 (charPr 30)
  const budgetPat = /^\(`\d{2}\)\s*\d+백만원,\s*\(총\)\s*\d+백만원/;
  xml = replaceCharPrByPattern(xml, '30', budgetPat, fmtBudget(project.rangeStart, project.budget));

  // 3. 연구목표 — charPr 34 의 첫 번째 hp:t 가 sample (e.g., "400km/h급 고속철도...")
  if (project.goal) {
    xml = replaceFirstByCharPr(xml, '34', project.goal);
  }

  // 4. 기술 정의 본문 — charPr 35 중 가장 긴 텍스트 (sample 본문)
  //    sample: "400km/h급 고속철도의 합리적·단계적 구축을 목표로..." 30+ 글자
  if (project.techDefinition) {
    const re35 = new RegExp(
      `(<hp:run charPrIDRef="35"[^>]*><hp:t>)([^<]{30,})(</hp:t></hp:run>)`
    );
    let didOnce = false;
    xml = xml.replace(re35, (match, open, text, close) => {
      if (didOnce) return match;
      didOnce = true;
      return `${open}${xmlEscape(project.techDefinition)}${close}`;
    });
  }

  // 5. 기술 세부 항목 — charPr 36 ("* 고속철도 속도향상..." 등)
  //    사용자 항목 수만큼 순차 치환. 남는 sample 은 비우기.
  const featCharPrIds = ['36'];
  let featIdx = 0;
  const features = Array.isArray(project.techFeatures) ? project.techFeatures : [];
  for (const cid of featCharPrIds) {
    const re = new RegExp(
      `(<hp:run charPrIDRef="${cid}"[^>]*><hp:t>)([^<]+)(</hp:t></hp:run>)`,
      'g'
    );
    xml = xml.replace(re, (match, open, text, close) => {
      // "* " prefix 가 있는 줄만 features 매핑
      if (!/^\s*\*/.test(text)) return match;
      if (featIdx >= features.length) {
        // 남은 sample 비우기 — 빈 "* " 로
        return `${open}      * ${close}`.replace('${close}', close).replace(`<hp:t>      * </hp:t>`, '<hp:t>      * </hp:t>');
      }
      const newText = `      * ${features[featIdx]}`;
      featIdx += 1;
      return `${open}${xmlEscape(newText)}${close}`;
    });
  }

  // 6. 주요 현안 — charPr 35 의 "   - 도시철도..." sample 들
  const issues = (submission?.issues || [])
    .map(i => (i?.content || '').trim())
    .filter(Boolean);
  let issueIdx = 0;
  const reIssue = /(<hp:run charPrIDRef="35"[^>]*><hp:t>)(   - [^<]+)(<\/hp:t><\/hp:run>)/g;
  xml = xml.replace(reIssue, (match, open, text, close) => {
    // sample patterns: "   - 도시철도운영기관..." / "   - 레일닥터플랫폼..." / "   - 0000 주요..."
    if (issueIdx >= issues.length) {
      return `${open}   - ${close}`;
    }
    const newText = `   - ${issues[issueIdx]}`;
    issueIdx += 1;
    return `${open}${xmlEscape(newText)}${close}`;
  });

  // 7. 이번 달 수행 — BLUE charPr (sample 활동 텍스트) 치환
  //    양식의 sample: "기존 열화모델 분석 및 열화인자 도출을 위한 DATA 수집" 등
  const thisMonth = (submission?.thisMonth || [])
    .filter(i => (i?.content || '').trim());
  let actIdx = 0;
  // BLUE charPr 들에서 의미 있는 활동 sample 텍스트 (8자 이상, 날짜·기호 패턴 제외) 매칭
  for (const cid of BLUE_CHARPR_IDS) {
    if (actIdx >= thisMonth.length) break;
    const re = new RegExp(
      `(<hp:run charPrIDRef="${cid}"[^>]*><hp:t>)([^<]+)(</hp:t></hp:run>)`,
      'g'
    );
    xml = xml.replace(re, (match, open, text, close) => {
      if (actIdx >= thisMonth.length) return match;
      // sample 활동 텍스트만: 8자 이상, 숫자만/짧은 토큰 제외
      if (text.length < 8) return match;
      if (/^[\s\-=]+$/.test(text)) return match;       // 구분자
      if (/^\(?[`'\d]{1,6}/.test(text)) return match;   // 날짜 마커
      if (/^[*\d.\s]+$/.test(text)) return match;       // 숫자/별표만
      const it = thisMonth[actIdx];
      const newText = it.content + (it.date ? `(${it.date})` : '');
      actIdx += 1;
      return `${open}${xmlEscape(newText)}${close}`;
    });
  }

  return xml;
}

// ───────── 메인 빌더 ─────────

/**
 * 월간 원장보고 section0.xml 생성.
 *
 * @param round — { year, month, baseDate, orgName, projectsSnapshot, ... }
 * @param submissions — [{ _id (= projectId), thisMonth, nextMonth, issues, achievements, progressTable, images, ... }]
 * @param options.masterProjects — 회차 snapshot 부족 시 fallback
 */
export function buildSection0Xml(round, submissions, options = {}) {
  let xml = SECTION_TEMPLATE_XML;
  const projects = round?.projectsSnapshot || options.masterProjects || [];
  const subMap = new Map((submissions || []).map(s => [s._id, s]));

  // 양식의 4개 슬롯에 projects 처음 4개를 매핑 (순서 유지 가정)
  const blocksToFill = Math.min(PROJECT_BLOCKS.length, projects.length);

  // 끝에서부터 처리 — 인덱스 시프트 방지
  const sortedBlocks = [...PROJECT_BLOCKS]
    .slice(0, blocksToFill)
    .sort((a, b) => b.start - a.start);

  for (const block of sortedBlocks) {
    const proj = projects[block.index];
    if (!proj) continue;
    const sub = subMap.get(proj.id) || {};
    const blockXml = xml.substring(block.start, block.end);
    const newBlockXml = substituteProjectBlock(blockXml, proj, sub);
    xml = xml.substring(0, block.start) + newBlockXml + xml.substring(block.end);
  }

  return xml;
}

// ───────── 호환 export (preview-render.js 등에서 사용) ─────────

export const KIND_NAMES = {
  basic: '기본사업',
  natl_rnd: '국가R&D',
  consign: '수탁사업',
  etc: '기타',
};
export const KIND_ORDER = ['basic', 'natl_rnd', 'consign', 'etc'];

export function formatItem(item) {
  const text = (item?.content || '').trim();
  const date = (item?.date || '').trim();
  if (!text) return '';
  return date ? `${text}(${date})` : text;
}

// 12개월 진행표 데이터 helper (preview 에서도 사용 가능)
export function getActivityProgress(progressTable, activityId) {
  return progressTable?.[activityId] || {};
}
