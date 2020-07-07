export const isAuthorizeFormRequired = (response: string): boolean => {
  return /<form.+action="(.*Logon\/oauth\/authorize[^"]*).*>/gm.test(response);
};
