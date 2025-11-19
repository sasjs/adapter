const sasjsTestsUrl = Cypress.env('sasjsTestsUrl')
const username = Cypress.env('username')
const password = Cypress.env('password')
const testingFinishTimeout = Cypress.env('testingFinishTimeout')

context('sasjs-tests', function () {
  before(() => {
    cy.visit(sasjsTestsUrl)
  })

  beforeEach(() => {
    cy.reload()
  })

  function loginIfNeeded() {
    cy.get('body').then(($body) => {
      if ($body.find('login-form').length > 0) {
        cy.get('login-form')
          .shadow()
          .find('#username')
          .should('be.visible')
          .type(username)
        cy.get('login-form')
          .shadow()
          .find('#password')
          .should('be.visible')
          .type(password)
        cy.get('login-form')
          .shadow()
          .find('#submit-btn')
          .should('be.visible')
          .click()
        cy.get('login-form').should('not.exist') // Wait for login to finish
      }
    })
  }

  it('Should have all tests successful', () => {
    loginIfNeeded()

    cy.get('tests-view').shadow().find('#run-btn').should('be.visible').click()

    cy.get('tests-view')
      .shadow()
      .find('#run-btn:disabled', {
        timeout: testingFinishTimeout
      })
      .should('not.exist')

    cy.get('test-card').shadow().find('.status-icon.failed').should('not.exist')
  })

  it('Should have all tests successful with debug on', () => {
    loginIfNeeded()

    cy.get('tests-view')
      .shadow()
      .find('#debug-toggle')
      .should('be.visible')
      .click()

    cy.get('tests-view').shadow().find('#run-btn').should('be.visible').click()

    cy.get('tests-view')
      .shadow()
      .find('#run-btn:disabled', {
        timeout: testingFinishTimeout
      })
      .should('not.exist')

    cy.get('test-card').shadow().find('.status-icon.failed').should('not.exist')
  })
})
