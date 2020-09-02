# Contributing

Contributions to SASjs are very welcome! When making a PR, test cases should be included.

This repository contains a suite of tests built using [@sasjs/test-framework](https://github.com/sasjs/test-framework).

Detailed instructions for creating and running the tests can be found [here](./sasjs-tests/readme.md).

If you'd like to test your changes in an app that uses the adapter, you can do so as follows:

1. Run `npm run package:lib` from the root folder in this repository.
   This creates a tarball in the `/build` folder.
2. In your app's root folder, run `npm install <path/to/tarball>`.
   This will install the changed version of the adapter in your app.
