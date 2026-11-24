import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Opportunity, AccountDetail, AccountSummary, Benefit, Dashboard, EligibilityOverviewRow, EligibilityResult, HotelCertificate, Institution, LoyaltyBalance, Product, UpcomingBonus, UserPreferences } from "./types";

export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard") });
export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api.get<AccountSummary[]>("/accounts") });
export const useLoyaltyBalances = () => useQuery({ queryKey: ["loyalty-balances"], queryFn: () => api.get<LoyaltyBalance[]>("/loyalty-balances") });
export const useAccount = (id: string | null) =>
  useQuery({ queryKey: ["account", id], queryFn: () => api.get<AccountDetail>(`/accounts/${id}`), enabled: !!id });
export const useProducts = () => useQuery({ queryKey: ["products"], queryFn: () => api.get<Product[]>("/products"), staleTime: 5 * 60_000 });
export const useInstitutions = () =>
  useQuery({ queryKey: ["institutions"], queryFn: () => api.get<Institution[]>("/institutions"), staleTime: 5 * 60_000 });
export const useBenefits = () => useQuery({ queryKey: ["benefits"], queryFn: () => api.get<Benefit[]>("/benefits") });
export type HotelCertificateFilter = "unused" | undefined;
export const hotelCertificatesPath = (status: HotelCertificateFilter) =>
  `/hotel-certificates${status ? `?status=${status}` : ""}`;
export const hotelCertificatesQueryKey = (status: HotelCertificateFilter) => ["hotel-certificates", status ?? "all"] as const;
export const useHotelCertificates = (status?: HotelCertificateFilter) =>
  useQuery({ queryKey: hotelCertificatesQueryKey(status), queryFn: () => api.get<HotelCertificate[]>(hotelCertificatesPath(status)) });
export const useBonuses = () => useQuery({ queryKey: ["bonuses"], queryFn: () => api.get<UpcomingBonus[]>("/bonuses") });
export const useOpportunities = (archived: boolean) =>
  useQuery({ queryKey: ["opportunities", archived], queryFn: () => api.get<Opportunity[]>(`/opportunities${archived ? "?archived=1" : ""}`) });
export const useUpcoming = () => useQuery({ queryKey: ["upcoming"], queryFn: () => api.get<UpcomingBonus[]>("/bonuses/upcoming") });
export const preferencesQueryKey = ["preferences"] as const;
export const usePreferences = () => useQuery({ queryKey: preferencesQueryKey, queryFn: () => api.get<UserPreferences>("/preferences") });
/** Saves account-level preferences and writes the server's response straight into the cache. */
export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Pick<UserPreferences, "homeState">) => api.patch<UserPreferences>("/preferences", patch),
    onSuccess: (prefs) => qc.setQueryData(preferencesQueryKey, prefs),
  });
}
export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api.get<{ email: string; source: string }>("/me") });

export function useEligibility(productId: string | null, qs: string) {
  return useQuery({
    queryKey: ["eligibility", productId, qs],
    queryFn: () => api.get<EligibilityResult>(`/eligibility/${productId}?${qs}`),
    enabled: !!productId,
  });
}
export const useEligibilityOverview = (qs: string) =>
  useQuery({ queryKey: ["eligibility-all", qs], queryFn: () => api.get<EligibilityOverviewRow[]>(`/eligibility?${qs}`) });

/** Mutation that refreshes everything derived from account data. */
export function useMutate<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of ["opportunities", "bonuses", "accounts", "account", "loyalty-balances", "dashboard", "benefits", "hotel-certificates", "upcoming", "eligibility", "eligibility-all", "products", "institutions"])
        qc.invalidateQueries({ queryKey: [k] });
    },
  });
}
