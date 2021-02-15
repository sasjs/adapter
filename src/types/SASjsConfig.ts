import { ServerType } from '@sasjs/utils/types'

/**
 * Specifies the configuration for the SASjs instance - eg where and how to
 * connect to SAS.
 */
export class SASjsConfig {
  /**
   * The location (including http protocol and port) of the SAS Server.
   * Can be omitted, eg if serving directly from the SAS Web Server or being
   * streamed.
   */
  serverUrl: string = ''
  /**
   * The location of the Stored Process Web Application.  By default the adapter
   * will use '/SASStoredProcess/do' on SAS 9.
   */
  pathSAS9: string = ''
  /**
   * The location of the Job Execution Web Application.  By default the adapter
   * will use '/SASJobExecution' on SAS Viya.
   */
  pathSASViya: string = ''
  /**
   * The appLoc is the parent folder under which the SAS services (STPs or Job
   * Execution Services) are stored.  We recommend that each app is stored in
   * a dedicated parent folder (the appLoc) and the services are grouped inside
   * subfolders within the appLoc - allowing functionality to be restricted
   * according to those groups at backend.
   * When using appLoc, the paths provided in the `request` function should be
   * _without_ a leading slash (/).
   */
  appLoc: string = ''
  /**
   * Can be `SAS9` or `SASVIYA`.
   */
  serverType: ServerType | null = null
  /**
   * Set to `true` to enable additional debugging.
   */
  debug: boolean = true
  /**
   * The name of the compute context to use when calling the Viya APIs directly.
   * Example value: 'SAS Job Execution compute context'
   * If set to missing or empty, and useComputeApi is true, the adapter will use
   * the JES APIs.  If provided, the Job Code will be executed in pooled
   * compute sessions on this named context.
   */
  contextName: string = ''
  /**
   * Set to `false` to use the Job Execution Web Service.  To enhance VIYA
   * performance, set to `true` and provide a `contextName` on which to run
   * the code.  When running on a named context, the code executes under the
   * user identity.  When running as a Job Execution service, the code runs
   * under the identity in the JES context.  If no `contextName` is provided,
   * and `useComputeApi` is `true`, then the service will run as a Job, except
   * triggered using the APIs instead of the Job Execution Web Service broker.
   */
  useComputeApi = false
  /**
   * Defaults to `false`.
   * When set to `true`, the adapter will allow requests to SAS servers that use a self-signed SSL certificate.
   * Changing this setting is not recommended.
   */
  allowInsecureRequests = false
}
