/**
 * Join a parent folder path and a folder name into one path.
 *
 * A parent path can be the root, and `'/' + '/' + 'app'` is `'//app'` - a path
 * that some Viya deployments do not collapse when it arrives in `?path=`, so the
 * server mints an id for a folder that is not the one just created. Creating at
 * the root then reports a refusal for a folder that exists (adapter#974).
 *
 * Collapsing repeated slashes here keeps every caller off that path, and keeps
 * the path used for a write identical to the one used to read it back.
 */
export const joinFolderPath = (
  parentFolderPath: string,
  folderName: string
): string => `${parentFolderPath}/${folderName}`.replace(/\/{2,}/g, '/')
