/** Number formats used by the Lab pages. All values come from the API, these only decide how they are written. */
export const int = (n: number) => n.toLocaleString("en-US");
export const dec = (n: number, digits = 3) => n.toFixed(digits);
/** For values that are already percentages, such as 73.3. */
export const pct = (n: number, digits = 0) => `${n.toFixed(digits)}%`;
/** For shares between 0 and 1, such as 0.564. */
export const share = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
export const signed = (n: number, digits = 3) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
