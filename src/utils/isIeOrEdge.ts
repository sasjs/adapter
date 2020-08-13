export function isIEorEDGE() {
  const ua = window.navigator.userAgent;

  const msie = ua.indexOf("MSIE ");
  if (msie > 0) {
    // IE 10 or older => return version number
    return true;
  }

  const trident = ua.indexOf("Trident/");
  if (trident > 0) {
    return true;
  }

  const edge = ua.indexOf("Edge/");
  if (edge > 0) {
    // Edge (IE 12+) => return version number
    return true;
  }

  // other browser
  return false;
}
