# 궤도노반연구실 회의자료 작성 시스템

매주(또는 매월) 궤도노반연구실 회의자료를 분담 입력하고 한글(HWPX) 보고서를 자동 생성하는 정적 웹앱.

원본 [mini486ok/krri-report](https://github.com/mini486ok/krri-report) (철도AI융합연구실용)을 궤도노반연구실에 맞게 변형.

## 구성

- **작성자 페이지** (`index.html`)
  익명 로그인. URL 알면 누구나 접근.
  본인 분담 과제별 활동 항목 입력 → 임시저장 → 최종 제출.
- **관리자 페이지** (`admin.html`)
  Google 로그인 + 화이트리스트 검증.
  회차/작성자/과제 관리, HWPX 다운로드.

## 데이터 모델

- **회차(round)** 단위로 관리. 관리자가 새 회차 만들면 작성자별 빈 submission 자동 생성.
- 각 작성자는 자기 과제별로 **활동 항목 리스트**를 입력. 항목마다 "주요" 체크박스.
- 출력 시 모든 작성자의 entries 합산 → HWPX 1개 파일 생성:
  - **주요 보고사항**: `important=true` 항목들, 과제별로 묶어서
  - **일반 보고사항**: 전체 항목들, kind별 그룹 (기본사업/국가R&D/수탁사업/기타)

## 기술 스택

- Vanilla JavaScript (ES Modules) — 빌드 도구 없이 브라우저에서 직접 실행
- Firebase Firestore + Authentication (Anonymous + Google)
- JSZip (HWPX 패키징)
- GitHub Pages (정적 호스팅)

## 디렉토리 구조

```
src/
├── index.html              작성자 페이지
├── admin.html              관리자 페이지 (URL로만 분리, 외부에 노출 금지)
├── README.md               이 파일
├── SETUP.md                Firebase/GitHub Pages 배포 가이드
├── _scripts/               개발용 스크립트 (Python, Node)
│   ├── build_assets.py     HWPX 템플릿 → JS 자산으로 변환
│   ├── serve.py            로컬 개발 서버
│   └── ...
├── _unpack/                HWPX 템플릿 원본 (build_assets.py가 입력으로 사용)
└── assets/
    ├── css/app.css
    ├── bin/PrvImage.png    HWPX 미리보기 이미지
    └── js/
        ├── firebase-config.js   ★ 사용자가 직접 채워야 함 (SETUP.md 참고)
        ├── firebase-init.js
        ├── store.js             Firestore CRUD + 시드 데이터 (10명 작성자, 17개 과제)
        ├── state.js
        ├── hwpx/                HWPX 빌더
        ├── util/
        └── views/
            ├── author-view.js
            ├── admin-view.js
            └── preview-render.js
```

## 배포

`SETUP.md` 참고. 요약:
1. Firebase 프로젝트 생성 (Firestore + Auth)
2. `firebase-config.js`에 config 채우기
3. GitHub 레포 생성 + push
4. GitHub Pages 활성화
5. 관리자 UID 등록

## 로컬 실행

```bash
cd src/
python _scripts/serve.py
# → http://localhost:8000/
```

(주의: `firebase-config.js`가 placeholder 상태면 Firebase 인증이 실패하므로 실제 DB 동작은 확인 불가. UI 골격 확인용도로만.)

## HWPX 템플릿 자산 재생성

표 구조나 스타일을 변경하고 싶을 때:

```bash
python _scripts/build_assets.py
# → assets/js/hwpx/hwpx-assets.js 재생성
```

## 라이선스

원본 mini486ok/krri-report 기반. 사내 사용.
