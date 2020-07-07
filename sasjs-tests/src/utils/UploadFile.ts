export const uploadFile = (file: File, fileName: string, url: string) => {
  return new Promise((resolve, reject) => {
    const data = new FormData();
    data.append("file", file);
    data.append("filename", fileName);
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.addEventListener("readystatechange", function () {
      if (this.readyState === 4) {
        let response: any;
        try {
          response = JSON.parse(this.responseText);
        } catch (e) {
          reject(e);
        }
        resolve(response);
      }
    });
    xhr.open("POST", url);
    xhr.setRequestHeader("cache-control", "no-cache");
    xhr.send(data);
  });
};
