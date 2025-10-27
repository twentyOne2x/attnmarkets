use anchor_lang::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use anchor_lang::{InstructionData, ToAccountMetas};
use creator_vault::CreatorVault;
use solana_program::{
    clock::Clock, entrypoint::ProgramResult, program_option::COption, program_pack::Pack,
};
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::{Account, AccountSharedData},
    instruction::{Instruction, InstructionError},
    signature::{Keypair, Signer},
    system_instruction, system_program, sysvar,
    transaction::{Transaction, TransactionError},
    transport::TransportError,
};
use spl_associated_token_account::get_associated_token_address;
use spl_associated_token_account::instruction as ata_instruction;
use spl_token::instruction as token_instruction;
use spl_token::state::{Account as TokenAccountState, AccountState, Mint as MintState};
use splitter::{accounts, instruction, Market, SplitterError};
use std::mem;

const DECIMALS: u8 = 6;
const FEE_INDEX_SCALE: u128 = 1_000_000_000;

struct MarketFixture {
    context: ProgramTestContext,
    pump_mint: Keypair,
    quote_mint: Keypair,
    pump_creator: Keypair,
    user: Keypair,
    creator_vault: Pubkey,
    creator_vault_bump: u8,
    fee_vault: Pubkey,
    fee_vault_bump: u8,
    sy_mint: Pubkey,
    sy_mint_bump: u8,
    market: Keypair,
    pt_mint: Keypair,
    yt_mint: Keypair,
    splitter_authority: Pubkey,
    user_sy_ata: Pubkey,
    user_pt_ata: Pubkey,
    user_yt_ata: Pubkey,
    user_quote_ata: Pubkey,
    user_position: Pubkey,
    maturity_ts: i64,
}

impl MarketFixture {
    fn mint_pt_yt_ix(&self, amount: u64) -> Instruction {
        let accounts = accounts::MintPtYt {
            market: self.market.pubkey(),
            creator_vault: self.creator_vault,
            splitter_authority: self.splitter_authority,
            user: self.user.pubkey(),
            user_sy_ata: self.user_sy_ata,
            user_pt_ata: self.user_pt_ata,
            user_yt_ata: self.user_yt_ata,
            sy_mint: self.sy_mint,
            pt_mint: self.pt_mint.pubkey(),
            yt_mint: self.yt_mint.pubkey(),
            user_position: self.user_position,
            system_program: system_program::id(),
            token_program: spl_token::id(),
            creator_vault_program: creator_vault::id(),
        };
        Instruction {
            program_id: splitter::id(),
            accounts: accounts.to_account_metas(None),
            data: instruction::MintPtYt { amount }.data(),
        }
    }

    fn redeem_yield_ix(&self, new_fee_index: u128) -> Instruction {
        let accounts = accounts::RedeemYield {
            market: self.market.pubkey(),
            creator_vault: self.creator_vault,
            splitter_authority: self.splitter_authority,
            user: self.user.pubkey(),
            user_position: self.user_position,
            user_yt_ata: self.user_yt_ata,
            fee_vault: self.fee_vault,
            user_quote_ata: self.user_quote_ata,
            token_program: spl_token::id(),
            creator_vault_program: creator_vault::id(),
        };
        Instruction {
            program_id: splitter::id(),
            accounts: accounts.to_account_metas(None),
            data: instruction::RedeemYield { new_fee_index }.data(),
        }
    }

    fn redeem_principal_ix(&self, amount: u64) -> Instruction {
        let accounts = accounts::RedeemPrincipal {
            market: self.market.pubkey(),
            creator_vault: self.creator_vault,
            splitter_authority: self.splitter_authority,
            user: self.user.pubkey(),
            user_pt_ata: self.user_pt_ata,
            user_sy_ata: self.user_sy_ata,
            pt_mint: self.pt_mint.pubkey(),
            sy_mint: self.sy_mint,
            user_yt_ata: self.user_yt_ata,
            yt_mint: self.yt_mint.pubkey(),
            token_program: spl_token::id(),
            creator_vault_program: creator_vault::id(),
        };
        Instruction {
            program_id: splitter::id(),
            accounts: accounts.to_account_metas(None),
            data: instruction::RedeemPrincipal { amount }.data(),
        }
    }
}

async fn setup_market_fixture() -> MarketFixture {
    let mut program_test = ProgramTest::default();
    program_test.add_program(
        "creator_vault",
        creator_vault::id(),
        processor!(creator_vault_entry_shim),
    );
    program_test.add_program("splitter", splitter::id(), processor!(splitter_entry_shim));

    let pump_mint = Keypair::new();
    let quote_mint = Keypair::new();
    let pump_creator = Keypair::new();
    let user = Keypair::new();

    let (creator_vault_pda, creator_vault_bump) = Pubkey::find_program_address(
        &[b"creator-vault", pump_mint.pubkey().as_ref()],
        &creator_vault::id(),
    );
    let (fee_vault_pda, fee_vault_bump) = Pubkey::find_program_address(
        &[b"fee-vault", pump_mint.pubkey().as_ref()],
        &creator_vault::id(),
    );
    let (sy_mint_pda, sy_mint_bump) = Pubkey::find_program_address(
        &[b"sy-mint", pump_mint.pubkey().as_ref()],
        &creator_vault::id(),
    );
    let (splitter_authority_pda, _) = Pubkey::find_program_address(
        &[b"splitter-authority", creator_vault_pda.as_ref()],
        &splitter::id(),
    );

    let mut context = program_test.start_with_context().await;
    let rent = context.banks_client.get_rent().await.unwrap();

    let transfer_ix =
        system_instruction::transfer(&context.payer.pubkey(), &user.pubkey(), 1_000_000_000);
    let payer_clone = clone_keypair(&context.payer);
    send_tx_owned(&mut context, &[transfer_ix], vec![payer_clone]).await;

    let payer_clone = clone_keypair(&context.payer);
    create_mint(&mut context, &pump_mint, &payer_clone, DECIMALS).await;
    let payer_clone = clone_keypair(&context.payer);
    create_mint(&mut context, &quote_mint, &payer_clone, DECIMALS).await;

    seed_creator_vault_accounts(
        &mut context,
        &rent,
        &pump_mint,
        &quote_mint,
        &pump_creator,
        creator_vault_pda,
        creator_vault_bump,
        fee_vault_pda,
        fee_vault_bump,
        sy_mint_pda,
        sy_mint_bump,
    )
    .await;

    let user_quote_ata = get_associated_token_address(&user.pubkey(), &quote_mint.pubkey());
    let create_quote_ata_ix = ata_instruction::create_associated_token_account(
        &user.pubkey(),
        &user.pubkey(),
        &quote_mint.pubkey(),
        &spl_token::id(),
    );
    send_tx(&mut context, &[create_quote_ata_ix], &[&user]).await;

    let mint_quote_ix = token_instruction::mint_to(
        &spl_token::id(),
        &quote_mint.pubkey(),
        &user_quote_ata,
        &context.payer.pubkey(),
        &[],
        1_000_000,
    )
    .unwrap();
    let payer_clone = clone_keypair(&context.payer);
    send_tx_owned(&mut context, &[mint_quote_ix], vec![payer_clone]).await;

    let transfer_fees_ix = token_instruction::transfer(
        &spl_token::id(),
        &user_quote_ata,
        &fee_vault_pda,
        &user.pubkey(),
        &[],
        400_000,
    )
    .unwrap();
    send_tx(&mut context, &[transfer_fees_ix], &[&user]).await;

    let user_sy_ata = get_associated_token_address(&user.pubkey(), &sy_mint_pda);
    let create_sy_ata_ix = ata_instruction::create_associated_token_account(
        &user.pubkey(),
        &user.pubkey(),
        &sy_mint_pda,
        &spl_token::id(),
    );
    send_tx(&mut context, &[create_sy_ata_ix], &[&user]).await;

    seed_user_sy_balance(
        &mut context,
        user_sy_ata,
        sy_mint_pda,
        creator_vault_pda,
        400_000,
    )
    .await;

    let clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    let maturity_ts = clock.unix_timestamp - 10;

    let market_account = Keypair::new();
    let pt_mint = Keypair::new();
    let yt_mint = Keypair::new();

    let create_market_accounts = accounts::CreateMarket {
        authority: context.payer.pubkey(),
        creator_vault: creator_vault_pda,
        splitter_authority: splitter_authority_pda,
        pump_mint: pump_mint.pubkey(),
        sy_mint: sy_mint_pda,
        market: market_account.pubkey(),
        pt_mint: pt_mint.pubkey(),
        yt_mint: yt_mint.pubkey(),
        system_program: system_program::id(),
        token_program: spl_token::id(),
        rent: sysvar::rent::ID,
    };
    let create_market_ix = Instruction {
        program_id: splitter::id(),
        accounts: create_market_accounts.to_account_metas(None),
        data: instruction::CreateMarket { maturity_ts }.data(),
    };
    let payer_clone = clone_keypair(&context.payer);
    let market_clone = clone_keypair(&market_account);
    let pt_clone = clone_keypair(&pt_mint);
    let yt_clone = clone_keypair(&yt_mint);
    send_tx_owned(
        &mut context,
        &[create_market_ix],
        vec![payer_clone, market_clone, pt_clone, yt_clone],
    )
    .await;

    let user_pt_ata = get_associated_token_address(&user.pubkey(), &pt_mint.pubkey());
    let create_pt_ata_ix = ata_instruction::create_associated_token_account(
        &user.pubkey(),
        &user.pubkey(),
        &pt_mint.pubkey(),
        &spl_token::id(),
    );
    send_tx(&mut context, &[create_pt_ata_ix], &[&user]).await;

    let user_yt_ata = get_associated_token_address(&user.pubkey(), &yt_mint.pubkey());
    let create_yt_ata_ix = ata_instruction::create_associated_token_account(
        &user.pubkey(),
        &user.pubkey(),
        &yt_mint.pubkey(),
        &spl_token::id(),
    );
    send_tx(&mut context, &[create_yt_ata_ix], &[&user]).await;

    let (user_position_pda, _) = Pubkey::find_program_address(
        &[
            b"user-position",
            market_account.pubkey().as_ref(),
            user.pubkey().as_ref(),
        ],
        &splitter::id(),
    );

    MarketFixture {
        context,
        pump_mint,
        quote_mint,
        pump_creator,
        user,
        creator_vault: creator_vault_pda,
        creator_vault_bump,
        fee_vault: fee_vault_pda,
        fee_vault_bump,
        sy_mint: sy_mint_pda,
        sy_mint_bump,
        market: market_account,
        pt_mint,
        yt_mint,
        splitter_authority: splitter_authority_pda,
        user_sy_ata,
        user_pt_ata,
        user_yt_ata,
        user_quote_ata,
        user_position: user_position_pda,
        maturity_ts,
    }
}

fn creator_vault_entry_shim(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let accounts_static: &[AccountInfo] = unsafe { mem::transmute(accounts) };
    creator_vault::entry(program_id, accounts_static, data)
}

fn splitter_entry_shim(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // SAFETY: `splitter::entry` only needs the account slice for the duration of this call.
    // We temporarily widen the lifetime so Anchor's generated entrypoint can accept the slice.
    let accounts_static: &[AccountInfo] = unsafe { mem::transmute(accounts) };
    splitter::entry(program_id, accounts_static, data)
}

#[tokio::test]
async fn full_market_flow() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(250_000);
    send_tx(context, &[mint_ix], &[user]).await;

    // Validate PT/YT balances
    let pt_account = get_token_account(context, &fixture.user_pt_ata).await;
    let yt_account = get_token_account(context, &fixture.user_yt_ata).await;
    assert_eq!(pt_account.amount, 250_000);
    assert_eq!(yt_account.amount, 250_000);

    // Validate market state
    let market_state = fetch_market(context, fixture.market.pubkey()).await;
    assert_eq!(market_state.total_pt_issued, 250_000);
    assert_eq!(market_state.total_yt_issued, 250_000);
    assert_eq!(market_state.fee_index, 0);

    // Accrue yield by minting to fee vault
    let accrue_amount: u64 = 100_000;
    let mint_yield_ix = token_instruction::mint_to(
        &spl_token::id(),
        &fixture.quote_mint.pubkey(),
        &fixture.fee_vault,
        &context.payer.pubkey(),
        &[],
        accrue_amount,
    )
    .unwrap();
    let payer_clone = clone_keypair(&context.payer);
    send_tx_owned(context, &[mint_yield_ix], vec![payer_clone]).await;

    // Redeem yield with updated index
    let delta_index =
        (accrue_amount as u128 * FEE_INDEX_SCALE) / market_state.total_yt_issued as u128;
    let new_fee_index = market_state.fee_index + delta_index;

    let redeem_ix = fixture.redeem_yield_ix(new_fee_index);
    let pre_quote_balance = get_token_account(context, &fixture.user_quote_ata)
        .await
        .amount;
    send_tx(context, &[redeem_ix], &[user]).await;
    let post_quote_balance = get_token_account(context, &fixture.user_quote_ata)
        .await
        .amount;
    assert_eq!(post_quote_balance - pre_quote_balance, accrue_amount);

    // Redeem principal in two steps
    let redeem_ix = fixture.redeem_principal_ix(100_000);
    send_tx(context, &[redeem_ix], &[user]).await;

    let market_state = fetch_market(context, fixture.market.pubkey()).await;
    assert_eq!(market_state.total_pt_issued, 150_000);
    assert_eq!(market_state.total_yt_issued, 150_000);

    let redeem_ix = fixture.redeem_principal_ix(150_000);
    send_tx(context, &[redeem_ix], &[user]).await;

    let pt_account = get_token_account(context, &fixture.user_pt_ata).await;
    assert_eq!(pt_account.amount, 0);

    let sy_account = get_token_account(context, &fixture.user_sy_ata).await;
    assert_eq!(sy_account.amount, 400_000);

    let pt_mint_state = get_mint(context, &fixture.pt_mint.pubkey()).await;
    assert_eq!(pt_mint_state.supply, 0);
    let yt_mint_state = get_mint(context, &fixture.yt_mint.pubkey()).await;
    assert_eq!(yt_mint_state.supply, 0);

    let yt_account = get_token_account(context, &fixture.user_yt_ata).await;
    assert_eq!(yt_account.amount, 0);

    let market_state = fetch_market(context, fixture.market.pubkey()).await;
    assert_eq!(market_state.total_pt_issued, 0);
    assert_eq!(market_state.total_yt_issued, 0);

    // Close market
    let close_accounts = accounts::CloseMarket {
        creator_authority: fixture.pump_creator.pubkey(),
        admin: context.payer.pubkey(),
        creator_vault: fixture.creator_vault,
        market: fixture.market.pubkey(),
        pt_mint: fixture.pt_mint.pubkey(),
        yt_mint: fixture.yt_mint.pubkey(),
    };
    let close_ix = Instruction {
        program_id: splitter::id(),
        accounts: close_accounts.to_account_metas(None),
        data: instruction::CloseMarket {}.data(),
    };
    let payer_clone = clone_keypair(&context.payer);
    let authority_clone = clone_keypair(&fixture.pump_creator);
    send_tx_owned(context, &[close_ix], vec![payer_clone, authority_clone]).await;

    let market_account_result = context
        .banks_client
        .get_account(fixture.market.pubkey())
        .await
        .unwrap();
    assert!(market_account_result.is_none());
}

#[tokio::test]
async fn redeem_principal_requires_yt_balance() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(100_000);
    send_tx(context, &[mint_ix], &[user]).await;

    let counterparty = Keypair::new();
    let counter_yt_ata =
        get_associated_token_address(&counterparty.pubkey(), &fixture.yt_mint.pubkey());
    let create_counter_ata = ata_instruction::create_associated_token_account(
        &user.pubkey(),
        &counterparty.pubkey(),
        &fixture.yt_mint.pubkey(),
        &spl_token::id(),
    );
    send_tx(context, &[create_counter_ata], &[user, &counterparty]).await;

    let transfer_ix = token_instruction::transfer(
        &spl_token::id(),
        &fixture.user_yt_ata,
        &counter_yt_ata,
        &user.pubkey(),
        &[],
        50_000,
    )
    .unwrap();
    send_tx(context, &[transfer_ix], &[user]).await;

    let redeem_ix = fixture.redeem_principal_ix(100_000);
    let err = send_tx_expect_err(context, &[redeem_ix], &[user]).await;
    assert_custom_error(err, SplitterError::InsufficientYieldTokens as u32);
}

#[tokio::test]
async fn redeem_yield_rejects_fee_vault_spoof() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(10_000);
    send_tx(context, &[mint_ix], &[user]).await;

    let mut spoof_ix = fixture.redeem_yield_ix(0);
    if let Some(account_meta) = spoof_ix
        .accounts
        .iter_mut()
        .find(|meta| meta.pubkey == fixture.fee_vault)
    {
        account_meta.pubkey = fixture.user_quote_ata;
    } else {
        panic!("fee vault account meta not found");
    }

    let err = send_tx_expect_err(context, &[spoof_ix], &[user]).await;
    assert_custom_error(err, ErrorCode::ConstraintSeeds as u32);
}

#[tokio::test]
async fn redeem_yield_liquidity_shortfall() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(50_000);
    send_tx(context, &[mint_ix], &[user]).await;

    let excessive_index = FEE_INDEX_SCALE * 10_000u128;
    let redeem_ix = fixture.redeem_yield_ix(excessive_index);
    let err = send_tx_expect_err(context, &[redeem_ix], &[user]).await;
    assert_custom_error(err, SplitterError::InsufficientYieldLiquidity as u32);
}

#[tokio::test]
async fn redeem_yield_fee_index_regression() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(10_000);
    send_tx(context, &[mint_ix], &[user]).await;

    let forward_ix = fixture.redeem_yield_ix(FEE_INDEX_SCALE);
    send_tx(context, &[forward_ix], &[user]).await;

    let regression_ix = fixture.redeem_yield_ix(FEE_INDEX_SCALE - 1);
    let err = send_tx_expect_err(context, &[regression_ix], &[user]).await;
    assert_custom_error(err, SplitterError::FeeIndexRegression as u32);
}

#[tokio::test]
async fn mint_pt_yt_rejects_wrong_token_program() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let fake_program = Pubkey::new_unique();
    let mut fake_account = AccountSharedData::new(0, 0, &Pubkey::default());
    fake_account.set_executable(true);
    context.set_account(&fake_program, &fake_account);

    let mut mint_ix = fixture.mint_pt_yt_ix(1);
    if let Some(account_meta) = mint_ix
        .accounts
        .iter_mut()
        .find(|meta| meta.pubkey == spl_token::id())
    {
        account_meta.pubkey = fake_program;
    } else {
        panic!("token program account meta not found");
    }

    let err = send_tx_expect_err(context, &[mint_ix], &[user]).await;
    assert_custom_error(err, ErrorCode::ConstraintAddress as u32);
}

#[tokio::test]
async fn mint_pt_yt_rejects_mismatched_ata() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let imposter = Keypair::new();
    let imposter_pt_ata =
        get_associated_token_address(&imposter.pubkey(), &fixture.pt_mint.pubkey());
    let create_imposter_pt = ata_instruction::create_associated_token_account(
        &user.pubkey(),
        &imposter.pubkey(),
        &fixture.pt_mint.pubkey(),
        &spl_token::id(),
    );
    send_tx(context, &[create_imposter_pt], &[user, &imposter]).await;

    let mut mint_ix = fixture.mint_pt_yt_ix(1);
    if let Some(account_meta) = mint_ix
        .accounts
        .iter_mut()
        .find(|meta| meta.pubkey == fixture.user_pt_ata)
    {
        account_meta.pubkey = imposter_pt_ata;
    } else {
        panic!("user PT ATA meta missing");
    }

    let err = send_tx_expect_err(context, &[mint_ix], &[user]).await;
    assert_custom_error(err, ErrorCode::ConstraintOwner as u32);
}

#[tokio::test]
async fn close_market_requires_dual_admin_signers() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(10_000);
    send_tx(context, &[mint_ix], &[user]).await;

    let redeem_ix = fixture.redeem_principal_ix(10_000);
    send_tx(context, &[redeem_ix], &[user]).await;

    let close_accounts = accounts::CloseMarket {
        creator_authority: user.pubkey(),
        admin: user.pubkey(),
        creator_vault: fixture.creator_vault,
        market: fixture.market.pubkey(),
        pt_mint: fixture.pt_mint.pubkey(),
        yt_mint: fixture.yt_mint.pubkey(),
    };
    let close_ix = Instruction {
        program_id: splitter::id(),
        accounts: close_accounts.to_account_metas(None),
        data: instruction::CloseMarket {}.data(),
    };
    let err = send_tx_expect_err(context, &[close_ix], &[user]).await;
    assert_custom_error(err, ErrorCode::ConstraintAddress as u32);
}

#[tokio::test]
async fn close_market_missing_creator_authority_signature_fails() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(5_000);
    send_tx(context, &[mint_ix], &[user]).await;

    let redeem_ix = fixture.redeem_principal_ix(5_000);
    send_tx(context, &[redeem_ix], &[user]).await;

    let close_accounts = accounts::CloseMarket {
        creator_authority: fixture.pump_creator.pubkey(),
        admin: context.payer.pubkey(),
        creator_vault: fixture.creator_vault,
        market: fixture.market.pubkey(),
        pt_mint: fixture.pt_mint.pubkey(),
        yt_mint: fixture.yt_mint.pubkey(),
    };
    let close_ix = Instruction {
        program_id: splitter::id(),
        accounts: close_accounts.to_account_metas(None),
        data: instruction::CloseMarket {}.data(),
    };

    let payer_clone = clone_keypair(&context.payer);
    let err = send_tx_expect_err_owned(context, &[close_ix], vec![payer_clone]).await;
    match err {
        TransportError::TransactionError(TransactionError::InstructionError(
            _,
            InstructionError::MissingRequiredSignature,
        )) => {}
        other => panic!("unexpected transport error: {other:?}"),
    }
}

#[tokio::test]
async fn close_market_missing_admin_signature_fails() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(8_000);
    send_tx(context, &[mint_ix], &[user]).await;

    let redeem_ix = fixture.redeem_principal_ix(8_000);
    send_tx(context, &[redeem_ix], &[user]).await;

    let transfer_ix = system_instruction::transfer(
        &context.payer.pubkey(),
        &fixture.pump_creator.pubkey(),
        1_000_000,
    );
    let payer_clone = clone_keypair(&context.payer);
    send_tx_owned(context, &[transfer_ix], vec![payer_clone]).await;

    let close_accounts = accounts::CloseMarket {
        creator_authority: fixture.pump_creator.pubkey(),
        admin: context.payer.pubkey(),
        creator_vault: fixture.creator_vault,
        market: fixture.market.pubkey(),
        pt_mint: fixture.pt_mint.pubkey(),
        yt_mint: fixture.yt_mint.pubkey(),
    };
    let close_ix = Instruction {
        program_id: splitter::id(),
        accounts: close_accounts.to_account_metas(None),
        data: instruction::CloseMarket {}.data(),
    };

    let authority_clone = clone_keypair(&fixture.pump_creator);
    let err = send_tx_expect_err_owned(context, &[close_ix], vec![authority_clone]).await;
    match err {
        TransportError::TransactionError(TransactionError::InstructionError(
            _,
            InstructionError::MissingRequiredSignature,
        )) => {}
        other => panic!("unexpected transport error: {other:?}"),
    }
}

#[tokio::test]
async fn close_market_rejects_remaining_yt_supply() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(25_000);
    send_tx(context, &[mint_ix], &[user]).await;

    let close_accounts = accounts::CloseMarket {
        creator_authority: fixture.pump_creator.pubkey(),
        admin: context.payer.pubkey(),
        creator_vault: fixture.creator_vault,
        market: fixture.market.pubkey(),
        pt_mint: fixture.pt_mint.pubkey(),
        yt_mint: fixture.yt_mint.pubkey(),
    };
    let close_ix = Instruction {
        program_id: splitter::id(),
        accounts: close_accounts.to_account_metas(None),
        data: instruction::CloseMarket {}.data(),
    };
    let payer_clone = clone_keypair(&context.payer);
    let authority_clone = clone_keypair(&fixture.pump_creator);
    let err =
        send_tx_expect_err_owned(context, &[close_ix], vec![payer_clone, authority_clone]).await;
    assert_custom_error(err, SplitterError::OutstandingYield as u32);
}

#[tokio::test]
async fn mint_pt_yt_fails_when_market_is_closed() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    mark_market_closed(context, fixture.market.pubkey()).await;

    let mint_ix = fixture.mint_pt_yt_ix(1);
    let err = send_tx_expect_err(context, &[mint_ix], &[user]).await;
    assert_custom_error(err, SplitterError::MarketClosed as u32);
}

#[tokio::test]
async fn redeem_yield_rejects_closed_market_flag() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(10_000);
    send_tx(context, &[mint_ix], &[user]).await;

    mark_market_closed(context, fixture.market.pubkey()).await;

    let redeem_ix = fixture.redeem_yield_ix(FEE_INDEX_SCALE);
    let err = send_tx_expect_err(context, &[redeem_ix], &[user]).await;
    assert_custom_error(err, SplitterError::MarketClosed as u32);
}

#[tokio::test]
async fn redeem_principal_rejects_closed_market_flag() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;
    let user = &fixture.user;

    let mint_ix = fixture.mint_pt_yt_ix(5_000);
    send_tx(context, &[mint_ix], &[user]).await;

    mark_market_closed(context, fixture.market.pubkey()).await;

    let redeem_ix = fixture.redeem_principal_ix(1_000);
    let err = send_tx_expect_err(context, &[redeem_ix], &[user]).await;
    assert_custom_error(err, SplitterError::MarketClosed as u32);
}

#[tokio::test]
async fn create_market_rejects_decimal_mismatch() {
    let mut fixture = setup_market_fixture().await;
    let context = &mut fixture.context;

    let market = Keypair::new();
    let pt_mint = Keypair::new();
    let yt_mint = Keypair::new();

    let payer_clone = clone_keypair(&context.payer);
    create_mint(context, &pt_mint, &payer_clone, DECIMALS - 1).await;
    let payer_clone = clone_keypair(&context.payer);
    create_mint(context, &yt_mint, &payer_clone, DECIMALS).await;

    let create_accounts = accounts::CreateMarket {
        authority: context.payer.pubkey(),
        creator_vault: fixture.creator_vault,
        splitter_authority: fixture.splitter_authority,
        pump_mint: fixture.pump_mint.pubkey(),
        sy_mint: fixture.sy_mint,
        market: market.pubkey(),
        pt_mint: pt_mint.pubkey(),
        yt_mint: yt_mint.pubkey(),
        system_program: system_program::id(),
        token_program: spl_token::id(),
        rent: sysvar::rent::ID,
    };
    let ix = Instruction {
        program_id: splitter::id(),
        accounts: create_accounts.to_account_metas(None),
        data: instruction::CreateMarket {
            maturity_ts: fixture.maturity_ts,
        }
        .data(),
    };

    let err = send_tx_expect_err_owned(
        context,
        &[ix],
        vec![
            clone_keypair(&context.payer),
            clone_keypair(&market),
            clone_keypair(&pt_mint),
            clone_keypair(&yt_mint),
        ],
    )
    .await;
    assert_custom_error(err, SplitterError::MintDecimalsMismatch as u32);
}

async fn seed_creator_vault_accounts(
    context: &mut ProgramTestContext,
    rent: &Rent,
    pump_mint: &Keypair,
    quote_mint: &Keypair,
    pump_creator: &Keypair,
    creator_vault_pda: Pubkey,
    creator_vault_bump: u8,
    fee_vault_pda: Pubkey,
    fee_vault_bump: u8,
    sy_mint_pda: Pubkey,
    sy_mint_bump: u8,
) {
    // sy mint
    let mut sy_mint_state = MintState::default();
    sy_mint_state.mint_authority = COption::Some(creator_vault_pda);
    sy_mint_state.decimals = DECIMALS;
    sy_mint_state.is_initialized = true;
    let mut sy_mint_data = vec![0u8; MintState::LEN];
    MintState::pack(sy_mint_state, &mut sy_mint_data).unwrap();
    let mut sy_account = Account::new(
        rent.minimum_balance(MintState::LEN),
        sy_mint_data.len(),
        &spl_token::id(),
    );
    sy_account.data = sy_mint_data;
    context.set_account(&sy_mint_pda, &AccountSharedData::from(sy_account));

    // fee vault
    let mut fee_account_state = TokenAccountState::default();
    fee_account_state.mint = quote_mint.pubkey();
    fee_account_state.owner = creator_vault_pda;
    fee_account_state.state = AccountState::Initialized;
    let mut fee_data = vec![0u8; TokenAccountState::LEN];
    TokenAccountState::pack(fee_account_state, &mut fee_data).unwrap();
    let mut fee_account = Account::new(
        rent.minimum_balance(TokenAccountState::LEN),
        fee_data.len(),
        &spl_token::id(),
    );
    fee_account.data = fee_data;
    context.set_account(&fee_vault_pda, &AccountSharedData::from(fee_account));

    // creator vault state
    let creator_state = CreatorVault {
        bump: creator_vault_bump,
        fee_vault_bump,
        sy_mint_bump,
        authority: pump_creator.pubkey(),
        pump_creator: pump_creator.pubkey(),
        pump_mint: pump_mint.pubkey(),
        quote_mint: quote_mint.pubkey(),
        sy_mint: sy_mint_pda,
        splitter_program: splitter::id(),
        total_fees_collected: 0,
        total_sy_minted: 0,
        admin: context.payer.pubkey(),
        sol_rewards_bps: 0,
        paused: false,
        padding: [0; 5],
    };
    let mut state_data = CreatorVault::DISCRIMINATOR.to_vec();
    let mut creator_bytes = creator_state.try_to_vec().unwrap();
    state_data.append(&mut creator_bytes);
    state_data.resize(8 + CreatorVault::INIT_SPACE, 0);
    let mut creator_account = Account::new(
        rent.minimum_balance(8 + CreatorVault::INIT_SPACE),
        state_data.len(),
        &creator_vault::id(),
    );
    creator_account.data = state_data;
    context.set_account(
        &creator_vault_pda,
        &AccountSharedData::from(creator_account),
    );
}

async fn seed_user_sy_balance(
    context: &mut ProgramTestContext,
    user_sy_ata: Pubkey,
    sy_mint_pda: Pubkey,
    creator_vault_pda: Pubkey,
    amount: u64,
) {
    // Update user SY ATA amount
    let mut sy_account = context
        .banks_client
        .get_account(user_sy_ata)
        .await
        .unwrap()
        .unwrap();
    let mut sy_state = TokenAccountState::unpack(&sy_account.data).unwrap();
    sy_state.amount = amount;
    let mut sy_data = sy_account.data;
    TokenAccountState::pack(sy_state, &mut sy_data).unwrap();
    sy_account.data = sy_data;
    context.set_account(&user_sy_ata, &AccountSharedData::from(sy_account));

    // Update sy mint supply
    let mut mint_account = context
        .banks_client
        .get_account(sy_mint_pda)
        .await
        .unwrap()
        .unwrap();
    let mut mint_state = MintState::unpack(&mint_account.data).unwrap();
    mint_state.supply = amount;
    let mut mint_data = mint_account.data;
    MintState::pack(mint_state, &mut mint_data).unwrap();
    mint_account.data = mint_data;
    context.set_account(&sy_mint_pda, &AccountSharedData::from(mint_account));

    // Update creator vault accounting
    let mut creator_account = context
        .banks_client
        .get_account(creator_vault_pda)
        .await
        .unwrap()
        .unwrap();
    let mut cursor: &[u8] = &creator_account.data;
    let mut state = CreatorVault::try_deserialize(&mut cursor).unwrap();
    state.total_fees_collected = amount;
    state.total_sy_minted = amount;
    let mut data = CreatorVault::DISCRIMINATOR.to_vec();
    let mut state_bytes = state.try_to_vec().unwrap();
    data.append(&mut state_bytes);
    data.resize(8 + CreatorVault::INIT_SPACE, 0);
    creator_account.data = data;
    context.set_account(
        &creator_vault_pda,
        &AccountSharedData::from(creator_account),
    );
}

async fn mark_market_closed(context: &mut ProgramTestContext, market: Pubkey) {
    let mut market_account = context
        .banks_client
        .get_account(market)
        .await
        .unwrap()
        .unwrap();
    let mut data_slice: &[u8] = &market_account.data;
    let mut state = Market::try_deserialize(&mut data_slice).unwrap();
    state.is_closed = true;
    if state.maturity_ts > 0 {
        state.maturity_ts = -1;
    }
    let mut serialized = Market::DISCRIMINATOR.to_vec();
    let mut body = state.try_to_vec().unwrap();
    serialized.append(&mut body);
    serialized.resize(8 + Market::INIT_SPACE, 0);
    market_account.data = serialized;
    context.set_account(&market, &AccountSharedData::from(market_account));
}

async fn process_tx(
    context: &mut ProgramTestContext,
    instructions: &[Instruction],
    signers: &[&Keypair],
) -> Result<(), TransportError> {
    let tx = Transaction::new_signed_with_payer(
        instructions,
        Some(&signers[0].pubkey()),
        signers,
        context.last_blockhash,
    );
    let result = context.banks_client.process_transaction(tx.clone()).await;
    context.last_blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
    result
}

async fn send_tx(
    context: &mut ProgramTestContext,
    instructions: &[Instruction],
    signers: &[&Keypair],
) {
    if let Err(err) = process_tx(context, instructions, signers).await {
        let tx = Transaction::new_signed_with_payer(
            instructions,
            Some(&signers[0].pubkey()),
            signers,
            context.last_blockhash,
        );
        if let Ok(simulation) = context.banks_client.simulate_transaction(tx.clone()).await {
            if let Some(details) = simulation.simulation_details {
                for log in details.logs {
                    println!("tx log: {}", log);
                }
            }
        }
        panic!("process_transaction failed: {:?}", err);
    }
}

async fn send_tx_expect_err(
    context: &mut ProgramTestContext,
    instructions: &[Instruction],
    signers: &[&Keypair],
) -> TransportError {
    if let Err(err) = process_tx(context, instructions, signers).await {
        return err;
    }
    panic!("transaction unexpectedly succeeded");
}

async fn send_tx_expect_err_owned(
    context: &mut ProgramTestContext,
    instructions: &[Instruction],
    signers: Vec<Keypair>,
) -> TransportError {
    let signer_refs: Vec<&Keypair> = signers.iter().collect();
    send_tx_expect_err(context, instructions, &signer_refs).await
}

fn assert_custom_error(err: TransportError, expected: u32) {
    match err {
        TransportError::TransactionError(TransactionError::InstructionError(
            _,
            InstructionError::Custom(code),
        )) => assert_eq!(code, expected, "unexpected custom error code"),
        other => panic!("unexpected transport error: {other:?}"),
    }
}

async fn send_tx_owned(
    context: &mut ProgramTestContext,
    instructions: &[Instruction],
    signers: Vec<Keypair>,
) {
    let signer_refs: Vec<&Keypair> = signers.iter().collect();
    send_tx(context, instructions, &signer_refs).await;
}

async fn create_mint(
    context: &mut ProgramTestContext,
    mint: &Keypair,
    authority: &Keypair,
    decimals: u8,
) {
    let rent = context.banks_client.get_rent().await.unwrap();
    let lamports = rent.minimum_balance(MintState::LEN);

    let create_ix = system_instruction::create_account(
        &authority.pubkey(),
        &mint.pubkey(),
        lamports,
        MintState::LEN as u64,
        &spl_token::id(),
    );
    let init_ix = token_instruction::initialize_mint(
        &spl_token::id(),
        &mint.pubkey(),
        &authority.pubkey(),
        None,
        decimals,
    )
    .unwrap();

    send_tx(context, &[create_ix, init_ix], &[authority, mint]).await;
}

async fn get_token_account(context: &mut ProgramTestContext, pubkey: &Pubkey) -> TokenAccountState {
    let account = context
        .banks_client
        .get_account(*pubkey)
        .await
        .unwrap()
        .unwrap();
    TokenAccountState::unpack(&account.data).unwrap()
}

async fn get_mint(context: &mut ProgramTestContext, pubkey: &Pubkey) -> MintState {
    let account = context
        .banks_client
        .get_account(*pubkey)
        .await
        .unwrap()
        .unwrap();
    MintState::unpack(&account.data).unwrap()
}

async fn fetch_market(context: &mut ProgramTestContext, pubkey: Pubkey) -> Market {
    let account = context
        .banks_client
        .get_account(pubkey)
        .await
        .unwrap()
        .unwrap();
    let mut data_slice: &[u8] = &account.data;
    Market::try_deserialize(&mut data_slice).unwrap()
}

fn clone_keypair(keypair: &Keypair) -> Keypair {
    Keypair::from_bytes(&keypair.to_bytes()).unwrap()
}
