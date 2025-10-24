use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};
use creator_vault::CreatorVault as CreatorVaultAccount;
use rewards_vault::{program::RewardsVault as RewardsProgram, RewardsPool};
use std::convert::TryInto;

pub const PRICE_SCALE: u128 = 1_000_000_000;
const TOTAL_BPS: u64 = 10_000;

declare_id!("98jhX2iz4cec2evPKhLwA1HriVEbUAsMBo61bQpSef5Z");

macro_rules! only_keeper {
    ($vault:expr, $signer:expr) => {
        require_keys_eq!(
            $vault.keeper_authority,
            $signer,
            AttnError::UnauthorizedKeeper
        );
    };
}

#[program]
pub mod stable_vault {
    use super::*;

    pub fn initialize_stable_vault(
        ctx: Context<InitializeStableVault>,
        accepted_mints: Vec<Pubkey>,
        admin: Pubkey,
    ) -> Result<()> {
        require!(!accepted_mints.is_empty(), AttnError::NoAcceptedMints);
        require!(
            accepted_mints.len() <= StableVault::MAX_ACCEPTED_MINTS,
            AttnError::TooManyAcceptedMints
        );
        require!(
            accepted_mints.contains(&ctx.accounts.stable_mint.key()),
            AttnError::UnsupportedMint
        );

        let bumps = &ctx.bumps;
        let vault = &mut ctx.accounts.stable_vault;
        vault.bump = bumps.stable_vault;
        vault.treasury_bump = bumps.treasury;
        vault.sol_vault_bump = bumps.sol_vault;
        vault.share_mint_bump = bumps.share_mint;
        require!(admin != Pubkey::default(), AttnError::InvalidAdmin);
        vault.authority_seed = ctx.accounts.authority.key();
        vault.keeper_authority = ctx.accounts.authority.key();
        vault.admin = admin;
        vault.emergency_admin = None;
        vault.share_mint = ctx.accounts.share_mint.key();
        vault.stable_mint = ctx.accounts.stable_mint.key();
        vault.treasury = ctx.accounts.treasury.key();
        vault.sol_vault = ctx.accounts.sol_vault.key();
        vault.total_assets = 0;
        vault.total_shares = 0;
        vault.pending_sol = 0;
        vault.accepted_mints = accepted_mints;
        vault.padding = [0u8; 32];

        emit!(StableVaultInitialized {
            stable_vault: vault.key(),
            authority_seed: vault.authority_seed,
            share_mint: vault.share_mint,
            stable_mint: vault.stable_mint,
            admin,
        });

        Ok(())
    }

    pub fn deposit_stable(ctx: Context<DepositStable>, amount: u64) -> Result<()> {
        require!(amount > 0, AttnError::InvalidAmount);

        require!(
            ctx.accounts
                .stable_vault
                .accepted_mints
                .contains(&ctx.accounts.stable_mint.key()),
            AttnError::UnsupportedMint
        );

        let shares_to_mint = ctx.accounts.stable_vault.preview_deposit(amount)?;
        let authority_key = ctx.accounts.stable_vault.authority_seed;
        let vault_bump = ctx.accounts.stable_vault.bump;

        let transfer_accounts = Transfer {
            from: ctx.accounts.user_stable_ata.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
        );
        token::transfer(cpi_ctx, amount)?;

        let seeds: [&[u8]; 3] = [b"stable-vault", authority_key.as_ref(), &[vault_bump]];
        let signer_seeds = &[&seeds[..]];
        let mint_accounts = MintTo {
            mint: ctx.accounts.share_mint.to_account_info(),
            to: ctx.accounts.user_share_ata.to_account_info(),
            authority: ctx.accounts.stable_vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            mint_accounts,
            signer_seeds,
        );
        token::mint_to(cpi_ctx, shares_to_mint)?;

        {
            let vault = &mut ctx.accounts.stable_vault;
            vault.total_assets = vault
                .total_assets
                .checked_add(amount)
                .ok_or(AttnError::MathOverflow)?;
            vault.total_shares = vault
                .total_shares
                .checked_add(shares_to_mint)
                .ok_or(AttnError::MathOverflow)?;
        }

        emit!(AttnUsdMinted {
            user: ctx.accounts.user.key(),
            deposited_amount: amount,
            minted_shares: shares_to_mint,
            price_per_share: ctx.accounts.stable_vault.price_per_share_scaled(),
        });

        Ok(())
    }

    pub fn redeem_attnusd(ctx: Context<RedeemAttnUsd>, shares: u64) -> Result<()> {
        require!(shares > 0, AttnError::InvalidAmount);
        let assets_to_return = ctx.accounts.stable_vault.preview_redeem(shares)?;
        let authority_key = ctx.accounts.stable_vault.authority_seed;
        let vault_bump = ctx.accounts.stable_vault.bump;

        let seeds: [&[u8]; 3] = [b"stable-vault", authority_key.as_ref(), &[vault_bump]];
        let signer_seeds = &[&seeds[..]];
        let burn_accounts = Burn {
            mint: ctx.accounts.share_mint.to_account_info(),
            from: ctx.accounts.user_share_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let burn_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), burn_accounts);
        token::burn(burn_ctx, shares)?;

        let transfer_accounts = Transfer {
            from: ctx.accounts.treasury.to_account_info(),
            to: ctx.accounts.user_stable_ata.to_account_info(),
            authority: ctx.accounts.stable_vault.to_account_info(),
        };
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
            signer_seeds,
        );
        token::transfer(transfer_ctx, assets_to_return)?;

        {
            let vault = &mut ctx.accounts.stable_vault;
            vault.total_assets = vault
                .total_assets
                .checked_sub(assets_to_return)
                .ok_or(AttnError::MathOverflow)?;
            vault.total_shares = vault
                .total_shares
                .checked_sub(shares)
                .ok_or(AttnError::MathOverflow)?;
        }

        emit!(AttnUsdRedeemed {
            user: ctx.accounts.user.key(),
            redeemed_shares: shares,
            returned_amount: assets_to_return,
            price_per_share: ctx.accounts.stable_vault.price_per_share_scaled(),
        });

        Ok(())
    }

    pub fn sweep_creator_fees(ctx: Context<SweepCreatorFees>, amount: u64) -> Result<()> {
        require!(amount > 0, AttnError::InvalidAmount);
        let vault = &mut ctx.accounts.stable_vault;
        only_keeper!(vault, ctx.accounts.keeper_authority.key());
        let creator_vault = &ctx.accounts.creator_vault;
        require!(!creator_vault.paused, AttnError::CreatorVaultPaused);
        let sol_rewards_bps = creator_vault.sol_rewards_bps;
        require!(sol_rewards_bps as u64 <= TOTAL_BPS, AttnError::InvalidBps);
        require_keys_eq!(
            ctx.accounts.rewards_pool.creator_vault,
            creator_vault.key(),
            AttnError::Unauthorized
        );

        let rewards_amount = (amount as u128)
            .checked_mul(sol_rewards_bps as u128)
            .ok_or(AttnError::MathOverflow)?
            .checked_div(TOTAL_BPS as u128)
            .ok_or(AttnError::MathOverflow)? as u64;
        let stable_amount = amount
            .checked_sub(rewards_amount)
            .ok_or(AttnError::MathOverflow)?;

        if rewards_amount > 0 {
            let cpi_accounts = rewards_vault::cpi::accounts::FundRewards {
                creator_vault: ctx.accounts.creator_vault.to_account_info(),
                rewards_pool: ctx.accounts.rewards_pool.to_account_info(),
                funding_source: ctx.accounts.fee_source.to_account_info(),
                sol_treasury: ctx.accounts.rewards_treasury.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            };
            let cpi_ctx =
                CpiContext::new(ctx.accounts.rewards_program.to_account_info(), cpi_accounts);
            rewards_vault::cpi::fund_rewards(cpi_ctx, rewards_amount)?;
        }

        if stable_amount > 0 {
            let transfer_accounts = system_program::Transfer {
                from: ctx.accounts.fee_source.to_account_info(),
                to: ctx.accounts.sol_vault.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                transfer_accounts,
            );
            system_program::transfer(cpi_ctx, stable_amount)?;
            vault.pending_sol = vault
                .pending_sol
                .checked_add(stable_amount)
                .ok_or(AttnError::MathOverflow)?;
        }

        emit!(CreatorFeesSwept {
            stable_vault: vault.key(),
            keeper_authority: ctx.accounts.keeper_authority.key(),
            admin: vault.admin,
            amount_lamports: amount,
            sol_rewards_bps,
            sol_rewards_lamports: rewards_amount,
            converted_lamports: stable_amount,
            pending_sol: vault.pending_sol,
        });

        Ok(())
    }

    pub fn process_conversion(
        ctx: Context<ProcessConversion>,
        amount_stable: u64,
        sol_spent: u64,
    ) -> Result<()> {
        require!(amount_stable > 0, AttnError::InvalidAmount);
        let vault = &mut ctx.accounts.stable_vault;
        only_keeper!(vault, ctx.accounts.keeper_authority.key());
        require!(
            vault
                .accepted_mints
                .contains(&ctx.accounts.stable_mint.key()),
            AttnError::UnsupportedMint
        );
        require!(
            sol_spent <= vault.pending_sol,
            AttnError::InsufficientPendingSol
        );

        let transfer_accounts = Transfer {
            from: ctx.accounts.conversion_source.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
            authority: ctx.accounts.conversion_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
        );
        token::transfer(cpi_ctx, amount_stable)?;

        if sol_spent > 0 {
            require!(
                ctx.accounts.sol_vault.to_account_info().lamports() >= sol_spent,
                AttnError::InsufficientPendingSol
            );
            let vault_key = vault.key();
            let sol_seeds: [&[u8]; 3] = [b"sol-vault", vault_key.as_ref(), &[vault.sol_vault_bump]];
            let signer_seeds = &[&sol_seeds[..]];
            let transfer_accounts = system_program::Transfer {
                from: ctx.accounts.sol_vault.to_account_info(),
                to: ctx.accounts.conversion_authority.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                transfer_accounts,
                signer_seeds,
            );
            system_program::transfer(cpi_ctx, sol_spent)?;
        }

        vault.pending_sol = vault
            .pending_sol
            .checked_sub(sol_spent)
            .ok_or(AttnError::MathOverflow)?;
        vault.total_assets = vault
            .total_assets
            .checked_add(amount_stable)
            .ok_or(AttnError::MathOverflow)?;

        emit!(ConversionProcessed {
            stable_vault: vault.key(),
            executor: ctx.accounts.conversion_authority.key(),
            stable_received: amount_stable,
            sol_spent,
            pending_sol: vault.pending_sol,
        });

        Ok(())
    }

    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        require!(new_admin != Pubkey::default(), AttnError::InvalidAdmin);
        let vault = &mut ctx.accounts.stable_vault;
        vault.assert_admin(&ctx.accounts.admin.key())?;
        let previous_admin = vault.admin;
        vault.admin = new_admin;
        emit!(StableVaultAdminUpdated {
            stable_vault: vault.key(),
            previous_admin,
            new_admin,
        });
        Ok(())
    }

    pub fn update_keeper_authority(
        ctx: Context<UpdateKeeperAuthority>,
        new_keeper: Pubkey,
    ) -> Result<()> {
        require!(new_keeper != Pubkey::default(), AttnError::InvalidKeeper);
        let vault = &mut ctx.accounts.stable_vault;
        vault.assert_admin_or_emergency(&ctx.accounts.authority.key())?;
        vault.keeper_authority = new_keeper;
        emit!(KeeperAuthorityUpdated {
            stable_vault: vault.key(),
            keeper_authority: new_keeper,
        });
        Ok(())
    }

    pub fn update_emergency_admin(
        ctx: Context<UpdateEmergencyAdmin>,
        new_emergency_admin: Option<Pubkey>,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.stable_vault;
        vault.assert_admin(&ctx.accounts.admin.key())?;
        if let Some(admin) = new_emergency_admin {
            require!(admin != Pubkey::default(), AttnError::InvalidAdmin);
        }
        let previous = vault.emergency_admin;
        vault.emergency_admin = new_emergency_admin;
        emit!(EmergencyAdminUpdated {
            stable_vault: vault.key(),
            previous_emergency_admin: previous,
            new_emergency_admin: vault.emergency_admin,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeStableVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub stable_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = StableVault::space(StableVault::MAX_ACCEPTED_MINTS),
        seeds = [b"stable-vault", authority.key().as_ref()],
        bump
    )]
    pub stable_vault: Account<'info, StableVault>,
    #[account(
        init,
        payer = authority,
        token::mint = stable_mint,
        token::authority = stable_vault,
        seeds = [b"stable-treasury", stable_vault.key().as_ref(), stable_mint.key().as_ref()],
        bump
    )]
    pub treasury: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = authority,
        mint::decimals = stable_mint.decimals,
        mint::authority = stable_vault,
        seeds = [b"share-mint", stable_vault.key().as_ref()],
        bump
    )]
    pub share_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 0,
        seeds = [b"sol-vault", stable_vault.key().as_ref()],
        bump
    )]
    pub sol_vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct DepositStable<'info> {
    #[account(
        mut,
        seeds = [b"stable-vault", stable_vault.authority_seed.as_ref()],
        bump = stable_vault.bump,
        has_one = share_mint,
        has_one = stable_mint,
        has_one = treasury
    )]
    pub stable_vault: Account<'info, StableVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub stable_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"stable-treasury", stable_vault.key().as_ref(), stable_mint.key().as_ref()],
        bump = stable_vault.treasury_bump
    )]
    pub treasury: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_stable_ata.mint == stable_mint.key(),
        constraint = user_stable_ata.owner == user.key()
    )]
    pub user_stable_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"share-mint", stable_vault.key().as_ref()],
        bump = stable_vault.share_mint_bump
    )]
    pub share_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = user_share_ata.mint == share_mint.key(),
        constraint = user_share_ata.owner == user.key()
    )]
    pub user_share_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RedeemAttnUsd<'info> {
    #[account(
        mut,
        seeds = [b"stable-vault", stable_vault.authority_seed.as_ref()],
        bump = stable_vault.bump,
        has_one = share_mint,
        has_one = stable_mint,
        has_one = treasury
    )]
    pub stable_vault: Account<'info, StableVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub stable_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"stable-treasury", stable_vault.key().as_ref(), stable_mint.key().as_ref()],
        bump = stable_vault.treasury_bump
    )]
    pub treasury: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_stable_ata.mint == stable_mint.key(),
        constraint = user_stable_ata.owner == user.key()
    )]
    pub user_stable_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"share-mint", stable_vault.key().as_ref()],
        bump = stable_vault.share_mint_bump
    )]
    pub share_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = user_share_ata.mint == share_mint.key(),
        constraint = user_share_ata.owner == user.key()
    )]
    pub user_share_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SweepCreatorFees<'info> {
    #[account(
        mut,
        seeds = [b"stable-vault", stable_vault.authority_seed.as_ref()],
        bump = stable_vault.bump,
        has_one = keeper_authority,
        has_one = sol_vault
    )]
    pub stable_vault: Account<'info, StableVault>,
    pub keeper_authority: Signer<'info>,
    #[account(mut)]
    pub fee_source: Signer<'info>,
    pub creator_vault: Account<'info, CreatorVaultAccount>,
    #[account(mut, has_one = creator_vault)]
    pub rewards_pool: Account<'info, RewardsPool>,
    #[account(
        mut,
        seeds = [b"sol-treasury", rewards_pool.key().as_ref()],
        bump = rewards_pool.treasury_bump
    )]
    pub rewards_treasury: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"sol-vault", stable_vault.key().as_ref()],
        bump = stable_vault.sol_vault_bump
    )]
    pub sol_vault: SystemAccount<'info>,
    pub rewards_program: Program<'info, RewardsProgram>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProcessConversion<'info> {
    #[account(
        mut,
        seeds = [b"stable-vault", stable_vault.authority_seed.as_ref()],
        bump = stable_vault.bump,
        has_one = keeper_authority,
        has_one = stable_mint,
        has_one = treasury,
        has_one = sol_vault
    )]
    pub stable_vault: Account<'info, StableVault>,
    pub keeper_authority: Signer<'info>,
    #[account(mut)]
    pub conversion_authority: Signer<'info>,
    #[account(mut)]
    pub stable_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"stable-treasury", stable_vault.key().as_ref(), stable_mint.key().as_ref()],
        bump = stable_vault.treasury_bump
    )]
    pub treasury: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = conversion_source.mint == stable_mint.key(),
        constraint = conversion_source.owner == conversion_authority.key()
    )]
    pub conversion_source: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"sol-vault", stable_vault.key().as_ref()],
        bump = stable_vault.sol_vault_bump
    )]
    pub sol_vault: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    #[account(
        mut,
        seeds = [b"stable-vault", stable_vault.authority_seed.as_ref()],
        bump = stable_vault.bump
    )]
    pub stable_vault: Account<'info, StableVault>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateKeeperAuthority<'info> {
    #[account(
        mut,
        seeds = [b"stable-vault", stable_vault.authority_seed.as_ref()],
        bump = stable_vault.bump
    )]
    pub stable_vault: Account<'info, StableVault>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateEmergencyAdmin<'info> {
    #[account(
        mut,
        seeds = [b"stable-vault", stable_vault.authority_seed.as_ref()],
        bump = stable_vault.bump
    )]
    pub stable_vault: Account<'info, StableVault>,
    pub admin: Signer<'info>,
}

#[account]
pub struct StableVault {
    pub bump: u8,
    pub treasury_bump: u8,
    pub sol_vault_bump: u8,
    pub share_mint_bump: u8,
    pub authority_seed: Pubkey,
    pub keeper_authority: Pubkey,
    pub admin: Pubkey,
    pub emergency_admin: Option<Pubkey>,
    pub share_mint: Pubkey,
    pub stable_mint: Pubkey,
    pub treasury: Pubkey,
    pub sol_vault: Pubkey,
    pub total_assets: u64,
    pub total_shares: u64,
    pub pending_sol: u64,
    pub accepted_mints: Vec<Pubkey>,
    pub padding: [u8; 32],
}

impl StableVault {
    pub const MAX_ACCEPTED_MINTS: usize = 8;
    pub const BASE_SIZE: usize = 1 + 1 + 1 + 1 + (32 * 7) + (8 * 3) + 1 + 32;
    pub const PADDING_SIZE: usize = 32;

    pub fn space(max_mints: usize) -> usize {
        8 + Self::BASE_SIZE + 4 + (max_mints * 32) + Self::PADDING_SIZE
    }

    fn price_per_share_scaled(&self) -> u64 {
        if self.total_shares == 0 {
            PRICE_SCALE as u64
        } else {
            let price = (self.total_assets as u128)
                .saturating_mul(PRICE_SCALE)
                .checked_div(self.total_shares as u128)
                .unwrap_or(PRICE_SCALE);
            price as u64
        }
    }

    fn preview_deposit(&self, deposit_amount: u64) -> Result<u64> {
        require!(deposit_amount > 0, AttnError::InvalidAmount);
        if self.total_shares == 0 || self.total_assets == 0 {
            return Ok(deposit_amount);
        }
        require!(self.total_assets > 0, AttnError::InvalidVaultState);
        let numerator = (deposit_amount as u128)
            .checked_mul(self.total_shares as u128)
            .ok_or(AttnError::MathOverflow)?;
        let shares = numerator
            .checked_div(self.total_assets as u128)
            .ok_or(AttnError::InvalidVaultState)?;
        require!(shares > 0, AttnError::AmountTooSmall);
        let shares: u64 = shares.try_into().map_err(|_| AttnError::MathOverflow)?;
        Ok(shares)
    }

    fn preview_redeem(&self, shares: u64) -> Result<u64> {
        require!(shares > 0, AttnError::InvalidAmount);
        require!(self.total_shares >= shares, AttnError::InsufficientShares);
        if shares == self.total_shares {
            return Ok(self.total_assets);
        }
        require!(self.total_shares > 0, AttnError::InvalidVaultState);
        let numerator = (shares as u128)
            .checked_mul(self.total_assets as u128)
            .ok_or(AttnError::MathOverflow)?;
        let assets = numerator
            .checked_div(self.total_shares as u128)
            .ok_or(AttnError::InvalidVaultState)?;
        require!(assets > 0, AttnError::AmountTooSmall);
        let assets: u64 = assets.try_into().map_err(|_| AttnError::MathOverflow)?;
        Ok(assets)
    }

    fn is_admin(&self, signer: &Pubkey) -> bool {
        self.admin == *signer
    }

    fn is_emergency_admin(&self, signer: &Pubkey) -> bool {
        self.emergency_admin
            .map(|key| key == *signer)
            .unwrap_or(false)
    }

    fn assert_admin(&self, signer: &Pubkey) -> Result<()> {
        require!(self.is_admin(signer), AttnError::UnauthorizedAdmin);
        Ok(())
    }

    fn assert_admin_or_emergency(&self, signer: &Pubkey) -> Result<()> {
        require!(
            self.is_admin(signer) || self.is_emergency_admin(signer),
            AttnError::UnauthorizedAdmin
        );
        Ok(())
    }
}

#[event]
pub struct StableVaultInitialized {
    pub stable_vault: Pubkey,
    pub authority_seed: Pubkey,
    pub share_mint: Pubkey,
    pub stable_mint: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct AttnUsdMinted {
    pub user: Pubkey,
    pub deposited_amount: u64,
    pub minted_shares: u64,
    pub price_per_share: u64,
}

#[event]
pub struct AttnUsdRedeemed {
    pub user: Pubkey,
    pub redeemed_shares: u64,
    pub returned_amount: u64,
    pub price_per_share: u64,
}

#[event]
pub struct CreatorFeesSwept {
    pub stable_vault: Pubkey,
    pub keeper_authority: Pubkey,
    pub admin: Pubkey,
    pub amount_lamports: u64,
    pub sol_rewards_bps: u16,
    pub sol_rewards_lamports: u64,
    pub converted_lamports: u64,
    pub pending_sol: u64,
}

#[event]
pub struct ConversionProcessed {
    pub stable_vault: Pubkey,
    pub executor: Pubkey,
    pub stable_received: u64,
    pub sol_spent: u64,
    pub pending_sol: u64,
}

#[event]
pub struct StableVaultAdminUpdated {
    pub stable_vault: Pubkey,
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct KeeperAuthorityUpdated {
    pub stable_vault: Pubkey,
    pub keeper_authority: Pubkey,
}

#[event]
pub struct EmergencyAdminUpdated {
    pub stable_vault: Pubkey,
    pub previous_emergency_admin: Option<Pubkey>,
    pub new_emergency_admin: Option<Pubkey>,
}

#[error_code]
pub enum AttnError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Invalid basis points")]
    InvalidBps,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid vault state")]
    InvalidVaultState,
    #[msg("Deposit amount too small for share precision")]
    AmountTooSmall,
    #[msg("Unsupported mint for this vault")]
    UnsupportedMint,
    #[msg("No accepted mints provided")]
    NoAcceptedMints,
    #[msg("Too many accepted mints provided")]
    TooManyAcceptedMints,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Unauthorized keeper")]
    UnauthorizedKeeper,
    #[msg("Unauthorized admin")]
    UnauthorizedAdmin,
    #[msg("Invalid admin public key")]
    InvalidAdmin,
    #[msg("Invalid keeper public key")]
    InvalidKeeper,
    #[msg("Insufficient shares to redeem")]
    InsufficientShares,
    #[msg("Insufficient pending SOL for conversion")]
    InsufficientPendingSol,
    #[msg("Creator vault is paused")]
    CreatorVaultPaused,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_vault(total_assets: u64, total_shares: u64) -> StableVault {
        StableVault {
            bump: 1,
            treasury_bump: 1,
            sol_vault_bump: 1,
            share_mint_bump: 1,
            authority_seed: Pubkey::new_unique(),
            share_mint: Pubkey::new_unique(),
            stable_mint: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
            sol_vault: Pubkey::new_unique(),
            keeper_authority: Pubkey::new_unique(),
            admin: Pubkey::new_unique(),
            emergency_admin: None,
            total_assets,
            total_shares,
            pending_sol: 0,
            accepted_mints: vec![],
            padding: [0u8; 32],
        }
    }

    #[test]
    fn deposit_mints_one_to_one_on_bootstrap() {
        let vault = mock_vault(0, 0);
        let minted = vault.preview_deposit(1_000_000).unwrap();
        assert_eq!(minted, 1_000_000);
    }

    #[test]
    fn deposit_uses_price_per_share() {
        let vault = mock_vault(2_000_000, 1_000_000);
        let minted = vault.preview_deposit(1_000_000).unwrap();
        assert_eq!(minted, 500_000);
    }

    #[test]
    fn redeem_returns_all_assets_on_full_exit() {
        let vault = mock_vault(1_500_000, 1_500_000);
        let redeemed = vault.preview_redeem(1_500_000).unwrap();
        assert_eq!(redeemed, 1_500_000);
    }

    #[test]
    fn redeem_scales_by_share_price() {
        let vault = mock_vault(2_000_000, 1_000_000);
        let redeemed = vault.preview_redeem(250_000).unwrap();
        assert_eq!(redeemed, 500_000);
    }
}
