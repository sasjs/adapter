const sasjsTestsUrl = Cypress.env('sasjsTestsUrl')
const username = Cypress.env('username')
const password = Cypress.env('password')
const testingFinishTimeout = Cypress.env('testingFinishTimeout')

context('sasjs-tests', function() {
    this.beforeAll(() => {
        cy.visit(sasjsTestsUrl)
    })

    it ('Should have all tests successfull', (done) => {
        cy.get('body').then($body => {
            if ($body.find('input[placeholder="User Name"]').length > 0) {
                cy.get('input[placeholder="User Name"]').type(username)
                cy.get('input[placeholder="Password"]').type(password)
                cy.get('.submit-button').click()
            }

            cy.get('input[placeholder="User Name"]', {timeout: 40000}).should('not.exist').then(() => {
                cy.get('.ui.massive.icon.primary.left.labeled.button').click().then(() => {
                    cy.get('.ui.massive.loading.primary.button').should('not.exist').then(() => {
                        cy.get('span.icon.failed', {timeout: testingFinishTimeout}).should('not.exist').then(() => {
                            done()
                        })
                    })
                })
            })
        })
    })
})