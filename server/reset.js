const {commit}=require('./store');
commit(d=>{d.projects=[];d.tasks=[];d.meetings=[]});console.log('Projects, tasks and meetings cleared. Users kept.');
