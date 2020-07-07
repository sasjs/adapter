import { ServerType } from "./ServerType";

/**
 * Specifies the configuration for the SASjs instance.
 *
 */
export class SASjsConfig {
  /**
   * The location (including http protocol and port) of the SAS Server.
   * Can be omitted, eg if serving directly from the SAS Web Server or being
   * streamed.
   */
  serverUrl: string = "";
  pathSAS9: string = "";
  pathSASViya: string = "";
  /**
   * The appLoc is the parent folder under which the SAS services (STPs or Job
   * Execution Services) are stored.
   */
  appLoc: string = "";
  /**
   * Can be SAS9 or SASVIYA
   */
  serverType: ServerType | null = null;
  /**
   * Set to `true` to enable additional debugging.
   */
  debug: boolean = true;
  contextName: string = "";
}
