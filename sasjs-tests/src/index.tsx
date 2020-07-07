import React from "react";
import ReactDOM from "react-dom";
import { Route, HashRouter, Switch } from "react-router-dom";
import "./index.scss";
import * as serviceWorker from "./serviceWorker";
import { AppProvider } from "./context/AppContext";
import PrivateRoute from "./PrivateRoute";
import Login from "./Login";
import App from "./App";

ReactDOM.render(
  <AppProvider>
    <HashRouter>
      <Switch>
        <PrivateRoute exact path="/" component={App} />
        <Route exact path="/login" component={Login} />
      </Switch>
    </HashRouter>
  </AppProvider>,
  document.getElementById("root")
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
