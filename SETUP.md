# 월간 원장보고 시스템 — 셋업 가이드

박사님이 코드 받은 후 따라할 단계별 절차. 총 30~60분.

## 0. 준비물
- Google 계정 (Firebase + GitHub)
- GitHub 계정 (`koochulji`)
- Git 설치된 터미널

## 1. Firebase 프로젝트 생성
1. https://console.firebase.google.com → "프로젝트 추가"
2. 이름: `krri-roadbed-monthly`
3. Google Analytics: 사용 안 함
4. 1~2분 대기

## 2. Firestore 활성화
1. 좌측 메뉴 → Firestore Database → 데이터베이스 만들기
2. 모드: 프로덕션
3. 위치: **asia-northeast3 (Seoul)**

### 보안 규칙 적용
규칙 탭 → 아래 붙여넣기 → 게시:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && request.auth.uid in get(/databases/$(database)/documents/config/admins).data.uids;
    }
    match /{document=**} { allow read: if request.auth != null; }
    match /config/projects { allow write: if request.auth != null; }
    match /config/{doc} { allow write: if isAdmin(); }
    match /rounds/{roundId} { allow write: if request.auth != null; }
    match /rounds/{roundId}/submissions/{projectId} { allow write: if request.auth != null; }
  }
}
```

## 3. Authentication 활성화
1. 좌측 메뉴 → Authentication → 시작하기
2. Sign-in method 탭 → **익명** 사용 설정
3. 같은 탭 → **Google** 사용 설정 (지원 이메일: 본인 이메일)

## 4. (생략) Storage 활성화 — 사용 안 함

이미지 첨부는 **Firestore 안에 base64 로 inline 저장** 방식이라 Firebase Storage 활성화가 필요 없습니다. Spark (무료) 플랜으로 충분.

⚠️ 단, 이 방식은 **이미지 1장당 700KB 이하**만 가능합니다 (Firestore 1MB 문서 한도 안). 큰 사진은 PC에서 압축 후 업로드하세요.

> 추후 Storage 가 필요해지면 Blaze 요금제로 업그레이드 후 별도 작업.

## 5. 웹앱 등록 + config 받기
1. ⚙️ → 프로젝트 설정 → 내 앱 → `</>` (웹) 클릭
2. 닉네임: `krri-roadbed-monthly-web`
3. Firebase 호스팅 체크 해제
4. firebaseConfig 객체 통째로 복사

## 6. firebase-config.js 채우기
`assets/js/firebase-config.js` 의 `YOUR_*` 값들을 실제 값으로 교체. 저장.

## 7. admins 문서 만들기
1. Firestore → 컬렉션 시작 → ID `config`
2. 문서 ID `admins`
3. 필드 `uids` (type: **array**) — 빈 배열로 시작
4. 저장

## 8. GitHub 레포 생성 + push
1. https://github.com/new
2. Name: `krri-roadbed-monthly`, Public, README/license 추가 X
3. 로컬에서:
```bash
cd "D:/Dropbox/1.KRRI/월간_원장보고_시스템/src"
git remote add origin https://github.com/koochulji/krri-roadbed-monthly.git
git branch -M main
git push -u origin main
```

## 9. GitHub Pages 활성화
1. 레포 Settings → Pages
2. Source: Deploy from a branch / Branch: main / (root)
3. 1~2분 후 `https://koochulji.github.io/krri-roadbed-monthly/` 접속

## 10. 본인 admin 등록
1. `https://koochulji.github.io/krri-roadbed-monthly/admin.html`
2. Google 로그인 → "관리자 미등록" 에러 → UID 복사
3. Firestore → config/admins → uids 배열에 UID 추가
4. admin.html 새로고침 → 진입 성공

## 11. 첫 회차 만들어 테스트
1. admin → 책임자 명단 / 과제 관리 탭에서 시드 버튼 클릭
2. 현재 회차 탭 → 새 회차: 년/월 선택 → 확정
3. 다른 탭에서 index.html → 본인 과제 선택 → 입력 테스트
4. admin 으로 돌아가 HWPX 출력 → 한글에서 확인

## 12. 다른 책임자/관리자 추가
- 작성자 (책임자): admin → 책임자 명단 탭 → 추가
- 추가 관리자: 그 분이 admin.html 접속 → UID 받음 → 박사님이 admins/uids 에 추가

## 트러블슈팅

### "Firebase 인증 응답이 10초 내에 오지 않았습니다"
사내 방화벽이 `gstatic.com` 차단? 시크릿 창으로 시도.

### 이미지 업로드 실패
Storage 활성화 + 보안 규칙 적용 확인.

### HWPX 다운로드 실패
F12 콘솔 → JSZip 또는 Storage fetch 에러 확인.

## 운영 흐름 (월 사이클)

| 시점 | 담당 | 작업 |
|------|------|------|
| 월 1주 | 관리자 | 새 회차 생성 (전월 자동 아카이브) |
| 월 2주 | 책임자 | 본인 과제 입력 (이번 달 수행 + 다음 달 계획 + 현안 + 성과) |
| 월 3주 | 책임자 | 최종 제출 |
| 월 3~4주 | 실장 (관리자) | 검수 + 필요시 수정 + 승인 |
| 월 마지막주 | 관리자 | HWPX 다운로드 → 원장 제출 |
| 다음 달 | 회차 종료 → 새 회차 (반복) |
