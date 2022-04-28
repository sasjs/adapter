#!/bin/bash

if npm run cy:run -- --spec "cypress/integration/sasjs.tests.ts" ; then
    echo "Cypress sasjs testing passed!"
else
    curl -X POST --header "Content-Type:application/json" --data '{"username":"GitHub CI - Adapter SASJS-TESTS (FAIL)", "content":"Publish of a @sasjs/adapter has been canceled because of the failing sasjs-tests!", "avatar_url":"https://i.ibb.co/Lpk7Xvq/error-outline.png"}' https://discord.com/api/webhooks/969275140087111690/NGowOKrzk-ejP4gkOB-N4-cCPoWFPIux9OEvMGqX73jJxXQqD7H9AhCL_dpxYBJrP0Oi
    # curl -X POST --data-urlencode "payload={\"channel\":\"#sasjs\", \"username\":\"GitHub CI\", \"text\":\"Publish of a @sasjs/adapter has been canceled because of the failing sasjs-tests!\", \"icon_emoji\":\":warning:\"}" $1
    echo "Cypress sasjs testing failed!"
    exit 1
fi