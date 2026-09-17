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
  badgeTitle:'Badges',badgeAll:'All {count} badges',badgeSelected:'{count} selected',badgeReset:'Reset badges',badgeMode:'Match badges',badgeAny:'Any',badgeEvery:'All',badgeFind:'Find a badge…',badgeEmpty:'No badges with this name.',badgeHelp:'Numbers show the total cards containing each badge in this document.',badgeCards:'{cards} cards',badgeResults:'{cards} matching cards',badgeCombined:'{cards} matching cards · {hits} keyword occurrences',badgeNoResults:'No cards match the selected conditions.',badgeColors:'Red,Orange,Yellow,Green,Cyan,Blue,Purple,Pink',badgeRendered:'Rendered color',readerExcluded:'Outside the current filter results',
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
  badgeTitle:'Badge',badgeAll:'全部 {count} 种',badgeSelected:'已选 {count} 种',badgeReset:'重置 Badge',badgeMode:'Badge 匹配方式',badgeAny:'任一',badgeEvery:'全部',badgeFind:'查找 Badge 名称…',badgeEmpty:'没有这个名称的 Badge。',badgeHelp:'数字表示本文档内包含该 Badge 的卡片总数。',badgeCards:'{cards} 张卡片',badgeResults:'符合条件 {cards} 张',badgeCombined:'符合条件 {cards} 张 · 关键词 {hits} 处',badgeNoResults:'没有符合当前筛选条件的卡片。',badgeColors:'红色,橙色,黄色,绿色,青色,蓝色,紫色,粉色',badgeRendered:'显示颜色',readerExcluded:'不在当前筛选结果中',
  networkHint:'HTML 可离线使用。导出期间，Obsidian 和已启用的插件可能加载卡片引用的远程资源。',
};
export function strings():Strings {return getLanguage().startsWith('zh')?ZH:EN;}
