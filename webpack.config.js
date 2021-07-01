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
  minimize: true,
  minimizer: [
    new terserPlugin({
      parallel: true,
      terserOptions: {}
    })
  ]
}

const browserConfig = {
  entry: './src/index.ts',
  devtool: 'inline-source-map',
  mode: 'production',
  optimization: optimization,
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
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'build'),
    libraryTarget: 'umd',
    library: 'SASjs'
  },
  plugins: [
    ...defaultPlugins,
    new webpack.ProvidePlugin({
      process: 'process/browser'
    }),
    new nodePolyfillPlugin()
  ]
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
    path: path.resolve(__dirname, 'build', 'node')
  }
}

module.exports = [browserConfig, nodeConfig]
