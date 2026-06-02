// Centralised company info for printable documents.
// Update once and every invoice / bill / ledger print reflects the change.

export const COMPANY = {
  name: "Zizz Mattress",
  tagline: "Comfort. Crafted.",
  address: [
    "Plot No. 42, Industrial Area",
    "Bengaluru, Karnataka 560058",
    "India",
  ],
  gstin: "29ABCDE1234F1Z5",
  pan: "ABCDE1234F",
  state: "Karnataka",
  stateCode: "29",
  phone: "+91 80 1234 5678",
  email: "accounts@zizzmattress.com",
  website: "www.zizzmattress.com",
  bank: {
    name: "HDFC Bank",
    accountName: "Zizz Mattress Pvt Ltd",
    accountNumber: "50200012345678",
    ifsc: "HDFC0001234",
    branch: "Peenya Industrial Branch",
  },
  terms: [
    "Payment due within 30 days of invoice date.",
    "Interest @ 18% p.a. on overdue balances.",
    "Goods once sold will not be taken back.",
    "Subject to Bengaluru jurisdiction.",
  ],
} as const;
