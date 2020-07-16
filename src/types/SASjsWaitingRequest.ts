/**
 * Represents requests that are queued, pending a signon event
 *
 */

 // FIXME: be more specific on type declaration
export interface SASjsWaitingRequest {
  requestPromise: {
    promise: any;
    resolve: any;
    reject: any;
  };
  SASjob: string;
  data: any;
  params?: any;
}
