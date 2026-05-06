# 궤도노반연구실 회의자료 시스템 — 셋업 가이드

박사님이 코드를 받은 후 따라할 단계별 절차. 총 소요시간 약 30분.

---

## 0. 준비물

- Google 계정 (Firebase + GitHub 로그인용)
- GitHub 계정 (이 가이드는 `koochulji` ID 기준)
- Git이 설치된 터미널 (Windows: PowerShell, Bash 등)

---

## 1. Firebase 프로젝트 생성

1. https://console.firebase.google.com 접속 → Google 로그인
2. **"프로젝트 추가"** 버튼
3. 프로젝트 이름: `krri-track-roadbed` (또는 임의)
4. Google Analytics: 사용 안함 권장 (불필요)
5. 생성 완료 (1~2분 소요)

> 박사님은 이 단계를 이미 완료하셨음. 프로젝트 ID: `krri-track-roadbed`

---

## 2. Firestore 활성화

1. 좌측 메뉴 → **Firestore Database** → **데이터베이스 만들기**
2. 모드: **프로덕션 모드**
3. 위치: **asia-northeast3 (Seoul)**

> 박사님은 이미 활성화하셨음.

### 보안 규칙 적용

규칙 탭으로 이동 → 아래 내용 붙여넣기 → **게시**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && request.auth.uid in get(/databases/$(database)/documents/config/admins).data.uids;
    }
    match /{document=**} { allow read: if request.auth != null; }
    match /rounds/{roundId}/submissions/{authorId} {
      allow write: if request.auth != null;
    }
    match /config/{doc}      { allow write: if isAdmin(); }
    match /rounds/{roundId}  { allow write: if isAdmin(); }
  }
}
```

---

## 3. Authentication 활성화

1. 좌측 메뉴 → **Authentication** → **시작하기**
2. Sign-in method 탭 → **익명** 사용 설정
3. 같은 탭 → **Google** 사용 설정 (지원 이메일: 본인 이메일 — `koochulji@gmail.com`)

> 박사님은 이미 둘 다 활성화하셨음.

---

## 4. 웹앱 등록 + config 받기

1. 좌측 톱니 (⚙️) → **프로젝트 설정**
2. 하단 "내 앱" → 웹 아이콘 (`</>`) 클릭
3. 앱 닉네임: `krri-track-roadbed-web`
4. **Firebase 호스팅도 설정** 체크 해제 (우리는 GitHub Pages 사용)
5. **앱 등록**
6. 표시되는 `firebaseConfig = { ... }` 객체 통째로 복사 (Ctrl+C)

> 박사님은 이미 받으셨고, `firebase-config-임시.txt`에 보관 중.

---

## 5. firebase-config.js에 붙여넣기

`assets/js/firebase-config.js` 열고:

**Before (placeholder):**
```javascript
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

**After (박사님의 실제 값으로 교체):**
```javascript
export const firebaseConfig = {
  apiKey: "AIzaSyCTmF4N6gSc7yEncIirF1jGtnPC0TGWpBI",
  authDomain: "krri-track-roadbed.firebaseapp.com",
  projectId: "krri-track-roadbed",
  storageBucket: "krri-track-roadbed.firebasestorage.app",
  messagingSenderId: "512158435622",
  appId: "1:512158435622:web:40f585999c4317665899e7"
};
```

> `measurementId`는 빼도 됩니다 (Analytics 사용 안 함).

저장 (Ctrl+S).

---

## 6. admins 문서 초기화

1. Firestore → 컬렉션 시작 → 컬렉션 ID `config`
2. 문서 ID `admins`
3. 필드: `uids` (type: **array**) → 일단 빈 배열 `[]`
4. 저장

---

## 7. GitHub 레포 생성 + push

1. https://github.com/koochulji 에서 새 레포 만들기
   - 레포 이름: `track-roadbed-report`
   - Public (Pages 무료)
   - README/license/gitignore는 추가하지 마세요 (이미 있음)

2. 로컬에서:
   ```bash
   cd "D:/Dropbox/1.KRRI/주간보고_시스템/src"
   git remote add origin https://github.com/koochulji/track-roadbed-report.git
   git branch -M main
   git push -u origin main
   ```

3. GitHub에 코드 올라온 것 확인.

---

## 8. GitHub Pages 활성화

1. 레포 페이지 → Settings → Pages (좌측 메뉴)
2. Source: **Deploy from a branch**
3. Branch: **main** / **(root)**
4. Save
5. 1~2분 후 `https://koochulji.github.io/track-roadbed-report/` 접속 가능

---

## 9. 본인(첫 관리자) 등록

1. `https://koochulji.github.io/track-roadbed-report/admin.html` 접속
2. **Google로 로그인** (본인 계정)
3. "관리자 미등록" 에러 → 에러 메시지에 표시된 본인 UID 복사
4. Firebase Console → Firestore → `config/admins` 문서 → `uids` 배열에 본인 UID 추가
5. admin.html 새로고침 → 진입 성공

---

## 10. 첫 회차 만들어 테스트

1. admin 페이지 진입 → 시드 버튼 (작성자/카테고리) 클릭 → 기본값 등록
   - 작성자 10명 + 과제 17개 자동 등록됨
2. "새 회차 만들기" 섹션:
   - 양식: **주간**
   - 회의일: 다음 회의일 (예: 2026-05-04)
   - "회차 확정" 클릭
3. 새 탭에서 `https://koochulji.github.io/track-roadbed-report/index.html` 열기
4. 작성자 드롭다운에서 본인(지구철 선임) 선택
5. 과제 추가 → 활동 항목 입력 → "주요" 체크 → 임시저장
6. admin 페이지 돌아가서 HWPX 다운로드
7. 한글에서 열어 정상 표시 확인

---

## 11. 나머지 5명 관리자 추가

각 관리자(5명)에게 admin.html URL 공유 → 각자:
1. Google 로그인 시도 → "관리자 미등록" 에러 → UID 받음
2. 박사님께 UID 전달

박사님이 한꺼번에:
- Firebase Console → Firestore → `config/admins` → `uids` 배열에 5명 UID 추가

---

## 트러블슈팅

### "Firebase 인증 응답이 10초 내에 오지 않았습니다"
→ 사내 방화벽이 `gstatic.com`을 차단할 수 있음. 시크릿/비공식 모드로 시도.

### HWPX 다운로드 실패
→ F12 콘솔 에러 확인. JSZip 라이브러리 (CDN) 로드 실패 가능성. `cdn.jsdelivr.net` 차단 여부 확인.

### "관리자 미등록" 계속 뜸
→ UID가 정확히 복사됐는지, `config/admins` 문서의 `uids` 필드 타입이 `array`인지(string 아님!), 권한 규칙이 적용되었는지 확인.

### 작성자 드롭다운이 비어 있음
→ admin 페이지에서 시드 버튼 (작성자) 클릭 안 했거나, Firestore에 `config/authors` 문서가 없음.

---

## 운영 흐름 (1주 사이클)

```
[월요일 오전]   관리자 → 새 회차 생성 (이전 회차 자동 아카이브)
[월~목]        작성자 → 매일 본인 항목 입력 (자동저장)
[목요일 오후]   작성자 → 최종 제출
[금요일 오전]   관리자 → HWPX 다운로드 → 한글에서 실장활동사항 수동 추가
[금요일 회의]   회의 사용
[다음 월요일]   새 회차 생성 (반복)
```

---

## Phase 2 예정 기능 (현재 미포함)

- 실장 활동사항 자동 입력 (현재는 한글에서 수동 추가)
- 미제출자 자동 알림 (Cloud Functions)
- 본부 단위 통합 보고 (3개 실 합본)
