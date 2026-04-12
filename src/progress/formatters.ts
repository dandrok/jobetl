export function formatRunStartText(totalListings: number): string {
  return `Found ${totalListings} listings to process`;
}

export function formatOfferProgressText(
  current: number,
  total: number,
  step: string,
  company: string
): string {
  return `[${current}/${total}] ${step}: ${company}`;
}
