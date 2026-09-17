/** Only these semantic values are allowed through the static HTML sanitizer. */
export function badgeColor(classes:Iterable<string>,custom:string):{kind:'theme'|'custom';color:string}|undefined {
  const tokens=Array.from(classes);
  if(tokens.includes('badge-custom')){
    let color=custom.trim().toLowerCase();
    if(/^#[0-9a-f]{3}$/.test(color))color='#'+Array.from(color.slice(1),c=>c+c).join('');
    if(/^#[0-9a-f]{6}$/.test(color))return {kind:'custom',color};
    return;
  }
  const theme=tokens.find(c=>/^badge-(red|orange|yellow|green|cyan|blue|purple|pink)$/.test(c));
  if(theme)return {kind:'theme',color:theme.slice(6)};
}
