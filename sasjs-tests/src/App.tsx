import React, { ReactElement, useState, useContext, useEffect } from "react";
import "./App.scss";
import TestSuiteRunner from "./TestSuiteRunner";
import { AppContext } from "./context/AppContext";

const App = (): ReactElement<{}> => {
  const [appLoc, setAppLoc] = useState("");
  const [debug, setDebug] = useState(false);
  const { adapter } = useContext(AppContext);

  useEffect(() => {
    if (adapter) {
      adapter.setDebugState(debug);
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
      {adapter && <TestSuiteRunner adapter={adapter} />}
    </div>
  );
};

export default App;
