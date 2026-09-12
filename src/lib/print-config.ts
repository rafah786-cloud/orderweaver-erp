// Centralised company info for printable documents.
// Update once and every invoice / bill / ledger print reflects the change.

export const COMPANY = {
  name: "ABOOD TRADINGS",
  brand: "Zizz",
  tagline: "",
  address: [
    "Build No: 2/53-A, Alfa Tower",
    "Malappuram Road, Valluvambram",
    "Malappuram",
  ],
  gstin: "32ABWFA0954C1ZM",
  pan: "ABWFA0954C",
  state: "Kerala",
  stateCode: "32",
  phone: "",
  email: "customercare@aboodtradings.in",
  website: "",
  bank: {
    name: "",
    accountName: "",
    accountNumber: "",
    ifsc: "",
    branch: "",
  },
  terms: [
    "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
  ],
  declaration: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
} as const;
