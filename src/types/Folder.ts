import { Link } from './Link'

export interface Folder {
  id: string
  name?: string
  type?: string
  parentFolderUri?: string | null
  uri: string
  links: Link[]
  memberCount: number
}
