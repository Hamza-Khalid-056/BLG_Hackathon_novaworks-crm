require('dotenv').config();
const express=require('express'),session=require('express-session'),bcrypt=require('bcryptjs'),path=require('path');
const {db,commit}=require('./store'),ai=require('./ai'),V=require('./validate');
require('./seed')();
const app=express();app.use(express.json({limit:'1mb'}));
app.use(session({secret:process.env.SESSION_SECRET||'dev-secret',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax'}}));
app.use(express.static(path.join(__dirname,'..','public')));
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
// Jobs live in server memory, independent of any session: logout never cancels them.
const jobs=new Map();
const running=f=>[...jobs.values()].some(j=>j.status==='RUNNING'&&f(j));
function start(type,ownerId,projectId,fn){const j={id:uid('J'),type,ownerId,projectId,status:'RUNNING'};jobs.set(j.id,j);fn().then(r=>{j.status='DONE';j.result=r},e=>{j.status='FAILED';j.error=e.message});return j}
const auth=(...roles)=>(req,res,next)=>{const u=db().users.find(x=>x.id===req.session.uid);
if(!u)return res.status(401).json({error:'Please log in'});if(roles.length&&!roles.includes(u.role))return res.status(403).json({error:'Not allowed'});req.user=u;next()};
const dir=()=>db().users.filter(u=>u.role!=='ADMIN').map(({id,name,role,specialization,skills})=>({id,name,role,specialization,skills}));
const nm=id=>(db().users.find(u=>u.id===id)||{}).name;
// access rules (spec pseudocode), enforced on every data request
function projectsFor(u){const{projects,tasks}=db();if(u.role==='ADMIN')return projects;if(u.role==='MANAGER')return projects.filter(p=>p.managerId===u.id);
const ids=new Set(tasks.filter(t=>t.assigneeId===u.id).map(t=>t.projectId));return projects.filter(p=>ids.has(p.id))}
function tasksFor(u,pid){const{projects,tasks}=db();const p=projects.find(x=>x.id===pid);if(!p)return[];
if(u.role==='MANAGER'&&p.managerId!==u.id)return[];const l=tasks.filter(t=>t.projectId===pid);return u.role==='AGENT'?l.filter(t=>t.assigneeId===u.id):l}
const view=(u,p)=>({...p,managerName:nm(p.managerId),generating:running(j=>j.projectId===p.id),tasks:tasksFor(u,p.id).map(t=>({...t,assigneeName:nm(t.assigneeId)}))});
app.post('/api/login',(req,res)=>{const u=db().users.find(x=>x.email===String(req.body.email||'').toLowerCase().trim());
if(!u||!bcrypt.compareSync(String(req.body.password||''),u.passwordHash))return res.status(401).json({error:'Invalid email or password'});
req.session.uid=u.id;res.json({id:u.id,name:u.name,role:u.role})});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',auth(),(req,res)=>{const{id,name,role}=req.user;res.json({id,name,role})});
app.get('/api/team',auth(),(req,res)=>res.json(db().users.map(({name,role,specialization})=>({name,role,specialization}))));
app.get('/api/projects',auth(),(req,res)=>res.json(projectsFor(req.user).map(p=>view(req.user,p))));
app.get('/api/projects/:id',auth(),(req,res)=>{const p=projectsFor(req.user).find(x=>x.id===req.params.id);p?res.json(view(req.user,p)):res.status(404).json({error:'Project not found'})});
app.get('/api/my-tasks',auth('AGENT'),(req,res)=>res.json(db().tasks.filter(t=>t.assigneeId===req.user.id).map(t=>{const p=db().projects.find(x=>x.id===t.projectId);return{...t,assigneeName:req.user.name,projectName:p.name}})));
app.get('/api/jobs/active',auth('ADMIN'),(req,res)=>{const j=[...jobs.values()].find(x=>x.status==='RUNNING'&&x.type==='ADMIN');res.json(j?{id:j.id}:null)});
app.get('/api/jobs/:id',auth(),(req,res)=>{const j=jobs.get(req.params.id);if(!j||j.ownerId!==req.user.id)return res.status(404).json({error:'Job not found'});res.json({id:j.id,status:j.status,error:j.error,result:j.result})});
async function genTasks(p,transcript){const out=await ai('tasks',transcript,dir(),p);const e=V.tasks(out.tasks,p,db().users);if(e.length)throw new Error('Unresolved: '+e.join('; '));
return out.tasks.map(x=>({id:uid('T'),projectId:p.id,title:x.title,description:x.description||'',assigneeId:x.assigneeId,deadline:x.deadline,estimatedHours:Number(x.estimatedHours)}))}
app.post('/api/admin/transcript-jobs',auth('ADMIN'),(req,res)=>{const transcript=String(req.body.transcript||'').trim();
if(!transcript)return res.status(400).json({error:'Paste a transcript first'});
if(running(j=>j.type==='ADMIN'))return res.status(409).json({error:'A transcript is already being processed'});
const withTasks=req.body.withTasks!==false;
const j=start('ADMIN',req.user.id,null,async()=>{const out=await ai('projects',transcript,dir());const e=V.projects(out.projects,db().users);
if(e.length)throw new Error('Unresolved: '+e.join('; '));
const dup=out.projects.find(p=>db().projects.some(x=>x.name===p.name&&x.clientName===p.clientName));if(dup)throw new Error(dup.name+' already exists. Use Reset demo data first.');
const mid=uid('M');const ps=out.projects.map(p=>({id:uid('P'),meetingId:mid,name:p.name,clientName:p.clientName,description:p.description||'',managerId:p.managerId,deadline:p.deadline}));
let ts=[];if(withTasks)for(const p of ps)ts=ts.concat(await genTasks(p,transcript));
commit(d=>{d.meetings.push({id:mid,transcript});d.projects.push(...ps);d.tasks.push(...ts)}); // single atomic save
return{projects:ps.length,tasks:ts.length}});res.status(202).json({id:j.id})});
app.post('/api/projects/:id/generate-tasks',auth('MANAGER'),(req,res)=>{const p=db().projects.find(x=>x.id===req.params.id&&x.managerId===req.user.id);
if(!p)return res.status(404).json({error:'Project not found'});
if(db().tasks.some(t=>t.projectId===p.id))return res.status(409).json({error:'Tasks already exist'});
if(running(j=>j.projectId===p.id))return res.status(409).json({error:'Already generating'});
const j=start('TASKS',req.user.id,p.id,async()=>{const m=db().meetings.find(x=>x.id===p.meetingId);const ts=await genTasks(p,m.transcript);
commit(d=>{if(d.tasks.some(t=>t.projectId===p.id))throw new Error('Tasks already exist');d.tasks.push(...ts)});return{tasks:ts.length}});res.status(202).json({id:j.id})});
app.post('/api/admin/reset',auth('ADMIN'),(req,res)=>{if(running(()=>true))return res.status(409).json({error:'A job is running'});commit(d=>{d.projects=[];d.tasks=[];d.meetings=[]});res.json({ok:true})});
app.listen(process.env.PORT||3000,()=>console.log('NovaWorks CRM on http://localhost:'+(process.env.PORT||3000)+'  (AI_MODE='+(process.env.AI_MODE||'live')+')'));
