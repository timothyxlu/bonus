import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { AccountDetail, AccountSummary, Benefit, Dashboard, EligibilityOverviewRow, EligibilityResult, Institution, Product, UpcomingBonus } from "./types";

export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard") });
export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api.get<AccountSummary[]>("/accounts") });
export const useAccount = (id: string | null) =>
  useQuery({ queryKey: ["account", id], queryFn: () => api.get<AccountDetail>(`/accounts/${id}`), enabled: !!id });
export const useProducts = () => useQuery({ queryKey: ["products"], queryFn: () => api.get<Product[]>("/products"), staleTime: 5 * 60_000 });
export const useInstitutions = () =>
  useQuery({ queryKey: ["institutions"], queryFn: () => api.get<Institution[]>("/institutions"), staleTime: 5 * 60_000 });
export const useBenefits = () => useQuery({ queryKey: ["benefits"], queryFn: () => api.get<Benefit[]>("/benefits") });
export const useUpcoming = () => useQuery({ queryKey: ["upcoming"], queryFn: () => api.get<UpcomingBonus[]>("/bonuses/upcoming") });
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
      for (const k of ["accounts", "account", "dashboard", "benefits", "upcoming", "eligibility", "eligibility-all", "products", "institutions"])
        qc.invalidateQueries({ queryKey: [k] });
    },
  });
}
