import { Link } from "./Link";

export interface Session {
  id: string;
  state: string;
  links: Link[];
}
