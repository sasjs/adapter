import SASjs from "@sasjs/adapter";
import { TestSuite } from "@sasjs/test-framework";

export const computeTests = (adapter: SASjs): TestSuite => ({
  name: "Compute",
  tests: [
    {
      title: "Start Compute Job",
      description: "Should start a compute job and return the session",
      test: () => {
        const data: any = { table1: [{ col1: "first col value" }] };
        return adapter.startComputeJob("/Public/app/common/sendArr", data);
      },
      assertion: (res: any) => {
        return (
          !!res &&
          !!res.applicationName &&
          !!res.attributes &&
          !!res.attributes.sessionInactiveTimeout
        );
      }
    }
  ]
});
