# 궤도노반연구실 월간 원장보고 자동 취합 시스템

매월 궤도노반연구실 4개 과제의 원장보고를 책임자가 입력하고 실장이 검수해 한글(HWPX) 보고서를 자동 생성하는 정적 웹앱.

원본 양식 (`업무보고 양식_궤도노반연구실.hwpx`) 기반으로 placeholder 자동 치환.

주간 회의자료 시스템 (`koochulji/track-roadbed-report`) 과 **별건 운영** — 같은 작성자라도 별도 인증/Firestore.

## 구성

- **작성자 페이지** (`index.html`)
  익명 로그인. URL 알면 누구나 접근. 본인 책임 과제 선택 → 구조화 폼 입력.
- **관리자 페이지** (`admin.html`)
  Google 로그인 + 화이트리스트. 회차/과제/책임자 관리, HWPX 다운로드.
- **사용법 페이지** (`help.html`)
  운영 흐름 + FAQ.

## 데이터 모델

- **회차(round)**: 매월 1회 (year/month/baseDate). 관리자가 만들면 책임자별 빈 submission 자동 생성.
- **과제(project)**: 4개 시드 (양식 기본). 정적 필드 (개요/기술 정의/활동 항목) 는 한 번 입력 후 매월 자동 복사.
- **submission**: 과제별 월간 데이터 (이번 달 수행, 다음 달 계획, 12개월 진행표, 이미지, 현안, 성과).
- **12개월 진행표**: 클릭 음영 토글. 매월 누적 (이전 달 데이터 자동 복사).
- **이미지 첨부**: Firebase Storage. 위치별 (afterPlan / beforeTable / afterTable / afterIssues) 첨부.

## 기술 스택

- Vanilla JS (ES Modules)
- Firebase Firestore + Anonymous/Google Auth + **Storage**
- JSZip (HWPX 패키징)
- GitHub Pages (정적 호스팅)

## 디렉토리 구조

```
src/
├── index.html              작성자 페이지
├── admin.html              관리자 페이지
├── help.html               사용법
├── README.md / SETUP.md
├── _scripts/
│   ├── extract_template.py 양식 → JS 자산 변환
│   ├── serve.py            로컬 개발 서버
│   └── ...
├── _unpack/                양식 분해본
└── assets/
    ├── css/app.css
    ├── bin/
    └── js/
        ├── firebase-config.js   ★ 사용자 직접 채움
        ├── firebase-init.js
        ├── store.js             projects + submissions per-project
        ├── storage.js           Firebase Storage helpers
        ├── state.js
        ├── hwpx/                HWPX 빌더
        │   ├── hwpx-assets.js   양식 자산 (자동 생성)
        │   ├── hwpx-builder.js
        │   ├── section-builder.js
        │   └── template-map.js  charPr id + 과제 블록 위치
        ├── util/
        └── views/
            ├── author-view.js   구조화 입력 폼
            ├── admin-view.js    회차/과제/책임자 관리 + 검수
            ├── preview-render.js
            ├── progress-table.js  12개월 클릭 토글
            └── image-uploader.js  이미지 업로드 UI
```

## 배포

`SETUP.md` 참고. 요약:
1. Firebase 프로젝트 생성 (`krri-roadbed-monthly`) — Firestore + Auth + **Storage** 활성화
2. `firebase-config.js` 에 config 채우기
3. GitHub 새 레포 (`koochulji/krri-roadbed-monthly`) 생성 + push
4. GitHub Pages 활성화
5. 관리자 UID 등록

## 로컬 실행

```bash
cd src/
python _scripts/serve.py
# → http://localhost:8000/
```

(주의: `firebase-config.js` 가 placeholder 면 인증 실패. UI 골격 확인용.)

## 양식 자산 재생성

양식 HWPX 가 변경되면:

```bash
python _scripts/extract_template.py
# → assets/js/hwpx/hwpx-assets.js + template-map.js 재생성
```

## 라이선스

사내 사용. 베이스: 주간 회의자료 시스템 (mini486ok/krri-report).
