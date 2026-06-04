/**
 * Type declaration for the `virtual:arp-cms` module the integration injects at
 * the consumer's build time. The package's own runtime code (client, i18n)
 * imports the resolved config from here; consumers import it via the package's
 * public entry points, not this virtual module directly.
 */
declare module 'virtual:arp-cms' {
  export const config: import('./options').ResolvedArpCmsConfig;
  export default config;
}
