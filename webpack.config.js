const path = require('path')
const webpack = require('webpack')
const nodePolyfillPlugin = require('node-polyfill-webpack-plugin')

// Browser bundles live in dist/. The package root is compiled CommonJS from
// tsc, so the browser file is no longer the package entry: the `browser` field
// in package.json points bundlers here, and script-tag and CDN consumers load
// dist/sasjs-adapter.js directly.
const defaultPlugins = [
  new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /en/)
]

const optimization = {
  minimize: false,
  minimizer: []
}

const browserConfig = {
  entry: {
    'sasjs-adapter': './src/index.ts',
    minified_sas9: './src/minified/sas9/index.ts'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'build', 'dist'),
    libraryTarget: 'umd',
    library: 'SASjs',
    // Without this webpack's runtime carries `new Function('return this')()`
    // as its globalThis fallback.
    globalObject: 'globalThis'
  },
  mode: 'production',
  optimization: optimization,
  devtool: false,
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: { https: false, fs: false, readline: false }
  },
  plugins: [
    ...defaultPlugins,
    new webpack.ProvidePlugin({
      process: 'process/browser'
    }),
    new nodePolyfillPlugin()
  ]
}

module.exports = [browserConfig]
