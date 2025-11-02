alter table squads_safe_requests
    add column import_source text not null default 'attn-api',
    add column import_metadata jsonb,
    add column imported_at timestamptz;

update squads_safe_requests
   set import_source = coalesce(import_source, 'attn-api');
