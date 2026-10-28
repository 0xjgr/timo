import { getDomain, getHostname } from "tldts";

// threat: billing.lumen-energy.es and lumen-energy.es.pagos.com must not collapse to the same owner
export function registrableDomain(hostOrUrl: string): string {
  return getDomain(hostOrUrl) ?? getHostname(hostOrUrl) ?? hostOrUrl.toLowerCase();
}

export function domainOfAddress(address: string): string {
  return registrableDomain(address.slice(address.lastIndexOf("@") + 1));
}
