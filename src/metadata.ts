import { type WatermarkOptions } from './watermark';
/** Display options for one export; they do not change the source or output path. */
export interface ExportOptions { title?:string; author?:string; showAuthor?:boolean; showTime?:boolean; watermark?:WatermarkOptions }
export interface ExportMetadata {
  title:string;
  author?:string;
  time?:{datetime:string;label:string;detail:string};
}

/** Capture once, before rendering: reopening the HTML must not reformat its time. */
export function exportMetadata(defaultTitle:string,options:ExportOptions={},now=new Date()):ExportMetadata {
  const line=(value:string)=>value.trim().replace(/\s+/g,' ');
  const metadata:ExportMetadata={title:line(options.title??'')||defaultTitle};
  if(options.showAuthor){const author=line(options.author??'');if(author)metadata.author=author;}
  if(options.showTime){
    const pad=(value:number)=>String(value).padStart(2,'0');
    const label=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const offset=-now.getTimezoneOffset(),minutes=Math.abs(offset);
    const zone=`UTC${offset<0?'-':'+'}${pad(Math.floor(minutes/60))}:${pad(minutes%60)}`;
    metadata.time={datetime:now.toISOString(),label,detail:`${label}:${pad(now.getSeconds())} ${zone}`};
  }
  return metadata;
}
