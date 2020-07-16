import SASjs from "sasjs";
import { TestSuite } from "../types";

const data: any = { table1: [{ col1: "first col value" }] }; // TODO: be more specific on type declaration

export const sasjsRequestTests = (adapter: SASjs): TestSuite => ({
  name: "SASjs Requests",
  tests: [
    {
      title: "WORK tables",
      description: "Should get WORK tables after request",
      test: async () => adapter.request("common/sendArr", data),
      assertion: (res: any) => {
        const requests = adapter.getSasRequests();

        return adapter.getSasjsConfig().debug ? requests[0].SASWORK !== null : requests[0].SASWORK === null
      },
    },
  ],
});
