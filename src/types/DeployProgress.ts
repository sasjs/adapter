/**
 * One member of a service pack, reported as the deploy writes it.
 *
 * A deploy is a sequential series of REST calls - one folder, one file, one job
 * definition at a time - and on a real server that is long enough that a caller
 * with no progress reporting looks hung. `deployServicePack` accepts an
 * `onProgress` callback and calls it once per member, immediately before the
 * member is written, so a caller can report position without knowing how the
 * pack is structured.
 */
export interface DeployProgress {
  /** What is being written: a folder, a file, or a service (a Viya job definition). */
  type: 'folder' | 'file' | 'service'
  /** The member name - a folder name, a file name, or a job name. */
  name: string
  /** Full path of the folder the member is written into. */
  parentFolder: string
  /** 1-based position of this member in deployment order. */
  index: number
  /**
   * Total members in the whole deployment, so a caller can render `12/88`.
   *
   * Every member is counted, at every depth, including folders: it is the
   * number of `onProgress` calls the deploy will make.
   */
  total: number
}
