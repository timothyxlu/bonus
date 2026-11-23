/**
 * Generic, public US credit card catalog used to seed new installations.
 * Contains NO personal data. Fees and rules change over time - edit in the app.
 */
import type { AccountKind, InstitutionType, Network, OwnerType, ProductRules } from "./types";

export interface CatalogInstitution {
  id: string;
  name: string;
  type: InstitutionType;
}

export interface CatalogProduct {
  id: string;
  institutionId: string;
  name: string;
  kind: AccountKind;
  ownerType: OwnerType;
  family: string | null;
  annualFee: number;
  network: Network;
  currency: string;
  rules: ProductRules;
}

export const CATALOG_INSTITUTIONS: CatalogInstitution[] = [
  { id: "chase", name: "Chase", type: "issuer" },
  { id: "amex", name: "American Express", type: "issuer" },
  { id: "citi", name: "Citi", type: "issuer" },
  { id: "boa", name: "Bank of America", type: "issuer" },
  { id: "barclays", name: "Barclays", type: "issuer" },
  { id: "capital_one", name: "Capital One", type: "issuer" },
  { id: "discover", name: "Discover", type: "issuer" },
  { id: "us_bank", name: "U.S. Bank", type: "issuer" },
  { id: "wells_fargo", name: "Wells Fargo", type: "issuer" },
];

const chase24: ProductRules = { bonusCooldownMonths: 24, cooldownScope: "product" };
const citi48: ProductRules = { bonusCooldownMonths: 48, cooldownScope: "product" };
const boa24: ProductRules = { bonusCooldownMonths: 24, cooldownScope: "product" };

type P = Omit<CatalogProduct, "kind" | "rules"> & { kind?: AccountKind; rules?: ProductRules };
const card = (p: P): CatalogProduct => ({ kind: "credit_card", rules: {}, ...p });

export const CATALOG_PRODUCTS: CatalogProduct[] = [
  // Chase
  card({ id: "chase-sapphire-preferred", institutionId: "chase", name: "Chase Sapphire Preferred", ownerType: "personal", family: "chase_sapphire", annualFee: 95, network: "visa", currency: "Chase Ultimate Rewards" }),
  card({ id: "chase-sapphire-reserve", institutionId: "chase", name: "Chase Sapphire Reserve", ownerType: "personal", family: "chase_sapphire", annualFee: 795, network: "visa", currency: "Chase Ultimate Rewards" }),
  card({ id: "chase-freedom-unlimited", institutionId: "chase", name: "Chase Freedom Unlimited", ownerType: "personal", family: "chase_freedom", annualFee: 0, network: "visa", currency: "Chase Ultimate Rewards", rules: chase24 }),
  card({ id: "chase-freedom-flex", institutionId: "chase", name: "Chase Freedom Flex", ownerType: "personal", family: "chase_freedom", annualFee: 0, network: "mastercard", currency: "Chase Ultimate Rewards", rules: chase24 }),
  card({ id: "chase-united-explorer", institutionId: "chase", name: "United Explorer", ownerType: "personal", family: "chase_united", annualFee: 150, network: "visa", currency: "United MileagePlus", rules: chase24 }),
  card({ id: "chase-southwest-plus", institutionId: "chase", name: "Southwest Rapid Rewards Plus", ownerType: "personal", family: "chase_southwest", annualFee: 99, network: "visa", currency: "Southwest Rapid Rewards", rules: chase24 }),
  card({ id: "chase-marriott-boundless", institutionId: "chase", name: "Marriott Bonvoy Boundless", ownerType: "personal", family: "chase_marriott", annualFee: 95, network: "visa", currency: "Marriott Bonvoy", rules: chase24 }),
  card({ id: "chase-world-of-hyatt", institutionId: "chase", name: "World of Hyatt", ownerType: "personal", family: "chase_hyatt", annualFee: 95, network: "visa", currency: "World of Hyatt", rules: chase24 }),
  card({ id: "chase-ihg-premier", institutionId: "chase", name: "IHG One Rewards Premier", ownerType: "personal", family: "chase_ihg", annualFee: 99, network: "mastercard", currency: "IHG One Rewards", rules: chase24 }),
  card({ id: "chase-ink-preferred", institutionId: "chase", name: "Ink Business Preferred", ownerType: "business", family: "chase_ink", annualFee: 95, network: "visa", currency: "Chase Ultimate Rewards", rules: chase24 }),
  card({ id: "chase-ink-cash", institutionId: "chase", name: "Ink Business Cash", ownerType: "business", family: "chase_ink", annualFee: 0, network: "visa", currency: "Chase Ultimate Rewards", rules: chase24 }),
  card({ id: "chase-ink-unlimited", institutionId: "chase", name: "Ink Business Unlimited", ownerType: "business", family: "chase_ink", annualFee: 0, network: "visa", currency: "Chase Ultimate Rewards", rules: chase24 }),

  // American Express (once per lifetime + family ladders)
  card({ id: "amex-green", institutionId: "amex", name: "American Express Green", ownerType: "personal", family: "amex_mr_charge", annualFee: 150, network: "amex", currency: "Amex Membership Rewards", rules: { lifetimeBonus: true, familyRank: 1, isCharge: true } }),
  card({ id: "amex-gold", institutionId: "amex", name: "American Express Gold", ownerType: "personal", family: "amex_mr_charge", annualFee: 325, network: "amex", currency: "Amex Membership Rewards", rules: { lifetimeBonus: true, familyRank: 2, isCharge: true } }),
  card({ id: "amex-platinum", institutionId: "amex", name: "The Platinum Card", ownerType: "personal", family: "amex_mr_charge", annualFee: 895, network: "amex", currency: "Amex Membership Rewards", rules: { lifetimeBonus: true, familyRank: 3, isCharge: true } }),
  card({ id: "amex-blue-cash-everyday", institutionId: "amex", name: "Blue Cash Everyday", ownerType: "personal", family: "amex_blue_cash", annualFee: 0, network: "amex", currency: "USD cash back", rules: { lifetimeBonus: true, familyRank: 1 } }),
  card({ id: "amex-blue-cash-preferred", institutionId: "amex", name: "Blue Cash Preferred", ownerType: "personal", family: "amex_blue_cash", annualFee: 95, network: "amex", currency: "USD cash back", rules: { lifetimeBonus: true, familyRank: 2 } }),
  card({ id: "amex-delta-blue", institutionId: "amex", name: "Delta SkyMiles Blue", ownerType: "personal", family: "amex_delta", annualFee: 0, network: "amex", currency: "Delta SkyMiles", rules: { lifetimeBonus: true, familyRank: 1 } }),
  card({ id: "amex-delta-gold", institutionId: "amex", name: "Delta SkyMiles Gold", ownerType: "personal", family: "amex_delta", annualFee: 150, network: "amex", currency: "Delta SkyMiles", rules: { lifetimeBonus: true, familyRank: 2 } }),
  card({ id: "amex-delta-platinum", institutionId: "amex", name: "Delta SkyMiles Platinum", ownerType: "personal", family: "amex_delta", annualFee: 350, network: "amex", currency: "Delta SkyMiles", rules: { lifetimeBonus: true, familyRank: 3 } }),
  card({ id: "amex-delta-reserve", institutionId: "amex", name: "Delta SkyMiles Reserve", ownerType: "personal", family: "amex_delta", annualFee: 650, network: "amex", currency: "Delta SkyMiles", rules: { lifetimeBonus: true, familyRank: 4 } }),
  card({ id: "amex-hilton-surpass", institutionId: "amex", name: "Hilton Honors Surpass", ownerType: "personal", family: "amex_hilton", annualFee: 150, network: "amex", currency: "Hilton Honors", rules: { lifetimeBonus: true } }),
  card({ id: "amex-marriott-brilliant", institutionId: "amex", name: "Marriott Bonvoy Brilliant", ownerType: "personal", family: "amex_marriott", annualFee: 650, network: "amex", currency: "Marriott Bonvoy", rules: { lifetimeBonus: true } }),
  card({ id: "amex-business-gold", institutionId: "amex", name: "American Express Business Gold", ownerType: "business", family: "amex_mr_business", annualFee: 375, network: "amex", currency: "Amex Membership Rewards", rules: { lifetimeBonus: true, isCharge: true } }),
  card({ id: "amex-business-platinum", institutionId: "amex", name: "The Business Platinum Card", ownerType: "business", family: "amex_mr_business", annualFee: 895, network: "amex", currency: "Amex Membership Rewards", rules: { lifetimeBonus: true, isCharge: true } }),
  card({ id: "amex-blue-business-plus", institutionId: "amex", name: "Blue Business Plus", ownerType: "business", family: null, annualFee: 0, network: "amex", currency: "Amex Membership Rewards", rules: { lifetimeBonus: true } }),

  // Citi (48 months per product + 1/8, 2/65)
  card({ id: "citi-strata-premier", institutionId: "citi", name: "Citi Strata Premier", ownerType: "personal", family: "citi_thankyou", annualFee: 95, network: "mastercard", currency: "Citi ThankYou Points", rules: citi48 }),
  card({ id: "citi-strata-elite", institutionId: "citi", name: "Citi Strata Elite", ownerType: "personal", family: "citi_thankyou", annualFee: 595, network: "mastercard", currency: "Citi ThankYou Points", rules: citi48 }),
  card({ id: "citi-double-cash", institutionId: "citi", name: "Citi Double Cash", ownerType: "personal", family: "citi_thankyou", annualFee: 0, network: "mastercard", currency: "Citi ThankYou Points", rules: citi48 }),
  card({ id: "citi-custom-cash", institutionId: "citi", name: "Citi Custom Cash", ownerType: "personal", family: "citi_thankyou", annualFee: 0, network: "mastercard", currency: "Citi ThankYou Points", rules: citi48 }),
  card({ id: "citi-aa-platinum-select", institutionId: "citi", name: "Citi / AAdvantage Platinum Select", ownerType: "personal", family: "citi_aadvantage", annualFee: 99, network: "mastercard", currency: "American AAdvantage", rules: citi48 }),

  // Bank of America (2/3/4)
  card({ id: "boa-premium-rewards", institutionId: "boa", name: "Bank of America Premium Rewards", ownerType: "personal", family: null, annualFee: 95, network: "visa", currency: "BoA Points", rules: boa24 }),
  card({ id: "boa-customized-cash", institutionId: "boa", name: "Bank of America Customized Cash Rewards", ownerType: "personal", family: null, annualFee: 0, network: "visa", currency: "USD cash back", rules: boa24 }),
  card({ id: "boa-travel-rewards", institutionId: "boa", name: "Bank of America Travel Rewards", ownerType: "personal", family: null, annualFee: 0, network: "visa", currency: "BoA Points", rules: boa24 }),

  // Barclays (6/24)
  card({ id: "barclays-aviator-red", institutionId: "barclays", name: "AAdvantage Aviator Red", ownerType: "personal", family: null, annualFee: 99, network: "mastercard", currency: "American AAdvantage" }),
  card({ id: "barclays-jetblue-plus", institutionId: "barclays", name: "JetBlue Plus", ownerType: "personal", family: null, annualFee: 99, network: "mastercard", currency: "JetBlue TrueBlue" }),
  card({ id: "barclays-wyndham-earner-plus", institutionId: "barclays", name: "Wyndham Rewards Earner Plus", ownerType: "personal", family: null, annualFee: 75, network: "visa", currency: "Wyndham Rewards" }),

  // Others
  card({ id: "capital-one-venture-x", institutionId: "capital_one", name: "Capital One Venture X", ownerType: "personal", family: "capital_one_venture", annualFee: 395, network: "visa", currency: "Capital One Miles" }),
  card({ id: "capital-one-venture", institutionId: "capital_one", name: "Capital One Venture", ownerType: "personal", family: "capital_one_venture", annualFee: 95, network: "visa", currency: "Capital One Miles" }),
  card({ id: "capital-one-savor", institutionId: "capital_one", name: "Capital One Savor", ownerType: "personal", family: null, annualFee: 0, network: "mastercard", currency: "USD cash back" }),
  card({ id: "discover-it-cash-back", institutionId: "discover", name: "Discover it Cash Back", ownerType: "personal", family: null, annualFee: 0, network: "discover", currency: "USD cash back" }),
  card({ id: "us-bank-cash-plus", institutionId: "us_bank", name: "U.S. Bank Cash+", ownerType: "personal", family: null, annualFee: 0, network: "visa", currency: "USD cash back" }),
  card({ id: "wells-fargo-active-cash", institutionId: "wells_fargo", name: "Wells Fargo Active Cash", ownerType: "personal", family: null, annualFee: 0, network: "visa", currency: "USD cash back" }),
  card({ id: "wells-fargo-autograph", institutionId: "wells_fargo", name: "Wells Fargo Autograph", ownerType: "personal", family: null, annualFee: 0, network: "visa", currency: "Wells Fargo Rewards" }),
];
