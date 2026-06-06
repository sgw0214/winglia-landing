# Winglia Landing

Winglia 업무 의뢰 랜딩 페이지입니다. 신청 폼은 Vercel Serverless Function을 통해 PostgreSQL에 저장됩니다.

## 배포 구조

- 정적 페이지: `index.html`, `styles.css`, `script.js`
- 신청 API: `api/apply.js`
- 관리자 화면: `admin/index.html`
- 관리자 API: `api/admin/*`
- DB 스키마: `db/schema.sql`
- DB 연결: `DATABASE_URL`
- 관리자 인증: `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`

## Vercel Postgres 설정

신규 Vercel 프로젝트에서는 예전 Vercel Postgres 대신 Marketplace Postgres 연동을 사용합니다. 권장 흐름은 다음과 같습니다.

1. Vercel에서 `winglia-landing` 프로젝트를 GitHub repo와 연결합니다.
2. Storage 또는 Marketplace에서 Neon Postgres를 추가합니다.
3. 생성한 Neon database를 `winglia-landing` 프로젝트에 연결합니다.
4. Vercel 프로젝트 환경변수에 `DATABASE_URL`이 들어왔는지 확인합니다.
5. 배포 후 신청 폼을 테스트합니다.

API는 최초 신청 시 `applications` 테이블과 인덱스를 자동 생성합니다. 수동 생성이 필요하면 `db/schema.sql`을 실행하면 됩니다.

## 관리자 모드

신청 내용은 DB에 저장되고 `/admin`에서 확인합니다. 관리자 화면에서는 접수 목록, 상태, 처리 메모, 다음 액션을 관리할 수 있습니다.

```env
ADMIN_SESSION_SECRET="랜덤 문자열"
ADMIN_PASSWORD_HASH="scrypt:SALT_HEX:HASH_HEX"
```

비밀번호 해시는 `api/_lib/auth.js`의 `hashPassword()`와 같은 `scrypt` 형식입니다. 운영 환경에서는 평문 `ADMIN_PASSWORD` 대신 `ADMIN_PASSWORD_HASH` 사용을 권장합니다.

## 내보내기

관리자 로그인 후 `/api/admin/export`에서 CSV를 내려받을 수 있습니다. Excel에서는 CSV를 열어 신청대장처럼 사용할 수 있습니다.
