alter table creator_vaults
    add column if not exists authority text not null default '';

update creator_vaults
set authority = vault_pubkey
where authority = '';

alter table creator_vaults
    alter column authority drop default;
