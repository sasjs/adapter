import React, { ReactElement } from "react";
import "./TestSuiteCard.scss";
import { Test } from "../types";
import TestCard from "./TestCard";

interface TestSuiteCardProps {
  name: string;
  tests: {
    test: Test;
    result: boolean;
    error: Error | null;
    executionTime: number;
  }[];
}
const TestSuiteCard = (
  props: TestSuiteCardProps
): ReactElement<TestSuiteCardProps> => {
  const { name, tests } = props;
  const overallStatus = tests.map((t) => t.result).reduce((x, y) => x && y);

  return (
    <div className="test-suite">
      <div className={`test-suite-name ${overallStatus ? "passed" : "failed"}`}>
        {name}
      </div>
      {tests.map((completedTest, index) => {
        const { test, result, error, executionTime } = completedTest;
        const { title, description } = test;
        return (
          <TestCard
            key={index}
            title={title}
            description={description}
            status={result === true ? "passed" : "failed"}
            error={error}
            executionTime={executionTime}
          />
        );
      })}
    </div>
  );
};

export default TestSuiteCard;
