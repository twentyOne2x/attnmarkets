create table if not exists creator_vaults(
  pump_mint text primary key,
  vault_pubkey text not null,
  total_fees_lamports numeric not null default 0,
  total_sy numeric not null default 0,
  last_slot bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists markets(
  market_pubkey text primary key,
  pump_mint text not null references creator_vaults(pump_mint),
  maturity_ts bigint not null,
  pt_mint text not null,
  yt_mint text not null,
  fee_index numeric not null default 0,
  pt_supply numeric not null default 0,
  yt_supply numeric not null default 0,
  created_slot bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists user_positions(
  wallet text not null,
  market_pubkey text not null references markets(market_pubkey),
  pt_balance numeric not null default 0,
  yt_balance numeric not null default 0,
  last_index numeric not null default 0,
  accrued_yield numeric not null default 0,
  primary key(wallet, market_pubkey)
);

create table if not exists attnusd_stats(
  id boolean primary key default true,
  total_supply numeric not null default 0,
  share_index numeric not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists events(
  sig text primary key,
  slot bigint not null,
  program text not null,
  kind text not null,
  payload jsonb not null,
  ts timestamptz not null default now()
);
