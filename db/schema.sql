create table if not exists applications (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  status text not null default 'new',
  name text not null,
  organization text,
  email text not null,
  phone text,
  service_type text not null,
  preferred_contact text not null default 'email',
  message text not null,
  consent boolean not null default true,
  source text not null default 'landing',
  owner_email_subject text not null,
  owner_email_body text not null,
  customer_email_subject text not null,
  customer_email_body text not null,
  notification_status text not null default 'not_configured',
  notification_sent_at timestamptz,
  notification_error text,
  ip_hash text,
  user_agent text
);

create index if not exists applications_created_at_idx
  on applications (created_at desc);

create index if not exists applications_status_idx
  on applications (status);

create index if not exists applications_service_type_idx
  on applications (service_type);
