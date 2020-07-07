import SASjs from "sasjs";
import { TestSuite } from "../types";

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
      assertion: (res: any) => {
        const requests = adapter.getSasRequests();
        if (adapter.getSasjsConfig().debug) {
          return requests[0].SASWORK !== null;
        } else {
          return requests[0].SASWORK === null;
        }
      },
    },
  ],
});
