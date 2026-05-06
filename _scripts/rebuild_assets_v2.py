#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""주례 예시.hwpx 기반 새 템플릿으로 hwpx-assets.js 재생성.

새 템플릿 구조 (3개 표):
  Table 1: 궤도토목본부 헤더 (org name)
  Table 2:
    Row 0 (header): 구 분 / 내 용 / 비 고
    Row 1: 주 요 보고사항 / [{{MAIN_BODY}}] / [memo]
  Table 3:
    Row 0: 지난 주 실적 (range) / [{{PAST_BODY}}] / [memo]
    Row 1: 이번 주 계획 (range) / [{{NEXT_BODY}}] / [memo]

placeholders:
  {{MAIN_BODY_SUBLIST}}   — 주요 보고사항 본문 셀 subList 내부
  {{PAST_LABEL_SUBLIST}}  — 지난 주 실적 라벨 셀 subList 내부 (전체 교체)
  {{PAST_BODY_SUBLIST}}   — 지난 주 실적 본문 셀 subList 내부
  {{NEXT_LABEL_SUBLIST}}  — 이번 주 계획 라벨 셀 subList 내부 (전체 교체)
  {{NEXT_BODY_SUBLIST}}   — 이번 주 계획 본문 셀 subList 내부

실행: python _scripts/rebuild_assets_v2.py
"""
import os, re, sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNPACK = os.path.join(ROOT, '_unpack')
OUT_JS = os.path.join(ROOT, 'assets', 'js', 'hwpx', 'hwpx-assets.js')

FILES = [
    ('mimetype',                 'mimetype',                 'text'),
    ('version.xml',              'version.xml',              'xml'),
    ('settings.xml',             'settings.xml',             'xml'),
    ('META-INF/container.xml',   'META-INF/container.xml',   'xml'),
    ('META-INF/container.rdf',   'META-INF/container.rdf',   'xml'),
    ('META-INF/manifest.xml',    'META-INF/manifest.xml',    'xml'),
    ('Contents/content.hpf',     'Contents/content.hpf',     'xml'),
    ('Contents/header.xml',      'Contents/header.xml',      'xml'),
]


def read_file(rel):
    with open(os.path.join(UNPACK, rel), 'r', encoding='utf-8') as f:
        return f.read()


def js_escape_backtick(s):
    return s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')


def find_subList_inner_range(s, search_start, search_end):
    """주어진 범위 내 첫 <hp:subList ...>...</hp:subList> 의 내부 범위 반환."""
    m = re.search(r'<hp:subList [^>]*>', s[search_start:search_end])
    if not m:
        raise SystemExit(f"subList not found in [{search_start}, {search_end}]")
    inner_start = search_start + m.end()
    close_idx = s.find('</hp:subList>', inner_start, search_end)
    if close_idx < 0:
        raise SystemExit(f"</hp:subList> not found")
    return inner_start, close_idx


def build_section_template(section_xml):
    """3개 표 구조에 맞춰 5개 placeholder 삽입."""
    s = section_xml

    # 모든 <hp:tc>...</hp:tc> 위치 찾기 (DOTALL 매칭)
    tc_iter = list(re.finditer(r'<hp:tc\b[^>]*>.*?</hp:tc>', s, flags=re.DOTALL))
    cells = []
    for m in tc_iter:
        addr = re.search(r'<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"', m.group(0))
        col, row = (addr.group(1), addr.group(2)) if addr else ('?', '?')
        cells.append({'start': m.start(), 'end': m.end(), 'col': col, 'row': row})

    if len(cells) < 13:
        raise SystemExit(f"예상보다 적은 셀 수: {len(cells)}")

    # 셀 순서:
    #  cell[0] = Table1: 궤도토목본부 (col=0,row=0)
    #  cell[1-3] = Table2 row 0 (header): 구 분 / 내 용 / 비 고
    #  cell[4-6] = Table2 row 1: 주 요 보고사항 / [body{{MAIN_BODY}}] / [memo]
    #  cell[7-9] = Table3 row 0: 지난 주 실적 / [body{{PAST_BODY}}] / [memo]
    #  cell[10-12] = Table3 row 1: 이번 주 계획 / [body{{NEXT_BODY}}] / [memo]

    targets = [
        # (cell_idx, slot_marker)
        (5,  '{{MAIN_BODY_SUBLIST}}'),   # 주요 보고사항 본문
        (7,  '{{PAST_LABEL_SUBLIST}}'),  # 지난 주 실적 라벨
        (8,  '{{PAST_BODY_SUBLIST}}'),   # 지난 주 실적 본문
        (10, '{{NEXT_LABEL_SUBLIST}}'),  # 이번 주 계획 라벨
        (11, '{{NEXT_BODY_SUBLIST}}'),   # 이번 주 계획 본문
    ]

    # 위치(끝 → 처음) 순으로 치환해야 인덱스 안 깨짐
    ranges = []
    for cell_idx, slot in targets:
        c = cells[cell_idx]
        inner_start, inner_end = find_subList_inner_range(s, c['start'], c['end'])
        ranges.append((inner_start, inner_end, slot))

    ranges.sort(key=lambda t: t[0], reverse=True)
    result = s
    for inner_start, inner_end, slot in ranges:
        result = result[:inner_start] + slot + result[inner_end:]

    # 검증: 5개 슬롯 모두 있는가
    for slot in ['{{MAIN_BODY_SUBLIST}}',
                 '{{PAST_LABEL_SUBLIST}}', '{{PAST_BODY_SUBLIST}}',
                 '{{NEXT_LABEL_SUBLIST}}', '{{NEXT_BODY_SUBLIST}}']:
        cnt = result.count(slot)
        if cnt != 1:
            raise SystemExit(f"슬롯 주입 실패: {slot} count={cnt}")
    return result


def main():
    parts = {}
    for zip_name, rel, _kind in FILES:
        # PrvText.txt 가 _unpack 에 없으면 빈 텍스트로
        path = os.path.join(UNPACK, rel)
        if os.path.exists(path):
            text = read_file(rel)
        else:
            text = ''
            print(f"WARNING: {rel} not found, using empty")
        parts[zip_name] = text

    # PrvText.txt 도 ASSETS 에 포함 (없으면 빈 문자열)
    prvtext_path = os.path.join(UNPACK, 'Preview', 'PrvText.txt')
    prvtext_content = ''
    if os.path.exists(prvtext_path):
        with open(prvtext_path, 'r', encoding='utf-8') as f:
            prvtext_content = f.read()

    section_xml = read_file('Contents/section0.xml')
    section_tpl = build_section_template(section_xml)

    # JS 모듈 생성
    lines = [
        '// 이 파일은 _scripts/rebuild_assets_v2.py 로부터 자동 생성됨.',
        '// 주례 예시.hwpx 기반 — 3개 표 구조 (주요/지난주/이번주).',
        '',
    ]

    # ASSETS 배열에 포함될 파일들
    asset_entries = [
        ('mimetype',                'A_MIMETYPE',                parts['mimetype']),
        ('version.xml',             'A_VERSION_XML',             parts['version.xml']),
        ('settings.xml',            'A_SETTINGS_XML',            parts['settings.xml']),
        ('META-INF/container.xml',  'A_META_INF_CONTAINER_XML',  parts['META-INF/container.xml']),
        ('META-INF/container.rdf',  'A_META_INF_CONTAINER_RDF',  parts['META-INF/container.rdf']),
        ('META-INF/manifest.xml',   'A_META_INF_MANIFEST_XML',   parts['META-INF/manifest.xml']),
        ('Contents/content.hpf',    'A_CONTENTS_CONTENT_HPF',    parts['Contents/content.hpf']),
        ('Contents/header.xml',     'A_CONTENTS_HEADER_XML',     parts['Contents/header.xml']),
        ('Preview/PrvText.txt',     'A_PREVIEW_PRVTEXT_TXT',     prvtext_content),
    ]

    for path, varname, content in asset_entries:
        esc = js_escape_backtick(content)
        lines.append(f'const {varname} = `{esc}`;')
    lines.append('')

    section_esc = js_escape_backtick(section_tpl)
    lines.append('export const SECTION_TEMPLATE_XML = `' + section_esc + '`;')
    lines.append('')
    lines.append('export const PREV_IMAGE_URL = "./assets/bin/PrvImage.png";')
    lines.append('')
    lines.append('// ZIP 패키징 순서를 보장하기 위해 배열로 export')
    lines.append('export const ASSETS = [')
    for path, varname, _ in asset_entries:
        store = 'true' if path == 'mimetype' else 'false'
        lines.append(f'  {{ path: {path!r}, content: {varname}, store: {store} }},')
    lines.append('];')
    lines.append('')

    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f'OK: wrote {OUT_JS}  ({os.path.getsize(OUT_JS)} bytes)')


if __name__ == '__main__':
    main()
