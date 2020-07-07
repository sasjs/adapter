export const isLogInSuccess = (response: string): boolean =>
  /You have signed in/gm.test(response);
