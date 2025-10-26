alter table squads_safe_requests
    add column status_url text,
    add column status_last_checked_at timestamptz,
    add column status_last_response jsonb,
    add column status_last_response_hash text,
    add column status_sync_error text;

create index if not exists squads_safe_requests_status_poll_idx
    on squads_safe_requests (next_retry_at)
    where status = 'submitted' and status_url is not null;
