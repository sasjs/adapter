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

  function waitForTestsToFinish(timeout: number) {
    const deadline = Date.now() + timeout
    function check() {
      cy.get('tests-view', { log: false }).then(($view) => {
        const shadow = ($view[0] as HTMLElement).shadowRoot
        const stillRunning = !!shadow?.querySelector('#run-btn:disabled')
        if (!stillRunning) return
        if (Date.now() >= deadline) {
          cy.log('Timed out waiting for tests to finish; reporting status')
          return
        }
        cy.wait(2000, { log: false })
        check()
      })
    }
    check()
  }

  function assertNoFailedTests() {
    cy.get('test-card').then(($cards) => {
      const failed: string[] = []
      const stuck: string[] = []
      const pending: string[] = []
      $cards.each((_, card) => {
        const shadow = (card as HTMLElement).shadowRoot
        if (!shadow) return
        const icon = shadow.querySelector('.status-icon')
        const title =
          shadow.querySelector('.header h3')?.textContent?.trim() ?? '(unknown)'
        if (icon?.classList.contains('failed')) {
          const error =
            shadow.querySelector('.error pre')?.textContent?.trim() ?? ''
          failed.push(error ? `- ${title}\n    ${error}` : `- ${title}`)
        } else if (icon?.classList.contains('running')) {
          stuck.push(`- ${title}`)
        } else if (icon?.classList.contains('pending')) {
          pending.push(`- ${title}`)
        }
      })
      const parts: string[] = []
      if (failed.length)
        parts.push(`${failed.length} failed:\n${failed.join('\n')}`)
      if (stuck.length)
        parts.push(`${stuck.length} stuck (running):\n${stuck.join('\n')}`)
      if (pending.length)
        parts.push(
          `${pending.length} did not start (pending):\n${pending.join('\n')}`
        )
      expect(parts, parts.join('\n\n')).to.be.empty
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

    waitForTestsToFinish(testingFinishTimeout)

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

    waitForTestsToFinish(testingFinishTimeout)

    assertNoFailedTests()
  })
})
