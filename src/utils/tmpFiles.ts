import * as path from 'path'
import { getRealPath, folderExists, createFolder } from '@sasjs/utils'

export const getTmpFolderPath = async () => {
  const tmpFolderPath = path.join(__dirname, '..', 'tmp')

  if (!(await folderExists(tmpFolderPath))) await createFolder(tmpFolderPath)

  return tmpFolderPath
}

export const getTmpFilesFolderPath = async () =>
  path.join(await getTmpFolderPath(), 'files')

export const getTmpLogFolderPath = async () =>
  path.join(await getTmpFolderPath(), 'log')
