use anchor_lang::prelude::*;

declare_id!("CreAtor111111111111111111111111111111111111");

#[program]
pub mod creator_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.creator_vault;
        vault.bump = *ctx.bumps.get("creator_vault").unwrap();
        vault.authority = ctx.accounts.authority.key();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + CreatorVault::INIT_SPACE,
        seeds = [b"creator-vault", authority.key().as_ref()],
        bump
    )]
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct CreatorVault {
    pub bump: u8,
    pub authority: Pubkey,
}
