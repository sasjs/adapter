import { Link } from "./Link";

export interface Folder {
  id: string;
  uri: string;
  links: Link[];
}
