use anchor_lang::prelude::*;
use anchor_lang::{InstructionData, ToAccountMetas};
use creator_vault::CreatorVault;
use anchor_lang::Discriminator;
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::{Account, AccountSharedData},
    instruction::Instruction,
    signature::{Keypair, Signer},
    system_instruction, system_program,
    transaction::Transaction,
    sysvar,
};
use solana_program::{entrypoint::ProgramResult, program_option::COption, program_pack::Pack};
use std::mem;
use spl_associated_token_account::get_associated_token_address;
use spl_associated_token_account::instruction as ata_instruction;
use spl_token::instruction as token_instruction;
use spl_token::state::{Account as TokenAccountState, AccountState, Mint as MintState};
use splitter::{accounts, instruction, Market};

const DECIMALS: u8 = 6;
const FEE_INDEX_SCALE: u128 = 1_000_000_000;

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
    let program_test =
        ProgramTest::new("splitter", splitter::id(), processor!(splitter_entry_shim));

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

    let mut context = program_test.start_with_context().await;
    let rent = context.banks_client.get_rent().await.unwrap();

    // Fund user
    let transfer_ix =
        system_instruction::transfer(&context.payer.pubkey(), &user.pubkey(), 1_000_000_000);
    let payer_clone = clone_keypair(&context.payer);
    send_tx_owned(&mut context, &[transfer_ix], vec![payer_clone]).await;

    // Create pump and quote mints
    let payer_clone = clone_keypair(&context.payer);
    create_mint(&mut context, &pump_mint, &payer_clone, DECIMALS).await;
    let payer_clone = clone_keypair(&context.payer);
    create_mint(&mut context, &quote_mint, &payer_clone, DECIMALS).await;

    // Pre-seed CreatorVault PDA accounts
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

    // Create user quote ATA and mint quote liquidity
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

    // Seed fee vault with wrapped fees (simulate WrapFees)
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

    // Create user SY ATA (owned by CreatorVault PDA)
    let user_sy_ata = get_associated_token_address(&user.pubkey(), &sy_mint_pda);
    let create_sy_ata_ix = ata_instruction::create_associated_token_account(
        &user.pubkey(),
        &user.pubkey(),
        &sy_mint_pda,
        &spl_token::id(),
    );
    send_tx(&mut context, &[create_sy_ata_ix], &[&user]).await;

    // Manually seed SY balance and CreatorVault accounting
    seed_user_sy_balance(
        &mut context,
        user_sy_ata,
        sy_mint_pda,
        creator_vault_pda,
        400_000,
    )
    .await;

    // Prepare maturity timestamp
    let clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    let maturity_ts: i64 = clock.unix_timestamp + 10;

    // Create market
    let market_account = Keypair::new();
    let pt_mint = Keypair::new();
    let yt_mint = Keypair::new();

    let create_market_accounts = accounts::CreateMarket {
        authority: context.payer.pubkey(),
        creator_vault: creator_vault_pda,
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

    // User PT/YT ATAs
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

    // Mint PT/YT by burning SY
    let (user_position_pda, _) = Pubkey::find_program_address(
        &[
            b"user-position",
            market_account.pubkey().as_ref(),
            user.pubkey().as_ref(),
        ],
        &splitter::id(),
    );
    let mint_accounts = accounts::MintPtYt {
        market: market_account.pubkey(),
        creator_vault: creator_vault_pda,
        user: user.pubkey(),
        user_sy_ata,
        user_pt_ata,
        user_yt_ata,
        sy_mint: sy_mint_pda,
        pt_mint: pt_mint.pubkey(),
        yt_mint: yt_mint.pubkey(),
        user_position: user_position_pda,
        token_program: spl_token::id(),
        system_program: system_program::id(),
    };
    let mint_ix = Instruction {
        program_id: splitter::id(),
        accounts: mint_accounts.to_account_metas(None),
        data: instruction::MintPtYt { amount: 250_000 }.data(),
    };
    send_tx(&mut context, &[mint_ix], &[&user]).await;

    // Validate PT/YT balances
    let pt_account = get_token_account(&mut context, &user_pt_ata).await;
    let yt_account = get_token_account(&mut context, &user_yt_ata).await;
    assert_eq!(pt_account.amount, 250_000);
    assert_eq!(yt_account.amount, 250_000);

    // Validate market state
    let market_state = fetch_market(&mut context, market_account.pubkey()).await;
    assert_eq!(market_state.total_pt_issued, 250_000);
    assert_eq!(market_state.total_yt_issued, 250_000);
    assert_eq!(market_state.fee_index, 0);

    // Accrue yield by minting to fee vault
    let accrue_amount: u64 = 100_000;
    let mint_yield_ix = token_instruction::mint_to(
        &spl_token::id(),
        &quote_mint.pubkey(),
        &fee_vault_pda,
        &context.payer.pubkey(),
        &[],
        accrue_amount,
    )
    .unwrap();
    let payer_clone = clone_keypair(&context.payer);
    send_tx_owned(&mut context, &[mint_yield_ix], vec![payer_clone]).await;

    // Redeem yield with updated index
    let delta_index = (accrue_amount as u128 * FEE_INDEX_SCALE) / market_state.total_yt_issued as u128;
    let new_fee_index = market_state.fee_index + delta_index;

    let redeem_accounts = accounts::RedeemYield {
        market: market_account.pubkey(),
        creator_vault: creator_vault_pda,
        user: user.pubkey(),
        user_position: user_position_pda,
        user_yt_ata,
        fee_vault: fee_vault_pda,
        user_quote_ata,
        token_program: spl_token::id(),
    };
    let redeem_ix = Instruction {
        program_id: splitter::id(),
        accounts: redeem_accounts.to_account_metas(None),
        data: instruction::RedeemYield {
            new_fee_index,
        }
        .data(),
    };
    let pre_quote_balance = get_token_account(&mut context, &user_quote_ata).await.amount;
    send_tx(&mut context, &[redeem_ix], &[&user]).await;
    let post_quote_balance = get_token_account(&mut context, &user_quote_ata).await.amount;
    assert_eq!(post_quote_balance - pre_quote_balance, accrue_amount);

    // Warp to maturity
    context
        .warp_to_slot(clock.slot + 1_000)
        .unwrap();

    // Redeem principal in two steps
    let redeem_accounts = accounts::RedeemPrincipal {
        market: market_account.pubkey(),
        creator_vault: creator_vault_pda,
        user: user.pubkey(),
        user_pt_ata,
        user_sy_ata,
        pt_mint: pt_mint.pubkey(),
        sy_mint: sy_mint_pda,
        token_program: spl_token::id(),
    };

    let redeem_ix = Instruction {
        program_id: splitter::id(),
        accounts: redeem_accounts.to_account_metas(None),
        data: instruction::RedeemPrincipal { amount: 100_000 }.data(),
    };
    send_tx(&mut context, &[redeem_ix], &[&user]).await;

    let redeem_ix = Instruction {
        program_id: splitter::id(),
        accounts: redeem_accounts.to_account_metas(None),
        data: instruction::RedeemPrincipal { amount: 150_000 }.data(),
    };
    send_tx(&mut context, &[redeem_ix], &[&user]).await;

    let pt_account = get_token_account(&mut context, &user_pt_ata).await;
    assert_eq!(pt_account.amount, 0);

    let sy_account = get_token_account(&mut context, &user_sy_ata).await;
    assert_eq!(sy_account.amount, 400_000);

    let pt_mint_state = get_mint(&mut context, &pt_mint.pubkey()).await;
    assert_eq!(pt_mint_state.supply, 0);

    // Close market
    let close_accounts = accounts::CloseMarket {
        authority: context.payer.pubkey(),
        creator_vault: creator_vault_pda,
        market: market_account.pubkey(),
        pt_mint: pt_mint.pubkey(),
        yt_mint: yt_mint.pubkey(),
    };
    let close_ix = Instruction {
        program_id: splitter::id(),
        accounts: close_accounts.to_account_metas(None),
        data: instruction::CloseMarket {}.data(),
    };
    let payer_clone = clone_keypair(&context.payer);
    send_tx_owned(&mut context, &[close_ix], vec![payer_clone]).await;

    let market_account_result = context
        .banks_client
        .get_account(market_account.pubkey())
        .await
        .unwrap();
    assert!(market_account_result.is_none());
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
        authority: context.payer.pubkey(),
        pump_creator: pump_creator.pubkey(),
        pump_mint: pump_mint.pubkey(),
        quote_mint: quote_mint.pubkey(),
        sy_mint: sy_mint_pda,
        total_fees_collected: 0,
        total_sy_minted: 0,
    };
    let mut state_data = CreatorVault::discriminator().to_vec();
    let mut creator_bytes = creator_state.try_to_vec().unwrap();
    state_data.append(&mut creator_bytes);
    state_data.resize(8 + CreatorVault::INIT_SPACE, 0);
    let mut creator_account = Account::new(
        rent.minimum_balance(8 + CreatorVault::INIT_SPACE),
        state_data.len(),
        &creator_vault::id(),
    );
    creator_account.data = state_data;
    context.set_account(&creator_vault_pda, &AccountSharedData::from(creator_account));
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
    let mut data = CreatorVault::discriminator().to_vec();
    let mut state_bytes = state.try_to_vec().unwrap();
    data.append(&mut state_bytes);
    data.resize(8 + CreatorVault::INIT_SPACE, 0);
    creator_account.data = data;
    context.set_account(&creator_vault_pda, &AccountSharedData::from(creator_account));
}

async fn send_tx(
    context: &mut ProgramTestContext,
    instructions: &[Instruction],
    signers: &[&Keypair],
) {
    let tx = Transaction::new_signed_with_payer(
        instructions,
        Some(&signers[0].pubkey()),
        signers,
        context.last_blockhash,
    );
    context.banks_client.process_transaction(tx).await.unwrap();
    context.last_blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
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
