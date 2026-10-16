// Writes the `@sasjs/adapter/node` entry. The package root is the compiled
// tree, and the node subpath is the same code, so it re-exports rather than
// duplicating the tree. Consumers import it as @sasjs/adapter/node.
const fs = require('fs')
const path = require('path')

const dir = path.resolve(__dirname, 'build', 'node')
fs.mkdirSync(dir, { recursive: true })

fs.writeFileSync(
  path.join(dir, 'index.js'),
  `module.exports = require('../index')\n`
)

fs.writeFileSync(
  path.join(dir, 'index.d.ts'),
  `export * from '../index'\nexport { default } from '../index'\n`
)

console.log('wrote node/index.js and node/index.d.ts')
