const bcrypt=require('bcryptjs'),{commit}=require('./store');
const U=`ADMIN|Admin|admin|ADMIN|Administrator|Company overview,transcript creation
PM01|Ayesha Khan|ayesha|MANAGER|Web PM|Web projects,client coordination
PM02|Bilal Ahmed|bilal|MANAGER|Mobile PM|Mobile projects,delivery planning
PM03|Hina Malik|hina|MANAGER|AI PM|AI projects,requirement review
DEV01|Ali Raza|ali|AGENT|Full-Stack|React,frontend integration
DEV02|Hamza Shah|hamza|AGENT|Full-Stack|Node.js,databases,APIs
DEV03|Sara Noor|sara|AGENT|App Developer|Flutter,mobile UI
DEV04|Usman Tariq|usman|AGENT|App Developer|Flutter,integration,testing
DEV05|Zain Abbas|zain|AGENT|AI Developer|LLMs,extraction,prompts
DEV06|Maryam Asif|maryam|AGENT|AI Developer|Retrieval,document processing`;
function seed(){commit(db=>{for(const l of U.split('\n')){const[id,name,e,role,specialization,sk]=l.split('|');const email=e+'@novaworks.example';
const u={id,name,email,role,specialization,skills:sk.split(','),passwordHash:bcrypt.hashSync('Demo123!',8)};
const i=db.users.findIndex(x=>x.email===email);i<0?db.users.push(u):db.users[i]=u}});console.log('Demo users seeded')}
if(require.main===module)seed();module.exports=seed;
