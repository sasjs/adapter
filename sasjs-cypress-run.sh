#!/bin/bash

if npm run cy:run -- --spec "cypress/integration/sasjs.tests.ts" ; then
    echo "Cypress sasjs testing passed!"
else
    curl -XPOST -d '{"msgtype":"m.text", "body":"content":"Automated sasjs-tests failed on the @sasjs/adapter PR on following link.\n'$2'"}' https://matrix.4gl.io/_matrix/client/r0/rooms/%21BDUPBPEGVvRLKLQUxY:4gl.io/send/m.room.message?access_token=$1
    echo "Cypress sasjs testing failed!"
    exit 1
fi
