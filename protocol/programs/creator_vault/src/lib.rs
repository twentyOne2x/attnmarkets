use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("CreAtor111111111111111111111111111111111111");

#[program]
pub mod creator_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>, splitter_program: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.creator_vault;
        let bumps = &ctx.bumps;
        vault.bump = bumps.creator_vault;
        vault.fee_vault_bump = bumps.fee_vault;
        vault.sy_mint_bump = bumps.sy_mint;
        vault.authority = ctx.accounts.authority.key();
        vault.pump_creator = ctx.accounts.pump_creator.key();
        vault.pump_mint = ctx.accounts.pump_mint.key();
        vault.quote_mint = ctx.accounts.quote_mint.key();
        vault.sy_mint = ctx.accounts.sy_mint.key();
        vault.splitter_program = splitter_program;
        vault.total_fees_collected = 0;
        vault.total_sy_minted = 0;
        emit!(VaultInitialized {
            pump_mint: vault.pump_mint,
            quote_mint: vault.quote_mint,
            sy_mint: vault.sy_mint,
        });
        Ok(())
    }

    pub fn wrap_fees(ctx: Context<WrapFees>, amount: u64) -> Result<()> {
        require!(amount > 0, AttnError::InvalidAmount);

        let transfer_accounts = Transfer {
            from: ctx.accounts.user_quote_ata.to_account_info(),
            to: ctx.accounts.fee_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
        );
        token::transfer(cpi_ctx, amount)?;

        {
            let vault = &mut ctx.accounts.creator_vault;
            vault.total_fees_collected = vault
                .total_fees_collected
                .checked_add(amount)
                .ok_or(AttnError::MathOverflow)?;
        }

        let pump_mint_key = ctx.accounts.pump_mint.key();
        let bump = ctx.accounts.creator_vault.bump;
        let seeds: [&[u8]; 3] = [b"creator-vault", pump_mint_key.as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];
        let mint_accounts = MintTo {
            mint: ctx.accounts.sy_mint.to_account_info(),
            to: ctx.accounts.user_sy_ata.to_account_info(),
            authority: ctx.accounts.creator_vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            mint_accounts,
            signer_seeds,
        );
        token::mint_to(cpi_ctx, amount)?;

        {
            let vault = &mut ctx.accounts.creator_vault;
            vault.total_sy_minted = vault
                .total_sy_minted
                .checked_add(amount)
                .ok_or(AttnError::MathOverflow)?;
        }

        emit!(SyMinted {
            user: ctx.accounts.user.key(),
            pump_mint: ctx.accounts.pump_mint.key(),
            amount,
        });

        Ok(())
    }

    pub fn mint_for_splitter(ctx: Context<MintForSplitter>, amount: u64) -> Result<()> {
        require!(amount > 0, AttnError::InvalidAmount);

        let vault = &ctx.accounts.creator_vault;
        require!(
            vault.splitter_program != Pubkey::default(),
            AttnError::SplitterProgramUnset
        );

        msg!(
            "mint_for_splitter: vault={}, amount={}, authority={}",
            vault.key(),
            amount,
            ctx.accounts.splitter_authority.key()
        );

        let expected_authority = Pubkey::find_program_address(
            &[b"splitter-authority", vault.key().as_ref()],
            &vault.splitter_program,
        )
        .0;
        require_keys_eq!(
            expected_authority,
            ctx.accounts.splitter_authority.key(),
            AttnError::UnauthorizedSplitter
        );
        msg!("splitter authority match verified");

        let vault_bump = [vault.bump];
        let seeds: [&[u8]; 3] = [b"creator-vault", vault.pump_mint.as_ref(), &vault_bump];
        let signer_seeds = &[&seeds[..]];
        let mint_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.creator_vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            mint_accounts,
            signer_seeds,
        );
        msg!("mint_for_splitter: invoking mint_to");
        token::mint_to(cpi_ctx, amount)?;
        msg!("mint_for_splitter: completed");

        Ok(())
    }

    pub fn transfer_fees_for_splitter(
        ctx: Context<TransferFeesForSplitter>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, AttnError::InvalidAmount);

        let vault = &ctx.accounts.creator_vault;
        require!(
            vault.splitter_program != Pubkey::default(),
            AttnError::SplitterProgramUnset
        );

        let expected_authority = Pubkey::find_program_address(
            &[b"splitter-authority", vault.key().as_ref()],
            &vault.splitter_program,
        )
        .0;
        require_keys_eq!(
            expected_authority,
            ctx.accounts.splitter_authority.key(),
            AttnError::UnauthorizedSplitter
        );

        let (expected_fee_vault, _) =
            Pubkey::find_program_address(&[b"fee-vault", vault.pump_mint.as_ref()], &crate::ID);
        require_keys_eq!(
            expected_fee_vault,
            ctx.accounts.fee_vault.key(),
            AttnError::InvalidFeeVault
        );

        let vault_bump = [vault.bump];
        let seeds: [&[u8]; 3] = [b"creator-vault", vault.pump_mint.as_ref(), &vault_bump];
        let signer_seeds = &[&seeds[..]];
        let transfer_accounts = Transfer {
            from: ctx.accounts.fee_vault.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.creator_vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Pump.fun creator PDA forwarded via CTO
    pub pump_creator: UncheckedAccount<'info>,
    pub pump_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + CreatorVault::INIT_SPACE,
        seeds = [b"creator-vault", pump_mint.key().as_ref()],
        bump
    )]
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(
        init,
        payer = authority,
        token::mint = quote_mint,
        token::authority = creator_vault,
        seeds = [b"fee-vault", pump_mint.key().as_ref()],
        bump
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = authority,
        mint::decimals = quote_mint.decimals,
        mint::authority = creator_vault,
        seeds = [b"sy-mint", pump_mint.key().as_ref()],
        bump
    )]
    pub sy_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct WrapFees<'info> {
    #[account(mut, has_one = quote_mint, has_one = sy_mint, has_one = pump_mint)]
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub pump_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"fee-vault", pump_mint.key().as_ref()],
        bump = creator_vault.fee_vault_bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_quote_ata.mint == quote_mint.key(), constraint = user_quote_ata.owner == user.key())]
    pub user_quote_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"sy-mint", pump_mint.key().as_ref()],
        bump = creator_vault.sy_mint_bump
    )]
    pub sy_mint: Account<'info, Mint>,
    #[account(mut, constraint = user_sy_ata.mint == sy_mint.key(), constraint = user_sy_ata.owner == user.key())]
    pub user_sy_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MintForSplitter<'info> {
    #[account(mut)]
    pub creator_vault: Account<'info, CreatorVault>,
    /// CHECK: PDA owned by splitter program, validated in handler
    pub splitter_authority: Signer<'info>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferFeesForSplitter<'info> {
    #[account(mut)]
    pub creator_vault: Account<'info, CreatorVault>,
    /// CHECK: PDA owned by splitter program, validated in handler
    pub splitter_authority: Signer<'info>,
    #[account(mut)]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct CreatorVault {
    pub bump: u8,
    pub fee_vault_bump: u8,
    pub sy_mint_bump: u8,
    pub authority: Pubkey,
    pub pump_creator: Pubkey,
    pub pump_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub sy_mint: Pubkey,
    pub splitter_program: Pubkey,
    pub total_fees_collected: u64,
    pub total_sy_minted: u64,
}

impl CreatorVault {
    pub const INIT_SPACE: usize = 1 + 1 + 1 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8;
}

#[event]
pub struct VaultInitialized {
    pub pump_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub sy_mint: Pubkey,
}

#[event]
pub struct SyMinted {
    pub user: Pubkey,
    pub pump_mint: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum AttnError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Splitter program not registered")]
    SplitterProgramUnset,
    #[msg("Unauthorized splitter authority")]
    UnauthorizedSplitter,
    #[msg("Fee vault address mismatch")]
    InvalidFeeVault,
}
