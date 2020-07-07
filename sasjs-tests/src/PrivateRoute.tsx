import React, { ReactElement, useContext, FunctionComponent } from "react";
import { Redirect, Route } from "react-router-dom";
import { AppContext } from "./context/AppContext";

interface PrivateRouteProps {
  component: FunctionComponent;
  exact?: boolean;
  path: string;
}

const PrivateRoute = (
  props: PrivateRouteProps
): ReactElement<PrivateRouteProps> => {
  const { component, path, exact } = props;
  const appContext = useContext(AppContext);
  return appContext.isLoggedIn ? (
    <Route component={component} path={path} exact={exact} />
  ) : (
    <Redirect to="/login" />
  );
};

export default PrivateRoute;
