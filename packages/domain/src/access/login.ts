/**
 * A login names one account whatever its capitals: GitHub treats "Ada" and "ada" as the same
 * account, and a lecturer types logins into enrollment.yaml by hand. Every comparison of logins in
 * Tutors goes through here, so the browser, the server and an export agree on who someone is.
 */

/** The form two spellings of one login share; "" for no login. */
export function loginKey(login: string | null | undefined): string {
  return typeof login === "string" ? login.trim().toLowerCase() : "";
}

/** True when both name the same account. No login matches nobody, itself included. */
export function sameLogin(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = loginKey(a);
  return key !== "" && key === loginKey(b);
}

/** True when `login` is on the list, however either was capitalised. */
export function listsLogin(logins: readonly string[] | null | undefined, login: string | null | undefined): boolean {
  const key = loginKey(login);
  return key !== "" && (logins ?? []).some((listed) => loginKey(listed) === key);
}
