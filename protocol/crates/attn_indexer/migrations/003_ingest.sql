create table if not exists ingest_checkpoints(
  program text primary key,
  last_slot bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists rewards_positions_wallet_idx on rewards_positions(wallet);
create index if not exists rewards_positions_pool_idx on rewards_positions(pool);
create index if not exists events_slot_idx on events(slot);
