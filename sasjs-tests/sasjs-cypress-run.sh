#!/bin/bash

if npm run cy:run -- --spec "cypress/integration/sasjs.tests.ts" --browser chrome ; then
    echo "Cypress sasjs testing passed!"
else
    echo '{"msgtype":"m.text", "body":"Automated sasjs-tests failed on the @sasjs/adapter PR: '$2'"}'
    curl -XPOST -d '{"msgtype":"m.text", "body":"Automated sasjs-tests failed on the @sasjs/adapter PR: '$2'"}' https://matrix.4gl.io/_matrix/client/r0/rooms/%21jRebyiGmHZlpfDwYXN:4gl.io:4gl.io/send/m.room.message?access_token=$1
    echo "Cypress sasjs testing failed!"
    exit 1
fi
