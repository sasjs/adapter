#!/bin/bash

if npm run cy:run -- --spec "cypress/integration/sasjs.tests.ts" ; then
    echo "Cypress sasjs testing passed!"
else
    curl -X POST --header "Content-Type:application/json" --data '{"username":"GitHub CI - Adapter SASJS-TESTS (FAIL)", "content":"Automated sasjs-tests failed on the @sasjs/adapter PR on following link.\n'$2'", "avatar_url":"https://i.ibb.co/Lpk7Xvq/error-outline.png"}' $1

    echo "Cypress sasjs testing failed!"
    exit 1
fi
