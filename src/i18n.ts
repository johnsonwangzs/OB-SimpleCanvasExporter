import { getLanguage } from 'obsidian';
export const EN={
  command:'Export current Canvas to HTML',title:'Export Canvas to HTML',path:'Save to',pathHint:'Path within this vault. Existing files receive a numbered copy.',
  export:'Export',cancel:'Cancel',close:'Close',working:'Rendering cards…',saving:'Saving HTML…',done:'HTML exported',failed:'Export failed',
  open:'Open in browser',fit:'Fit all',reset:'100%',out:'Zoom out',in:'Zoom in',help:'Drag the background to pan · Scroll inside cards to read · Ctrl + wheel to zoom',
  empty:'This Canvas is empty.',cards:'cards',connections:'connections',warnings:'Export notes',
  search:'Search text cards…',searchClear:'Clear',searchPrevious:'Previous card',searchNext:'Next card',searchAll:'Show all results',searchDim:'Dim other cards',
  searchResults:'{cards} matching cards · {hits} occurrences',searchPosition:'Current {index}/{cards}',searchCurrent:'Current',
  searchEmpty:'No matching text cards.',searchIdle:'Search the full text of cards.',searchWorking:'Searching…',searchFailed:'Search could not be completed. Clear the query and try again.',
  searchFallback:'This browser supports card highlighting only.',searchHelp:'Enter: next card. Shift+Enter: previous card. Escape: clear. Browser find remains available with Ctrl or Cmd+F.',
  readerOpen:'Read',readerTitle:'Card reader',readerClose:'Close reader',readerSmaller:'Decrease reading font size',readerLarger:'Increase reading font size',readerCurrent:'Reading',readerChanged:'Reading another card.',
  networkHint:'The HTML works offline. During export, Obsidian and enabled plugins may load remote resources referenced by cards.',
};
export type Strings=typeof EN;
export const ZH:Strings={
  command:'将当前 Canvas 导出为 HTML',title:'将 Canvas 导出为 HTML',path:'保存位置',pathHint:'填写 vault 内的路径。已有同名文件时自动保存编号副本。',
  export:'导出',cancel:'取消',close:'关闭',working:'正在渲染卡片…',saving:'正在保存 HTML…',done:'HTML 已导出',failed:'导出失败',
  open:'在浏览器中打开',fit:'适应全图',reset:'100%',out:'缩小',in:'放大',help:'拖动空白处平移 · 在卡片内滚动阅读 · Ctrl + 滚轮缩放',
  empty:'这张 Canvas 没有内容。',cards:'张卡片',connections:'条连接',warnings:'导出说明',
  search:'搜索文本卡片…',searchClear:'清除',searchPrevious:'上一张',searchNext:'下一张',searchAll:'查看全部结果',searchDim:'淡化其他卡片',
  searchResults:'命中 {cards} 张 · {hits} 处',searchPosition:'当前 {index}/{cards} 张',searchCurrent:'当前',
  searchEmpty:'未找到匹配的文本卡片。',searchIdle:'搜索卡片的完整正文。',searchWorking:'正在搜索…',searchFailed:'搜索未能完成，请清除关键词后重试。',
  searchFallback:'当前浏览器仅支持卡片高亮。',searchHelp:'Enter：下一张。Shift+Enter：上一张。Escape：清除。Ctrl 或 Cmd+F 仍使用浏览器查找。',
  readerOpen:'阅读',readerTitle:'卡片阅读',readerClose:'关闭阅读面板',readerSmaller:'减小阅读字号',readerLarger:'增大阅读字号',readerCurrent:'阅读中',readerChanged:'已切换阅读卡片。',
  networkHint:'HTML 可离线使用。导出期间，Obsidian 和已启用的插件可能加载卡片引用的远程资源。',
};
export function strings():Strings {return getLanguage().startsWith('zh')?ZH:EN;}
