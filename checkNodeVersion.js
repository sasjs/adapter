const result = process.versions
if (result && result.node) {
  if (parseInt(result.node) >= 14) {
    console.log(
      '\x1b[32m%s\x1b[0m',
      `Good to Go with your Node Version: ${result.node}`
    )
  } else {
    console.log(
      '\x1b[31m%s\x1b[0m',
      `Package installation(npm install) failed due to Node Version,\nPlease install and use Node Version >=14\nYour current Node Version is: ${result.node}`
    )
    process.exit(1)
  }
} else {
  console.log(
    '\x1b[31m%s\x1b[0m',
    'Something went wrong while checking Node version'
  )
  process.exit(1)
}
