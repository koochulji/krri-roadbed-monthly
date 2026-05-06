#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""양식 HWPX 의 section0.xml 에서 4개 과제 위치 + placeholder 추출.

출력:
  1. assets/js/hwpx/hwpx-assets.js — section0.xml + header.xml + 기타 자산을 JS 모듈로 인라인
  2. assets/js/hwpx/template-map.js — 빨간/파란 charPr id 목록 + 4개 과제 블록 위치

실행: python _scripts/extract_template.py
"""
import os, re, json, sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNPACK = os.path.join(ROOT, '_unpack')


def read_file(rel):
    with open(os.path.join(UNPACK, rel), 'r', encoding='utf-8') as f:
        return f.read()


def js_escape(s):
    return s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')


def find_red_blue_charprs(header_xml):
    """header.xml 에서 #FF0000(빨강), #0000FF(파랑) charPr id 목록 추출."""
    red = []
    blue = []
    for m in re.finditer(r'<hh:charPr id="(\d+)"[^>]*textColor="([^"]+)"', header_xml):
        cid, color = m.group(1), m.group(2).upper()
        if color == '#FF0000':
            red.append(cid)
        elif color == '#0000FF':
            blue.append(cid)
    return red, blue


def find_project_blocks(section_xml):
    """section0.xml 에서 4개 과제 블록 위치 식별.

    각 과제는 "(기본사업)" / "(국가R&D)" / "(수탁사업)" / "(기타)" 헤더로 시작.
    제목이 같은 hp:t 안에 있는 경우(4번째 블록)와 별개의 hp:t 에 있는 경우(1~3번째 블록) 모두 처리.
    반환: [{index, kind, title, start, end}]
    """
    # group(1) = kind, group(2) = same hp:t 내 trailing text (보통 공백 또는 제목)
    kind_pattern = re.compile(r'<hp:t>\s*\((기본사업|국가R&D|수탁사업|기타)\)([^<]*)</hp:t>')
    matches = list(kind_pattern.finditer(section_xml))
    blocks = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(section_xml)
        # 같은 hp:t 안의 trailing text 확인 — 비어있지 않으면 그것이 제목
        trailing = m.group(2).strip()
        if trailing:
            title = trailing
        else:
            # 다음 hp:t 에 과제 제목이 있을 가능성
            title_m = re.search(r'<hp:t>([^<]+)</hp:t>', section_xml[m.end():m.end() + 800])
            title = title_m.group(1).strip() if title_m else '(제목 없음)'
        blocks.append({
            'index': i,
            'kind': m.group(1),
            'title': title[:120],
            'start': start,
            'end': end,
        })
    return blocks


def main():
    section_xml = read_file('Contents/section0.xml')
    header_xml = read_file('Contents/header.xml')

    red_charprs, blue_charprs = find_red_blue_charprs(header_xml)
    print(f'빨간색 charPr: {red_charprs}')
    print(f'파란색 charPr: {blue_charprs}')

    blocks = find_project_blocks(section_xml)
    print(f'\n과제 블록 {len(blocks)}개:')
    for b in blocks:
        print(f"  [{b['index']}] ({b['kind']}) {b['title'][:60]}")

    # template-map.js 생성
    out_map = os.path.join(ROOT, 'assets', 'js', 'hwpx', 'template-map.js')
    os.makedirs(os.path.dirname(out_map), exist_ok=True)
    with open(out_map, 'w', encoding='utf-8') as f:
        f.write('// 자동 생성됨 — _scripts/extract_template.py\n')
        f.write('// 양식 HWPX 의 색상별 charPr id + 과제 블록 위치 메타데이터\n\n')
        f.write(f'export const RED_CHARPR_IDS = {json.dumps(red_charprs)};\n')
        f.write(f'export const BLUE_CHARPR_IDS = {json.dumps(blue_charprs)};\n\n')
        f.write('// 4개 과제 블록의 section0.xml 내 위치 (start/end 인덱스)\n')
        f.write(f'export const PROJECT_BLOCKS = {json.dumps(blocks, ensure_ascii=False, indent=2)};\n')

    # hwpx-assets.js 생성 — _unpack 의 모든 파일을 JS 문자열로 인라인
    parts_files = [
        ('mimetype', 'mimetype'),
        ('version.xml', 'version.xml'),
        ('settings.xml', 'settings.xml'),
        ('META-INF/container.xml', 'META-INF/container.xml'),
        ('META-INF/container.rdf', 'META-INF/container.rdf'),
        ('META-INF/manifest.xml', 'META-INF/manifest.xml'),
        ('Contents/content.hpf', 'Contents/content.hpf'),
        ('Contents/header.xml', 'Contents/header.xml'),
    ]
    parts = {}
    for zip_name, rel in parts_files:
        path = os.path.join(UNPACK, rel)
        if os.path.exists(path):
            parts[zip_name] = read_file(rel)
        else:
            print(f'WARNING: {rel} 가 없음 — 빈 문자열로 처리')
            parts[zip_name] = ''

    out_assets = os.path.join(ROOT, 'assets', 'js', 'hwpx', 'hwpx-assets.js')
    lines = [
        '// 자동 생성됨 — _scripts/extract_template.py',
        '// 월간 원장보고 양식 자산 (불변 파츠 + section0.xml 템플릿)',
        '',
    ]
    for zip_name in parts.keys():
        var = 'A_' + re.sub(r'[^A-Za-z0-9]', '_', zip_name.upper())
        lines.append(f'const {var} = `{js_escape(parts[zip_name])}`;')
    lines.append('')
    lines.append(f'export const SECTION_TEMPLATE_XML = `{js_escape(section_xml)}`;')
    lines.append('')
    lines.append('export const PREV_IMAGE_URL = "./assets/bin/PrvImage.png";')
    lines.append('')
    lines.append('// ZIP 패키징 순서를 보장하기 위해 배열로 export')
    lines.append('export const ASSETS = [')
    for zip_name in parts.keys():
        var = 'A_' + re.sub(r'[^A-Za-z0-9]', '_', zip_name.upper())
        store = 'true' if zip_name == 'mimetype' else 'false'
        lines.append(f'  {{ path: {zip_name!r}, content: {var}, store: {store} }},')
    lines.append('];')
    lines.append('')

    with open(out_assets, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f'\nOK: {out_map}  ({os.path.getsize(out_map)} bytes)')
    print(f'OK: {out_assets}  ({os.path.getsize(out_assets)} bytes)')


if __name__ == '__main__':
    main()
