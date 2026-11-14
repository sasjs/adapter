/**
 * Collapse repeated slashes in a folder path.
 *
 * A Viya folder path is a sequence of names separated by single slashes, so a run
 * of slashes is always a caller's join going wrong. Two ways of getting one:
 *
 * - joining a parent path with a name, when the parent is the root: `'/' + '/app'`
 *   is `'//app'` (adapter#974)
 * - a caller passing a path it built itself, with a trailing slash or a doubled
 *   one in the middle: `'/Users/me/' + 'app'`
 *
 * Some deployments do not collapse the doubled slash when it arrives in `?path=`,
 * and answer 404 for a folder that exists, so the path a request carries has to be
 * the path the server knows. This is applied where a path is turned into a request,
 * not only where one is joined, so the invariant holds for every caller.
 */
export const normaliseFolderPath = (folderPath: string): string => {
  const collapsed = folderPath.replace(/\/{2,}/g, '/')
  // a single trailing slash is the other way a caller's join goes wrong, and it is
  // not a run of slashes: '/app/' names the same folder as '/app', and asking the
  // server about the first is a 404 on a deployment that does not tidy it up
  return collapsed.length > 1 && collapsed.endsWith('/')
    ? collapsed.slice(0, -1)
    : collapsed
}

/**
 * Join a parent folder path and a folder name into one path.
 *
 * The result is normalised, so a create at the root reads back the same path it
 * wrote - which is the failure adapter#974 describes.
 */
export const joinFolderPath = (
  parentFolderPath: string,
  folderName: string
): string => normaliseFolderPath(`${parentFolderPath}/${folderName}`)
