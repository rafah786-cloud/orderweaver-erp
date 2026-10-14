export type BankAmountPair = {
  debit: number | string | null | undefined;
  credit: number | string | null | undefined;
};

function amount(value: number | string | null | undefined): number {
  return value == null ? 0 : Number(value);
}

/** Match exactly the debit and credit pair enforced by match_bank_lines in PostgreSQL. */
export function bankLineAmountsMatch(book: BankAmountPair, statement: BankAmountPair): boolean {
  const bookDebit = amount(book.debit);
  const bookCredit = amount(book.credit);
  const statementDebit = amount(statement.debit);
  const statementCredit = amount(statement.credit);
  return [bookDebit, bookCredit, statementDebit, statementCredit].every(Number.isFinite)
    && bookDebit === statementDebit
    && bookCredit === statementCredit;
}

/** A bank statement line must contain one positive side and one zero side. */
export function validBankStatementAmounts(debit: number, credit: number): boolean {
  return Number.isFinite(debit)
    && Number.isFinite(credit)
    && debit >= 0
    && credit >= 0
    && ((debit > 0 && credit === 0) || (credit > 0 && debit === 0));
}
