const td = require('typedoc')
const ts = require('typescript')

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
