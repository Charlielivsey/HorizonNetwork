'use strict';
const ID=/^\d{15,22}$/;
const EVENTS={1:'Server settings changed',10:'Channel created',11:'Channel changed',12:'Channel deleted',13:'Channel permissions added',14:'Channel permissions changed',15:'Channel permissions removed',16:'Channels reordered',21:'Members pruned',22:'Member banned',23:'Member unbanned',24:'Member changed',25:'Member roles changed',26:'Member moved in voice',27:'Member disconnected from voice',28:'Bot added',30:'Role created',31:'Role changed',32:'Role deleted',33:'Roles reordered',40:'Server invite created',41:'Server invite changed',42:'Server invite deleted',50:'Webhook created',51:'Webhook changed',52:'Webhook deleted',60:'Emoji created',61:'Emoji changed',62:'Emoji deleted',72:'Message deleted',73:'Messages deleted',74:'Message pinned',75:'Message unpinned',80:'Integration added',81:'Integration changed',82:'Integration removed',83:'Stage opened',84:'Stage changed',85:'Stage closed',90:'Sticker created',91:'Sticker changed',92:'Sticker deleted',100:'Scheduled event created',101:'Scheduled event changed',102:'Scheduled event deleted',110:'Thread created',111:'Thread changed',112:'Thread deleted',121:'Command permissions changed',140:'AutoMod rule created',141:'AutoMod rule changed',142:'AutoMod rule deleted',143:'AutoMod blocked a message',144:'AutoMod flagged a message',145:'AutoMod timed out a member'};
const privateKey=/token|secret|password|credential|authorization|cookie|invite|^code$|admin.?code|^pin$/i;
function createServerAudit({record,seen,markSeen}){
 return function audit(event){
  if(!ID.test(String(event?.id))||!ID.test(String(event.guild_id))||!Number.isInteger(event.action_type)||event.action_type===20||seen().includes(event.id))return;
  // Kicks already pass through moderation.js, including its persisted event deduplication.
  let label=EVENTS[event.action_type]||'Discord server action '+event.action_type;
  const changes=(event.changes||[]).map(change=>({key:String(change.key||''),...(Object.hasOwn(change,'old_value')?{before:privateKey.test(change.key)?'[redacted]':change.old_value}:{}),...(Object.hasOwn(change,'new_value')?{after:privateKey.test(change.key)?'[redacted]':change.new_value}:{})}));
  if(event.action_type===24){
   const timeout=changes.find(c=>c.key==='communication_disabled_until'),mute=changes.find(c=>c.key==='mute'),deaf=changes.find(c=>c.key==='deaf');
   if(timeout)label=timeout.after&&Date.parse(timeout.after)>Date.now()?'Member timed out':'Member timeout removed';
   else if(mute)label=mute.after?'Member voice muted':'Member voice unmuted';
   else if(deaf)label=deaf.after?'Member voice deafened':'Member voice undeafened';
  }
  const member=[21,22,23,24,25,26,27,28,143,144,145].includes(event.action_type);
  const details={event:label,guild:event.guild_id,target:[40,41,42].includes(event.action_type)?'[invite redacted]':event.target_id||null,targetKind:member?'Member':'Target',reason:event.reason||'No reason was recorded.',changes};
  const name=changes.find(c=>c.key==='name');if(name)details.targetName=name.after||name.before;
  if(event.options?.channel_id)details.channel=event.options.channel_id;
  if(event.options?.count)details.count=event.options.count;
  markSeen(event.id);
  record({email:event.user_id?'Discord '+event.user_id:'Discord'},'server.audit.'+event.action_type,details);
 };
}
module.exports={createServerAudit,EVENTS};
