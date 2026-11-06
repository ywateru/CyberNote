#!/usr/bin/env node
import readline from 'node:readline';
const mode=process.argv[2];
const send=(row)=>process.stdout.write(JSON.stringify(row)+'\n');
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
 const r=JSON.parse(line),base={requestId:r.requestId,ok:true,value:{command:r.command,window:r.window},events:[]};
 if(mode==='unknown'){send({...base,requestId:r.requestId+999});continue;}
 if(mode==='silent')continue;
 const event={name:'notes-sync',payload:{syntheticCommand:r.command}};
 if(r.command==='slow')setTimeout(()=>send({...base,events:[event]}),75);
 else send({...base,events:[event]});
}
