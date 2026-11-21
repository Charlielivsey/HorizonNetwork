'use strict';
// Access to the shared HQ staff area is independent of NPL/NA authority.
const HQ='1360208008755413227';
const COMPANIES=new Set(['Horizon Network','Horizon Advertising','Horizon Development']);
async function syncHqStaffAccess({guild,roles,people,request,check=()=>{}}){
 if(guild!==HQ)return 0;
 const role=roles.find(r=>r.name==='Network Staff'&&!r.managed);if(!role)return 0;
 const eligible=new Set(people.filter(p=>(p.titles||[]).some(t=>COMPANIES.has(t.company))).map(p=>p.id));
 let changed=0,after='';
 for(;;){
  check();const members=await request('GET','/guilds/'+guild+'/members?limit=1000'+(after?'&after='+after:''));
  for(const member of members){check();if(member.user?.bot)continue;const has=(member.roles||[]).includes(role.id),want=eligible.has(member.user.id);if(has===want)continue;
   await request(want?'PUT':'DELETE','/guilds/'+guild+'/members/'+member.user.id+'/roles/'+role.id,undefined,'HN Utilities: current network staff HQ access');changed++;
  }
  if(members.length<1000)break;const next=members.at(-1).user.id;if(next===after)throw Error('HQ staff membership pagination stalled');after=next;
 }
 return changed;
}
module.exports={syncHqStaffAccess};
