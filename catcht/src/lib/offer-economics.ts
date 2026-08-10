export interface LeaseCostInput {
  monthlyPayment: number | null | undefined;
  dueAtSigning: number | null | undefined;
  termMonths: number | null | undefined;
  brokerFee?: number | null;
  acquisitionFee?: number | null;
  acquisitionFeeIncludedInDueAtSigning?: boolean | null;
  dueAtSigningIncludesFirstPayment?: boolean;
  securityDeposit?: number | null;
  securityDepositRefundable?: boolean | null;
}

export function effectiveMonthlyCost(input: LeaseCostInput): number | null {
  const { monthlyPayment, dueAtSigning, termMonths } = input;
  if (
    monthlyPayment === null || monthlyPayment === undefined || monthlyPayment <= 0 ||
    dueAtSigning === null || dueAtSigning === undefined || dueAtSigning < 0 ||
    termMonths === null || termMonths === undefined || !Number.isInteger(termMonths) || termMonths <= 0
  ) return null;

  const recurringPayments = termMonths - (input.dueAtSigningIncludesFirstPayment === false ? 0 : 1);
  const total = monthlyPayment * recurringPayments
    + dueAtSigning
    + (input.brokerFee ?? 0)
    + (input.acquisitionFeeIncludedInDueAtSigning === true ? 0 : input.acquisitionFee ?? 0)
    + (input.securityDepositRefundable === false ? input.securityDeposit ?? 0 : 0);
  return Math.round((total / termMonths) * 100) / 100;
}

export function leaseDealScore({
  effectiveMonthly,
  msrp,
  parseConfidence,
  dueAtSigning,
}: {
  effectiveMonthly: number;
  msrp: number | null | undefined;
  parseConfidence: number;
  dueAtSigning: number | null | undefined;
}) {
  const paymentRatio = msrp && msrp > 0 ? (effectiveMonthly / msrp) * 100 : null;
  const value = paymentRatio === null ? 35 : Math.max(0, Math.min(70, (1.45 - paymentRatio) * 100));
  const confidence = Math.max(0, Math.min(1, parseConfidence)) * 20;
  const upfrontPenalty = Math.min(15, Math.max(0, (dueAtSigning ?? 0) / 500));
  return Math.max(0, Math.min(100, Math.round((value + confidence + 10 - upfrontPenalty) * 10) / 10));
}
