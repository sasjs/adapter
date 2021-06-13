import { Link } from './Link'

export interface File {
  id: string
  name: string
  parentUri: string
  links: Link[]
}
