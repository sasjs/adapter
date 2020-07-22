import React, { ReactElement, useState, useContext, useEffect } from "react";
import { TestSuiteRunner, TestSuite, AppContext } from "@sasjs/test-framework";
import { basicTests } from "./testSuites/Basic";
import { sendArrTests, sendObjTests } from "./testSuites/RequestData";
import { specialCaseTests } from "./testSuites/SpecialCases";
import { sasjsRequestTests } from "./testSuites/SasjsRequests";
import "@sasjs/test-framework/dist/index.css";
import "./App.scss";

const App = (): ReactElement<{}> => {
  const [appLoc, setAppLoc] = useState("");
  const [debug, setDebug] = useState(false);
  const { adapter, config } = useContext(AppContext);
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);

  useEffect(() => {
    if (adapter) {
      adapter.setDebugState(debug);
      setTestSuites([
        basicTests(adapter, config.userName, config.password),
        sendArrTests(adapter),
        sendObjTests(adapter),
        specialCaseTests(adapter),
        sasjsRequestTests(adapter),
      ]);
    }
  }, [debug, adapter]);

  useEffect(() => {
    if (appLoc && adapter) {
      adapter.setSASjsConfig({ ...adapter.getSasjsConfig(), appLoc });
    }
  }, [appLoc, adapter]);

  useEffect(() => {
    setAppLoc(adapter.getSasjsConfig().appLoc);
  }, [adapter]);

  return (
    <div className="app">
      <div className="controls">
        <div className="row">
          <label>Debug</label>
          <div className="debug-toggle">
            <label className="switch">
              <input
                type="checkbox"
                onChange={(e) => setDebug(e.target.checked)}
              />
              <span className="knob"></span>
            </label>
          </div>
        </div>
        <div className="row app-loc">
          <label>App Loc</label>
          <input
            type="text"
            className="app-loc-input"
            value={appLoc}
            onChange={(e) => setAppLoc(e.target.value)}
            placeholder="AppLoc"
          />
        </div>
      </div>
      {adapter && testSuites && <TestSuiteRunner testSuites={testSuites} />}
    </div>
  );
};

export default App;
