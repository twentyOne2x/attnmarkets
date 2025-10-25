describe('Live mode readiness', () => {
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
      body: { creator_vaults: [], rewards_pools: [], stable_vault: null },
      headers: { ETag: 'W/"governance"', 'Cache-Control': 'private, max-age=0, must-revalidate' },
    }).as('governance');

    cy.intercept('GET', '**/v1/overview', {
      statusCode: 200,
      body: {
        total_creator_vaults: 0,
        total_markets: 0,
        total_fees_collected_sol: 0,
        attnusd_supply: 0,
        attnusd_nav: 0,
        updated_at: new Date().toISOString(),
      },
      headers: { ETag: 'W/"overview"', 'Cache-Control': 'private, max-age=0, must-revalidate' },
    }).as('overview');

    cy.intercept('GET', '**/v1/*', (req) => {
      if (!req.alias) {
        req.reply({ statusCode: 200, body: {}, headers: { ETag: 'W/"stub"' } });
      }
    });

    cy.visit('/');
  });

  it('toggles Live mode and hides governance pause banner', () => {
    cy.contains('button', 'Live').click();
    cy.wait('@readyz');
    cy.wait('@governance');
    cy.contains('Writes disabled: governance pause active.').should('not.exist');
  });
});
