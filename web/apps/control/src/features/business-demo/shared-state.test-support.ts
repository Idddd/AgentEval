// Synchronous repository fixture for isolated component tests.
// Database transport, persistence and failure behavior are tested separately.
import {useEffect,useRef,useState} from "react";
import {advanceProcessing,restoreIntegratedEntities,STORAGE_KEY,type Entity} from "./model";
import {normalizeDemo} from './unified-demo';
import {compactTraces,assertStorageCapacity} from "./trace-retention";
export function useSharedState(initial:()=>Entity[]){
 const [items,setItems]=useState(()=>{const stored=localStorage.getItem(STORAGE_KEY);return stored?normalizeDemo(restoreIntegratedEntities(stored)):initial();}),current=useRef(items);
 const commit=(update:(items:Entity[])=>Entity[])=>{const next=compactTraces(update(current.current));assertStorageCapacity(next);current.current=next;setItems(next);};
 useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:4,statusDemosVersion:1,failureDemoVersion:1,balancedStatusesVersion:1,items}));}catch{/* Fixture persistence is optional. */}},[items]);
 useEffect(()=>{const timer=setInterval(()=>commit(items=>advanceProcessing(items,Date.now())),500);return()=>clearInterval(timer)},[]);
 return {items,commit,ready:true,busy:false,error:"",retry:()=>{}};
}
