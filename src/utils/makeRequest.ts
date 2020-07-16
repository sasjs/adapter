import { CsrfToken } from "../types";

export async function makeRequest<T>(
  url: string,
  request: RequestInit, // Where 'RequestInit' is coming from?
  callback: (value: CsrfToken) => any,
  contentType: "text" | "json" = "json"
): Promise<T> {
  const responseTransform = contentType === "json" ?
      (res: Response) => res.json()
      :
      (res: Response) => res.text();

  const result = await fetch(url, request).then((response) => { // FIXME: use axios instead of fetch
    if (!response.ok) { // FIXME we can just check if status === 403
      if (response.status === 403) {
        const tokenHeader = response.headers.get("X-CSRF-HEADER");

        if (tokenHeader) {
          const token = response.headers.get(tokenHeader) || ''; // TODO: refactor

          callback({
            headerName: tokenHeader,
            value: token,
          });

          const retryRequest = {
            ...request,
            headers: { ...request.headers, [tokenHeader]: token },
          };

          return fetch(url, retryRequest).then(responseTransform);
        }
      }
    } else {
      return responseTransform(response);
    }
  });

  return result;
}
