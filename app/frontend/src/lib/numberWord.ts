const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** A small count written as a word, as in running text. Larger numbers stay as digits. */
export const numberWord = (n: number): string => WORDS[n] ?? String(n);

/** The same, with a capital for the start of a sentence. */
export const numberWordCap = (n: number): string => {
  const word = numberWord(n);
  return word.charAt(0).toUpperCase() + word.slice(1);
};
