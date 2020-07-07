import { Link } from "./Link";
import { JobResult } from "./JobResult";

export interface Job {
  id: string;
  name: string;
  uri: string;
  createdBy: string;
  links: Link[];
  results: JobResult;
}
