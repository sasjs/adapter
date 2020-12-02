import SASjs from "@sasjs/adapter";
import { TestSuite } from "@sasjs/test-framework";

export const computeTests = (adapter: SASjs): TestSuite => ({
  name: "Compute",
  tests: [
    {
      title: "Start Compute Job - not waiting for result",
      description: "Should start a compute job and return the session",
      test: () => {
        const data: any = { table1: [{ col1: "first col value" }] };
        return adapter.startComputeJob("/Public/app/common/sendArr", data);
      },
      assertion: (res: any) => {
        const expectedProperties = ["id", "applicationName", "attributes"]
        return validate(expectedProperties, res);
      }
    },
    {
      title: "Start Compute Job - waiting for result",
      description: "Should start a compute job and return the job",
      test: () => {
        const data: any = { table1: [{ col1: "first col value" }] };
        return adapter.startComputeJob("/Public/app/common/sendArr", data, {}, "", true);
      },
      assertion: (res: any) => {
        const expectedProperties = ["id", "state", "creationTimeStamp", "jobConditionCode"]
        return validate(expectedProperties, res.result);
      }
    }
  ]
});

const validate = (expectedProperties: string[], data: any): boolean => {
  const actualProperties = Object.keys(data);

        const isValid = expectedProperties.every(
          (property) => actualProperties.includes(property)
        );
        return isValid
}