import { generateTimestamp } from '@sasjs/utils/time'
import { getCwd } from '../../utils/host'
import { Job } from '../../types'

export const getFileStream = async (job: Job, filePath?: string) => {
  // Node only, so required rather than imported: a static import of
  // @sasjs/utils/file drags its csvFile module (and @fast-csv, and the stream
  // shim that needs) into the browser bundle.
  const { createWriteStream, isFolder } = require('@sasjs/utils/file')
  const logPath = filePath || getCwd()
  const isFolderPath = await isFolder(logPath)
  if (isFolderPath) {
    const logFileName = `${job.name || 'job'}-${generateTimestamp()}.log`
    const path = require('path')
    const logFilePath = path.join(filePath || getCwd(), logFileName)
    return await createWriteStream(logFilePath)
  } else {
    return await createWriteStream(logPath)
  }
}
