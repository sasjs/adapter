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
      if ($body.find('input[placeholder="User Name"]').length > 0) {
        cy.get('input[placeholder="User Name"]')
          .should('be.visible')
          .type(username)
        cy.get('input[placeholder="Password"]')
          .should('be.visible')
          .type(password)
        cy.get('.submit-button').should('be.visible').click()
        cy.get('input[placeholder="User Name"]').should('not.exist') // Wait for login to finish
      }
    })
  }

  it('Should have all tests successful', () => {
    loginIfNeeded()

    cy.get('.ui.massive.icon.primary.left.labeled.button')
      .should('be.visible')
      .click()

    cy.get('.ui.massive.loading.primary.button', {
      timeout: testingFinishTimeout
    }).should('not.exist')

    cy.get('span.icon.failed').should('not.exist')
  })

  it('Should have all tests successful with debug on', () => {
    loginIfNeeded()

    cy.get('.ui.fitted.toggle.checkbox label').should('be.visible').click()

    cy.get('.ui.massive.icon.primary.left.labeled.button')
      .should('be.visible')
      .click()

    cy.get('.ui.massive.loading.primary.button', {
      timeout: testingFinishTimeout
    }).should('not.exist')

    cy.get('span.icon.failed').should('not.exist')
  })
})
