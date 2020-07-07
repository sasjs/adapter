/**
 * Represents a SASjs request, its response and logs.
 *
 */
export interface SASjsRequest {
  serviceLink: string;
  timestamp: Date;
  sourceCode: string;
  generatedCode: string;
  logFile: string;
  SASWORK: any;
}
