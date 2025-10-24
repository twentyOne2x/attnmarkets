alter table creator_vaults
    add column if not exists admin text not null default '',
    add column if not exists sol_rewards_bps integer not null default 0,
    add column if not exists paused boolean not null default false,
    add column if not exists sy_mint text not null default '';

alter table rewards_pools
    add column if not exists paused boolean not null default false;

create table if not exists stable_vaults(
  stable_vault text primary key,
  authority_seed text not null,
  admin text not null,
  keeper_authority text not null,
  share_mint text not null,
  stable_mint text not null,
  pending_sol_lamports numeric not null default 0,
  updated_at timestamptz not null default now()
);
