export const serialize = (obj: any) => { // TODO: be more specific on type declaration
  const str: any[] = [];

  for (const p in obj) { // FIXME: name variables properly
    if (obj.hasOwnProperty(p)) {
      if (obj[p] instanceof Array) {
        for (let i = 0, n = obj[p].length; i < n; i++) {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
        }
      } else {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    }
  }

  return str.join("&");
};