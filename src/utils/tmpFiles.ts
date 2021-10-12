import { isNode } from '../utils'

export const getTmpFolderPath = async () => {
  if (!isNode()) return 'Error: not node environment'

  const { getRealPath, folderExists, createFolder } = require('@sasjs/utils/file')
  const path = require('path')
  const tmpFolderPath = path.join(__dirname, '..', 'tmp')

  if (!(await folderExists(tmpFolderPath))) await createFolder(tmpFolderPath)

  return tmpFolderPath
}

export const getTmpFilesFolderPath = async () => {
  if (!isNode()) return 'Error: not node environment'

  const { getRealPath, folderExists, createFolder } = require('@sasjs/utils/file')
  const path = require('path')
  
  return path.join(await getTmpFolderPath(), 'files')
}

export const getTmpLogFolderPath = async () => {
  if (!isNode()) return 'Error: not node environment'

  const { getRealPath, folderExists, createFolder } = require('@sasjs/utils/file')
  const path = require('path')

  return path.join(await getTmpFolderPath(), 'log')
}
