const okD=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!isNaN(Date.parse(s));
exports.projects=(l,users)=>{if(!Array.isArray(l)||!l.length)return['No projects found'];const e=[];
l.forEach((p,i)=>{const n=p.name||'Project '+(i+1);if(!p.name)e.push(n+': name missing');if(!p.clientName)e.push(n+': client missing');
if(!okD(p.deadline))e.push(n+': invalid deadline');const m=users.find(u=>u.id===p.managerId);if(!m||m.role!=='MANAGER')e.push(n+': manager not found')});return e};
exports.tasks=(l,proj,users)=>{if(!Array.isArray(l)||!l.length)return['No tasks found for '+proj.name];const e=[];
l.forEach((t,i)=>{const n=t.title||'Task '+(i+1);if(!t.title)e.push(n+': title missing');const a=users.find(u=>u.id===t.assigneeId);
if(!a||a.role!=='AGENT')e.push(n+': assignee not found');if(!(Number(t.estimatedHours)>0))e.push(n+': hours must be positive');
if(!okD(t.deadline))e.push(n+': invalid deadline');else if(t.deadline>proj.deadline)e.push(n+': due after project deadline')});return e};
