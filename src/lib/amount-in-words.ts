const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(value: number): string {
  const parts: string[] = [];
  let number = value;
  if (number >= 100) {
    parts.push(`${ONES[Math.floor(number / 100)]} Hundred`);
    number %= 100;
  }
  if (number >= 20) {
    parts.push(TENS[Math.floor(number / 10)]);
    number %= 10;
  }
  if (number > 0) parts.push(ONES[number]);
  return parts.join(" ");
}

function integerToIndianWords(value: number): string {
  if (value === 0) return "Zero";
  const parts: string[] = [];
  const groups: Array<[number, string]> = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1_000, "Thousand"],
  ];
  let number = Math.floor(value);
  for (const [size, label] of groups) {
    if (number >= size) {
      parts.push(`${belowThousand(Math.floor(number / size))} ${label}`);
      number %= size;
    }
  }
  if (number > 0) parts.push(belowThousand(number));
  return parts.join(" ");
}

export function amountInIndianWords(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const rupees = Math.floor(safeAmount);
  const paise = Math.round((safeAmount - rupees) * 100);
  const rupeeWords = `INR ${integerToIndianWords(rupees)}`;
  return paise > 0
    ? `${rupeeWords} and ${integerToIndianWords(paise)} Paise Only`
    : `${rupeeWords} Only`;
}