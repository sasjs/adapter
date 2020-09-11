# Contributing

Contributions to SASjs are very welcome! When making a PR, test cases should be included.

## Code Style

This repository uses `Prettier` to ensure a uniform code style.
If you are using VS Code for development, you can automatically fix your code to match the style as follows:

- Install the `Prettier` extension for VS Code.
- Open your `settings.json` file by choosing 'Preferences: Open Settings (JSON)' from the command palette.
- Add the following items to the JSON.
  ```
    "editor.formatOnSave": true,
    "editor.formatOnPaste": true,
  ```

If you are using another editor, or are unable to install the extension, you can run `npm run lint:fix` to fix the formatting after you've made your changes.

## Testing

This repository contains a suite of tests built using [@sasjs/test-framework](https://github.com/sasjs/test-framework).

Detailed instructions for creating and running the tests can be found [here](https://github.com/sasjs/adapter/blob/master/sasjs-tests/README.md).

If you'd like to test your changes in an app that uses the adapter, you can do so as follows:

1. Run `npm run package:lib` from the root folder in this repository.
   This creates a tarball in the `/build` folder.
2. In your app's root folder, run `npm install <path/to/tarball>`.
   This will install the changed version of the adapter in your app.
