// Linear-time slash trimming: a regex such as /\/+$/ backtracks on long runs of "/" (CodeQL js/polynomial-redos).

export function trimTrailingSlashes(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === "/") end--;
  return text.slice(0, end);
}

export function trimLeadingSlashes(text: string): string {
  let start = 0;
  while (start < text.length && text[start] === "/") start++;
  return text.slice(start);
}
