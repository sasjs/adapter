const path = require("path");
const webpack = require("webpack");
const UglifyJsPlugin = require("uglifyjs-webpack-plugin");

const browserConfig = {
  entry: "./src/index.ts",
  devtool: "inline-source-map",
  mode: "development",
  optimization: {
    minimize: false,
  },
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  output: {
    filename: "index.js",
    path: path.resolve(__dirname, "build"),
    libraryTarget: "umd",
    library: "SASjs",
  },
  plugins: [
    new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /en/),
    new webpack.SourceMapDevToolPlugin({
      filename: null,
      exclude: [/node_modules/],
      test: /\.ts($|\?)/i,
    }),
  ],
};

const nodeConfig = {
  ...browserConfig,
  target: "node",
  output: {
    ...browserConfig.output,
    path: path.resolve(__dirname, "build", "node"),
  },
};

module.exports = [browserConfig, nodeConfig];
