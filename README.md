# Winglia Landing

Winglia 업무 의뢰 랜딩 페이지입니다. 신청 폼은 Vercel Serverless Function을 통해 PostgreSQL에 저장됩니다.

## 배포 구조

- 정적 페이지: `index.html`, `styles.css`, `script.js`
- 신청 API: `api/apply.js`
- DB 스키마: `db/schema.sql`
- DB 연결: `DATABASE_URL`
- 선택 메일 발송: `RESEND_API_KEY`, `MAIL_FROM`, `OWNER_EMAIL`

## Vercel Postgres 설정

신규 Vercel 프로젝트에서는 예전 Vercel Postgres 대신 Marketplace Postgres 연동을 사용합니다. 권장 흐름은 다음과 같습니다.

1. Vercel에서 `winglia-landing` 프로젝트를 GitHub repo와 연결합니다.
2. Storage 또는 Marketplace에서 Neon Postgres를 추가합니다.
3. 생성한 Neon database를 `winglia-landing` 프로젝트에 연결합니다.
4. Vercel 프로젝트 환경변수에 `DATABASE_URL`이 들어왔는지 확인합니다.
5. 배포 후 신청 폼을 테스트합니다.

API는 최초 신청 시 `applications` 테이블과 인덱스를 자동 생성합니다. 수동 생성이 필요하면 `db/schema.sql`을 실행하면 됩니다.

## 메일 알림

신청 내용은 DB에 항상 저장됩니다. 아래 환경변수가 있으면 운영자에게 접수 알림 메일도 발송합니다.

```env
OWNER_EMAIL="you@example.com"
MAIL_FROM="Winglia <hello@your-domain.com>"
RESEND_API_KEY="re_..."
```

`MAIL_FROM`은 Resend에서 인증된 도메인 주소를 사용하는 것이 좋습니다.
