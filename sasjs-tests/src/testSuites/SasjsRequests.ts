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
      description: "Should make an error and capture log",
      test: async () => {
        return new Promise(async (resolve, reject) => {
          adapter
            .request("common/makeErr", data, {debug: true})
            .then((res) => {
              //no action here, this request must throw error
            })
            .catch((err) => {
              let sasRequests = adapter.getSasRequests();
              let makeErrRequest =
                sasRequests.find((req) =>
                  req.serviceLink.includes("makeErr")
                ) || null;

              resolve(!!makeErrRequest);
            });
        });
      },
      assertion: (response) => {
        return response;
      }
    }
  ]
});
