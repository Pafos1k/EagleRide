import React, {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {dayAfter,localDay,timeLabel,timeWindows,type TimePreset,type Period} from '../lib/rideSearchSchedule';
type Value={date:string;earliest:string;latest:string;periods?:Period[];custom?:boolean};
export default function RideSearchSchedule({value,onChange,active=true}:{value:Value;onChange:(value:Value)=>void;active?:boolean}){
  const today=new Date(),todayKey=localDay(today);
  const periods=value.periods ?? [];
  const preset=value.custom?'Custom':periods.length?'Periods':'Any time';
  const [calendar,setCalendar]=useState(false);
  const [month,setMonth]=useState(()=>new Date(today.getFullYear(),today.getMonth(),1));
  const picker=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const quick=[0,1,2].map(offset=>{const date=dayAfter(today,offset);return {date:localDay(date),label:offset===0?'Today':offset===1?'Tomorrow':date.toLocaleDateString(undefined,{month:'short',day:'numeric'})};});
  const customDate=active && !quick.some(day=>day.date===value.date);
  useEffect(()=>{
    if(!calendar)return;
    picker.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    const outside=(event:PointerEvent)=>{if(!picker.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node))setCalendar(false);};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[calendar]);
  const choose=(date:string)=>{onChange({...value,date});setCalendar(false);trigger.current?.focus();};
  const pill=(active:boolean)=>`min-h-11 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${active?'bg-black text-white':'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`;
  const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const times=[...Array.from({length:48},(_,i)=>`${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`),'23:59'];
  return <div className="space-y-3 text-left">
    <fieldset className="relative"><legend className="sr-only">Travel date</legend>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {quick.map(day=><button type="button" key={day.date} aria-pressed={active && value.date===day.date} className={pill(active && value.date===day.date)} onClick={()=>{onChange({...value,date:day.date});setCalendar(false);}}>{day.label}</button>)}
        <button type="button" ref={trigger} aria-label="Choose date" aria-pressed={customDate} aria-haspopup="dialog" aria-expanded={calendar} className={pill(customDate)} onClick={()=>{const selected=new Date(value.date+'T12:00');setMonth(new Date(selected.getFullYear(),selected.getMonth(),1));setCalendar(!calendar);}}>{customDate?new Date(value.date+'T12:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}):'Choose date'}</button>
      </div>
      {calendar && <div ref={picker} role="dialog" aria-label="Choose travel date" onKeyDown={event=>{if(event.key==='Escape'){setCalendar(false);trigger.current?.focus();}}} className="absolute top-full left-0 sm:left-auto sm:right-0 z-20 mt-2 w-full max-w-sm rounded-2xl bg-white border border-neutral-200 shadow-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <button type="button" aria-label="Previous month" disabled={month.getFullYear()===today.getFullYear() && month.getMonth()===today.getMonth()} className="h-11 w-11 flex items-center justify-center rounded-xl disabled:opacity-30" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={18}/></button>
          <p aria-live="polite" className="font-semibold">{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</p>
          <button type="button" aria-label="Next month" className="h-11 w-11 flex items-center justify-center rounded-xl" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={18}/></button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs text-neutral-500">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(day=><span key={day}>{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({length:month.getDay()},(_,i)=><span key={'blank'+i}/>)}
          {Array.from({length:days},(_,i)=>{const date=new Date(month.getFullYear(),month.getMonth(),i+1),key=localDay(date);return <button type="button" key={key} disabled={key<todayKey} aria-label={date.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})} aria-pressed={active && value.date===key} className={`min-h-11 rounded-xl text-sm disabled:opacity-25 ${active && value.date===key?'bg-black text-white':'hover:bg-neutral-100'}`} onClick={()=>choose(key)}>{i+1}</button>;})}
        </div>
        <button type="button" className="w-full min-h-11 mt-1 text-sm text-neutral-500" onClick={()=>{setCalendar(false);trigger.current?.focus();}}>Close calendar</button>
      </div>}
    </fieldset>
    <fieldset><legend className="sr-only">Departure time</legend>
      <div className="flex flex-wrap gap-2">{([...Object.keys(timeWindows),'Custom'] as TimePreset[]).map(name=><button type="button" key={name} aria-pressed={name==='Any time'?preset==='Any time':name==='Custom'?!!value.custom:periods.includes(name as Period)} className={pill(name==='Any time'?preset==='Any time':name==='Custom'?!!value.custom:periods.includes(name as Period))+' flex-1'} onClick={()=>{
        if(name==='Custom')onChange({...value,custom:true,periods:[],earliest:value.earliest || '06:00',latest:value.latest || '23:59'});
        else if(name==='Any time')onChange({...value,custom:false,periods:[],earliest:'',latest:''});
        else onChange({...value,custom:false,earliest:'',latest:'',periods:periods.includes(name)?periods.filter(p=>p!==name):[...periods,name]});
      }}>{name}</button>)}</div>
      {preset==='Custom' && <div className="grid grid-cols-2 gap-3 mt-3 rounded-xl bg-neutral-50 p-3">
        {(['earliest','latest'] as const).map(key=><label key={key} className="text-xs text-neutral-600">{key==='earliest'?'From time':'To time'}<select aria-label={key==='earliest'?'From time':'To time'} className="block w-full min-h-11 mt-1 rounded-lg bg-white px-2 text-sm text-neutral-900" value={value[key]} onChange={event=>onChange({...value,[key]:event.target.value})}>{times.map(time=><option key={time} value={time}>{timeLabel(time)}</option>)}</select></label>)}
      </div>}
      <p className="text-xs text-neutral-500 mt-2" aria-live="polite">{preset==='Any time'?'Entire selected day':preset==='Periods'?(['Morning','Afternoon','Evening'] as Period[]).filter(p=>periods.includes(p)).join(' + '):`${timeLabel(value.earliest || '00:00')} – ${timeLabel(value.latest || '23:59')}`}</p>
    </fieldset>
  </div>;
}
