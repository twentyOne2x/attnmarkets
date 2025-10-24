create table if not exists rewards_pools(
  rewards_pool text primary key,
  creator_vault text not null,
  reward_bps integer not null default 0,
  total_staked_attnusd numeric not null default 0,
  sol_per_share numeric not null default 0,
  pending_rewards_lamports numeric not null default 0,
  total_rewards_lamports numeric not null default 0,
  admin text not null default '',
  allowed_funder text not null default '',
  treasury_balance_lamports numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists rewards_positions(
  pool text not null references rewards_pools(rewards_pool),
  wallet text not null,
  staked_amount_attnusd numeric not null default 0,
  reward_debt numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key(pool, wallet)
);
