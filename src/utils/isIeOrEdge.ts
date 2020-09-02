export function isIEorEdgeOrOldFirefox() {
  if (typeof window === 'undefined') {
    return false
  }
  const ua = window.navigator.userAgent

  if (ua.indexOf('Firefox') > 0) {
    const version = parseInt(
      ua.substring(ua.lastIndexOf('Firefox/') + 8, ua.length),
      10
    )
    return version <= 60
  }

  const msie = ua.indexOf('MSIE ')
  if (msie > 0) {
    // IE 10 or older => return version number
    return true
  }

  const trident = ua.indexOf('Trident/')
  if (trident > 0) {
    return true
  }

  const edge = ua.indexOf('Edge/')
  if (edge > 0) {
    // Edge (IE 12+) => return version number
    return true
  }

  // other browser
  return false
}
