const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    includeShadowDom: true,
    chromeWebSecurity: false,
    defaultCommandTimeout: 20000,
    specPattern: 'cypress/integration/**/*.ts',
    supportFile: 'cypress/support/index.js'
  },
  env: {
    sasjsTestsUrl: 'http://localhost:3000',
    username: '',
    password: '',
    screenshotOnRunFailure: false,
    testingFinishTimeout: 600000
  }
})
