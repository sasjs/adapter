const path = require('path')
const webpack = require('webpack')
const terserPlugin = require('terser-webpack-plugin')
const nodePolyfillPlugin = require('node-polyfill-webpack-plugin')

const defaultPlugins = [
  new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /en/),
  new webpack.SourceMapDevToolPlugin({
    filename: null,
    exclude: [/node_modules/],
    test: /\.ts($|\?)/i
  })
]

const optimization = {
  minimize: false,
  minimizer: [
    // new terserPlugin({
    //   parallel: true,
    //   terserOptions: {}
    // })
  ]
}

const browserConfig = {
  entry: {
    index: './src/index.ts',
    minified_sas9: './src/minified/sas9/index.ts'
  },
  externals: {
    'node:fs': 'node:fs',
    'node:fs/promises': 'node:fs/promises',
    'node:path': 'node:path',
    'node:stream': 'node:stream',
    'node:url': 'node:url',
    'node:events': 'node:events',
    'node:string_decoder': 'node:string_decoder'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'build'),
    libraryTarget: 'umd',
    library: 'SASjs'
  },
  mode: 'production',
  optimization: optimization,
  devtool: 'inline-source-map',
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

const browserConfigWithDevTool = {
  ...browserConfig,
  entry: './src/index.ts',
  output: {
    filename: 'index-dev.js',
    path: path.resolve(__dirname, 'build'),
    libraryTarget: 'umd',
    library: 'SASjs'
  },
  devtool: 'inline-source-map'
}

const browserConfigWithoutProcessPlugin = {
  entry: browserConfig.entry,
  devtool: browserConfig.devtool,
  mode: browserConfig.mode,
  optimization: optimization,
  module: browserConfig.module,
  resolve: browserConfig.resolve,
  output: browserConfig.output,
  plugins: defaultPlugins
}

const nodeConfig = {
  ...browserConfigWithoutProcessPlugin,
  target: 'node',
  entry: './node/index.ts',
  output: {
    ...browserConfig.output,
    path: path.resolve(__dirname, 'build', 'node'),
    filename: 'index.js'
  }
}

module.exports = [browserConfig, browserConfigWithDevTool, nodeConfig]
