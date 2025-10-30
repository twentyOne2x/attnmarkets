alter table creator_vaults
    add column if not exists authority text;

update creator_vaults
set authority = vault_pubkey
where authority is null or authority = '';

alter table creator_vaults
    alter column authority set not null;

alter table creator_vaults
    add column if not exists advance_enabled boolean not null default false;
