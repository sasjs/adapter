import React, { ReactElement } from "react";
import "./TestCard.scss";

interface TestCardProps {
  title: string;
  description: string;
  status: string;
  error: Error | null;
  executionTime?: number;
}
const TestCard = (props: TestCardProps): ReactElement<TestCardProps> => {
  const { title, description, status, error, executionTime } = props;

  return (
    <div className="test">
      <code className="title">{title}</code>
      <span className="description">{description}</span>
      <span className="execution-time">
        {executionTime ? executionTime.toFixed(2) + "s" : ""}
      </span>
      {status === "running" && (
        <div>
          <span className="icon running"></span>Running...
        </div>
      )}
      {status === "passed" && (
        <div>
          <span className="icon passed"></span>Passed
        </div>
      )}
      {status === "failed" && (
        <>
          <div>
            <span className="icon failed"></span>Failed
          </div>
          {!!error && <code>{error.message}</code>}
        </>
      )}
    </div>
  );
};

export default TestCard;
