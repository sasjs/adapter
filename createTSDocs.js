const td = require('typedoc')
const ts = require('typescript')

const { installMatchOne } = require('./minimatchShim')
const typedocJson = require('./typedoc.json')

async function createTSDocs() {
  if (!typedocJson.entryPoints?.length) {
    throw new Error(
      'Typedoc error: entryPoints option is missing in typedoc configuration.'
    )
  }

  if (!typedocJson.out) {
    throw new Error(
      'Typedoc error: out option is missing in typedoc configuration.'
    )
  }

  // typedoc 0.28 calls Minimatch#matchOne(), which minimatch 11 removed. The
  // method, and the two differences that matter (arrays of segments, and the
  // pattern-level negation match() applies but matchOne never did), live in
  // minimatchShim.js; its spec covers the shim, and createTSDocs.spec.ts pins
  // the day it can be deleted.
  //
  // It is a shim rather than a forked dependency because the minimatch override
  // in package.json (the advisory covers everything below 11.0.1) makes
  // minimatch 11 unavoidable, and this is a gap in typedoc's own range.
  //
  // Both builds are passed: this script loads typedoc through require(), so
  // typedoc in turn resolves minimatch's CommonJS build, while importing the same
  // package resolves the ESM one - two module instances, two classes.
  installMatchOne([require('minimatch'), await import('minimatch')])

  // typedoc 0.28 builds the application through the static bootstrap; the
  // constructor no longer accepts an empty configuration
  const app = await td.Application.bootstrapWithPlugins({
    ...typedocJson,
    tsconfig: 'tsconfig.json'
  })

  const project = await app.convert()

  if (project) {
    await app.generateDocs(project, typedocJson.out)
  } else {
    throw new Error('Typedoc error: error creating the TS docs.')
  }
}

createTSDocs()
