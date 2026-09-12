import { getLanguage } from 'obsidian';
export const EN={
  command:'Export current Canvas to HTML',title:'Export Canvas to HTML',path:'Save to',pathHint:'Path within this vault. Existing files receive a numbered copy.',
  export:'Export',cancel:'Cancel',close:'Close',working:'Rendering cards…',saving:'Saving HTML…',done:'HTML exported',failed:'Export failed',
  open:'Open in browser',fit:'Fit all',reset:'100%',out:'Zoom out',in:'Zoom in',help:'Drag the background to pan · Scroll inside cards to read · Ctrl + wheel to zoom',
  empty:'This Canvas is empty.',cards:'cards',connections:'connections',warnings:'Export notes',
  networkHint:'The HTML works offline. During export, Obsidian and enabled plugins may load remote resources referenced by cards.',
};
export type Strings=typeof EN;
const ZH:Strings={
  command:'将当前 Canvas 导出为 HTML',title:'将 Canvas 导出为 HTML',path:'保存位置',pathHint:'填写 vault 内的路径。已有同名文件时自动保存编号副本。',
  export:'导出',cancel:'取消',close:'关闭',working:'正在渲染卡片…',saving:'正在保存 HTML…',done:'HTML 已导出',failed:'导出失败',
  open:'在浏览器中打开',fit:'适应全图',reset:'100%',out:'缩小',in:'放大',help:'拖动空白处平移 · 在卡片内滚动阅读 · Ctrl + 滚轮缩放',
  empty:'这张 Canvas 没有内容。',cards:'张卡片',connections:'条连接',warnings:'导出说明',
  networkHint:'HTML 可离线使用。导出期间，Obsidian 和已启用的插件可能加载卡片引用的远程资源。',
};
export function strings():Strings {return getLanguage().startsWith('zh')?ZH:EN;}
