'use strict';
// Desktop tests only (never in an installed copy): a pretend Windows PC with HN Browser installed, whose apps
// "run" when the test says so. Settings are real preferences files in the test's temporary folder.
const{System}=require('./system.cjs'),{entry}=require('./catalog.cjs'),{verified}=require('./releases.cjs');
class FakeSystem extends System{
 constructor(dir){super({platform:'win32',arch:'x64',home:dir,roaming:dir});
  this.apps={browser:{id:'browser',path:'C:\\Users\\charlie\\AppData\\Local\\Programs\\hn-group-browser',exe:'C:\\Users\\charlie\\AppData\\Local\\Programs\\hn-group-browser\\HN Browser.exe',version:'1.1.3',build:38},network:null};
  this.open=new Set();this.events=[];}
 get supported(){return true;}
 async detect(id){entry(id);return this.apps[id]?{...this.apps[id]}:null;}
 async running(installed){return!!installed&&this.open.has(installed.id);}
 async install(id,file,release){await this.idle(id);await verified(file,release);await new Promise(r=>setTimeout(r,500));const[version,build]=release.version.split('-');
  this.apps[id]={id,path:'C:\\Users\\charlie\\AppData\\Local\\Programs\\'+entry(id).name,exe:'C:\\Users\\charlie\\AppData\\Local\\Programs\\'+entry(id).name+'\\'+entry(id).exe,version,build:Number(build)||0};this.events.push({install:id,version:release.version});}
 async uninstall(id){if(!await this.idle(id))throw Error('This app is not installed.');await new Promise(r=>setTimeout(r,300));this.apps[id]=null;this.events.push({uninstall:id});}
}
module.exports={FakeSystem};
