const sasjsTestsUrl = Cypress.env('sasjsTestsUrl')
const username = Cypress.env('username')
const password = Cypress.env('password')
const testingFinishTimeout = Cypress.env('testingFinishTimeout')

context('sasjs-tests', function () {
  before(() => {
    cy.visit(sasjsTestsUrl)
  })

  beforeEach(() => {
    cy.visit(sasjsTestsUrl)
  })

  function assertNoFailedTests() {
    cy.get('test-card').then(($cards) => {
      const failures: string[] = []
      $cards.each((_, card) => {
        const shadow = (card as HTMLElement).shadowRoot
        if (!shadow) return
        if (!shadow.querySelector('.status-icon.failed')) return
        const title =
          shadow.querySelector('.header h3')?.textContent?.trim() ?? '(unknown)'
        const error =
          shadow.querySelector('.error pre')?.textContent?.trim() ?? ''
        failures.push(error ? `- ${title}\n    ${error}` : `- ${title}`)
      })
      expect(
        failures,
        `${failures.length} test(s) failed:\n${failures.join('\n')}`
      ).to.be.empty
    })
  }

  function loginIfNeeded() {
    cy.get('login-form, tests-view', { timeout: 30000 }).should('exist')

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

    assertNoFailedTests()
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

    assertNoFailedTests()
  })
})
