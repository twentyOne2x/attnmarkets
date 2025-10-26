create type squads_safe_status as enum ('pending', 'submitted', 'ready', 'failed');

create table squads_safe_requests (
    id uuid primary key,
    idempotency_key text,
    creator_wallet text not null,
    attn_wallet text not null,
    cluster text not null,
    threshold smallint not null,
    safe_name text,
    contact_email text,
    note text,
    status squads_safe_status not null,
    safe_address text,
    transaction_url text,
    members jsonb not null,
    raw_response jsonb,
    raw_response_hash text,
    request_payload jsonb not null,
    requester_api_key text,
    requester_wallet text not null,
    requester_ip inet,
    creator_signature text not null,
    nonce text not null,
    error_code text,
    error_message text,
    upstream_response_hash text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index squads_safe_requests_idempotency_idx
    on squads_safe_requests (idempotency_key)
    where idempotency_key is not null;

create unique index squads_safe_requests_uniqueness_idx
    on squads_safe_requests (lower(creator_wallet), lower(attn_wallet), cluster);

create table squads_safe_nonces (
    wallet text primary key,
    nonce text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index squads_safe_nonces_expires_at_idx
    on squads_safe_nonces (expires_at);
