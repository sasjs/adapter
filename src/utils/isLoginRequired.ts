export const isLogInRequired = (response: string): boolean => {
  const pattern: RegExp = /<form.+action="(.*Logon[^"]*).*>/gm; // FIXME: unnecessary type declaration
  const matches = pattern.test(response);

  return matches;
};