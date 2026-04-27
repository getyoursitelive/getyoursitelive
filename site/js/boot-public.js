// Boot script for the public site — sets page title after render
const origRenderSite = renderSite;
renderSite = function() {
  origRenderSite();
  if (BUSINESS && BUSINESS.businessInfo) {
    document.title = BUSINESS.businessInfo.name + ' \u2014 ' + (BUSINESS.businessInfo.tagline || '');
  }
};
