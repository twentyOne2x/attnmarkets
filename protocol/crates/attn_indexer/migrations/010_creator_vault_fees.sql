alter table creator_vaults
    add column if not exists total_fees_lamports numeric not null default 0;

update creator_vaults
set total_fees_lamports = 0
where total_fees_lamports is null;
