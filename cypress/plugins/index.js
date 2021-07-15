/// <reference types="cypress" />
// ***********************************************************
// This example plugins/index.js can be used to load plugins
//
// You can change the location of this file or turn off loading
// the plugins file with the 'pluginsFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

const wp = require("@cypress/webpack-preprocessor");

/**
 * @type {Cypress.PluginConfig}
 */
module.exports = (on, config) => {
  // `on` is used to hook into various events Cypress emits
  // `config` is the resolved Cypress config

  const options = {
    webpackOptions: require("../webpack.config.js")
  };
  on("file:preprocessor", wp(options));

  on("before:browser:launch", (browser = {}, launchOptions) => {
    if (browser.name === "chrome") {
      launchOptions.args.push("--disable-site-isolation-trials");
      launchOptions.args.push("--auto-open-devtools-for-tabs");
      launchOptions.args.push("--aggressive-cache-discard")
      launchOptions.args.push("--disable-cache")
      launchOptions.args.push("--disable-application-cache")
      launchOptions.args.push("--disable-offline-load-stale-cache")
      launchOptions.args.push("--disk-cache-size=0")
      
      return launchOptions;
    }
  });
}
