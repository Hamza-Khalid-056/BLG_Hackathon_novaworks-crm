const fs=require('fs'),path=require('path');
const F=path.join(__dirname,'..','data','store.json');
let db={users:[],projects:[],tasks:[],meetings:[]};
fs.mkdirSync(path.dirname(F),{recursive:true});
if(fs.existsSync(F))db=JSON.parse(fs.readFileSync(F,'utf8'));
const save=()=>{fs.writeFileSync(F+'.tmp',JSON.stringify(db,null,1));fs.renameSync(F+'.tmp',F)};
// all-or-nothing: changes are applied and written once; any error restores the snapshot
function commit(fn){const snap=JSON.stringify(db);try{fn(db);save()}catch(e){db=JSON.parse(snap);throw e}}
module.exports={db:()=>db,commit};
