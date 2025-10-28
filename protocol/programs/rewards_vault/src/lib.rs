use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};
use creator_vault::CreatorVault as CreatorVaultAccount;

pub const INDEX_SCALE: u128 = 1_000_000_000;
const TOTAL_BPS: u64 = 10_000;

declare_id!("6M8TEGPJhspXoYtDvY5vd9DHg7ojCPgbrqjaWoZa2dfw");

#[program]
pub mod rewards_vault {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        reward_bps: u16,
        allowed_funder: Pubkey,
    ) -> Result<()> {
        require!(reward_bps as u64 <= TOTAL_BPS, RewardsError::InvalidBps);
        require!(
            allowed_funder != Pubkey::default(),
            RewardsError::InvalidAllowedFunder
        );

        let pool = &mut ctx.accounts.rewards_pool;
        let bumps = ctx.bumps;
        pool.bump = bumps.rewards_pool;
        pool.authority_bump = bumps.rewards_authority;
        let pool_key = pool.key();
        let (expected_treasury, treasury_bump) =
            Pubkey::find_program_address(&[b"sol-treasury", pool_key.as_ref()], &crate::ID);
        require_keys_eq!(
            expected_treasury,
            ctx.accounts.sol_treasury.key(),
            RewardsError::InvalidTreasuryAccount
        );
        pool.treasury_bump = treasury_bump;
        pool.admin = ctx.accounts.admin.key();
        pool.creator_vault = ctx.accounts.creator_vault.key();
        pool.attn_mint = ctx.accounts.attn_mint.key();
        pool.s_attn_mint = ctx.accounts.s_attn_mint.key();
        pool.attn_vault = ctx.accounts.attn_vault.key();
        pool.total_staked = 0;
        pool.sol_per_share = 0;
        pool.pending_rewards = 0;
        pool.reward_bps = reward_bps;
        pool.allowed_funder = allowed_funder;
        pool.last_treasury_balance = 0;
        pool.last_fund_id = 0;
        pool.is_paused = false;
        pool.padding = [0; 5];

        let payer_info = ctx.accounts.payer.to_account_info();
        let treasury_info = ctx.accounts.sol_treasury.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();
        ensure_treasury_initialized(
            &payer_info,
            &treasury_info,
            &system_program_info,
            pool_key,
            pool.treasury_bump,
        )?;
        pool.last_treasury_balance = treasury_info.lamports();

        emit!(RewardsPoolInitialized {
            pool: pool.key(),
            creator_vault: pool.creator_vault,
            attn_mint: pool.attn_mint,
            s_attn_mint: pool.s_attn_mint,
            reward_bps,
            admin: pool.admin,
            allowed_funder,
        });

        Ok(())
    }

    pub fn stake_attnusd(ctx: Context<StakeAttnUsd>, amount: u64) -> Result<()> {
        require!(amount > 0, RewardsError::InvalidAmount);

        let pool = &mut ctx.accounts.rewards_pool;
        pool.ensure_active()?;
        distribute_pending(pool)?;

        let position = &mut ctx.accounts.stake_position;
        if position.pool == Pubkey::default() {
            position.bump = bump_for_position(pool.key(), ctx.accounts.staker.key());
            position.pool = pool.key();
            position.user = ctx.accounts.staker.key();
            position.staked_amount = 0;
            position.reward_debt = 0;
            position.padding = [0; 7];
        }

        require_keys_eq!(
            position.pool,
            pool.key(),
            RewardsError::PositionPoolMismatch
        );
        require_keys_eq!(
            position.user,
            ctx.accounts.staker.key(),
            RewardsError::PositionOwnerMismatch
        );

        let pool_key = pool.key();
        let authority_bump = pool.authority_bump;
        let treasury_bump = pool.treasury_bump;

        let claimed = settle_rewards(
            pool_key,
            treasury_bump,
            pool,
            position,
            ctx.accounts.sol_treasury.clone(),
            ctx.accounts.staker.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        )?;
        pool.last_treasury_balance = ctx.accounts.sol_treasury.to_account_info().lamports();

        // Move attnUSD into the vault.
        let transfer_accounts = Transfer {
            from: ctx.accounts.user_attn_ata.to_account_info(),
            to: ctx.accounts.attn_vault.to_account_info(),
            authority: ctx.accounts.staker.to_account_info(),
        };
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
        );
        token::transfer(transfer_ctx, amount)?;

        // Mint sAttnUSD 1:1 using signer PDA.
        let authority_seeds = [
            b"rewards-authority".as_ref(),
            pool_key.as_ref(),
            &[authority_bump],
        ];
        let authority_signer = [&authority_seeds[..]];
        let mint_accounts = MintTo {
            mint: ctx.accounts.s_attn_mint.to_account_info(),
            to: ctx.accounts.user_s_attn_ata.to_account_info(),
            authority: ctx.accounts.rewards_authority.to_account_info(),
        };
        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            mint_accounts,
            &authority_signer,
        );
        token::mint_to(mint_ctx, amount)?;

        pool.total_staked = pool
            .total_staked
            .checked_add(amount)
            .ok_or(RewardsError::MathOverflow)?;
        position.staked_amount = position
            .staked_amount
            .checked_add(amount)
            .ok_or(RewardsError::MathOverflow)?;
        position.reward_debt = scaled_index(pool, position.staked_amount)?;

        emit!(Staked {
            pool: pool.key(),
            user: position.user,
            amount,
            total_staked: pool.total_staked,
            claimed,
        });

        Ok(())
    }

    pub fn unstake_attnusd(ctx: Context<UnstakeAttnUsd>, amount: u64) -> Result<()> {
        require!(amount > 0, RewardsError::InvalidAmount);
        let pool = &mut ctx.accounts.rewards_pool;
        pool.ensure_active()?;
        let position = &mut ctx.accounts.stake_position;

        require_keys_eq!(
            position.pool,
            pool.key(),
            RewardsError::PositionPoolMismatch
        );
        require_keys_eq!(
            position.user,
            ctx.accounts.staker.key(),
            RewardsError::PositionOwnerMismatch
        );
        require!(
            position.staked_amount >= amount,
            RewardsError::InsufficientStake
        );

        let pool_key = pool.key();
        let authority_bump = pool.authority_bump;
        let treasury_bump = pool.treasury_bump;

        let claimed = settle_rewards(
            pool_key,
            treasury_bump,
            pool,
            position,
            ctx.accounts.sol_treasury.clone(),
            ctx.accounts.staker.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        )?;
        pool.last_treasury_balance = ctx.accounts.sol_treasury.to_account_info().lamports();

        // Burn sAttnUSD held by the user.
        let burn_accounts = Burn {
            mint: ctx.accounts.s_attn_mint.to_account_info(),
            from: ctx.accounts.user_s_attn_ata.to_account_info(),
            authority: ctx.accounts.staker.to_account_info(),
        };
        let burn_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), burn_accounts);
        token::burn(burn_ctx, amount)?;

        position.staked_amount = position
            .staked_amount
            .checked_sub(amount)
            .ok_or(RewardsError::MathOverflow)?;
        pool.total_staked = pool
            .total_staked
            .checked_sub(amount)
            .ok_or(RewardsError::MathOverflow)?;
        position.reward_debt = scaled_index(pool, position.staked_amount)?;

        // Send attnUSD back to staker.
        let authority_seeds = [
            b"rewards-authority".as_ref(),
            pool_key.as_ref(),
            &[authority_bump],
        ];
        let authority_signer = [&authority_seeds[..]];
        let transfer_accounts = Transfer {
            from: ctx.accounts.attn_vault.to_account_info(),
            to: ctx.accounts.user_attn_ata.to_account_info(),
            authority: ctx.accounts.rewards_authority.to_account_info(),
        };
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
            &authority_signer,
        );
        token::transfer(transfer_ctx, amount)?;
        pool.last_treasury_balance = ctx.accounts.sol_treasury.to_account_info().lamports();

        emit!(Unstaked {
            pool: pool.key(),
            user: position.user,
            amount,
            total_staked: pool.total_staked,
            claimed,
        });

        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let pool = &mut ctx.accounts.rewards_pool;
        pool.ensure_active()?;
        let position = &mut ctx.accounts.stake_position;

        require_keys_eq!(
            position.pool,
            pool.key(),
            RewardsError::PositionPoolMismatch
        );
        require_keys_eq!(
            position.user,
            ctx.accounts.staker.key(),
            RewardsError::PositionOwnerMismatch
        );

        let pool_key = pool.key();
        let treasury_bump = pool.treasury_bump;

        let claimed = settle_rewards(
            pool_key,
            treasury_bump,
            pool,
            position,
            ctx.accounts.sol_treasury.clone(),
            ctx.accounts.staker.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        )?;
        position.reward_debt = scaled_index(pool, position.staked_amount)?;
        pool.last_treasury_balance = ctx.accounts.sol_treasury.to_account_info().lamports();

        emit!(RewardsClaimed {
            pool: pool.key(),
            user: position.user,
            amount: claimed,
        });

        Ok(())
    }

    pub fn fund_rewards(ctx: Context<FundRewards>, amount: u64, operation_id: u64) -> Result<()> {
        require!(amount > 0, RewardsError::InvalidAmount);

        let pool = &mut ctx.accounts.rewards_pool;
        pool.ensure_active()?;
        if operation_id == pool.last_fund_id {
            return Ok(());
        }
        require!(
            operation_id > pool.last_fund_id,
            RewardsError::OperationOutOfOrder
        );
        let pre_balance = ctx.accounts.sol_treasury.to_account_info().lamports();
        require!(
            pre_balance >= pool.last_treasury_balance,
            RewardsError::TreasuryBalanceRegression
        );

        // Transfer SOL into the treasury.
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.allowed_funder.to_account_info(),
                    to: ctx.accounts.sol_treasury.to_account_info(),
                },
            ),
            amount,
        )?;

        let mut total_amount = amount;
        let had_stakers = pool.total_staked > 0;
        if pool.pending_rewards > 0 && pool.total_staked > 0 {
            total_amount = total_amount
                .checked_add(pool.pending_rewards)
                .ok_or(RewardsError::MathOverflow)?;
            pool.pending_rewards = 0;
        }
        let previous_index = pool.sol_per_share;
        let previous_pending = pool.pending_rewards;
        accrue_rewards(pool, total_amount)?;
        pool.last_treasury_balance = ctx.accounts.sol_treasury.to_account_info().lamports();
        if !had_stakers {
            let expected_pending = previous_pending
                .checked_add(amount)
                .ok_or(RewardsError::MathOverflow)?;
            require_eq!(
                pool.sol_per_share,
                previous_index,
                RewardsError::IndexInvariant
            );
            require_eq!(
                pool.pending_rewards,
                expected_pending,
                RewardsError::PendingRewardsInvariant
            );
            total_amount = 0;
        }

        emit!(RewardsFunded {
            pool: pool.key(),
            amount: total_amount,
            source_amount: amount,
            sol_per_share: pool.sol_per_share,
            treasury_balance: pool.last_treasury_balance,
            operation_id,
        });

        pool.last_fund_id = operation_id;

        Ok(())
    }

    pub fn update_allowed_funder(
        ctx: Context<UpdateAllowedFunder>,
        new_allowed_funder: Pubkey,
    ) -> Result<()> {
        require!(
            new_allowed_funder != Pubkey::default(),
            RewardsError::InvalidAllowedFunder
        );
        let pool = &mut ctx.accounts.rewards_pool;
        require_keys_eq!(
            pool.admin,
            ctx.accounts.admin.key(),
            RewardsError::UnauthorizedAdmin
        );
        pool.allowed_funder = new_allowed_funder;
        emit!(AllowedFunderUpdated {
            pool: pool.key(),
            allowed_funder: new_allowed_funder,
        });
        Ok(())
    }

    pub fn update_reward_bps(ctx: Context<UpdateRewardBps>, new_reward_bps: u16) -> Result<()> {
        require!(new_reward_bps as u64 <= TOTAL_BPS, RewardsError::InvalidBps);
        let pool = &mut ctx.accounts.rewards_pool;
        require_keys_eq!(
            pool.admin,
            ctx.accounts.admin.key(),
            RewardsError::UnauthorizedAdmin
        );
        pool.reward_bps = new_reward_bps;
        emit!(RewardBpsUpdated {
            pool: pool.key(),
            reward_bps: new_reward_bps,
        });
        Ok(())
    }

    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        require!(new_admin != Pubkey::default(), RewardsError::InvalidAdmin);
        let pool = &mut ctx.accounts.rewards_pool;
        require_keys_eq!(
            pool.admin,
            ctx.accounts.admin.key(),
            RewardsError::UnauthorizedAdmin
        );
        let previous_admin = pool.admin;
        pool.admin = new_admin;
        emit!(RewardsAdminUpdated {
            pool: pool.key(),
            previous_admin,
            new_admin,
        });
        Ok(())
    }

    pub fn set_pause(ctx: Context<SetPause>, paused: bool) -> Result<()> {
        let pool = &mut ctx.accounts.rewards_pool;
        require_keys_eq!(
            pool.admin,
            ctx.accounts.admin.key(),
            RewardsError::UnauthorizedAdmin
        );
        pool.is_paused = paused;
        emit!(RewardsPoolPaused {
            pool: pool.key(),
            paused,
        });
        Ok(())
    }
}

fn ensure_treasury_initialized<'info>(
    payer: &AccountInfo<'info>,
    treasury: &AccountInfo<'info>,
    system_program_acc: &AccountInfo<'info>,
    pool_key: Pubkey,
    treasury_bump: u8,
) -> Result<()> {
    let rent = Rent::get()?;
    let required_lamports = rent.minimum_balance(0);
    require!(payer.is_signer, RewardsError::UnauthorizedCreatorVault);
    if treasury.lamports() == 0 {
        let seeds = [
            b"sol-treasury".as_ref(),
            pool_key.as_ref(),
            &[treasury_bump],
        ];
        system_program::create_account(
            CpiContext::new_with_signer(
                system_program_acc.clone(),
                system_program::CreateAccount {
                    from: payer.clone(),
                    to: treasury.clone(),
                },
                &[&seeds],
            ),
            required_lamports,
            0,
            &system_program::ID,
        )?;
    } else {
        require_keys_eq!(
            *treasury.owner,
            system_program::ID,
            RewardsError::InvalidTreasuryOwner
        );
        require!(
            treasury.lamports() >= required_lamports,
            RewardsError::InsufficientTreasury
        );
    }
    Ok(())
}

fn accrue_rewards(pool: &mut RewardsPool, amount: u64) -> Result<()> {
    if pool.total_staked == 0 {
        pool.pending_rewards = pool
            .pending_rewards
            .checked_add(amount)
            .ok_or(RewardsError::MathOverflow)?;
    } else {
        let increment = (amount as u128)
            .checked_mul(INDEX_SCALE)
            .ok_or(RewardsError::MathOverflow)?
            .checked_div(pool.total_staked as u128)
            .ok_or(RewardsError::MathOverflow)?;
        pool.sol_per_share = pool
            .sol_per_share
            .checked_add(increment)
            .ok_or(RewardsError::MathOverflow)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub admin: Signer<'info>,
    /// CHECK: Persisted in RewardsPool for future CPI validation.
    pub creator_vault: UncheckedAccount<'info>,
    pub attn_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        space = RewardsPool::SPACE,
        seeds = [b"rewards-pool", creator_vault.key().as_ref()],
        bump
    )]
    pub rewards_pool: Account<'info, RewardsPool>,
    #[account(
        init,
        payer = payer,
        seeds = [b"rewards-authority", rewards_pool.key().as_ref()],
        bump,
        space = 8
    )]
    /// CHECK: PDA acting as authority over token accounts.
    pub rewards_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        mint::decimals = attn_mint.decimals,
        mint::authority = rewards_authority,
        seeds = [b"s-attn-mint", rewards_pool.key().as_ref()],
        bump
    )]
    pub s_attn_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        token::mint = attn_mint,
        token::authority = rewards_authority,
        seeds = [b"attn-vault", rewards_pool.key().as_ref()],
        bump
    )]
    pub attn_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub sol_treasury: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct StakeAttnUsd<'info> {
    #[account(mut, has_one = attn_mint, has_one = s_attn_mint, has_one = attn_vault)]
    pub rewards_pool: Account<'info, RewardsPool>,
    #[account(
        seeds = [b"rewards-authority", rewards_pool.key().as_ref()],
        bump = rewards_pool.authority_bump
    )]
    /// CHECK: PDA derived alongside the pool.
    pub rewards_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub staker: Signer<'info>,
    #[account(
        mut,
        constraint = user_attn_ata.owner == staker.key(),
        constraint = user_attn_ata.mint == attn_mint.key()
    )]
    pub user_attn_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_s_attn_ata.owner == staker.key(),
        constraint = user_s_attn_ata.mint == s_attn_mint.key()
    )]
    pub user_s_attn_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub attn_vault: Account<'info, TokenAccount>,
    pub attn_mint: Account<'info, Mint>,
    #[account(mut)]
    pub s_attn_mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = staker,
        space = StakePosition::SPACE,
        seeds = [b"stake-position", rewards_pool.key().as_ref(), staker.key().as_ref()],
        bump
    )]
    pub stake_position: Account<'info, StakePosition>,
    #[account(
        mut,
        seeds = [b"sol-treasury", rewards_pool.key().as_ref()],
        bump = rewards_pool.treasury_bump
    )]
    pub sol_treasury: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnstakeAttnUsd<'info> {
    #[account(mut, has_one = attn_mint, has_one = s_attn_mint, has_one = attn_vault)]
    pub rewards_pool: Account<'info, RewardsPool>,
    #[account(
        seeds = [b"rewards-authority", rewards_pool.key().as_ref()],
        bump = rewards_pool.authority_bump
    )]
    /// CHECK: PDA derived alongside the pool.
    pub rewards_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub staker: Signer<'info>,
    #[account(
        mut,
        constraint = user_attn_ata.owner == staker.key(),
        constraint = user_attn_ata.mint == attn_mint.key()
    )]
    pub user_attn_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_s_attn_ata.owner == staker.key(),
        constraint = user_s_attn_ata.mint == s_attn_mint.key()
    )]
    pub user_s_attn_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub attn_vault: Account<'info, TokenAccount>,
    pub attn_mint: Account<'info, Mint>,
    #[account(mut)]
    pub s_attn_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"stake-position", rewards_pool.key().as_ref(), staker.key().as_ref()],
        bump = stake_position.bump
    )]
    pub stake_position: Account<'info, StakePosition>,
    #[account(
        mut,
        seeds = [b"sol-treasury", rewards_pool.key().as_ref()],
        bump = rewards_pool.treasury_bump
    )]
    pub sol_treasury: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub rewards_pool: Account<'info, RewardsPool>,
    #[account(mut)]
    pub staker: Signer<'info>,
    #[account(
        mut,
        seeds = [b"stake-position", rewards_pool.key().as_ref(), staker.key().as_ref()],
        bump = stake_position.bump
    )]
    pub stake_position: Account<'info, StakePosition>,
    #[account(
        mut,
        seeds = [b"sol-treasury", rewards_pool.key().as_ref()],
        bump = rewards_pool.treasury_bump
    )]
    pub sol_treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundRewards<'info> {
    pub creator_vault: Account<'info, CreatorVaultAccount>,
    #[account(mut, has_one = creator_vault, has_one = allowed_funder)]
    pub rewards_pool: Account<'info, RewardsPool>,
    #[account(mut)]
    pub allowed_funder: Signer<'info>,
    #[account(
        mut,
        seeds = [b"sol-treasury", rewards_pool.key().as_ref()],
        bump = rewards_pool.treasury_bump
    )]
    pub sol_treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAllowedFunder<'info> {
    #[account(mut, has_one = admin)]
    pub rewards_pool: Account<'info, RewardsPool>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateRewardBps<'info> {
    #[account(mut, has_one = admin)]
    pub rewards_pool: Account<'info, RewardsPool>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    #[account(mut, has_one = admin)]
    pub rewards_pool: Account<'info, RewardsPool>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetPause<'info> {
    #[account(mut, has_one = admin)]
    pub rewards_pool: Account<'info, RewardsPool>,
    pub admin: Signer<'info>,
}

#[account]
pub struct RewardsPool {
    pub bump: u8,
    pub authority_bump: u8,
    pub treasury_bump: u8,
    pub admin: Pubkey,
    pub creator_vault: Pubkey,
    pub attn_mint: Pubkey,
    pub s_attn_mint: Pubkey,
    pub attn_vault: Pubkey,
    pub total_staked: u64,
    pub sol_per_share: u128,
    pub pending_rewards: u64,
    pub reward_bps: u16,
    pub allowed_funder: Pubkey,
    pub last_treasury_balance: u64,
    pub last_fund_id: u64,
    pub is_paused: bool,
    pub padding: [u8; 5],
}

impl RewardsPool {
    pub const SPACE: usize =
        8 + 1 + 1 + 1 + 32 + 32 + 32 + 32 + 32 + 8 + 16 + 8 + 2 + 32 + 8 + 8 + 1 + 5;

    fn ensure_active(&self) -> Result<()> {
        require!(!self.is_paused, RewardsError::PoolPaused);
        Ok(())
    }
}

#[account]
pub struct StakePosition {
    pub bump: u8,
    pub pool: Pubkey,
    pub user: Pubkey,
    pub staked_amount: u64,
    pub reward_debt: u128,
    pub padding: [u8; 7],
}

impl StakePosition {
    pub const SPACE: usize = 8 + 1 + 32 + 32 + 8 + 16 + 7;
}

#[event]
pub struct RewardsPoolInitialized {
    pub pool: Pubkey,
    pub creator_vault: Pubkey,
    pub attn_mint: Pubkey,
    pub s_attn_mint: Pubkey,
    pub reward_bps: u16,
    pub admin: Pubkey,
    pub allowed_funder: Pubkey,
}

#[event]
pub struct RewardsFunded {
    pub pool: Pubkey,
    pub amount: u64,
    pub source_amount: u64,
    pub sol_per_share: u128,
    pub treasury_balance: u64,
    pub operation_id: u64,
}

#[event]
pub struct Staked {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
    pub claimed: u64,
}

#[event]
pub struct Unstaked {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
    pub claimed: u64,
}

#[event]
pub struct RewardsClaimed {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AllowedFunderUpdated {
    pub pool: Pubkey,
    pub allowed_funder: Pubkey,
}

#[event]
pub struct RewardBpsUpdated {
    pub pool: Pubkey,
    pub reward_bps: u16,
}

#[event]
pub struct RewardsAdminUpdated {
    pub pool: Pubkey,
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct RewardsPoolPaused {
    pub pool: Pubkey,
    pub paused: bool,
}

#[error_code]
pub enum RewardsError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid reward basis points")]
    InvalidBps,
    #[msg("Stake position pool mismatch")]
    PositionPoolMismatch,
    #[msg("Stake position owner mismatch")]
    PositionOwnerMismatch,
    #[msg("Insufficient staked balance")]
    InsufficientStake,
    #[msg("Creator vault mismatch")]
    UnauthorizedCreatorVault,
    #[msg("Insufficient SOL in treasury")]
    InsufficientTreasury,
    #[msg("Unauthorized funder")]
    UnauthorizedFunder,
    #[msg("Treasury balance decreased unexpectedly")]
    TreasuryBalanceRegression,
    #[msg("Treasury owner must be system program")]
    InvalidTreasuryOwner,
    #[msg("Allowed funder must be set")]
    InvalidAllowedFunder,
    #[msg("Treasury PDA mismatch")]
    InvalidTreasuryAccount,
    #[msg("Unauthorized admin")]
    UnauthorizedAdmin,
    #[msg("Invalid admin public key")]
    InvalidAdmin,
    #[msg("Rewards pool is paused")]
    PoolPaused,
    #[msg("Index must remain unchanged when no stake is present")]
    IndexInvariant,
    #[msg("Pending rewards must accumulate when no stake is present")]
    PendingRewardsInvariant,
    #[msg("Operation id out of order")]
    OperationOutOfOrder,
}

fn distribute_pending(pool: &mut RewardsPool) -> Result<()> {
    if pool.total_staked > 0 && pool.pending_rewards > 0 {
        let increment = (pool.pending_rewards as u128)
            .checked_mul(INDEX_SCALE)
            .ok_or(RewardsError::MathOverflow)?
            .checked_div(pool.total_staked as u128)
            .ok_or(RewardsError::MathOverflow)?;
        pool.sol_per_share = pool
            .sol_per_share
            .checked_add(increment)
            .ok_or(RewardsError::MathOverflow)?;
        pool.pending_rewards = 0;
    }
    Ok(())
}

fn pending_amount(pool: &RewardsPool, position: &StakePosition) -> Result<u64> {
    let accrued = (position.staked_amount as u128)
        .checked_mul(pool.sol_per_share)
        .ok_or(RewardsError::MathOverflow)?
        .checked_div(INDEX_SCALE)
        .ok_or(RewardsError::MathOverflow)?;

    if accrued <= position.reward_debt {
        Ok(0)
    } else {
        Ok((accrued - position.reward_debt) as u64)
    }
}

fn scaled_index(pool: &RewardsPool, staked: u64) -> Result<u128> {
    (staked as u128)
        .checked_mul(pool.sol_per_share)
        .ok_or(RewardsError::MathOverflow.into())
}

fn settle_rewards<'info>(
    pool_key: Pubkey,
    treasury_bump: u8,
    pool: &mut RewardsPool,
    position: &mut StakePosition,
    treasury: SystemAccount<'info>,
    user: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
) -> Result<u64> {
    distribute_pending(pool)?;
    let pending = pending_amount(pool, position)?;
    if pending > 0 {
        require!(
            treasury.to_account_info().lamports() >= pending,
            RewardsError::InsufficientTreasury
        );
        let treasury_seeds = [
            b"sol-treasury".as_ref(),
            pool_key.as_ref(),
            &[treasury_bump],
        ];
        let treasury_signer = [&treasury_seeds[..]];
        system_program::transfer(
            CpiContext::new_with_signer(
                system_program,
                system_program::Transfer {
                    from: treasury.to_account_info(),
                    to: user,
                },
                &treasury_signer,
            ),
            pending,
        )?;
    }
    Ok(pending)
}

fn bump_for_position(pool_key: Pubkey, user: Pubkey) -> u8 {
    Pubkey::find_program_address(
        &[b"stake-position", pool_key.as_ref(), user.as_ref()],
        &crate::ID,
    )
    .1
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn mock_pool(
        total_staked: u64,
        sol_per_share: u128,
        pending_rewards: u64,
    ) -> (Pubkey, RewardsPool) {
        (
            Pubkey::new_unique(),
            RewardsPool {
                bump: 1,
                authority_bump: 1,
                treasury_bump: 1,
                admin: Pubkey::new_unique(),
                creator_vault: Pubkey::new_unique(),
                attn_mint: Pubkey::new_unique(),
                s_attn_mint: Pubkey::new_unique(),
                attn_vault: Pubkey::new_unique(),
                total_staked,
                sol_per_share,
                pending_rewards,
                reward_bps: 0,
                allowed_funder: Pubkey::new_unique(),
                last_treasury_balance: 0,
                last_fund_id: 0,
                is_paused: false,
                padding: [0; 5],
            },
        )
    }

    fn mock_position(
        pool_key: Pubkey,
        pool: &RewardsPool,
        user: Pubkey,
        staked: u64,
    ) -> StakePosition {
        StakePosition {
            bump: bump_for_position(pool_key, user),
            pool: pool_key,
            user,
            staked_amount: staked,
            reward_debt: scaled_index(pool, staked).unwrap(),
            padding: [0; 7],
        }
    }

    #[test]
    fn accrue_rewards_accumulates_when_staked() {
        let (_key, mut pool) = mock_pool(1_000, 0, 0);
        accrue_rewards(&mut pool, 5_000).unwrap();
        assert!(pool.sol_per_share > 0);
        assert_eq!(pool.pending_rewards, 0);
    }

    #[test]
    fn accrue_rewards_defers_when_no_stake() {
        let (_key, mut pool) = mock_pool(0, 1_000, 0);
        accrue_rewards(&mut pool, 2_000).unwrap();
        assert_eq!(pool.sol_per_share, 1_000);
        assert_eq!(pool.pending_rewards, 2_000);
    }

    #[test]
    fn ensure_active_errors_when_paused() {
        let (_key, mut pool) = mock_pool(0, 0, 0);
        assert!(pool.ensure_active().is_ok());
        pool.is_paused = true;
        assert_eq!(
            pool.ensure_active().unwrap_err(),
            RewardsError::PoolPaused.into()
        );
    }

    #[test]
    fn fund_rewards_without_stake_keeps_index() {
        let (_key, mut pool) = mock_pool(0, 5_000, 250);
        let previous_index = pool.sol_per_share;
        let previous_pending = pool.pending_rewards;
        accrue_rewards(&mut pool, 750).unwrap();
        assert_eq!(pool.sol_per_share, previous_index);
        assert_eq!(pool.pending_rewards, previous_pending + 750);
    }

    #[test]
    fn distribute_pending_is_monotonic() {
        let (_key, mut pool) = mock_pool(2_000, 500, 1_000);
        distribute_pending(&mut pool).unwrap();
        assert!(pool.sol_per_share >= 500);
        assert_eq!(pool.pending_rewards, 0);
    }

    #[test]
    fn pending_amount_respects_debt() {
        let (pool_key, mut pool) = mock_pool(1_000, 0, 5_000);
        distribute_pending(&mut pool).unwrap();
        let user = Pubkey::new_unique();
        let mut position = mock_position(pool_key, &pool, user, 1_000);
        position.reward_debt = 0;
        let pending = pending_amount(&pool, &position).unwrap();
        assert!(pending > 0);
    }

    #[derive(Debug, Clone)]
    enum Action {
        Fund(u64),
        Stake(u64),
        Unstake(u64),
        Claim,
    }

    #[derive(Debug, Clone)]
    struct Sim {
        total_staked: u64,
        sol_per_share: u128,
        pending_rewards: u64,
        staked_amount: u64,
        reward_debt: u128,
        total_funded: u128,
        total_claimed: u128,
        last_index: u128,
    }

    impl Sim {
        fn new() -> Self {
            Self {
                total_staked: 0,
                sol_per_share: 0,
                pending_rewards: 0,
                staked_amount: 0,
                reward_debt: 0,
                total_funded: 0,
                total_claimed: 0,
                last_index: 0,
            }
        }

        fn distribute_pending(&mut self) {
            if self.total_staked > 0 && self.pending_rewards > 0 {
                let increment = (self.pending_rewards as u128)
                    .checked_mul(INDEX_SCALE)
                    .unwrap()
                    / self.total_staked as u128;
                self.sol_per_share = self.sol_per_share.checked_add(increment).unwrap();
                self.pending_rewards = 0;
            }
        }

        fn settle(&mut self) {
            self.distribute_pending();
            if self.staked_amount == 0 {
                return;
            }
            let accrued = (self.staked_amount as u128)
                .checked_mul(self.sol_per_share)
                .unwrap()
                / INDEX_SCALE;
            if accrued >= self.reward_debt {
                let claim = accrued - self.reward_debt;
                self.total_claimed = self.total_claimed.checked_add(claim).unwrap();
            }
            self.reward_debt = (self.staked_amount as u128)
                .checked_mul(self.sol_per_share)
                .unwrap();
        }

        fn fund(&mut self, amount: u64) {
            self.total_funded = self.total_funded.checked_add(amount as u128).unwrap();
            if self.total_staked == 0 {
                self.pending_rewards = self.pending_rewards.checked_add(amount).unwrap();
            } else {
                let total = self.pending_rewards.checked_add(amount).unwrap();
                self.pending_rewards = 0;
                let increment =
                    (total as u128).checked_mul(INDEX_SCALE).unwrap() / self.total_staked as u128;
                self.sol_per_share = self.sol_per_share.checked_add(increment).unwrap();
            }
            self.last_index = self.last_index.max(self.sol_per_share);
        }

        fn stake(&mut self, amount: u64) {
            if amount == 0 {
                return;
            }
            self.settle();
            self.total_staked = self.total_staked.checked_add(amount).unwrap();
            self.staked_amount = self.staked_amount.checked_add(amount).unwrap();
            self.reward_debt = (self.staked_amount as u128)
                .checked_mul(self.sol_per_share)
                .unwrap();
            self.last_index = self.last_index.max(self.sol_per_share);
        }

        fn unstake(&mut self, amount: u64) {
            if amount == 0 || amount > self.staked_amount {
                return;
            }
            self.settle();
            self.staked_amount = self.staked_amount.checked_sub(amount).unwrap();
            self.total_staked = self.total_staked.checked_sub(amount).unwrap();
            self.reward_debt = (self.staked_amount as u128)
                .checked_mul(self.sol_per_share)
                .unwrap();
        }

        fn claim(&mut self) {
            self.settle();
        }
    }

    prop_compose! {
        fn action_strategy()(tag in 0u8..4, value in 1u64..1_000) -> Action {
            match tag {
                0 => Action::Fund(value),
                1 => Action::Stake(value),
                2 => Action::Unstake(value),
                _ => Action::Claim,
            }
        }
    }

    proptest! {
        #[test]
        fn funding_vs_claims(actions in prop::collection::vec(action_strategy(), 1..64)) {
            let mut sim = Sim::new();
            for action in actions {
                match action {
                    Action::Fund(amount) => sim.fund(amount),
                    Action::Stake(amount) => sim.stake(amount),
                    Action::Unstake(amount) => sim.unstake(amount),
                    Action::Claim => sim.claim(),
                }
            }
            // Final settle to ensure reward debt accounted
            sim.claim();
            prop_assert!(sim.total_claimed <= sim.total_funded);
            prop_assert!(sim.sol_per_share >= sim.last_index);
        }
    }

    #[test]
    fn rounding_small_amounts() {
        for amount in 1..10u64 {
            let (pool_key, mut pool) = mock_pool(1_000, 0, 0);
            accrue_rewards(&mut pool, amount).unwrap();
            assert!(pool.sol_per_share >= 0);
            let user = Pubkey::new_unique();
            let position = StakePosition {
                bump: bump_for_position(pool_key, user),
                pool: pool_key,
                user,
                staked_amount: 1_000,
                reward_debt: 0,
                padding: [0; 7],
            };
            let pending = pending_amount(&pool, &position).unwrap();
            assert!(pending <= amount);
        }
    }
}
