describe('Advance RFQ flow', () => {
  const marketId = 'Market1111111111111111111111111111111111';
  const sellQuoteBody = {
    quote_id: 'sell-quote-123',
    market: marketId,
    size_yt: 100,
    price_usdc: 98.5,
    implied_apr: 0.1825,
    est_slippage: 0.003,
    route: 'rfq',
    side: 'sell',
    expires_at: new Date(Date.now() + 30_000).toISOString(),
    cursor: 'sell-quote-123',
  };
  const buyQuoteBody = {
    quote_id: 'buy-quote-123',
    market: marketId,
    size_yt: 50,
    price_usdc: 51.2,
    implied_apr: 0.1825,
    est_slippage: 0.004,
    route: 'rfq',
    side: 'buyback',
    expires_at: new Date(Date.now() + 30_000).toISOString(),
    cursor: 'buy-quote-123',
  };

  beforeEach(() => {
    cy.intercept('GET', '**/readyz', {
      statusCode: 200,
      body: { status: 'ok' },
    }).as('readyz');

    cy.intercept('GET', '**/version', {
      statusCode: 200,
      body: { version: '0.0.0', git_sha: 'deadbeefdeadbeef', built_at_unix: 0 },
      headers: { ETag: 'W/"version"', 'Cache-Control': 'private, max-age=0, must-revalidate' },
    }).as('version');

    cy.intercept('GET', '**/v1/governance', {
      statusCode: 200,
      body: {
        creator_vaults: [
          {
            creator_vault: 'CreatorVault1111111111111111111111111111111',
            pump_mint: 'PumpMint11111111111111111111111111111111',
            admin: 'Admin11111111111111111111111111111111111',
            sol_rewards_bps: 300,
            paused: false,
            sy_mint: 'SyMint111111111111111111111111111111111',
            advance_enabled: true,
          },
        ],
        rewards_pools: [],
        stable_vault: { paused: false },
      },
      headers: { ETag: 'W/"governance"', 'Cache-Control': 'private, max-age=0, must-revalidate' },
    }).as('governance');

    cy.intercept('GET', `**/v1/markets/${marketId}`, {
      statusCode: 200,
      body: {
        summary: {
          market: marketId,
          pump_mint: 'PumpMint11111111111111111111111111111111',
          creator_vault: 'CreatorVault1111111111111111111111111111111',
          sy_mint: 'SyMint111111111111111111111111111111111',
          pt_mint: 'PtMint111111111111111111111111111111111',
          yt_mint: 'YtMint111111111111111111111111111111111',
          maturity_ts: Math.floor(Date.now() / 1000) + 15 * 86400,
          pt_supply: 125000,
          yt_supply: 125000,
          implied_apy: 0.1825,
          status: 'active',
        },
        total_fees_distributed_sol: 420.5,
        fee_index: 1.02,
        tvl_sol: 95000,
        last_yield_slot: 235000000,
        updated_at: new Date().toISOString(),
      },
      headers: { ETag: 'W/"market-detail"', 'Cache-Control': 'private, max-age=0, must-revalidate' },
    }).as('marketDetail');

    cy.intercept('GET', '**/v1/overview', {
      statusCode: 200,
      body: {
        total_creator_vaults: 1,
        total_markets: 1,
        total_fees_collected_sol: 420,
        attnusd_supply: 100000,
        attnusd_nav: 102000,
        updated_at: new Date().toISOString(),
      },
      headers: { ETag: 'W/"overview"', 'Cache-Control': 'private, max-age=0, must-revalidate' },
    }).as('overview');

    let sellQuoteCount = 0;
    cy.intercept('GET', `**/v1/markets/${marketId}/yt-quote*side=sell*`, (req) => {
      sellQuoteCount += 1;
      if (sellQuoteCount === 1) {
        req.reply({
          statusCode: 200,
          body: sellQuoteBody,
          headers: { ETag: 'W/"sell-quote"', 'Cache-Control': 'private, max-age=0, must-revalidate' },
        });
      } else {
        req.reply({
          statusCode: 304,
          headers: { ETag: 'W/"sell-quote"', 'Cache-Control': 'private, max-age=0, must-revalidate' },
        });
      }
    }).as('sellQuote');

    let buyQuoteCount = 0;
    cy.intercept('GET', `**/v1/markets/${marketId}/yt-quote*side=buyback*`, (req) => {
      buyQuoteCount += 1;
      if (buyQuoteCount === 1) {
        req.reply({
          statusCode: 200,
          body: buyQuoteBody,
          headers: { ETag: 'W/"buy-quote"', 'Cache-Control': 'private, max-age=0, must-revalidate' },
        });
      } else {
        req.reply({
          statusCode: 304,
          headers: { ETag: 'W/"buy-quote"', 'Cache-Control': 'private, max-age=0, must-revalidate' },
        });
      }
    }).as('buyQuote');
  });

  it('fetches and caches advance quotes', () => {
    cy.visit(`/markets/${marketId}`);

    cy.wait('@marketDetail');

    cy.contains('Get quote').click();
    cy.wait('@sellQuote');
    cy.contains('Upfront USDC').should('be.visible');
    cy.contains('98.5');

    cy.contains('Get quote').click();
    cy.wait('@sellQuote');
    cy.contains('Upfront USDC').should('be.visible');

    cy.contains('Get buyback quote').click();
    cy.wait('@buyQuote');
    cy.contains('USDC required').should('be.visible');
    cy.contains('51.2');

    cy.contains('Get buyback quote').click();
    cy.wait('@buyQuote');
    cy.contains('USDC required').should('be.visible');
  });
});
