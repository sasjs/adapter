import {
  MemberType,
  FolderMember,
  ServiceMember,
  ExecutionQuery,
  ExecutionResult
} from './types'
import {
  createFolder,
  createFile,
  fileExists,
  readFile,
  asyncForEach,
  generateTimestamp
} from '@sasjs/utils'
import { getTmpFilesFolderPath, getTmpLogFolderPath } from './utils'
import * as path from 'path'
import { promisify } from 'util'
import { execFile } from 'child_process'
const execFilePromise = promisify(execFile)

export class SASBaseApiClient {
  public async deploy(members: [FolderMember, ServiceMember]) {
    await this.createFileTree(members)
  }

  constructor(private pathSASBase: string) {}

  public setConfig(pathSASBase: string) {
    if (pathSASBase) this.pathSASBase = pathSASBase
  }

  // TODO: make public
  private async createFileTree(
    members: [FolderMember, ServiceMember],
    parentFolders: string[] = []
  ) {
    const destinationPath = path.join(
      await getTmpFilesFolderPath(),
      path.join(...parentFolders)
    )

    await asyncForEach(
      members,
      async (member: FolderMember | ServiceMember) => {
        const name = member.name

        if (member.type === MemberType.folder) {
          await createFolder(path.join(destinationPath, name)).catch((err) =>
            Promise.reject({ error: err, failedToCreate: name })
          )

          await this.createFileTree(member.members, [
            ...parentFolders,
            name
          ]).catch((err) =>
            Promise.reject({ error: err, failedToCreate: name })
          )
        } else {
          await createFile(path.join(destinationPath, name), member.code).catch(
            (err) => Promise.reject({ error: err, failedToCreate: name })
          )
        }
      }
    )

    return Promise.resolve(true)
  }

  public async executeScript(
    query: ExecutionQuery
  ): Promise<ExecutionResult | undefined> {
    let sasCodePath = path.join(await getTmpFilesFolderPath(), query._program)

    sasCodePath = sasCodePath.replace(new RegExp('/', 'g'), path.sep)

    if (!(await fileExists(sasCodePath))) {
      return Promise.reject(`${query._program} does not exist.`)
    }

    const sasFile: string = sasCodePath.split(path.sep).pop() || 'default'

    const sasLogPath = path.join(
      await getTmpLogFolderPath(),
      [sasFile.replace(/\.sas/g, ''), '-', generateTimestamp(), '.log'].join('')
    )

    const { stdout, stderr } = await execFilePromise(this.pathSASBase, [
      '-SYSIN',
      sasCodePath,
      '-log',
      sasLogPath,
      '-nosplash'
    ])

    if (stderr) return Promise.reject(stderr)

    if (await fileExists(sasLogPath)) {
      return Promise.resolve({
        log: await readFile(sasLogPath),
        logPath: sasLogPath
      })
    }
  }
}
