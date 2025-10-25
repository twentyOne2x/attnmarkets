// https://on.cypress.io/configuration
// Custom commands can be added here.

beforeEach(() => {
  cy.on('uncaught:exception', () => false);
});
