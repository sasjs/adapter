#!/bin/bash

if npm run cy:run -- --spec "cypress/integration/sasjs.tests.ts" ; then
    echo "Cypress sasjs testing passed!"
else
    curl -X POST --data-urlencode "payload={\"channel\":\"#sasjs\", \"username\":\"GitHub CI\", \"text\":\"Publish of a @sasjs/adapter has been canceled because of the failing sasjs-tests!\", \"icon_emoji\":\":warning:\"}" $1
    echo "Cypress sasjs testing failed!"
    exit 1
fi