// note: every site has its own host so the source log sees the domain a real browser would
export const SITES = {
  mail: "mail.es",
  portal: "lumen-energy.es",
  bank: "bancosol.es",
} as const;

export type Site = keyof typeof SITES;

export function siteUrl(site: Site, path: string): string {
  return `http://${SITES[site]}${path}`;
}

export function findSite(host: string): Site | undefined {
  const hostname = host.split(":")[0]?.toLowerCase();
  return (Object.keys(SITES) as Site[]).find((site) => SITES[site] === hostname);
}

// threat: an agent that wanders off the toy world to a real site with real forms
export function mapHostsTo(port: number): string {
  const toyHosts = Object.values(SITES).map((host) => `MAP ${host} 127.0.0.1:${port}`);
  return [...toyHosts, "MAP * ~NOTFOUND"].join(", ");
}
