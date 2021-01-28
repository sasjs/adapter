import SASjs from "@sasjs/adapter";
import { TestSuite } from "@sasjs/test-framework";

const data: any = { table1: [{ col1: "first col value" }] };

export const sasjsRequestTests = (adapter: SASjs): TestSuite => ({
  name: "SASjs Requests",
  tests: [
    {
      title: "WORK tables",
      description: "Should get WORK tables after request",
      test: async () => {
        return adapter.request("common/sendArr", data);
      },
      assertion: () => {
        const requests = adapter.getSasRequests();
        if (adapter.getSasjsConfig().debug) {
          return requests[0].SASWORK !== null;
        } else {
          return requests[0].SASWORK === null;
        }
      }
    },
    {
      title: "Make error and capture log",
      description:
        "Should make an error and capture log, in the same time it is testing if debug override is working",
      test: async () => {
        return adapter
          .request("common/makeErr", data, { debug: true })
          .catch((err) => {
            let sasRequests = adapter.getSasRequests();
            let makeErrRequest: any =
              sasRequests.find((req) => req.serviceLink.includes("makeErr")) ||
              null;

            if (!makeErrRequest) return false;

            return !!(
              makeErrRequest.logFile && makeErrRequest.logFile.length > 0
            );
          });
      },
      assertion: (response) => {
        return response;
      }
    }
  ]
});
