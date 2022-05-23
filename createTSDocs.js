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
  const app = new td.Application()
  app.options.addReader(new td.TSConfigReader())

  app.bootstrap({
    ...typedocJson,
    tsconfig: 'tsconfig.json'
  })

  const project = app.converter.convert(app.getEntryPoints() ?? [])

  if (project) {
    await app.generateDocs(project, typedocJson.out)
  } else {
    throw new Error('Typedoc error: error creating the TS docs.')
  }
}

createTSDocs()
