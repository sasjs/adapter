var https = require('https')
var { Cert } = require('selfsigned-ca')

// Root CA certificate used to sign other certificates.
// argument(s) point to .crt and .key file paths - ./selfsigned.root-ca.crt & ./selfsigned.root-ca.key
export const rootCaCert = new Cert('selfsigned.root-ca')
// The certificate generated for use in the HTTP server. It is signed by the CA certificate.
// That way you can create any amount of certificates and they will be all trusted as long
// as the Root CA certificate is trusted (installed to device's keychain).
// argument(s) point to .crt and .key file paths - ./selfsigned.localhost.crt & ./selfsigned.localhost.key
export const serverCert = new Cert(`selfsigned.localhost`)
export const clientCert = new Cert(`selfsigned.client`)

// .then(startHttpsServer)
// .then(() => console.log('certificates ready, server listening'))
// .catch(console.error)

export async function createCertificates() {
  // await createRootCertificate()
  console.log('creating server certificate')
  createServerCertificate()
  console.log('server certificate created & stored')
}

function startHttpsServer() {
  var server = https.createServer(serverCert, (req: any, res: any) => {
    res.writeHead(200)
    res.end('hello world\n')
  })
  server.listen(443)
}

async function loadRootCertificate() {
  await rootCaCert.load()
  if (!(await rootCaCert.isInstalled())) {
    // Make sure the CA is installed to device's keychain so that all server certificates
    // signed by the CA are automatically trusted and green.
    await rootCaCert.install()
  }
}

async function createRootCertificate() {
  console.log('createRootCertificate')
  // Couldn't load existing root CA certificate. Generate new one.
  rootCaCert.createRootCa({
    subject: {
      commonName: 'My Trusted Certificate Authority'
    }
  })
  console.log('rootCaCert', rootCaCert)
  // console.log('createRootCertificate saving')
  // await rootCaCert.save()
  // console.log('createRootCertificate saved')
  // Install the newly created CA to device's keychain so that all server certificates
  // signed by the CA are automatically trusted and green.
  // await rootCaCert.install()
  // console.log('createRootCertificate installed')
}

async function createServerCertificate() {
  var serverCertOptions = {
    subject: {
      commonName: 'localhost'
    },
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' }, // DNS
          { type: 7, ip: '127.0.0.1' } // IP
        ]
      }
    ]
  }
  serverCert.create(serverCertOptions, rootCaCert)
  await serverCert.save()
}
