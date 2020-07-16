import React, { createContext, useState, useEffect, ReactNode } from "react";
import SASjs from "sasjs";

export const AppContext = createContext<{ // TODO: create an interface
  config: any; // TODO: be more specific on type declaration
  sasJsConfig: any; // TODO: be more specific on type declaration
  isLoggedIn: boolean;
  setIsLoggedIn: (value: boolean) => void;
  adapter: SASjs;
}>({
  config: null,
  sasJsConfig: null,
  isLoggedIn: false,
  setIsLoggedIn: (null as unknown) as (value: boolean) => void,
  adapter: (null as unknown) as SASjs,
});

export const AppProvider = (props: { children: ReactNode }) => {
  const [config, setConfig] = useState<{ sasJsConfig: any }>({sasJsConfig: null}); // TODO: be more specific on type declaration
  const [adapter, setAdapter] = useState<SASjs>((null as unknown) as SASjs);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetch("config.json") // TODO: use axios instead of fetch
      .then((res) => res.json())
      .then((configJson: any) => { // TODO: be more specific on type declaration
        setConfig(configJson);

        const sasjs = new SASjs(configJson.sasJsConfig);

        setAdapter(sasjs);

        sasjs.checkSession().then((response) => {
          setIsLoggedIn(response.isLoggedIn);
        }); // FIXME: add catch block
      });// FIXME: add catch block
  }, []);

  return (
    <AppContext.Provider
      value={{
        config,
        sasJsConfig: config.sasJsConfig,
        isLoggedIn,
        setIsLoggedIn,
        adapter,
      }}
    >
      {props.children}
    </AppContext.Provider>
  );
};