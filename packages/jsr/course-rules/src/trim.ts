/** The text without any run of `char` at its start (when `start`) and its end: a linear scan, where /-+$/ backtracks on long runs. */
export function trimRuns(text: string, char: string, start = true): string {
  let from = 0;
  let to = text.length;
  if (start) while (text[from] === char) from++;
  while (text[to - 1] === char) to--;
  return text.slice(from, to);
}
