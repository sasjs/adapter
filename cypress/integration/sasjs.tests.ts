const sasjsTestsUrl = Cypress.env('sasjsTestsUrl')
const username = Cypress.env('username')
const password = Cypress.env('password')
const testingFinishTimeout = Cypress.env('testingFinishTimeout')

context('sasjs-tests', function () {
  this.beforeAll(() => {
    cy.task('log', 'beforeAll')
    cy.task('log', `sasjsTestsUrl: ${sasjsTestsUrl}`)

    cy.visit(sasjsTestsUrl)
  })

  this.beforeEach(() => {
    cy.reload()
  })

  it('Should have all tests successfull', (done) => {
    cy.task('log', `Should have all tests successfull`)

    cy.get('body').then(($body) => {
      cy.task('log', `22`)
      cy.wait(1000).then(() => {
        const startButton = $body.find(
          '.ui.massive.icon.primary.left.labeled.button'
        )[0]

        cy.task('log', `startButton: ${startButton}`)

        if (
          !startButton ||
          (startButton && !Cypress.dom.isVisible(startButton))
        ) {
          cy.task('log', `34`)
          cy.task('log', `username: ${username}`)
          cy.task('log', `password: ${password}`)

          cy.get('input[placeholder="User Name"]').type(username)
          cy.get('input[placeholder="Password"]').type(password)
          cy.get('.submit-button').click()
        }

        cy.get('input[placeholder="User Name"]', { timeout: 40000 })
          .should('not.exist')
          .then(() => {
            cy.task('log', `46`)
            cy.get('.ui.massive.icon.primary.left.labeled.button')
              .click()
              .then(() => {
                cy.task('log', `50`)
                cy.get('.ui.massive.loading.primary.button', {
                  timeout: testingFinishTimeout
                })
                  .should('not.exist')
                  .then(() => {
                    cy.task('log', `56`)
                    cy.get('span.icon.failed')
                      .should('not.exist')
                      .then(() => {
                        cy.task('log', `60`)
                        done()
                      })
                  })
              })
          })
      })
    })
  })

  // it('Should have all tests successfull with debug on', (done) => {
  //   cy.get('body').then(($body) => {
  //     cy.wait(1000).then(() => {
  //       const startButton = $body.find(
  //         '.ui.massive.icon.primary.left.labeled.button'
  //       )[0]

  //       if (
  //         !startButton ||
  //         (startButton && !Cypress.dom.isVisible(startButton))
  //       ) {
  //         cy.get('input[placeholder="User Name"]').type(username)
  //         cy.get('input[placeholder="Password"]').type(password)
  //         cy.get('.submit-button').click()
  //       }

  //       cy.get('.ui.fitted.toggle.checkbox label')
  //         .click()
  //         .then(() => {
  //           cy.get('input[placeholder="User Name"]', { timeout: 40000 })
  //             .should('not.exist')
  //             .then(() => {
  //               cy.get('.ui.massive.icon.primary.left.labeled.button')
  //                 .click()
  //                 .then(() => {
  //                   cy.get('.ui.massive.loading.primary.button', {
  //                     timeout: testingFinishTimeout
  //                   })
  //                     .should('not.exist')
  //                     .then(() => {
  //                       cy.get('span.icon.failed')
  //                         .should('not.exist')
  //                         .then(() => {
  //                           done()
  //                         })
  //                     })
  //                 })
  //             })
  //         })
  //     })
  //   })
  // })
})
