import React, { createContext, useState, useEffect, ReactNode } from "react";
import SASjs from "sasjs";

export const AppContext = createContext<{
  config: any;
  sasJsConfig: any;
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
  const [config, setConfig] = useState<{ sasJsConfig: any }>({
    sasJsConfig: null,
  });

  const [adapter, setAdapter] = useState<SASjs>((null as unknown) as SASjs);

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetch("config.json")
      .then((res) => res.json())
      .then((configJson: any) => {
        setConfig(configJson);
        const sasjs = new SASjs(configJson.sasJsConfig);
        setAdapter(sasjs);
        sasjs.checkSession().then((response) => {
          setIsLoggedIn(response.isLoggedIn);
        });
      });
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
