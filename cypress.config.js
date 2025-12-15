const { defineConfig } = require('cypress')

module.exports = defineConfig({
  includeShadowDom: true,
  e2e: {
    chromeWebSecurity: false,
    defaultCommandTimeout: 20000,
    specPattern: 'cypress/integration/**/*.ts',
    supportFile: 'cypress/support/index.js'
  },
  env: {
    sasjsTestsUrl: 'http://localhost:5173',
    username: '',
    password: '',
    screenshotOnRunFailure: false,
    testingFinishTimeout: 600000
  }
})
