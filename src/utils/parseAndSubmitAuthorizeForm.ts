export const parseAndSubmitAuthorizeForm = async (
  response: string,
  serverUrl: string
) => {
  let authUrl: string | null = null;
  const params: any = {};

  const responseBody = response.split("<body>")[1].split("</body>")[0];
  const bodyElement = document.createElement("div");
  bodyElement.innerHTML = responseBody;

  const form = bodyElement.querySelector("#application_authorization");
  authUrl = form ? serverUrl + form.getAttribute("action") : null;

  const inputs: any = form?.querySelectorAll("input");

  for (const input of inputs) {
    if (input.name === "user_oauth_approval") {
      input.value = "true";
    }

    params[input.name] = input.value;
  }

  const formData = new FormData();

  for (const key in params) {
    if (params.hasOwnProperty(key)) {
      formData.append(key, params[key]);
    }
  }

  return new Promise((resolve, reject) => {
    if (authUrl) {
      fetch(authUrl, {
        method: "POST",
        credentials: "include",
        body: formData,
        referrerPolicy: "same-origin",
      })
        .then((res) => res.text())
        .then((res) => {
          resolve(res);
        });
    } else {
      reject("Auth form url is null");
    }
  });
};
