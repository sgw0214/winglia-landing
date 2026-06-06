const { Pool } = require("pg");

const SERVICE_LABELS = {
  lead_response: "리드·문의 응답 관리",
  sheets_ops: "Excel·Google Sheets 업무 정리",
  settlement_audit: "정산·데이터 예외 점검",
  document_expiry: "증빙·문서 만료 관리",
  automation_monitoring: "자동화 모니터링",
  undecided: "상담 후 결정",
};

const STATUS_LABELS = {
  new: "신규",
  reviewing: "검토 중",
  contacted: "연락 완료",
  in_progress: "진행 중",
  done: "완료",
  rejected: "보류",
};

let pool;
let schemaReady;

function getPool() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    const usesLocalDatabase = /localhost|127\.0\.0\.1/.test(connectionString);
    pool = new Pool({
      connectionString,
      max: 1,
      ssl: usesLocalDatabase ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}

async function ensureSchema(client) {
  if (schemaReady) return;

  await client.query(`
    create table if not exists applications (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      status text not null default 'new',
      name text not null,
      organization text,
      email text not null,
      phone text,
      service_type text not null,
      preferred_contact text not null default 'email',
      message text not null,
      admin_note text not null default '',
      next_action text not null default '',
      consent boolean not null default true,
      source text not null default 'landing',
      owner_email_subject text not null,
      owner_email_body text not null,
      customer_email_subject text not null,
      customer_email_body text not null,
      notification_status text not null default 'admin_queue',
      notification_sent_at timestamptz,
      notification_error text,
      ip_hash text,
      user_agent text
    )
  `);

  await client.query(`
    create table if not exists admin_settings (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    )
  `);

  await client.query("alter table applications add column if not exists updated_at timestamptz not null default now()");
  await client.query("alter table applications add column if not exists admin_note text not null default ''");
  await client.query("alter table applications add column if not exists next_action text not null default ''");
  await client.query("alter table applications alter column notification_status set default 'admin_queue'");

  await client.query("create index if not exists applications_created_at_idx on applications (created_at desc)");
  await client.query("create index if not exists applications_status_idx on applications (status)");
  await client.query("create index if not exists applications_service_type_idx on applications (service_type)");

  schemaReady = true;
}

async function withClient(callback) {
  const client = await getPool().connect();
  try {
    await ensureSchema(client);
    return await callback(client);
  } finally {
    client.release();
  }
}

module.exports = {
  SERVICE_LABELS,
  STATUS_LABELS,
  ensureSchema,
  getPool,
  withClient,
};
