import { CsrfToken } from "../types";

export async function makeRequest<T>(
  url: string,
  request: RequestInit,
  callback: (value: CsrfToken) => any,
  contentType: "text" | "json" = "json"
): Promise<{ result: T; etag: string | null }> {
  const responseTransform =
    contentType === "json"
      ? (res: Response) => res.json()
      : (res: Response) => res.text();
  let etag = null;
  const result = await fetch(url, request).then(async (response) => {
    if (!response.ok) {
      if (response.status === 403) {
        const tokenHeader = response.headers.get("X-CSRF-HEADER");

        if (tokenHeader) {
          const token = response.headers.get(tokenHeader);
          callback({
            headerName: tokenHeader,
            value: token || "",
          });

          const retryRequest = {
            ...request,
            headers: { ...request.headers, [tokenHeader]: token },
          };
          return fetch(url, retryRequest).then((res) => {
            etag = res.headers.get("ETag");
            return responseTransform(res);
          });
        }
      } else {
        const body = await response.text();
        return Promise.reject({ status: response.status, body });
      }
    } else {
      if (response.redirected && response.url.includes("SASLogon/login")) {
        const body = await response.text();
        return Promise.reject({ status: 401, body });
      }
      etag = response.headers.get("ETag");
      return responseTransform(response);
    }
  });
  return { result, etag };
}
