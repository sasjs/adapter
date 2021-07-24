import { isFolder } from '@sasjs/utils/file'
import { generateTimestamp } from '@sasjs/utils/time'
import { Job } from '../../types'

export const getFileStream = async (job: Job, filePath?: string) => {
  const { createWriteStream } = require('@sasjs/utils/file')
  const logPath = filePath || process.cwd()
  const isFolderPath = await isFolder(logPath)
  if (isFolderPath) {
    const logFileName = `${job.name || 'job'}-${generateTimestamp()}.log`
    const path = require('path')
    const logFilePath = path.join(filePath || process.cwd(), logFileName)
    return await createWriteStream(logFilePath)
  } else {
    return await createWriteStream(logPath)
  }
}
