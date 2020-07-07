import { CsrfToken } from "../types";

export async function makeRequest<T>(
  url: string,
  request: RequestInit,
  callback: (value: CsrfToken) => any,
  contentType: "text" | "json" = "json"
): Promise<T> {
  const responseTransform =
    contentType === "json"
      ? (res: Response) => res.json()
      : (res: Response) => res.text();
  const result = await fetch(url, request).then((response) => {
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
          return fetch(url, retryRequest).then(responseTransform);
        }
      }
    } else {
      return responseTransform(response);
    }
  });
  return result;
}
