use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("HPjEgPTb7rrBks1oFrscBdJ7TCZ7bARzCT93X9azCK4b");

const TOTAL_BPS: u64 = 10_000;

#[program]
pub mod creator_vault {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        splitter_program: Pubkey,
        admin: Pubkey,
    ) -> Result<()> {
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
        require!(admin != Pubkey::default(), AttnError::InvalidAdmin);
        vault.admin = admin;
        vault.sol_rewards_bps = 0;
        vault.paused = false;
        vault.locked = false;
        vault.lock_expires_at = 0;
        vault.padding = [0; 1];
        emit!(VaultInitialized {
            creator_vault: vault.key(),
            pump_mint: vault.pump_mint,
            quote_mint: vault.quote_mint,
            sy_mint: vault.sy_mint,
            authority: ctx.accounts.authority.key(),
            admin,
        });
        Ok(())
    }

    pub fn wrap_fees(ctx: Context<WrapFees>, amount: u64) -> Result<()> {
        require!(amount > 0, AttnError::InvalidAmount);

        let vault = &mut ctx.accounts.creator_vault;
        vault.assert_not_paused()?;

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

        vault.total_fees_collected = vault
            .total_fees_collected
            .checked_add(amount)
            .ok_or(AttnError::MathOverflow)?;

        let pump_mint_key = ctx.accounts.pump_mint.key();
        let bump = vault.bump;
        let seeds: [&[u8]; 3] = [b"creator-vault", pump_mint_key.as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];
        let mint_accounts = MintTo {
            mint: ctx.accounts.sy_mint.to_account_info(),
            to: ctx.accounts.user_sy_ata.to_account_info(),
            authority: vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            mint_accounts,
            signer_seeds,
        );
        token::mint_to(cpi_ctx, amount)?;

        vault.total_sy_minted = vault
            .total_sy_minted
            .checked_add(amount)
            .ok_or(AttnError::MathOverflow)?;

        emit!(SyMinted {
            user: ctx.accounts.user.key(),
            pump_mint: ctx.accounts.pump_mint.key(),
            amount,
        });

        Ok(())
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        require!(amount > 0, AttnError::InvalidAmount);

        let vault = &mut ctx.accounts.creator_vault;
        vault.assert_not_paused()?;

        let now = Clock::get()?.unix_timestamp;
        let auto_unlocked = vault.refresh_lock(now);
        if auto_unlocked {
            emit!(VaultLockStatusChanged {
                creator_vault: vault.key(),
                locked: false,
                lock_expires_at: 0,
                is_auto: true,
            });
        }

        if vault.locked {
            vault.require_admin_signature(&ctx.accounts.admin)?;
        }

        require_keys_eq!(
            ctx.accounts.destination.owner,
            ctx.accounts.authority.key(),
            AttnError::InvalidWithdrawalDestination
        );
        require_keys_eq!(
            ctx.accounts.destination.mint,
            vault.quote_mint,
            AttnError::InvalidWithdrawalMint
        );
        require!(
            ctx.accounts.fee_vault.amount >= amount,
            AttnError::InsufficientVaultBalance
        );

        let vault_bump = [vault.bump];
        let seeds: [&[u8]; 3] = [b"creator-vault", vault.pump_mint.as_ref(), &vault_bump];
        let signer_seeds = &[&seeds[..]];
        let transfer_accounts = Transfer {
            from: ctx.accounts.fee_vault.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        emit!(FeesWithdrawn {
            creator_vault: vault.key(),
            authority: ctx.accounts.authority.key(),
            destination: ctx.accounts.destination.key(),
            amount,
            locked: vault.locked,
        });

        Ok(())
    }

    pub fn set_sweeper_delegate(
        ctx: Context<SetSweeperDelegate>,
        delegate: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        require!(delegate != Pubkey::default(), AttnError::InvalidSweeperDelegate);
        require!(
            fee_bps as u64 <= TOTAL_BPS,
            AttnError::InvalidSweeperFee
        );

        let sweeper = &mut ctx.accounts.sweeper;
        sweeper.bump = ctx.bumps.sweeper;
        sweeper.creator_vault = ctx.accounts.creator_vault.key();
        sweeper.delegate = delegate;
        sweeper.fee_bps = fee_bps;
        sweeper.last_sweep_ts = 0;

        emit!(SweeperDelegateUpdated {
            creator_vault: sweeper.creator_vault,
            delegate,
            fee_bps,
        });

        Ok(())
    }

    pub fn clear_sweeper_delegate(ctx: Context<ClearSweeperDelegate>) -> Result<()> {
        let creator_vault = ctx.accounts.creator_vault.key();
        emit!(SweeperDelegateCleared { creator_vault });
        Ok(())
    }

    pub fn delegate_sweep(ctx: Context<DelegateSweep>, amount: u64) -> Result<()> {
        require!(amount > 0, AttnError::InvalidAmount);

        let vault = &mut ctx.accounts.creator_vault;
        vault.assert_not_paused()?;

        let now = Clock::get()?.unix_timestamp;
        let auto_unlocked = vault.refresh_lock(now);
        if auto_unlocked {
            emit!(VaultLockStatusChanged {
                creator_vault: vault.key(),
                locked: false,
                lock_expires_at: 0,
                is_auto: true,
            });
        }

        require!(!vault.locked, AttnError::VaultLockedForDelegate);

        let sweeper = &mut ctx.accounts.sweeper;
        require_keys_eq!(
            sweeper.delegate,
            ctx.accounts.delegate.key(),
            AttnError::UnauthorizedSweeper
        );

        require!(
            ctx.accounts.fee_vault.amount >= amount,
            AttnError::InsufficientVaultBalance
        );

        require_keys_eq!(
            ctx.accounts.destination.owner,
            vault.authority,
            AttnError::InvalidWithdrawalDestination
        );
        require_keys_eq!(
            ctx.accounts.destination.mint,
            vault.quote_mint,
            AttnError::InvalidWithdrawalMint
        );

        let mut fee_amount = 0u64;
        if sweeper.fee_bps > 0 {
            let fee_destination = ctx
                .accounts
                .delegate_fee_destination
                .as_ref()
                .ok_or(AttnError::DelegateFeeDestinationRequired)?;
            require_keys_eq!(
                fee_destination.owner,
                sweeper.delegate,
                AttnError::InvalidDelegateFeeDestination
            );
            require_keys_eq!(
                fee_destination.mint,
                vault.quote_mint,
                AttnError::InvalidWithdrawalMint
            );
            fee_amount = ((amount as u128)
                .checked_mul(sweeper.fee_bps as u128)
                .ok_or(AttnError::MathOverflow)?
                / TOTAL_BPS as u128) as u64;
        }

        let creator_amount = amount
            .checked_sub(fee_amount)
            .ok_or(AttnError::MathOverflow)?;

        let vault_bump = [vault.bump];
        let seeds: [&[u8]; 3] = [b"creator-vault", vault.pump_mint.as_ref(), &vault_bump];
        let signer_seeds = &[&seeds[..]];

        if creator_amount > 0 {
            let transfer_accounts = Transfer {
                from: ctx.accounts.fee_vault.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: vault.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
                signer_seeds,
            );
            token::transfer(cpi_ctx, creator_amount)?;
        }

        if fee_amount > 0 {
            let fee_destination = ctx
                .accounts
                .delegate_fee_destination
                .as_ref()
                .ok_or(AttnError::DelegateFeeDestinationRequired)?;
            let transfer_accounts = Transfer {
                from: ctx.accounts.fee_vault.to_account_info(),
                to: fee_destination.to_account_info(),
                authority: vault.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
                signer_seeds,
            );
            token::transfer(cpi_ctx, fee_amount)?;
        }

        sweeper.last_sweep_ts = now;

        emit!(DelegatedFeesSwept {
            creator_vault: vault.key(),
            delegate: sweeper.delegate,
            destination: ctx.accounts.destination.key(),
            amount,
            fee_amount,
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
        vault.assert_not_paused()?;

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
        vault.assert_not_paused()?;

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

    pub fn set_rewards_split(ctx: Context<SetRewardsSplit>, sol_rewards_bps: u16) -> Result<()> {
        require!(sol_rewards_bps as u64 <= TOTAL_BPS, AttnError::InvalidBps);
        let vault = &mut ctx.accounts.creator_vault;
        vault.assert_admin(&ctx.accounts.admin.key())?;
        vault.sol_rewards_bps = sol_rewards_bps;
        emit!(RewardsSplitUpdated {
            creator_vault: vault.key(),
            sol_rewards_bps,
        });
        Ok(())
    }

    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        require!(new_admin != Pubkey::default(), AttnError::InvalidAdmin);
        let vault = &mut ctx.accounts.creator_vault;
        vault.assert_admin(&ctx.accounts.admin.key())?;
        let previous_admin = vault.admin;
        vault.admin = new_admin;
        emit!(AdminUpdated {
            creator_vault: vault.key(),
            previous_admin,
            new_admin,
        });
        Ok(())
    }

    pub fn set_pause(ctx: Context<SetPause>, paused: bool) -> Result<()> {
        let vault = &mut ctx.accounts.creator_vault;
        vault.assert_admin(&ctx.accounts.admin.key())?;
        vault.paused = paused;
        emit!(VaultPauseToggled {
            creator_vault: vault.key(),
            paused,
        });
        Ok(())
    }

    pub fn lock_collateral(
        ctx: Context<UpdateLockState>,
        lock_expires_at: Option<i64>,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.creator_vault;
        vault.assert_admin(&ctx.accounts.admin.key())?;

        let now = Clock::get()?.unix_timestamp;
        if let Some(expiry) = lock_expires_at {
            require!(expiry >= now, AttnError::InvalidLockExpiry);
            vault.lock_expires_at = expiry;
        } else {
            vault.lock_expires_at = 0;
        }
        vault.locked = true;

        emit!(VaultLockStatusChanged {
            creator_vault: vault.key(),
            locked: true,
            lock_expires_at: vault.lock_expires_at,
            is_auto: false,
        });

        Ok(())
    }

    pub fn unlock_collateral(ctx: Context<UpdateLockState>) -> Result<()> {
        let vault = &mut ctx.accounts.creator_vault;
        vault.assert_admin(&ctx.accounts.admin.key())?;

        let was_locked = vault.locked || vault.lock_expires_at != 0;
        vault.locked = false;
        vault.lock_expires_at = 0;

        if was_locked {
            emit!(VaultLockStatusChanged {
                creator_vault: vault.key(),
                locked: false,
                lock_expires_at: 0,
                is_auto: false,
            });
        }

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
pub struct WithdrawFees<'info> {
    #[account(mut, has_one = authority)]
    pub creator_vault: Account<'info, CreatorVault>,
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"fee-vault", creator_vault.pump_mint.as_ref()],
        bump = creator_vault.fee_vault_bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    /// CHECK: Must match creator_vault.admin; signature enforced in handler when locked
    #[account(address = creator_vault.admin)]
    pub admin: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SetSweeperDelegate<'info> {
    #[account(mut, has_one = authority)]
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + CreatorVaultSweeper::INIT_SPACE,
        seeds = [b"sweeper", creator_vault.key().as_ref()],
        bump
    )]
    pub sweeper: Account<'info, CreatorVaultSweeper>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClearSweeperDelegate<'info> {
    #[account(mut, has_one = authority)]
    pub creator_vault: Account<'info, CreatorVault>,
    pub authority: Signer<'info>,
    #[account(
        mut,
        close = authority,
        seeds = [b"sweeper", creator_vault.key().as_ref()],
        bump = sweeper.bump,
        has_one = creator_vault
    )]
    pub sweeper: Account<'info, CreatorVaultSweeper>,
}

#[derive(Accounts)]
pub struct DelegateSweep<'info> {
    #[account(mut)]
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(
        mut,
        seeds = [b"sweeper", creator_vault.key().as_ref()],
        bump = sweeper.bump,
        has_one = creator_vault,
        has_one = delegate
    )]
    pub sweeper: Account<'info, CreatorVaultSweeper>,
    pub delegate: Signer<'info>,
    #[account(
        mut,
        seeds = [b"fee-vault", creator_vault.pump_mint.as_ref()],
        bump = creator_vault.fee_vault_bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,
    #[account(mut)]
    pub delegate_fee_destination: Option<Account<'info, TokenAccount>>,
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

#[derive(Accounts)]
pub struct SetRewardsSplit<'info> {
    #[account(mut, has_one = admin)]
    pub creator_vault: Account<'info, CreatorVault>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    #[account(mut, has_one = admin)]
    pub creator_vault: Account<'info, CreatorVault>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetPause<'info> {
    #[account(mut, has_one = admin)]
    pub creator_vault: Account<'info, CreatorVault>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateLockState<'info> {
    #[account(mut, has_one = admin)]
    pub creator_vault: Account<'info, CreatorVault>,
    pub admin: Signer<'info>,
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
    pub admin: Pubkey,
    pub sol_rewards_bps: u16,
    pub paused: bool,
    pub locked: bool,
    pub lock_expires_at: i64,
    pub padding: [u8; 1],
}

impl CreatorVault {
    pub const INIT_SPACE: usize = 256;

    fn assert_admin(&self, signer: &Pubkey) -> Result<()> {
        require_keys_eq!(self.admin, *signer, AttnError::UnauthorizedAdmin);
        Ok(())
    }

    fn assert_not_paused(&self) -> Result<()> {
        require!(!self.paused, AttnError::VaultPaused);
        Ok(())
    }

    fn require_admin_signature(&self, admin: &AccountInfo<'_>) -> Result<()> {
        require_keys_eq!(self.admin, admin.key(), AttnError::UnauthorizedAdmin);
        require!(admin.is_signer, AttnError::AdminSignatureRequired);
        Ok(())
    }

    fn refresh_lock(&mut self, now: i64) -> bool {
        if self.locked && self.lock_expires_at > 0 && now >= self.lock_expires_at {
            self.locked = false;
            self.lock_expires_at = 0;
            return true;
        }
        false
    }
}

#[account]
pub struct CreatorVaultSweeper {
    pub bump: u8,
    pub creator_vault: Pubkey,
    pub delegate: Pubkey,
    pub fee_bps: u16,
    pub last_sweep_ts: i64,
    pub padding: [u8; 5],
}

impl CreatorVaultSweeper {
    pub const INIT_SPACE: usize = 1 + 32 + 32 + 2 + 8 + 5;
}

#[event]
pub struct VaultInitialized {
    pub creator_vault: Pubkey,
    pub pump_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub sy_mint: Pubkey,
    pub authority: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct SyMinted {
    pub user: Pubkey,
    pub pump_mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct FeesWithdrawn {
    pub creator_vault: Pubkey,
    pub authority: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub locked: bool,
}

#[event]
pub struct VaultLockStatusChanged {
    pub creator_vault: Pubkey,
    pub locked: bool,
    pub lock_expires_at: i64,
    pub is_auto: bool,
}

#[event]
pub struct SweeperDelegateUpdated {
    pub creator_vault: Pubkey,
    pub delegate: Pubkey,
    pub fee_bps: u16,
}

#[event]
pub struct SweeperDelegateCleared {
    pub creator_vault: Pubkey,
}

#[event]
pub struct DelegatedFeesSwept {
    pub creator_vault: Pubkey,
    pub delegate: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub fee_amount: u64,
}

#[event]
pub struct RewardsSplitUpdated {
    pub creator_vault: Pubkey,
    pub sol_rewards_bps: u16,
}

#[event]
pub struct AdminUpdated {
    pub creator_vault: Pubkey,
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct VaultPauseToggled {
    pub creator_vault: Pubkey,
    pub paused: bool,
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
    #[msg("Unauthorized admin")]
    UnauthorizedAdmin,
    #[msg("Invalid admin public key")]
    InvalidAdmin,
    #[msg("Invalid basis points")]
    InvalidBps,
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Admin signature required while vault is locked")]
    AdminSignatureRequired,
    #[msg("Insufficient balance in fee vault")]
    InsufficientVaultBalance,
    #[msg("Withdrawal destination must be owned by the creator authority")]
    InvalidWithdrawalDestination,
    #[msg("Withdrawal destination mint must match quote mint")]
    InvalidWithdrawalMint,
    #[msg("Lock expiry must be greater than or equal to the current timestamp")]
    InvalidLockExpiry,
    #[msg("Sweeper delegate must be a non-default public key")]
    InvalidSweeperDelegate,
    #[msg("Sweeper fee exceeds 100%")]
    InvalidSweeperFee,
    #[msg("Vault is locked; delegate sweep is unavailable")]
    VaultLockedForDelegate,
    #[msg("Unauthorized sweeper delegate")]
    UnauthorizedSweeper,
    #[msg("Delegate fee destination required")]
    DelegateFeeDestinationRequired,
    #[msg("Invalid delegate fee destination")]
    InvalidDelegateFeeDestination,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_creator_vault() -> CreatorVault {
        CreatorVault {
            bump: 1,
            fee_vault_bump: 1,
            sy_mint_bump: 1,
            authority: Pubkey::new_unique(),
            pump_creator: Pubkey::new_unique(),
            pump_mint: Pubkey::new_unique(),
            quote_mint: Pubkey::new_unique(),
            sy_mint: Pubkey::new_unique(),
            splitter_program: Pubkey::new_unique(),
            total_fees_collected: 0,
            total_sy_minted: 0,
            admin: Pubkey::new_unique(),
            sol_rewards_bps: 0,
            paused: false,
            locked: false,
            lock_expires_at: 0,
            padding: [0; 1],
        }
    }

    #[test]
    fn assert_admin_enforces_signer() {
        let vault = mock_creator_vault();
        assert!(vault.assert_admin(&vault.admin).is_ok());
        let err = vault.assert_admin(&Pubkey::new_unique()).unwrap_err();
        assert_eq!(err, AttnError::UnauthorizedAdmin.into());
    }

    #[test]
    fn assert_not_paused_checks_flag() {
        let mut vault = mock_creator_vault();
        assert!(vault.assert_not_paused().is_ok());
        vault.paused = true;
        let err = vault.assert_not_paused().unwrap_err();
        assert_eq!(err, AttnError::VaultPaused.into());
    }

    #[test]
    fn refresh_lock_clears_expired_state() {
        let mut vault = mock_creator_vault();
        vault.locked = true;
        vault.lock_expires_at = 100;
        assert!(vault.refresh_lock(150));
        assert!(!vault.locked);
        assert_eq!(vault.lock_expires_at, 0);
    }

    #[test]
    fn refresh_lock_noop_when_unlocked_or_not_expired() {
        let mut vault = mock_creator_vault();
        assert!(!vault.refresh_lock(50));
        vault.locked = true;
        vault.lock_expires_at = 200;
        assert!(!vault.refresh_lock(150));
        assert!(vault.locked);
    }
}
