// Search-only groups. These aliases never rewrite persisted ride locations.
export const campusGroups = [{id:'bc',campuses:[
  {id:'main',label:'Boston College Main Campus',aliases:['Boston College','Boston College Main Campus','BC Main Campus','140 Commonwealth Ave, Chestnut Hill, MA']},
  {id:'newton',label:'Newton Campus',aliases:['Newton Campus','Boston College Newton Campus','BC Newton Campus','885 Centre St, Newton, MA']},
]}];
export const normalizeLocation=(value:string)=>value.trim().replace(/\s+/g,' ').toLowerCase();
export function recognizedCampus(value:string){
  for(const group of campusGroups){const campus=group.campuses.find(c=>c.aliases.some(alias=>normalizeLocation(alias)===normalizeLocation(value)));if(campus)return {group,campus};}
  return null;
}
export function locationSearchTerms(value:string|undefined,nearby=false){
  if(!value?.trim())return null;
  const found=recognizedCampus(value);
  return found?(nearby?found.group.campuses:[found.campus]).flatMap(c=>c.aliases.map(normalizeLocation)):[normalizeLocation(value)];
}
