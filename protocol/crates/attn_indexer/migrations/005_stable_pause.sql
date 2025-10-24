alter table stable_vaults
    add column if not exists paused boolean not null default false,
    add column if not exists last_sweep_id numeric not null default 0,
    add column if not exists last_conversion_id numeric not null default 0;
