const path = require('path')
const webpack = require('webpack')
const terserPlugin = require('terser-webpack-plugin')

const browserConfig = {
  entry: './src/index.ts',
  devtool: 'inline-source-map',
  mode: 'production',
  optimization: {
    minimizer: [
      new terserPlugin({
        cache: true,
        parallel: true,
        sourceMap: true,
        terserOptions: {}
      })
    ]
  },
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
    extensions: ['.ts', '.js']
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'build'),
    libraryTarget: 'umd',
    library: 'SASjs'
  },
  plugins: [
    new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /en/),
    new webpack.SourceMapDevToolPlugin({
      filename: null,
      exclude: [/node_modules/],
      test: /\.ts($|\?)/i
    })
  ]
}

const nodeConfig = {
  ...browserConfig,
  target: 'node',
  output: {
    ...browserConfig.output,
    path: path.resolve(__dirname, 'build', 'node')
  }
}

module.exports = [browserConfig, nodeConfig]