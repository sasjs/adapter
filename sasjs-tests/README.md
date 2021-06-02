`sasjs-tests` is a test suite for the SASjs adapter.

It is a React app bootstrapped using [Create React App](https://github.com/facebook/create-react-app) and [@sasjs/test-framework](https://github.com/sasjs/test-framework).

When developing on `@sasjs/adapter`, it's good practice to run the test suite against your changed version of the adapter to ensure that existing functionality has not been impacted.

You can use the provided `update:adapter` NPM script for this.

```
    npm run update:adapter
```

This scripts builds a new version of the adapter and installs it in the `sasjs-tests` project.

## Running tests

There are three prerequisites to be able to run the tests:

1. Correct server configuration for the SASjs adapter.
2. `sasjs-tests` deployed to your SAS server.
3. The required SAS services created on the same server.

### 1. Configuring the SASjs adapter

There is a `config.json` file in the `/public` folder which specifies the configuration for the SASjs adapter. You can set the values within the `sasjsConfig` property in this file to match your SAS server configuration.

### 2. Deploying to your SAS server

There is a `deploy` NPM script provided in the `sasjs-tests` project's `package.json`.

It updates `sasjs-tests` to use the latest version of the adapter, and deploys to a specified server via SSH using the `rsync` command.

To be able to run the `deploy` script, two environment variables need to be set:

- `SSH_ACCOUNT` - your SSH account, this is of the form username@domain.com
- `DEPLOY_PATH` - the path on the server where `sasjs-tests` will be deployed to, typically `/var/www/html/<some-subfolder>`.

So you can run the script like so:

```
SSH_ACCOUNT=me@my-sas-server.com DEPLOY_PATH=/var/www/html/my-folder/sasjs-tests npm run deploy
```

If you'd like to deploy just `sasjs-tests` without changing the adapter version, you can use the `deploy:tests` script, while also setting the same environment variables as above.

## 3. Creating the required SAS services

The below services need to be created on your SAS server, at the location specified as the `appLoc` in the SASjs configuration.

### SAS 9

```

filename mc url "https://raw.githubusercontent.com/sasjs/core/main/all.sas";
%inc mc;
filename ft15f001 temp;
parmcards4;
  %webout(FETCH)
  %webout(OPEN)
  %macro x();
  %do i=1 %to &_webin_file_count; %webout(OBJ,&&_webin_name&i) %end;
  %mend; %x()
  %webout(CLOSE)
;;;;
%mm_createwebservice(path=/Public/app/common,name=sendObj)
parmcards4;
  %webout(FETCH)
  %webout(OPEN)
  %macro x();
  %do i=1 %to &_webin_file_count; %webout(ARR,&&_webin_name&i) %end;
  %mend; %x()
  %webout(CLOSE)
;;;;
%mm_createwebservice(path=/Public/app/common,name=sendArr)
parmcards4;
let he who hath understanding, reckon the number of the beast
;;;;
%mm_createwebservice(path=/Public/app/common,name=makeErr)
```

### SAS Viya

```
filename mc url "https://raw.githubusercontent.com/sasjs/core/main/all.sas";
%inc mc;
filename ft15f001 temp;
parmcards4;
  %webout(FETCH)
  %webout(OPEN)
  %macro x();
  %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(OBJ,&table)
  %end;
  %mend;
  %x()
  %webout(CLOSE)
;;;;
%mp_createwebservice(path=/Public/app/common,name=sendObj)
filename ft15f001 temp;
parmcards4;
  %webout(FETCH)
  %webout(OPEN)
  %macro x();
  %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(ARR,&table)
  %end;
  %mend;
  %x()
  %webout(CLOSE)
;;;;
%mp_createwebservice(path=/Public/app/common,name=sendArr)
filename ft15f001 temp;
parmcards4;
If you can keep your head when all about you
    Are losing theirs and blaming it on you,
If you can trust yourself when all men doubt you,
    But make allowance for their doubting too;
;;;;
%mp_createwebservice(path=/Public/app/common,name=makeErr)
```

You should now be able to access the tests in your browser at the deployed path on your server.

## Creating new tests

The `src/testSuites` folder contains all the test suites currently available.
Each suite contains a set of specs, each of which looks like this:

```javascript
    {
        title: "Your test title",
        description: "A slightly more detailed description",
        test: async () => {
        // typically makes a request using the adapter and returns a promise
        },
        assertion: (response: any) =>
        // receives the response when the test promise resolves, runs an assertion and returns a boolean
    }
```

A test suite is an array of such objects, along with a `name` property.

You can add your test to one of the existing suites if suitable, or create a new file that specifies a new test suite.
