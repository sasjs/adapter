const path = require('path')
const webpack = require('webpack')

// Browser bundles live in dist/. The package root is compiled CommonJS from
// tsc, so the browser file is no longer the package entry: the `browser` field
// in package.json points bundlers here, and script-tag and CDN consumers load
// dist/sasjs-adapter.js directly.
//
// No Node polyfills. The source guards every node-only access with isNode() -
// getLogger, getCwd and inspectValue in utils/host, and the node code paths -
// and the one module that is node-only by contract, @sasjs/utils/file, is
// aliased away rather than shimmed. Its call sites are behind isNode(), so a
// browser never reaches them.
//
// `util` is mapped to nothing for the same reason: the one require of it
// (host.inspectValue) is isNode()-guarded, and resolving it instead lands on the
// util npm package, which is 28 KiB of Node's own util source carried in the
// bundle for a call a browser never makes.
//
// A process stub is still needed, and webpack's ProvidePlugin puts it in every
// module: code in the bundle reads process.platform, process.nextTick and
// process.env, in @sasjs/utils and in readable-stream. browser-shims/process.js
// answers those reads in about twenty lines, where the node-stdlib polyfill
// tree answered them with bundled copies of Node internals. Its empty
// `versions` object is what keeps isNode() false in a browser.
const defaultPlugins = [
  new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /en/),
  new webpack.ProvidePlugin({
    process: path.resolve(__dirname, 'browser-shims', 'process.js')
  })
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
    // as its globalThis fallback. Webpack still emits its runtime global
    // helper, which keeps that fallback in its template.
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
    // Node builtins the source references only inside node-guarded code. These
    // have no package of their own in the tree, so a `false` fallback is enough.
    fallback: { https: false, fs: false, readline: false, path: false },
    // `util` needs an alias rather than a fallback: webpack only consults the
    // fallback when a request does not resolve, and the util npm package is
    // installed (a dependency of the toolchain), so a bare require resolves to
    // that polyfill - 28 KiB of Node's own util source carried into the bundle
    // for a call a browser never makes. The only requester is
    // host.inspectValue, behind isNode(). '@sasjs/utils/file' is aliased for
    // the same reason.
    alias: { '@sasjs/utils/file': false, util: false }
  },
  plugins: defaultPlugins
}

module.exports = [browserConfig]
