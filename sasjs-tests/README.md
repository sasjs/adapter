# SASjs Tests

`sasjs-tests` is a test suite for the SASjs adapter.

Browser-based integration testing for [@sasjs/adapter](https://github.com/sasjs/adapter) using TypeScript, Custom Elements, and zero dependencies.

When developing on `@sasjs/adapter`, it's good practice to run the test suite against your changed version of the adapter to ensure that existing functionality has not been impacted.

You can use the provided `update:adapter` NPM script for this.

```bash
    npm run update:adapter
```

This scripts builds a new version of the adapter and installs it in the `sasjs-tests` project.

## Running tests

There are three prerequisites to be able to run the tests:

1. Correct server configuration for the SASjs adapter.
2. `sasjs-tests` deployed to your SAS server.
3. The required SAS services created on the same server.

### Configuring the SASjs adapter

There is a `config.json` file in the `/public` folder which specifies the configuration for the SASjs adapter. You can set the values within the `sasjsConfig` property in this file to match your SAS server configuration.

#### Installation

```bash
npm install
```

#### Configuration

Edit `public/config.json`:

```json
{
  "userName": "your-username",
  "password": "your-password",
  "sasJsConfig": {
    "serverUrl": "https://your-sas-server.com",
    "appLoc": "/Public/app/adapter-tests/services",
    "serverType": "SASJS",
    "debug": false,
    "contextName": "sasjs adapter compute context",
    "useComputeApi": true
  }
}
```

**Server Types:**

- `SASJS` - SASjs Server
- `SASVIYA` - SAS Viya
- `SAS9` - SAS 9.4

## Getting Started

### Development

```bash
# Build for production
npm run build

# Watch mode (rebuild on changes)
npm run dev
```

The built files are in `build/`:

- `index.html` - App entry point
- `index.js` - Bundled JavaScript
- `index.css` - Global styles
- `config.json` - Configuration

## Test Suites

Tests are defined in `src/testSuites/`:

- **Basic.ts** - Login, config, session management, debug mode
- **RequestData.ts** - Data serialization (sendArr, sendObj) with various types
- **FileUpload.ts** - File upload functionality (VIYA only)
- **Compute.ts** - Compute API, JES API, executeScript (VIYA only)
- **SasjsRequests.ts** - WORK tables, log capture
- **SpecialCases.ts** - Edge cases (currently disabled)

Each test suite follows this pattern:

```typescript
export const myTests = (adapter: SASjs): TestSuite => ({
  name: 'My Test Suite',
  tests: [
    {
      title: 'Should do something',
      description: 'Description of what this tests',
      test: async () => {
        // Test logic - return a value
        return adapter.request('service', data)
      },
      assertion: (response) => {
        // Assertion - return true/false
        return response.success === true
      }
    }
  ],
  beforeAll: async () => {
    // Optional: runs once before all tests
  },
  afterAll: async () => {
    // Optional: runs once after all tests
  }
})
```

### Shadow DOM Access

Cypress accesses Shadow DOM using a custom command:

```javascript
cy.get('login-form').shadow().find('input#username').type('user')
```

The `shadow()` command is defined in `cypress/support/commands.js`.

## Deployment

### Build for Production

```bash
npm run build
```

This creates a `build/` folder ready for deployment.

### Deploy to SAS Server

#### Creating the required SAS services

The below services need to be created on your SAS server, at the location specified as the `appLoc` in the SASjs configuration.

The code below will work on ALL SAS platforms (Viya, SAS 9 EBI, SASjs Server).

```sas
filename mc url "https://raw.githubusercontent.com/sasjs/core/main/all.sas";
%inc mc;
%let apploc=/Public/app/adapter-tests;
filename ft15f001 temp lrecl=1000;
parmcards4;
  %webout(FETCH)
  %webout(OPEN)
  %macro x();
  %if %symexist(sasjs_tables) %then %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(OBJ,&table,missing=STRING,showmeta=YES)
  %end;
  %else %do i=1 %to &_webin_file_count;
    %webout(OBJ,&&_webin_name&i,missing=STRING,showmeta=YES)
  %end;
  %mend; %x()
  %webout(CLOSE)
;;;;
%mx_createwebservice(path=&apploc/services/common,name=sendObj)
parmcards4;
  %webout(FETCH)
  %webout(OPEN)
  %macro x();
  %if %symexist(sasjs_tables) %then %do i=1 %to %sysfunc(countw(&sasjs_tables));
    %let table=%scan(&sasjs_tables,&i);
    %webout(ARR,&table,missing=STRING,showmeta=YES)
  %end;
  %else %do i=1 %to &_webin_file_count;
    %webout(ARR,&&_webin_name&i,missing=STRING,showmeta=YES)
  %end;
  %mend; %x()
  %webout(CLOSE)
;;;;
%mx_createwebservice(path=&apploc/services/common,name=sendArr)
parmcards4;
  data work.macvars;
    set sashelp.vmacro;
  run;
  %webout(OPEN)
  %webout(OBJ,macvars)
  %webout(CLOSE)
;;;;
%mx_createwebservice(path=&apploc/services/common,name=sendMacVars)
parmcards4;
If you can keep your head when all about you
    Are losing theirs and blaming it on you,
If you can trust yourself when all men doubt you,
    But make allowance for their doubting too;
;;;;
%mx_createwebservice(path=&apploc/services/common,name=makeErr)
parmcards4;
%webout(OPEN)
data _null_;
  file _webout;
  put ' the discovery channel ';
 run;
%webout(CLOSE)
;;;;
%mx_createwebservice(path=&apploc/services/common,name=invalidJSON)
```

You should now be able to access the tests in your browser at the deployed path on your server.

#### Using SASjs CLI

```bash
sasjs deploy -t <target>
```

### Matrix Notifications

The `sasjs-cypress-run.sh` script sends Matrix chat notifications on test failure:

```bash
./sasjs-cypress-run.sh $MATRIX_ACCESS_TOKEN $PR_NUMBER
```

Notification format:

```
Automated sasjs-tests failed on the @sasjs/adapter PR: <PR_NUMBER>
```

## SAS Service Setup

The tests require SAS services to be deployed at the `appLoc` specified in `config.json`.

Services expected:

- `common/sendArr` - Echo back array data
- `common/sendObj` - Echo back object data
- (Additional services per test suite)

Deploy these services using [SASjs CLI](https://cli.sasjs.io) or manually.

## Troubleshooting

### Build Errors

- Ensure Node.js >= 18
- Clear `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`

### Cypress Shadow DOM Issues

If Cypress can't access Shadow DOM elements:

1. Verify custom `shadow()` command in `cypress/support/commands.js`
2. Check element selectors match actual DOM structure

### Test Failures

- Check `config.json` credentials and server URL
- Verify SAS services are deployed
- Check browser console for errors
- Enable `debug: true` in sasJsConfig for verbose logging

## Development

- **Pure Vanilla TS** - No React, no frameworks
- **Custom Elements** - Web Components with Shadow DOM
- **Zero Dependencies** - Only @sasjs/adapter + build tools
- **Minimal Bundle** - 40KB (8KB gzipped)

### Build Stack

- **tsdown** - TypeScript bundler (replaces CRA/react-scripts)

### UI Components (Custom Elements)

- `<login-form>` - SAS authentication
- `<tests-view>` - Test orchestrator with run controls
- `<test-suite>` - Test suite display with stats
- `<test-card>` - Individual test with status (pending/running/passed/failed)

All components use Shadow DOM for style encapsulation and expose custom events for interactivity.

### Adding New Test Suites

1. Create file in `src/testSuites/MyNewTests.ts`
2. Export function returning TestSuite
3. Import in `src/index.ts`
4. Add to `testSuites` array in `showTests()` function

### Modifying UI Components

Components are in `src/components/`:

- Edit `.ts` file
- Styles are in Shadow DOM `<style>` tags
- Rebuild with `npm run build`

## License

MIT

## Links

- [@sasjs/adapter](https://adapter.sasjs.io)
- [SASjs Documentation](https://sasjs.io)
- [SASjs CLI](https://cli.sasjs.io)
