# SG 한팀장 — 사내 전용 서버

로그인한 임직원만 앱을 열 수 있게 하고, 업무일지·대화·퀴즈 기록을 계정에 저장한다.
퇴사자는 관리자가 계정을 끄면 즉시 차단된다.

## Railway 배포 순서

1. **새 프로젝트 생성** — railway.app → New Project → Deploy from GitHub repo → `sg-crop-protection-app` 선택
   > ⚠️ 기존 hr-eval-system과 **반드시 별개 프로젝트**로 만들 것.
   > 같은 DB를 쓰면 그쪽 배포가 여기 테이블을 지울 수 있다.

2. **Root Directory 지정** — Settings → Root Directory 에 `server` 입력
   (저장소 최상위가 아니라 이 폴더가 서버다)

3. **데이터베이스 추가** — 프로젝트 화면에서 New → Database → PostgreSQL
   `DATABASE_URL` 은 Railway가 자동으로 넣어준다.

4. **환경변수 설정** — 서비스 → Variables 에 추가

   | 이름 | 값 | 설명 |
   |---|---|---|
   | `ADMIN_EMP_NO` | 예: `admin` | 최초 관리자 사번 |
   | `ADMIN_PASSWORD` | 임시 비밀번호 | 첫 로그인 후 반드시 변경 |
   | `NODE_ENV` | `production` | 쿠키 보안 활성화 |

   최초 관리자 계정은 **DB가 비어있을 때 한 번만** 만들어진다.
   계정이 하나라도 있으면 이 값들은 무시된다.

5. **도메인 발급** — Settings → Networking → Generate Domain

## 운영

- **계정 발급** — 로그인 → 사이드바 ⚙️ 관리자 설정 → 사번·이름·초기 비밀번호 입력
- **퇴사 처리** — 같은 화면에서 해당 직원 **사용중지**. 로그인 세션이 즉시 끊긴다.
- **비밀번호 분실** — **비번초기화** 버튼으로 임시 비밀번호 발급

## 앱 갱신

저장소 최상위에서 빌드하고 푸시하면 Railway가 자동 재배포한다.

```bash
node build_v2.js && git add -A && git commit -m "업데이트" && git push
```

`build_v2.js` 가 `server/public/index.html` 을 갱신한다.

## 구조

```
server.js   라우팅 · 인증 · 기록 동기화 · 관리자 API
db.js       PostgreSQL 연결과 스키마 (있으면 건드리지 않음)
auth.js     scrypt 비밀번호 해싱, 세션 관리
public/
  login.html  로그인 화면
  index.html  앱 본체 (build_v2.js 가 생성)
```

## 참고

앱은 서버가 있으면 실계정 모드로, 없으면(아티팩트·파일 직접 열기) 기존
인증코드 + 이름 방식으로 동작한다. 한 코드가 두 환경을 모두 지원한다.
