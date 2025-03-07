// craco.config.js
// We use craco instead of react-scripts so we can override webpack config, to include source maps
// so we can debug @sasjs/adapter easier when tests fail
module.exports = {
  webpack: {
    configure: (webpackConfig, { env }) => {
      // Disable optimizations in both development and production
      webpackConfig.optimization.minimize = false;
      webpackConfig.optimization.minimizer = [];
      webpackConfig.optimization.concatenateModules = false;
      webpackConfig.optimization.splitChunks = { cacheGroups: { default: false } };
      return webpackConfig;
    }
  }
};
