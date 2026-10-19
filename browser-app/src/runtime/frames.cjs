'use strict';
// One update per frame; unchanged large images are kept in each UI page's cache.
class Frames{
 constructor({snapshot,recipients,before=()=>{},after=()=>{}}){Object.assign(this,{snapshot,recipients,before,after});this.timer=null;this.memo=new WeakMap();this.revision=0;}
 changed(){if(!this.timer)this.timer=setTimeout(()=>this.flush(),16);this.after();}
 flush(){clearTimeout(this.timer);this.timer=null;this.before();const state={...this.snapshot(),stateRevision:++this.revision};for(const wc of this.recipients())if(wc&&!wc.isDestroyed())wc.send('browser:changed',this.lighten(wc,state));}
 lighten(wc,state){const memo=this.memo.get(wc)||{avatar:undefined,icons:new Map()},icons=new Map(),out={...state};this.memo.set(wc,memo);if(memo.avatar===state.avatar){out.avatar=null;out.avatarSame=true;}else memo.avatar=state.avatar;out.tabs=state.tabs.map(t=>{icons.set(t.id,t.icon);return t.icon&&memo.icons.get(t.id)===t.icon?{...t,icon:null,iconSame:true}:t;});memo.icons=icons;return out;}
}
module.exports={Frames};
