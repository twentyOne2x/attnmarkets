alter table squads_safe_requests
    add column attempt_count integer not null default 1,
    add column last_attempt_at timestamptz not null default now(),
    add column next_retry_at timestamptz,
    add column creator_vault text,
    add column governance_creator_signature text,
    add column governance_attn_signature text,
    add column governance_linked_at timestamptz;

update squads_safe_requests
   set next_retry_at = case
         when status in ('pending', 'submitted', 'failed') then now() + interval '2 minutes'
         else null
       end;
