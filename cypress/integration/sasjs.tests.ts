const sasjsTestsUrl = Cypress.env('sasjsTestsUrl')
const username = Cypress.env('username')
const password = Cypress.env('password')
const testingFinishTimeout = Cypress.env('testingFinishTimeout')

context('sasjs-tests', function () {
  this.beforeAll(() => {
    cy.visit(sasjsTestsUrl)
  })

  this.beforeEach(() => {
    cy.reload()
  })

  it('Should have all tests successfull', (done) => {
    cy.get('body').then(($body) => {
      cy.wait(1000).then(() => {
        const startButton = $body.find(
          '.ui.massive.icon.primary.left.labeled.button'
        )[0]

        if (
          !startButton ||
          (startButton && !Cypress.dom.isVisible(startButton))
        ) {
          cy.get('input[placeholder="User Name"]').type(username)
          cy.get('input[placeholder="Password"]').type(password)
          cy.get('.submit-button').click()
        }

        cy.get('input[placeholder="User Name"]', { timeout: 40000 })
          .should('not.exist')
          .then(() => {
            cy.get('.ui.massive.icon.primary.left.labeled.button')
              .click()
              .then(() => {
                cy.get('.ui.massive.loading.primary.button', {
                  timeout: testingFinishTimeout
                })
                  .should('not.exist')
                  .then(() => {
                    cy.get('span.icon.failed')
                      .should('not.exist')
                      .then(() => {
                        done()
                      })
                  })
              })
          })
      })
    })
  })

  it('Should have all tests successfull with debug on', (done) => {
    cy.get('body').then(($body) => {
      cy.wait(1000).then(() => {
        const startButton = $body.find(
          '.ui.massive.icon.primary.left.labeled.button'
        )[0]

        if (
          !startButton ||
          (startButton && !Cypress.dom.isVisible(startButton))
        ) {
          cy.get('input[placeholder="User Name"]').type(username)
          cy.get('input[placeholder="Password"]').type(password)
          cy.get('.submit-button').click()
        }

        cy.get('.ui.fitted.toggle.checkbox label')
          .click()
          .then(() => {
            cy.get('input[placeholder="User Name"]', { timeout: 40000 })
              .should('not.exist')
              .then(() => {
                cy.get('.ui.massive.icon.primary.left.labeled.button')
                  .click()
                  .then(() => {
                    cy.get('.ui.massive.loading.primary.button', {
                      timeout: testingFinishTimeout
                    })
                      .should('not.exist')
                      .then(() => {
                        cy.get('span.icon.failed')
                          .should('not.exist')
                          .then(() => {
                            done()
                          })
                      })
                  })
              })
          })
      })
    })
  })
})
