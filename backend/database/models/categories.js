// @file backend/database/models/categories.js
// The canonical transaction categories. This list is the contract between the database, the AI
// extraction prompt and the app's category icons.
//
// Keep in sync with mobile/src/features/finance/categories.ts.
// Adding a category: append here, add an icon/colour in the mobile map. Never rename an existing
// id — stored transactions reference it.

export const EXPENSE_CATEGORIES = [
  "food", // eating out, cafes, delivery
  "groceries",
  "transport", // fuel, cabs, metro, flights for commuting
  "shopping", // clothes, gadgets, general retail
  "bills", // electricity, water, phone, internet, subscriptions
  "rent",
  "emi", // loan / credit-card repayments
  "health",
  "education",
  "travel", // holidays, hotels
  "fun", // entertainment, hobbies, going out
  "gifts", // gifts given, donations
  "investment", // money moved into investments (SIP, stocks, gold)
  "savings", // money moved into savings / a goal
  "other",
];

export const INCOME_CATEGORIES = [
  "salary",
  "freelance",
  "business",
  "interest", // interest, dividends, capital gains realised
  "refund", // cashback, reimbursements
  "gift_received",
  "other_income",
];

export const CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export const TRANSACTION_TYPES = ["income", "expense"];

/** Which categories are valid for a given transaction type. */
export const categoriesFor = (type) => (type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES);

export const isValidCategory = (category, type) => categoriesFor(type).includes(category);

/** Sensible fallback so a bad AI guess never blocks a save. */
export const defaultCategory = (type) => (type === "income" ? "other_income" : "other");

/**
 * Coerces a loose category string (AI output, older clients) onto the canonical list.
 * Falls back to the type's "other" bucket.
 */
export const normaliseCategory = (category, type) => {
  const key = String(category || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (isValidCategory(key, type)) return key;
  const aliases = {
    dining: "food",
    restaurant: "food",
    eating_out: "food",
    grocery: "groceries",
    supermarket: "groceries",
    fuel: "transport",
    petrol: "transport",
    commute: "transport",
    cab: "transport",
    utilities: "bills",
    subscription: "bills",
    subscriptions: "bills",
    phone: "bills",
    internet: "bills",
    housing: "rent",
    loan: "emi",
    debt: "emi",
    credit_card: "emi",
    medical: "health",
    doctor: "health",
    pharmacy: "health",
    fees: "education",
    tuition: "education",
    holiday: "travel",
    vacation: "travel",
    entertainment: "fun",
    movies: "fun",
    donation: "gifts",
    charity: "gifts",
    sip: "investment",
    stocks: "investment",
    mutual_fund: "investment",
    saving: "savings",
    wage: "salary",
    wages: "salary",
    pay: "salary",
    paycheck: "salary",
    bonus: "salary",
    contract: "freelance",
    gig: "freelance",
    dividend: "interest",
    dividends: "interest",
    cashback: "refund",
    reimbursement: "refund",
    gift: type === "income" ? "gift_received" : "gifts",
  };
  const mapped = aliases[key];
  return mapped && isValidCategory(mapped, type) ? mapped : defaultCategory(type);
};
