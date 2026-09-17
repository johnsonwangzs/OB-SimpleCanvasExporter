import { escapeHTML as esc } from './canvas';
import { type Strings } from './i18n';

/** Shared by the exporter and standalone browser regression fixtures. */
export function viewerToolbar(s:Strings,title:string,cards:number,connections:number):string {
  const zoom=[['out',s.out,'−'],['in',s.in,'+'],['reset',s.reset,'100%'],['fit',s.fit,s.fit]]
    .map(([action,label,text])=>`<button type="button" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}">${esc(text)}</button>`).join('');
  const searchButtons=[['previous',s.searchPrevious],['next',s.searchNext],['all',s.searchAll]]
    .map(([action,label])=>`<button type="button" data-search-action="${action}" disabled>${esc(label)}</button>`).join('');
  return `<header class="sce-toolbar"><div class="sce-toolbar-main"><div class="sce-title" title="${esc(title)}">${esc(title)}</div><span class="sce-count">${cards} ${esc(s.cards)} · ${connections} ${esc(s.connections)}</span><nav class="sce-controls" aria-label="Canvas"><output class="sce-zoom" aria-live="polite">100%</output>${zoom}</nav></div>
<search class="sce-search" hidden aria-label="${esc(s.search)}" data-results="${esc(s.searchResults)}" data-current="${esc(s.searchPosition)}" data-empty="${esc(s.searchEmpty)}" data-idle="${esc(s.searchIdle)}" data-working="${esc(s.searchWorking)}" data-failed="${esc(s.searchFailed)}">
<div class="sce-search-input"><input type="search" aria-label="${esc(s.search)}" placeholder="${esc(s.search)}" autocomplete="off" spellcheck="false" aria-describedby="sce-search-help"><button type="button" data-search-action="clear">${esc(s.searchClear)}</button></div>
<div class="sce-search-actions">${searchButtons}<label class="sce-dim-label"><input type="checkbox" class="sce-search-dim-toggle" checked>${esc(s.searchDim)}</label></div>
<output class="sce-search-status" aria-live="polite" aria-atomic="true">${esc(s.searchIdle)}</output><span class="sce-search-fallback" hidden>${esc(s.searchFallback)}</span><span id="sce-search-help" class="sce-sr-only">${esc(s.searchHelp)}</span>
</search></header>
<aside id="sce-reader" class="sce-reader" hidden aria-labelledby="sce-reader-title" data-open-label="${esc(s.readerOpen)}" data-current-label="${esc(s.readerCurrent)}" data-changed-label="${esc(s.readerChanged)}">
<header class="sce-reader-header"><span id="sce-reader-title">${esc(s.readerTitle)}</span><div class="sce-reader-font-controls"><button type="button" data-reader-font="-2" aria-label="${esc(s.readerSmaller)}">A−</button><output class="sce-reader-font" aria-live="polite">16px</output><button type="button" data-reader-font="2" aria-label="${esc(s.readerLarger)}">A+</button></div><button type="button" class="sce-reader-close" aria-label="${esc(s.readerClose)}">×</button></header>
<div class="sce-reader-body" tabindex="0" role="region" aria-label="${esc(s.readerTitle)}"></div><span class="sce-reader-status sce-sr-only" aria-live="polite"></span></aside>`;
}
