import React, { ReactElement, useState, useEffect } from "react";
import "./TestSuiteCard.scss";
import { Test } from "../types";
import TestComponent from "./Test";
import TestCard from "./TestCard";

interface TestSuiteProps {
  name: string;
  tests: Test[];
  beforeAll?: (...args: any) => Promise<any>;
  afterAll?: (...args: any) => Promise<any>;
  onCompleted: (
    name: string,
    completedTests: {
      test: Test;
      result: boolean;
      error: Error | null;
      executionTime: number;
    }[]
  ) => void;
}
const TestSuite = (props: TestSuiteProps): ReactElement<TestSuiteProps> => {
  const { name, tests, beforeAll, afterAll, onCompleted } = props;
  const [context, setContext] = useState<any>(null);
  const [completedTests, setCompletedTests] = useState<
    {
      test: Test;
      result: boolean;
      error: Error | null;
      executionTime: number;
    }[]
  >([]);
  const [currentTest, setCurrentTest] = useState<Test | null>(
    (null as unknown) as Test
  );

  useEffect(() => {
    if (beforeAll) {
      beforeAll().then((data) => setContext({ data }));
    }
  }, [beforeAll]);

  useEffect(() => {
    if (tests.length) {
      setCurrentTest(tests[0]);
    }
    setCompletedTests([]);
    setContext(null);
  }, [tests]);

  return (!!beforeAll && !!context) || !beforeAll ? (
    <div className="test-suite">
      <div className="test-suite-name running">{name}</div>
      {currentTest && (
        <TestComponent
          {...currentTest}
          context={context}
          onCompleted={(completedTest) => {
            const newCompleteTests = [
              ...completedTests,
              {
                test: currentTest,
                result: completedTest.result,
                error: completedTest.error,
                executionTime: completedTest.executionTime,
              },
            ];
            setCompletedTests(newCompleteTests);
            const currentIndex = tests.indexOf(currentTest);
            const nextIndex =
              currentIndex < tests.length - 1 ? currentIndex + 1 : -1;
            if (nextIndex >= 0) {
              setCurrentTest(tests[nextIndex]);
            } else {
              setCurrentTest(null);
            }
            if (newCompleteTests.length === tests.length) {
              if (afterAll) {
                afterAll().then(() => onCompleted(name, newCompleteTests));
              } else {
                onCompleted(name, newCompleteTests);
              }
            }
          }}
        />
      )}
      {completedTests.map((completedTest, index) => {
        const { test, result, error } = completedTest;
        const { title, description } = test;
        return (
          <TestCard
            key={index}
            title={title}
            description={description}
            status={result === true ? "passed" : "failed"}
            error={error}
          />
        );
      })}
    </div>
  ) : (
    <></>
  );
};

export default TestSuite;
